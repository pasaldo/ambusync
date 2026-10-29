import hashlib
import json

from django.contrib.auth import get_user_model
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import AuditEvent
from emergencies.models import Emergency, ProcessedOperation, VitalMeasurement
from emergencies.serializers import (
    VITAL_FIELD_TO_KIND,
    EmergencyCreateSerializer,
    emergency_representation,
)
from institutions.models import AmbulanceAssignment, Institution, InstitutionMembership


class OperationConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "operation_conflict"
    default_detail = "La operación entra en conflicto con un resultado previo."


def active_assignment_for(user, lock=False):
    assignments = AmbulanceAssignment.objects.select_related("ambulance__institution")
    if lock:
        assignments = assignments.select_for_update()
    return assignments.filter(
        user=user,
        active=True,
        ambulance__enabled=True,
        ambulance__institution__enabled=True,
    ).first()


def authorized_emergencies(user):
    visible = Emergency.objects.none()
    if user.groups.filter(name="ambulance").exists():
        assignment = active_assignment_for(user)
        if assignment:
            visible = visible | Emergency.objects.filter(ambulance=assignment.ambulance)
    if user.groups.filter(name="urgencias").exists():
        institutions = InstitutionMembership.objects.filter(
            user=user,
            active=True,
            institution__enabled=True,
        ).values_list("institution_id", flat=True)
        visible = visible | Emergency.objects.filter(destination_id__in=institutions)
    return (
        visible.distinct()
        .select_related("operating_institution", "destination", "ambulance")
        .prefetch_related("vital_measurements")
    )


class EmergencyPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class EmergencyListCreateView(APIView):
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
                InstitutionMembership.objects.select_for_update()
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
                if previous.request_hash != request_hash:
                    raise OperationConflict()
                if not authorized_emergencies(actor).filter(pk=previous.emergency_id).exists():
                    raise PermissionDenied("La operación ya no está dentro del ámbito autorizado.")
                return Response(
                    emergency_representation(previous.emergency),
                    status=status.HTTP_200_OK,
                    headers={"Idempotent-Replay": "true"},
                )

            emergency = Emergency.objects.create(
                operating_institution=assignment.ambulance.institution,
                destination=destination,
                ambulance=assignment.ambulance,
                created_by=actor,
                status=Emergency.Status.IN_TRANSIT
                if transfer_started
                else Emergency.Status.NOTIFIED,
                transfer_declared_at=timezone.now() if transfer_started else None,
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

        return Response(
            emergency_representation(emergency),
            status=status.HTTP_201_CREATED,
        )


class EmergencyDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, emergency_id):
        emergency = authorized_emergencies(request.user).filter(pk=emergency_id).first()
        if emergency is None:
            from rest_framework.exceptions import NotFound

            raise NotFound("El episodio no está disponible.")
        return Response(emergency_representation(emergency))
