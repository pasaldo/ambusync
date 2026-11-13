"""Patient masters are only available to their assigned-unit users, not receivers."""

from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated

from audit.models import AuditEvent
from emergencies.models import Emergency, Patient
from emergencies.resource_mutations import NoStoreResourceView, ResourceMutationView
from emergencies.serializers import EmergencyCreateSerializer, EmergencyOperationSerializer
from emergencies.views import (
    EmergencyPagination,
    EmergencyTransitionView,
    OperationConflict,
    active_assignment_for,
)
from institutions.models import Institution, InstitutionMembership

PATIENT_FIELDS = (
    "patient_identity_unknown",
    "patient_alias",
    "age_value",
    "age_unit",
    "recorded_sex",
)


def patient_snapshot(patient):
    return {
        "identity_unknown": patient.patient_identity_unknown,
        "alias": patient.patient_alias or None,
        "age_value": patient.age_value,
        "age_unit": patient.age_unit or None,
        "recorded_sex": patient.recorded_sex,
    }


def patient_representation(patient):
    return {
        "id": str(patient.pk),
        "enabled": patient.enabled,
        "version": patient.version,
        "patient": patient_snapshot(patient),
    }


def patient_unit(actor, lock=False):
    if (
        not actor.groups.filter(name="ambulance").exists()
        or actor.groups.filter(name="system_admin").exists()
    ):
        raise PermissionDenied("Se requiere una unidad de ambulancia habilitada.")
    assignment = active_assignment_for(actor, lock=lock, lock_unit_only=True)
    if (
        not assignment
        or not InstitutionMembership.objects.filter(
            user=actor,
            institution_id=assignment.ambulance.institution_id,
            active=True,
            institution__enabled=True,
        ).exists()
    ):
        raise PermissionDenied("La cuenta no tiene una unidad habilitada.")
    return assignment.ambulance


def unit_patients(unit):
    return Patient.objects.filter(
        operating_institution_id=unit.institution_id, episodes__ambulance_id=unit.pk
    ).distinct()


def resolve_patient(actor, unit, values, operation_id):
    """Caller holds actor/unit; creation and deactivation serialize on patient."""
    if "patient_id" in values:
        # Resolve scope without DISTINCT in the locking query.
        if not unit_patients(unit).filter(pk=values["patient_id"]).exists():
            raise NotFound("El paciente no está disponible para esta unidad.")
        patient = Patient.objects.select_for_update(no_key=True).get(pk=values.pop("patient_id"))
        expected = values.pop("patient_version")
        if not patient.enabled or patient.version != expected:
            raise OperationConflict("El paciente cambió o está desactivado; revisa la selección.")
        values.update({field: getattr(patient, field) for field in PATIENT_FIELDS})
        return patient
    context = {field: values.get(field) for field in PATIENT_FIELDS if field in values}
    patient = Patient.objects.create(
        operating_institution_id=unit.institution_id, created_by=actor, **context
    )
    AuditEvent.objects.create(
        actor=actor,
        institution_id=unit.institution_id,
        ambulance=unit,
        action="patient.created",
        object_type="patient",
        object_id=str(patient.pk),
        result=AuditEvent.Result.SUCCESS,
        correlation_id=operation_id,
    )
    return patient


class PatientListView(NoStoreResourceView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        unit = patient_unit(request.user)
        paginator = EmergencyPagination()
        rows = paginator.paginate_queryset(
            unit_patients(unit).filter(enabled=True).order_by("created_at", "id"),
            request,
            view=self,
        )
        return paginator.get_paginated_response(
            [patient_representation(patient) for patient in rows]
        )


class PatientUpdateSerializer(EmergencyOperationSerializer):
    patient_identity_unknown = serializers.BooleanField()
    patient_alias = serializers.CharField(max_length=160, allow_blank=True, required=False)
    age_value = serializers.IntegerField(
        min_value=0, max_value=130, allow_null=True, required=False
    )
    age_unit = serializers.ChoiceField(
        choices=Emergency.AgeUnit.choices, allow_blank=True, required=False
    )
    recorded_sex = serializers.ChoiceField(
        choices=Emergency.RecordedSex.choices, allow_null=True, required=False
    )

    def validate(self, attrs):
        return EmergencyCreateSerializer.validate(self, attrs)


class PatientUpdateView(ResourceMutationView):
    required_groups = ("ambulance",)
    action = "patient.updated"
    target_field = "patient"
    serializer_class = PatientUpdateSerializer
    representation = staticmethod(patient_representation)

    def authorize(self, actor, kwargs):
        unit = patient_unit(actor, lock=True)
        if not unit_patients(unit).filter(pk=kwargs["patient_id"]).exists():
            raise NotFound("El paciente no está disponible para esta unidad.")
        return Patient.objects.select_for_update(no_key=True).get(pk=kwargs["patient_id"])

    def institution_id(self, target):
        return target.operating_institution_id

    def apply(self, actor, target, context, values):
        if not target.enabled:
            raise OperationConflict("El paciente está desactivado.")
        defaults = {"patient_alias": "", "age_value": None, "age_unit": "", "recorded_sex": None}
        for field in PATIENT_FIELDS:
            setattr(target, field, values.get(field, defaults.get(field)))
        target.version += 1
        target.save(update_fields=[*PATIENT_FIELDS, "version"])
        return target, True


class PatientDeactivateView(ResourceMutationView):
    required_groups = ("urgencias", "deactivate_patients")
    action = "patient.deactivated"
    target_field = "patient"
    serializer_class = EmergencyOperationSerializer

    def authorize(self, actor, kwargs):
        episode = Emergency.objects.filter(pk=kwargs["emergency_id"]).first()
        if episode is None or episode.patient_record_id is None:
            raise NotFound("El paciente no está disponible en este episodio.")
        EmergencyTransitionView().authorize_scope(actor, episode)
        # Match creation's destination-before-patient ordering, including audit FK.
        if (
            not Institution.objects.select_for_update(no_key=True)
            .filter(pk=episode.destination_id, enabled=True)
            .first()
        ):
            raise NotFound("El establecimiento ya no está habilitado.")
        self.destination_id = episode.destination_id
        return Patient.objects.select_for_update(no_key=True).get(pk=episode.patient_record_id)

    def institution_id(self, target):
        return self.destination_id

    def representation(self, target):
        return {"id": str(target.pk), "enabled": target.enabled, "version": target.version}

    def apply(self, actor, target, context, values):
        if (
            Emergency.objects.filter(patient_record=target)
            .exclude(status__in=("cerrada", "cancelada"))
            .exists()
        ):
            raise OperationConflict(
                "El paciente tiene episodios pendientes; no se puede desactivar."
            )
        if not target.enabled:
            return target, False
        target.enabled = False
        target.version += 1
        target.save(update_fields=["enabled", "version"])
        return target, True
