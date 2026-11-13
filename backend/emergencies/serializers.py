import unicodedata
from datetime import datetime
from decimal import Decimal

from django.utils import timezone
from django.utils.dateparse import parse_datetime
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


class MeasurementTimestampField(serializers.DateTimeField):
    def to_internal_value(self, value):
        try:
            parsed = value if isinstance(value, datetime) else parse_datetime(str(value))
        except ValueError:
            parsed = None
        if parsed is None or timezone.is_naive(parsed):
            raise serializers.ValidationError("Indica fecha/hora ISO con zona horaria explícita.")
        return super().to_internal_value(value)


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
    taken_at = MeasurementTimestampField(required=False)

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            return super().to_internal_value(data)
        unknown_fields = set(data) - set(self.fields)
        if unknown_fields:
            raise serializers.ValidationError(
                "La solicitud contiene campos de signos vitales no admitidos."
            )
        return super().to_internal_value(data)

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
        for name in VITAL_FIELD_TO_KIND:
            value = attrs.get(name)
            if value is not None and abs(Decimal(str(value))) >= Decimal(1000000):
                raise serializers.ValidationError(
                    {name: "El valor excede la capacidad del campo (6 dígitos enteros)."}
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


class ArrivalConfirmationSerializer(serializers.Serializer):
    operation_id = serializers.UUIDField()
    expected_version = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(
        max_length=2000, allow_blank=True, required=False, trim_whitespace=True
    )


class EmergencyOperationSerializer(serializers.Serializer):
    operation_id = serializers.UUIDField()
    expected_version = serializers.IntegerField(min_value=1)


class EmergencyCancellationSerializer(EmergencyOperationSerializer):
    reason = serializers.CharField(min_length=3, max_length=2000, trim_whitespace=True)


def validate_text(value):
    if any(
        unicodedata.category(character) == "Cc" and character not in "\n\r\t" for character in value
    ):
        raise serializers.ValidationError("El texto contiene caracteres de control no admitidos.")
    return value


def validate_label(value):
    validate_text(value)
    if any(character in value for character in "\n\r\t"):
        raise serializers.ValidationError("El síntoma debe estar en una sola línea, sin controles.")
    return value


class EmergencyUpdateSerializer(EmergencyOperationSerializer):
    reason = serializers.CharField(
        min_length=3, max_length=2000, required=False, validators=[validate_text]
    )
    notes = serializers.CharField(
        max_length=2000, allow_blank=True, required=False, validators=[validate_text]
    )
    symptoms = serializers.ListField(
        child=serializers.CharField(max_length=120, validators=[validate_label]),
        max_length=20,
        required=False,
    )
    triage = serializers.ChoiceField(
        choices=Emergency.Triage.choices, allow_blank=True, allow_null=True, required=False
    )

    def validate(self, attrs):
        if not set(attrs) & {"reason", "notes", "symptoms", "triage"}:
            raise serializers.ValidationError(
                "Indica al menos un antecedente o triaje para actualizar."
            )
        symptoms = [item.casefold() for item in attrs.get("symptoms", [])]
        if len(set(symptoms)) != len(symptoms):
            raise serializers.ValidationError({"symptoms": "No repitas síntomas en el episodio."})
        return attrs


class EmergencyMeasurementsSerializer(EmergencyOperationSerializer):
    vitals = VitalsCreateSerializer()

    def validate_vitals(self, value):
        if not any(value.get(name) is not None for name in VITAL_FIELD_TO_KIND):
            raise serializers.ValidationError(
                "Indica al menos una medición; no se sustituyen ausencias por cero."
            )
        return value


class EmergencyRectificationSerializer(EmergencyOperationSerializer):
    measurement_id = serializers.IntegerField(min_value=1)
    value = serializers.DecimalField(max_digits=8, decimal_places=2)
    unit = serializers.ChoiceField(choices=VitalMeasurement.Unit.choices)
    measured_at = MeasurementTimestampField()
    reason = serializers.CharField(min_length=3, max_length=2000, validators=[validate_text])


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
                "id": str(item.pk),
                "kind": item.kind,
                "value": float(item.value),
                "unit": item.unit,
                "measured_at": item.measured_at.isoformat(),
                "recorded_at": item.recorded_at.isoformat(),
                "recorded_by_id": str(item.recorded_by_id),
                "operation_id": str(item.operation_id) if item.operation_id else None,
                "rectifies_id": str(item.rectifies_id) if item.rectifies_id else None,
                "rectified_by_id": str(item.rectification.pk)
                if hasattr(item, "rectification")
                else None,
                "is_current": not hasattr(item, "rectification"),
                "rectification_reason": item.rectification_reason,
            }
            for item in emergency.vital_measurements.select_related("rectification").all()
        ],
        "triage": emergency.triage or None,
        "triage_recorded_at": emergency.triage_recorded_at.isoformat()
        if emergency.triage_recorded_at
        else None,
        "triage_recorded_by_id": str(emergency.triage_recorded_by_id)
        if emergency.triage_recorded_by_id
        else None,
        "created_at": emergency.created_at.isoformat(),
        "read_at": emergency.read_at.isoformat() if emergency.read_at else None,
        "read_by_id": str(emergency.read_by_id) if emergency.read_by_id else None,
        "prepared_at": emergency.prepared_at.isoformat() if emergency.prepared_at else None,
        "prepared_by_id": str(emergency.prepared_by_id) if emergency.prepared_by_id else None,
        "transfer_declared_at": (
            emergency.transfer_declared_at.isoformat() if emergency.transfer_declared_at else None
        ),
        "transfer_declared_by_id": (
            str(emergency.transfer_declared_by_id) if emergency.transfer_declared_by_id else None
        ),
        "arrived_at": emergency.arrived_at.isoformat() if emergency.arrived_at else None,
        "arrived_by_id": str(emergency.arrived_by_id) if emergency.arrived_by_id else None,
        "arrival_reason": emergency.arrival_reason,
        "cancelled_at": emergency.cancelled_at.isoformat() if emergency.cancelled_at else None,
        "cancelled_by_id": str(emergency.cancelled_by_id) if emergency.cancelled_by_id else None,
        "cancellation_reason": emergency.cancellation_reason,
        "closed_at": emergency.closed_at.isoformat() if emergency.closed_at else None,
        "closed_by_id": str(emergency.closed_by_id) if emergency.closed_by_id else None,
        "version": emergency.version,
    }
