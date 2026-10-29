from rest_framework import serializers

from emergencies.models import Emergency, VitalMeasurement
from institutions.models import Institution

VITAL_FIELD_TO_KIND = {
    "hr": VitalMeasurement.Kind.HEART_RATE,
    "bp_sys": VitalMeasurement.Kind.SYSTOLIC_PRESSURE,
    "bp_dia": VitalMeasurement.Kind.DIASTOLIC_PRESSURE,
    "spo2": VitalMeasurement.Kind.SPO2,
    "rr": VitalMeasurement.Kind.RESPIRATORY_RATE,
    "temp_c": VitalMeasurement.Kind.TEMPERATURE,
    "glasgow": VitalMeasurement.Kind.GLASGOW,
}


class VitalsCreateSerializer(serializers.Serializer):
    hr = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    bp_sys = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    bp_dia = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    spo2 = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100, required=False, allow_null=True
    )
    rr = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    temp_c = serializers.DecimalField(
        max_digits=6, decimal_places=1, required=False, allow_null=True
    )
    glasgow = serializers.IntegerField(min_value=3, max_value=15, required=False, allow_null=True)
    taken_at = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        measured_values = [attrs.get(name) for name in VITAL_FIELD_TO_KIND]
        has_measurement = any(value is not None for value in measured_values)
        if has_measurement and "taken_at" not in attrs:
            raise serializers.ValidationError(
                {"taken_at": "Indica cuándo se midieron los signos vitales."}
            )
        if not has_measurement and "taken_at" in attrs:
            raise serializers.ValidationError(
                {"taken_at": "No envíes una fecha si no hay mediciones."}
            )
        return attrs


class EmergencyCreateSerializer(serializers.Serializer):
    operation_id = serializers.UUIDField()
    destination_id = serializers.UUIDField()
    transfer_started = serializers.BooleanField(default=False)
    patient_identity_unknown = serializers.BooleanField()
    patient_alias = serializers.CharField(
        max_length=160, allow_blank=True, required=False, trim_whitespace=True
    )
    age_value = serializers.IntegerField(
        min_value=0, max_value=130, required=False, allow_null=True
    )
    age_unit = serializers.ChoiceField(
        choices=Emergency.AgeUnit.choices, required=False, allow_blank=True
    )
    recorded_sex = serializers.ChoiceField(
        choices=Emergency.RecordedSex.choices,
        required=False,
        allow_null=True,
    )
    reason = serializers.CharField(min_length=3, max_length=2000, trim_whitespace=True)
    symptoms = serializers.ListField(
        child=serializers.CharField(max_length=120, trim_whitespace=True),
        max_length=20,
        required=False,
    )
    notes = serializers.CharField(
        max_length=2000, allow_blank=True, required=False, trim_whitespace=True
    )
    vitals = VitalsCreateSerializer(required=False)
    triage = serializers.ChoiceField(
        choices=Emergency.Triage.choices, required=False, allow_blank=True
    )

    def validate_destination_id(self, value):
        destination = Institution.objects.filter(pk=value, enabled=True).first()
        if destination is None or destination.kind not in {
            Institution.Kind.RECEIVER,
            Institution.Kind.COMBINED,
        }:
            raise serializers.ValidationError("El destino no está disponible.")
        return destination

    def validate(self, attrs):
        age_value = attrs.get("age_value")
        age_unit = attrs.get("age_unit", "")
        if (age_value is None) != (not age_unit):
            raise serializers.ValidationError(
                {"age_value": "Indica valor y unidad de edad, o deja ambos sin informar."}
            )
        if age_value is not None:
            limits = {
                Emergency.AgeUnit.YEARS: 130,
                Emergency.AgeUnit.MONTHS: 11,
                Emergency.AgeUnit.DAYS: 30,
            }
            if age_value > limits[age_unit]:
                raise serializers.ValidationError(
                    {"age_value": "La edad supera el máximo para su unidad."}
                )

        alias = attrs.get("patient_alias", "")
        identity_unknown = attrs["patient_identity_unknown"]
        if not identity_unknown and not alias:
            raise serializers.ValidationError(
                {
                    "patient_alias": "Indica un alias de ejemplo o marca la identidad como desconocida."
                }
            )
        if identity_unknown and alias:
            raise serializers.ValidationError(
                {"patient_alias": "No combines identidad desconocida con un alias."}
            )
        symptoms = attrs.get("symptoms", [])
        normalized_symptoms = [symptom.casefold() for symptom in symptoms]
        if len(normalized_symptoms) != len(set(normalized_symptoms)):
            raise serializers.ValidationError({"symptoms": "No repitas síntomas en el episodio."})
        return attrs


def emergency_representation(emergency):
    return {
        "id": str(emergency.pk),
        "operating_institution_id": str(emergency.operating_institution_id),
        "destination_id": str(emergency.destination_id),
        "ambulance_id": str(emergency.ambulance_id),
        "ambulance_code": emergency.ambulance.code,
        "destination_name": emergency.destination.name,
        "status": emergency.status,
        "patient": {
            "identity_unknown": emergency.patient_identity_unknown,
            "alias": emergency.patient_alias or None,
            "age_value": emergency.age_value,
            "age_unit": emergency.age_unit or None,
            "recorded_sex": emergency.recorded_sex,
        },
        "reason": emergency.reason,
        "symptoms": emergency.symptoms,
        "notes": emergency.notes,
        "vital_measurements": [
            {
                "kind": item.kind,
                "value": float(item.value),
                "unit": item.unit,
                "measured_at": item.measured_at.isoformat(),
                "recorded_at": item.recorded_at.isoformat(),
                "recorded_by_id": str(item.recorded_by_id),
            }
            for item in emergency.vital_measurements.all()
        ],
        "triage": emergency.triage or None,
        "created_at": emergency.created_at.isoformat(),
        "transfer_declared_at": (
            emergency.transfer_declared_at.isoformat() if emergency.transfer_declared_at else None
        ),
        "version": emergency.version,
    }
