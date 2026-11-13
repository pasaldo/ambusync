import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from institutions.models import Ambulance, Institution


class Patient(models.Model):
    """Synthetic master; Emergency retains its own immutable identity snapshot."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    operating_institution = models.ForeignKey(
        Institution, on_delete=models.PROTECT, related_name="synthetic_patients"
    )
    patient_identity_unknown = models.BooleanField()
    patient_alias = models.CharField(max_length=160, blank=True)
    age_value = models.PositiveSmallIntegerField(null=True, blank=True)
    age_unit = models.CharField(max_length=8, blank=True)
    recorded_sex = models.CharField(max_length=1, null=True, blank=True)
    enabled = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_patient_records",
    )

    class Meta:
        ordering = ("created_at", "id")


class Emergency(models.Model):
    class Status(models.TextChoices):
        NOTIFIED = "notificada", "Notificada"
        IN_TRANSIT = "en_traslado", "En traslado"
        ARRIVED = "llegado", "Llegado a Urgencias"
        CANCELLED = "cancelada", "Cancelada"
        CLOSED = "cerrada", "Cerrada"

    class AgeUnit(models.TextChoices):
        YEARS = "years", "Años"
        MONTHS = "months", "Meses"
        DAYS = "days", "Días"

    class RecordedSex(models.TextChoices):
        FEMALE = "F", "Femenino"
        MALE = "M", "Masculino"
        INDETERMINATE = "X", "Indeterminado"

    class Triage(models.TextChoices):
        C1 = "C1", "C1"
        C2 = "C2", "C2"
        C3 = "C3", "C3"
        C4 = "C4", "C4"
        C5 = "C5", "C5"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    operating_institution = models.ForeignKey(
        Institution, on_delete=models.PROTECT, related_name="operated_emergencies"
    )
    destination = models.ForeignKey(
        Institution, on_delete=models.PROTECT, related_name="incoming_emergencies"
    )
    ambulance = models.ForeignKey(Ambulance, on_delete=models.PROTECT, related_name="emergencies")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_emergencies"
    )
    status = models.CharField(max_length=16, choices=Status.choices)
    patient_identity_unknown = models.BooleanField()
    patient_alias = models.CharField(max_length=160, blank=True)
    age_value = models.PositiveSmallIntegerField(null=True, blank=True)
    age_unit = models.CharField(max_length=8, choices=AgeUnit.choices, blank=True)
    recorded_sex = models.CharField(
        max_length=1, choices=RecordedSex.choices, null=True, blank=True
    )
    reason = models.CharField(max_length=2000)
    symptoms = models.JSONField(default=list, blank=True)
    notes = models.CharField(max_length=2000, blank=True)
    triage = models.CharField(max_length=2, choices=Triage.choices, blank=True)
    triage_recorded_at = models.DateTimeField(null=True, blank=True)
    triage_recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="triage_records",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    read_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="first_emergency_reads",
    )
    prepared_at = models.DateTimeField(null=True, blank=True)
    prepared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="first_emergency_preparations",
    )
    transfer_declared_at = models.DateTimeField(null=True, blank=True)
    transfer_declared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="declared_transfers",
    )
    arrived_at = models.DateTimeField(null=True, blank=True)
    arrived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="arrival_confirmations",
    )
    arrival_reason = models.CharField(max_length=2000, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cancelled_emergencies",
    )
    cancellation_reason = models.CharField(max_length=2000, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="closed_emergencies",
    )
    version = models.PositiveIntegerField(default=1)
    patient_record = models.ForeignKey(
        Patient, on_delete=models.PROTECT, null=True, blank=True, related_name="episodes"
    )
    replaces = models.OneToOneField(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="replacement"
    )

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=~Q(pk=models.F("replaces_id")), name="emergency_no_self_replacement"
            ),
            models.CheckConstraint(
                condition=Q(read_at__isnull=True, read_by__isnull=True)
                | Q(read_at__isnull=False, read_by__isnull=False),
                name="emergency_read_actor_time_pair",
            ),
            models.CheckConstraint(
                condition=Q(prepared_at__isnull=True, prepared_by__isnull=True)
                | Q(prepared_at__isnull=False, prepared_by__isnull=False),
                name="emergency_preparation_actor_time_pair",
            ),
            models.CheckConstraint(
                condition=Q(prepared_at__isnull=True) | Q(read_at__isnull=False),
                name="emergency_preparation_requires_read",
            ),
        ]


class ProcessedOperation(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="processed_operations"
    )
    operation_id = models.UUIDField()
    action = models.CharField(max_length=64, default="emergency.created")
    request_hash = models.CharField(max_length=64)
    emergency = models.ForeignKey(
        Emergency, on_delete=models.PROTECT, null=True, blank=True, related_name="operations"
    )
    patient = models.ForeignKey(
        Patient, on_delete=models.PROTECT, null=True, blank=True, related_name="operations"
    )
    symptom = models.ForeignKey(
        "institutions.Symptom",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="operations",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(emergency__isnull=False, patient__isnull=True, symptom__isnull=True)
                    | Q(emergency__isnull=True, patient__isnull=False, symptom__isnull=True)
                    | Q(emergency__isnull=True, patient__isnull=True, symptom__isnull=False)
                ),
                name="operation_exactly_one_target",
            ),
            models.UniqueConstraint(
                fields=("actor", "operation_id"), name="uniq_actor_operation_id"
            ),
        ]


class VitalMeasurement(models.Model):
    class Kind(models.TextChoices):
        HEART_RATE = "heart_rate", "Frecuencia cardíaca"
        SYSTOLIC_PRESSURE = "systolic_pressure", "Presión sistólica"
        DIASTOLIC_PRESSURE = "diastolic_pressure", "Presión diastólica"
        SPO2 = "spo2", "SpO2"
        RESPIRATORY_RATE = "respiratory_rate", "Frecuencia respiratoria"
        TEMPERATURE = "temperature", "Temperatura"
        GLASGOW = "glasgow", "Glasgow"

    class Unit(models.TextChoices):
        BEATS_PER_MINUTE = "lpm", "lpm"
        MMHG = "mmHg", "mmHg"
        PERCENT = "%", "%"
        BREATHS_PER_MINUTE = "rpm", "rpm"
        CELSIUS = "°C", "°C"
        POINTS = "puntos", "puntos"

    UNIT_BY_KIND = {
        Kind.HEART_RATE: Unit.BEATS_PER_MINUTE,
        Kind.SYSTOLIC_PRESSURE: Unit.MMHG,
        Kind.DIASTOLIC_PRESSURE: Unit.MMHG,
        Kind.SPO2: Unit.PERCENT,
        Kind.RESPIRATORY_RATE: Unit.BREATHS_PER_MINUTE,
        Kind.TEMPERATURE: Unit.CELSIUS,
        Kind.GLASGOW: Unit.POINTS,
    }

    emergency = models.ForeignKey(
        Emergency,
        on_delete=models.PROTECT,
        related_name="vital_measurements",
    )
    kind = models.CharField(max_length=24, choices=Kind.choices)
    value = models.DecimalField(max_digits=8, decimal_places=2)
    unit = models.CharField(max_length=8, choices=Unit.choices)
    measured_at = models.DateTimeField()
    recorded_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="recorded_vital_measurements",
    )
    operation_id = models.UUIDField(null=True, blank=True)
    rectifies = models.OneToOneField(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="rectification"
    )
    rectification_reason = models.CharField(max_length=2000, blank=True)
    inherited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("measured_at", "kind", "id")
