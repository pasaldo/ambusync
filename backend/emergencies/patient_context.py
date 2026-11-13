"""Explicit episode correction, never propagation from or to the patient master."""

from rest_framework import serializers

from emergencies.models import PatientContextCorrection
from emergencies.patient_records import PATIENT_FIELDS, PatientUpdateSerializer, patient_snapshot
from emergencies.resource_mutations import NoStoreResourceView
from emergencies.serializers import validate_text
from emergencies.updates import PreReceptionUpdateView


class PatientContextSerializer(PatientUpdateSerializer):
    reason = serializers.CharField(min_length=3, max_length=2000, validators=[validate_text])


class PatientContextView(PreReceptionUpdateView, NoStoreResourceView):
    action = "emergency.patient_context_corrected"
    serializer_class = PatientContextSerializer
    update_fields = (*PATIENT_FIELDS, "version")

    def apply_transition(self, emergency, actor, values):
        self.require_open(emergency)
        previous = patient_snapshot(emergency)
        defaults = {"patient_alias": "", "age_value": None, "age_unit": "", "recorded_sex": None}
        for field in PATIENT_FIELDS:
            setattr(emergency, field, values.get(field, defaults.get(field)))
        PatientContextCorrection.objects.create(
            emergency=emergency,
            previous_patient=previous,
            corrected_patient=patient_snapshot(emergency),
            reason=values["reason"],
            recorded_by=actor,
            operation_id=values["operation_id"],
            episode_version=emergency.version + 1,
        )
