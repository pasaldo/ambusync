"""Atomic cancellation/replacement; links never grant access to another episode."""

from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from audit.models import AuditEvent
from emergencies.events import publish_emergency_event
from emergencies.models import Emergency, VitalMeasurement
from emergencies.serializers import (
    EmergencyCancellationSerializer,
    emergency_representation,
    validate_text,
)
from emergencies.views import EmergencyTransitionView, OperationConflict
from institutions.models import Institution


class DestinationChangeSerializer(EmergencyCancellationSerializer):
    destination_id = serializers.UUIDField()
    reason = serializers.CharField(min_length=3, max_length=2000, validators=[validate_text])


# Only sender-provided episode context. Never copy receiver milestones or records.
CONTEXT_FIELDS = (
    "patient_identity_unknown",
    "patient_alias",
    "age_value",
    "age_unit",
    "recorded_sex",
    "reason",
    "symptoms",
    "notes",
    "triage",
    "triage_recorded_at",
    "triage_recorded_by_id",
    "transfer_declared_at",
    "transfer_declared_by_id",
)


class EmergencyDestinationChangeView(EmergencyTransitionView):
    actor_group = "ambulance"
    action = "emergency.destination_changed"
    serializer_class = DestinationChangeSerializer
    update_fields = ("status", "cancelled_at", "cancelled_by", "cancellation_reason", "version")

    def apply_transition(self, emergency, actor, values):
        if emergency.status not in (Emergency.Status.NOTIFIED, Emergency.Status.IN_TRANSIT):
            raise OperationConflict(
                "Solo se puede cambiar destino antes de que Urgencias registre llegada."
            )
        if values["destination_id"] == emergency.destination_id:
            raise ValidationError({"destination_id": "Selecciona un destino distinto del actual."})
        destination = (
            Institution.objects.select_for_update(no_key=True)
            .filter(pk=values["destination_id"], enabled=True, kind__in=("receiver", "combined"))
            .first()
        )
        if destination is None:
            raise ValidationError({"destination_id": "El nuevo destino no está disponible."})
        now = timezone.now()
        replacement = Emergency.objects.create(
            patient_record_id=emergency.patient_record_id,
            replaces=emergency,
            operating_institution_id=emergency.operating_institution_id,
            ambulance_id=emergency.ambulance_id,
            destination=destination,
            created_by=actor,
            status=emergency.status,
            **{field: getattr(emergency, field) for field in CONTEXT_FIELDS},
        )
        # Independent local leaves, not recaptured measurements or cross-scope FKs.
        for source in emergency.vital_measurements.filter(rectification__isnull=True):
            copy = VitalMeasurement.objects.create(
                emergency=replacement,
                kind=source.kind,
                value=source.value,
                unit=source.unit,
                measured_at=source.measured_at,
                recorded_by_id=source.recorded_by_id,
                inherited_at=now,
            )
            VitalMeasurement.objects.filter(pk=copy.pk).update(recorded_at=source.recorded_at)
        emergency.status = Emergency.Status.CANCELLED
        emergency.cancelled_at = now
        emergency.cancelled_by = actor
        emergency.cancellation_reason = values["reason"]
        for episode, action in (
            (emergency, "emergency.cancelled"),
            (replacement, "emergency.created"),
        ):
            AuditEvent.objects.create(
                actor=actor,
                institution_id=emergency.operating_institution_id,
                ambulance_id=emergency.ambulance_id,
                action=action,
                object_type="emergency",
                object_id=str(episode.pk),
                result=AuditEvent.Result.SUCCESS,
                correlation_id=values["operation_id"],
            )
        publish_emergency_event(replacement.pk, "emergency.created", 1)

    def representation(self, emergency):
        return {
            "original": emergency_representation(emergency),
            "replacement": emergency_representation(emergency.replacement),
        }
