"""Versioned, append-only episode updates before reception."""

from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from audit.models import AuditEvent
from emergencies.models import Emergency, VitalMeasurement
from emergencies.serializers import (
    VITAL_FIELD_TO_KIND,
    EmergencyMeasurementsSerializer,
    EmergencyRectificationSerializer,
    EmergencyUpdateSerializer,
    VitalsCreateSerializer,
)
from emergencies.views import EmergencyTransitionView, OperationConflict


def triage_audit(emergency, actor, operation_id):
    AuditEvent.objects.create(
        actor=actor,
        institution_id=emergency.operating_institution_id,
        ambulance_id=emergency.ambulance_id,
        action="emergency.triage_changed",
        object_type="emergency",
        object_id=str(emergency.pk),
        result="success",
        correlation_id=operation_id,
    )


class PreReceptionUpdateView(EmergencyTransitionView):
    actor_group = "ambulance"
    update_fields = ("version",)

    def require_open(self, emergency):
        if emergency.status not in (Emergency.Status.NOTIFIED, Emergency.Status.IN_TRANSIT):
            raise OperationConflict(
                "No se puede modificar después de recepción, cancelación o cierre."
            )


class EmergencyUpdateView(PreReceptionUpdateView):
    action = "emergency.updated"
    serializer_class = EmergencyUpdateSerializer
    update_fields = (
        "reason",
        "notes",
        "symptoms",
        "triage",
        "triage_recorded_at",
        "triage_recorded_by",
        "version",
    )

    def apply_transition(self, emergency, actor, values):
        self.require_open(emergency)
        for name in ("reason", "notes", "symptoms"):
            if name in values:
                setattr(emergency, name, values[name])
        if "triage" in values:
            value = values["triage"] or ""
            if emergency.triage != value:
                triage_audit(emergency, actor, values["operation_id"])
                emergency.triage = value
                emergency.triage_recorded_at = timezone.now()
                emergency.triage_recorded_by = actor


class EmergencyMeasurementsView(PreReceptionUpdateView):
    action = "emergency.measurements_added"
    serializer_class = EmergencyMeasurementsSerializer

    def apply_transition(self, emergency, actor, values):
        self.require_open(emergency)
        vitals = values["vitals"]
        VitalMeasurement.objects.bulk_create(
            [
                VitalMeasurement(
                    emergency=emergency,
                    kind=kind,
                    value=vitals[name],
                    unit=VitalMeasurement.UNIT_BY_KIND[kind],
                    measured_at=vitals["taken_at"],
                    recorded_by=actor,
                    operation_id=values["operation_id"],
                )
                for name, kind in VITAL_FIELD_TO_KIND.items()
                if vitals.get(name) is not None
            ]
        )


class EmergencyRectificationView(PreReceptionUpdateView):
    action = "emergency.measurement_rectified"
    serializer_class = EmergencyRectificationSerializer

    def apply_transition(self, emergency, actor, values):
        self.require_open(emergency)
        original = VitalMeasurement.objects.filter(
            pk=values["measurement_id"], emergency=emergency
        ).first()
        if original is None:
            raise NotFound("La medición no está disponible en este episodio.")
        if VitalMeasurement.objects.filter(rectifies=original).exists():
            raise OperationConflict(
                "La medición ya fue rectificada; revisa el valor vigente de la cadena."
            )
        if values["unit"] != VitalMeasurement.UNIT_BY_KIND[original.kind]:
            raise ValidationError({"unit": "Usa la unidad canónica de la medición original."})
        field = next(name for name, kind in VITAL_FIELD_TO_KIND.items() if kind == original.kind)
        check = VitalsCreateSerializer(
            data={
                field: format(values["value"].normalize(), "f"),
                "taken_at": values["measured_at"],
            }
        )
        check.is_valid(raise_exception=True)
        VitalMeasurement.objects.create(
            emergency=emergency,
            kind=original.kind,
            value=check.validated_data[field],
            unit=values["unit"],
            measured_at=values["measured_at"],
            recorded_by=actor,
            operation_id=values["operation_id"],
            rectifies=original,
            rectification_reason=values["reason"],
        )
