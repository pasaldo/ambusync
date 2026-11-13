import hashlib
import json

from django.contrib.auth import get_user_model
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import AuditEvent
from config.http import NoStoreResourceView
from emergencies.events import publish_emergency_event
from emergencies.models import Emergency, ProcessedOperation, VitalMeasurement
from emergencies.serializers import (
    VITAL_FIELD_TO_KIND,
    ArrivalConfirmationSerializer,
    EmergencyCancellationSerializer,
    EmergencyCreateSerializer,
    EmergencyOperationSerializer,
    emergency_representation,
)
from institutions.models import Ambulance, AmbulanceAssignment, Institution, InstitutionMembership


class OperationConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "operation_conflict"
    default_detail = "La operación entra en conflicto con un resultado previo."


def active_assignment_for(user, lock=False, lock_unit_only=False):
    assignments = AmbulanceAssignment.objects.select_related("ambulance__institution")
    if lock:
        # The caller holds this user's row. Lock the unit before the assignment,
        # matching administrative departures and logical unit deactivation.
        unit_id = (
            assignments.filter(user=user, active=True)
            .values_list("ambulance_id", flat=True)
            .first()
        )
        if unit_id is not None:
            # Unit ordering joins its institution. Existing-episode transitions
            # must not lock that joined row before locking a new destination.
            units = Ambulance.objects.select_for_update(of=("self",) if lock_unit_only else ())
            units.filter(pk=unit_id).first()
        assignments = assignments.select_for_update(of=("self",))
    return assignments.filter(
        user=user,
        active=True,
        ambulance__enabled=True,
        ambulance__institution__enabled=True,
    ).first()


def authorized_emergencies(user, include_terminal=False):
    from reports.scopes import has_report_permission, receiver_institution_ids

    if not user.is_active or user.groups.filter(name="system_admin").exists():
        return Emergency.objects.none()
    visible = Emergency.objects.none()
    if user.groups.filter(name="ambulance").exists():
        assignment = active_assignment_for(user)
        if (
            assignment
            and InstitutionMembership.objects.filter(
                user=user,
                active=True,
                institution_id=assignment.ambulance.institution_id,
                institution__enabled=True,
            ).exists()
        ):
            visible = visible | Emergency.objects.filter(ambulance=assignment.ambulance).exclude(
                status__in=("cerrada", "cancelada")
            )
    if user.groups.filter(name="urgencias").exists():
        scope = Q(destination_id__in=receiver_institution_ids(user))
        if not include_terminal or not has_report_permission(user):
            scope &= ~Q(status__in=("cerrada", "cancelada"))
        visible = visible | Emergency.objects.filter(scope)
    return (
        visible.distinct()
        .select_related("operating_institution", "destination", "ambulance", "patient_record")
        .prefetch_related("vital_measurements__rectification", "patient_context_corrections")
    )


class EmergencyPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class EmergencyListCreateView(NoStoreResourceView):
    permission_classes = (IsAuthenticated,)
    pagination_class = EmergencyPagination

    def get(self, request):
        emergencies = authorized_emergencies(request.user)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(emergencies, request, view=self)
        return paginator.get_paginated_response([emergency_representation(item) for item in page])

    def post(self, request):
        if not request.user.groups.filter(name="ambulance").exists():
            raise PermissionDenied("Se requiere permiso de ambulancia.")

        serializer = EmergencyCreateSerializer(data=request.data)
        unknown_fields = (
            set(request.data) - set(serializer.fields) if isinstance(request.data, dict) else set()
        )
        if unknown_fields:
            raise ValidationError(
                {"non_field_errors": "La solicitud contiene campos no admitidos."}
            )
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        operation_id = values.pop("operation_id")
        destination = values.pop("destination_id")
        transfer_started = values.pop("transfer_started")
        vitals = values.pop("vitals", {})
        canonical = {**values, "vitals": vitals}
        canonical.update(
            destination_id=str(destination.pk),
            transfer_started=transfer_started,
        )
        request_hash = hashlib.sha256(
            json.dumps(
                canonical,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
                cls=DjangoJSONEncoder,
            ).encode("utf-8")
        ).hexdigest()

        User = get_user_model()
        with transaction.atomic():
            actor = User.objects.select_for_update().get(pk=request.user.pk, is_active=True)
            if not actor.groups.filter(name="ambulance").exists():
                raise PermissionDenied("Se requiere permiso de ambulancia.")
            assignment = active_assignment_for(actor, lock=True)
            membership = (
                InstitutionMembership.objects.select_for_update(of=("self",))
                .filter(
                    user=actor,
                    institution_id=assignment.ambulance.institution_id if assignment else None,
                    active=True,
                    institution__enabled=True,
                )
                .first()
            )
            if assignment is None or membership is None:
                raise PermissionDenied("La cuenta no tiene una asignación activa.")

            destination = (
                Institution.objects.select_for_update()
                .filter(
                    pk=destination.pk,
                    enabled=True,
                    kind__in=("receiver", "combined"),
                )
                .first()
            )
            if destination is None:
                raise ValidationError({"destination_id": "El destino ya no está disponible."})

            previous = (
                ProcessedOperation.objects.filter(actor=actor, operation_id=operation_id)
                .select_related("emergency")
                .first()
            )
            if previous:
                if previous.action != "emergency.created" or previous.request_hash != request_hash:
                    raise OperationConflict()
                if (
                    previous.emergency is None
                    or previous.emergency.ambulance_id != assignment.ambulance_id
                    or previous.emergency.operating_institution_id
                    != assignment.ambulance.institution_id
                ):
                    raise PermissionDenied("La operación ya no está dentro del ámbito autorizado.")
                return Response(
                    emergency_representation(previous.emergency),
                    status=status.HTTP_200_OK,
                    headers={"Idempotent-Replay": "true"},
                )

            from emergencies.patient_records import resolve_patient
            from institutions.symptom_catalog import validate_episode_symptoms

            patient = resolve_patient(actor, assignment.ambulance, values, operation_id)
            values["symptoms"] = validate_episode_symptoms(
                assignment.ambulance.institution_id, values.get("symptoms", [])
            )
            emergency = Emergency.objects.create(
                patient_record=patient,
                operating_institution=assignment.ambulance.institution,
                destination=destination,
                ambulance=assignment.ambulance,
                created_by=actor,
                status=Emergency.Status.IN_TRANSIT
                if transfer_started
                else Emergency.Status.NOTIFIED,
                transfer_declared_at=timezone.now() if transfer_started else None,
                transfer_declared_by=actor if transfer_started else None,
                triage_recorded_at=timezone.now() if values.get("triage") else None,
                triage_recorded_by=actor if values.get("triage") else None,
                **values,
            )
            taken_at = vitals.pop("taken_at", None)
            if taken_at is not None:
                VitalMeasurement.objects.bulk_create(
                    [
                        VitalMeasurement(
                            emergency=emergency,
                            kind=kind,
                            value=value,
                            unit=VitalMeasurement.UNIT_BY_KIND[kind],
                            measured_at=taken_at,
                            recorded_by=actor,
                            operation_id=operation_id,
                        )
                        for field, kind in VITAL_FIELD_TO_KIND.items()
                        if (value := vitals.get(field)) is not None
                    ]
                )
            ProcessedOperation.objects.create(
                actor=actor,
                operation_id=operation_id,
                request_hash=request_hash,
                emergency=emergency,
                action="emergency.created",
            )
            AuditEvent.objects.create(
                actor=actor,
                institution=assignment.ambulance.institution,
                ambulance=assignment.ambulance,
                action="emergency.created",
                object_type="emergency",
                object_id=emergency.pk,
                result=AuditEvent.Result.SUCCESS,
                correlation_id=operation_id,
            )
            publish_emergency_event(emergency.pk, "emergency.created", emergency.version)
            if emergency.triage:
                from emergencies.updates import triage_audit

                triage_audit(emergency, actor, operation_id)

        return Response(
            emergency_representation(emergency),
            status=status.HTTP_201_CREATED,
        )


class EmergencyDetailView(NoStoreResourceView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, emergency_id):
        emergency = (
            authorized_emergencies(request.user, include_terminal=True)
            .filter(pk=emergency_id)
            .first()
        )
        if emergency is None:
            from rest_framework.exceptions import NotFound

            raise NotFound("El episodio no está disponible.")
        return Response(emergency_representation(emergency))


class EmergencyTransitionView(APIView):
    permission_classes = (IsAuthenticated,)
    action = ""
    actor_group = ""
    serializer_class = EmergencyOperationSerializer

    def post(self, request, emergency_id):
        if not isinstance(request.data, dict):
            raise ValidationError({"request": "Revisa el formato de la solicitud."})
        serializer = self.serializer_class(data=request.data)
        unknown_fields = set(request.data) - set(serializer.fields)
        if unknown_fields:
            raise ValidationError({"request": "La solicitud contiene campos no admitidos."})
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        operation_id = values["operation_id"]
        expected_version = values["expected_version"]
        request_hash = hashlib.sha256(
            json.dumps(
                {
                    "action": self.action,
                    "emergency_id": str(emergency_id),
                    **values,
                },
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
                cls=DjangoJSONEncoder,
            ).encode("utf-8")
        ).hexdigest()

        if not request.user.groups.filter(name=self.actor_group).exists():
            raise PermissionDenied("La acción no está permitida para este perfil.")

        User = get_user_model()
        with transaction.atomic():
            actor = (
                User.objects.select_for_update(no_key=True)
                .filter(pk=request.user.pk, is_active=True)
                .first()
            )
            if actor is None or not actor.groups.filter(name=self.actor_group).exists():
                raise PermissionDenied("La acción no está permitida para este perfil.")
            emergency = (
                Emergency.objects.select_for_update(of=("self",))
                .select_related("operating_institution", "destination", "ambulance")
                .filter(pk=emergency_id)
                .first()
            )
            if emergency is None:
                raise NotFound("El episodio no está disponible.")

            self.authorize_scope(actor, emergency)

            previous = ProcessedOperation.objects.filter(
                actor=actor, operation_id=operation_id
            ).first()
            if previous:
                if (
                    previous.action != self.action
                    or previous.emergency_id != emergency.pk
                    or previous.request_hash != request_hash
                ):
                    raise OperationConflict()
                return Response(
                    self.representation(emergency),
                    status=status.HTTP_200_OK,
                    headers={"Idempotent-Replay": "true"},
                )

            if emergency.version != expected_version:
                raise OperationConflict(
                    "La versión del episodio cambió; actualiza y vuelve a revisar."
                )

            applied = self.apply_transition(emergency, actor, values) is not False
            if applied:
                emergency.version += 1
                emergency.save(update_fields=self.update_fields)
            ProcessedOperation.objects.create(
                actor=actor,
                operation_id=operation_id,
                request_hash=request_hash,
                emergency=emergency,
                action=self.action,
            )
            if applied:
                AuditEvent.objects.create(
                    actor=actor,
                    institution=self.audit_institution(emergency),
                    ambulance=emergency.ambulance,
                    action=self.action,
                    object_type="emergency",
                    object_id=str(emergency.pk),
                    result=AuditEvent.Result.SUCCESS,
                    correlation_id=operation_id,
                )
                publish_emergency_event(emergency.pk, self.action, emergency.version)

        return Response(
            self.representation(emergency),
            status=status.HTTP_200_OK,
            headers={"Milestone-Already-Recorded": "true"} if not applied else {},
        )

    def authorize_scope(self, actor, emergency):
        if self.actor_group == "ambulance":
            assignment = active_assignment_for(actor, lock=True, lock_unit_only=True)
            membership = (
                InstitutionMembership.objects.select_for_update(of=("self",))
                .filter(
                    user=actor,
                    institution_id=emergency.operating_institution_id,
                    active=True,
                    institution__enabled=True,
                )
                .first()
            )
            if (
                assignment is None
                or assignment.ambulance_id != emergency.ambulance_id
                or not membership
            ):
                raise NotFound("El episodio no está disponible.")
            return
        membership = (
            InstitutionMembership.objects.select_for_update(of=("self",))
            .filter(
                user=actor,
                institution_id=emergency.destination_id,
                active=True,
                institution__enabled=True,
            )
            .first()
        )
        if not membership:
            raise NotFound("El episodio no está disponible.")

    def representation(self, emergency):
        return emergency_representation(emergency)

    def apply_transition(self, emergency, actor, values):
        raise NotImplementedError

    def audit_institution(self, emergency):
        return (
            emergency.operating_institution
            if self.actor_group == "ambulance"
            else emergency.destination
        )


class EmergencyArrivalView(EmergencyTransitionView):
    action = "emergency.arrived"
    actor_group = "urgencias"
    serializer_class = ArrivalConfirmationSerializer
    update_fields = ("status", "arrived_at", "arrived_by", "arrival_reason", "version")

    def apply_transition(self, emergency, actor, values):
        if emergency.status not in (Emergency.Status.NOTIFIED, Emergency.Status.IN_TRANSIT):
            raise OperationConflict("El episodio ya no admite confirmación de llegada.")
        reason = values.get("reason", "")
        if emergency.status == Emergency.Status.NOTIFIED and not reason:
            raise ValidationError(
                {
                    "reason": "Explica por qué se confirma la llegada sin inicio de traslado registrado."
                }
            )
        emergency.status = Emergency.Status.ARRIVED
        emergency.arrived_at = timezone.now()
        emergency.arrived_by = actor
        emergency.arrival_reason = reason


class EmergencyTransferStartView(EmergencyTransitionView):
    action = "emergency.transfer_started"
    actor_group = "ambulance"

    def apply_transition(self, emergency, actor, values):
        if emergency.status != Emergency.Status.NOTIFIED:
            raise OperationConflict("Solo se puede iniciar el traslado de un episodio notificado.")
        emergency.status = Emergency.Status.IN_TRANSIT
        emergency.transfer_declared_at = timezone.now()
        emergency.transfer_declared_by = actor

    @property
    def update_fields(self):
        return ("status", "transfer_declared_at", "transfer_declared_by", "version")


class EmergencyCancelView(EmergencyTransitionView):
    action = "emergency.cancelled"
    actor_group = "ambulance"
    serializer_class = EmergencyCancellationSerializer

    def apply_transition(self, emergency, actor, values):
        if emergency.status not in (Emergency.Status.NOTIFIED, Emergency.Status.IN_TRANSIT):
            raise OperationConflict(
                "Solo se puede cancelar antes de que Urgencias registre la llegada."
            )
        emergency.status = Emergency.Status.CANCELLED
        emergency.cancelled_at = timezone.now()
        emergency.cancelled_by = actor
        emergency.cancellation_reason = values["reason"]

    @property
    def update_fields(self):
        return ("status", "cancelled_at", "cancelled_by", "cancellation_reason", "version")


class EmergencyCloseView(EmergencyTransitionView):
    action = "emergency.closed"
    actor_group = "urgencias"

    def apply_transition(self, emergency, actor, values):
        if emergency.status != Emergency.Status.ARRIVED:
            raise OperationConflict(
                "Solo se puede cerrar un episodio después de registrar su llegada."
            )
        emergency.status = Emergency.Status.CLOSED
        emergency.closed_at = timezone.now()
        emergency.closed_by = actor

    @property
    def update_fields(self):
        return ("status", "closed_at", "closed_by", "version")
