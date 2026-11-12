import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from institutions.models import Ambulance, Institution


class AuditEvent(models.Model):
    class Result(models.TextChoices):
        SUCCESS = "success", "Éxito"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="audit_events",
        null=True,
        blank=True,
    )
    institution = models.ForeignKey(
        Institution,
        on_delete=models.PROTECT,
        related_name="audit_events",
    )
    ambulance = models.ForeignKey(
        Ambulance,
        on_delete=models.PROTECT,
        related_name="audit_events",
        null=True,
        blank=True,
    )
    action = models.CharField(max_length=64)
    object_type = models.CharField(max_length=64)
    object_id = models.CharField(max_length=64)
    result = models.CharField(max_length=16, choices=Result.choices)
    occurred_at = models.DateTimeField(auto_now_add=True)
    correlation_id = models.UUIDField()
    executor = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ("-occurred_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(actor__isnull=False, executor="") | Q(actor__isnull=True) & ~Q(executor="")
                ),
                name="audit_event_actor_or_executor",
            ),
        ]


class SessionRevocationEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="session_revocation_events",
    )
    executor = models.CharField(max_length=255)
    reason = models.CharField(max_length=500)
    resulting_session_version = models.PositiveBigIntegerField()
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-occurred_at", "id")


class RetentionExecution(models.Model):
    class Mode(models.TextChoices):
        DRY_RUN = "dry_run", "Simulación"
        APPLY = "apply", "Aplicación"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mode = models.CharField(max_length=16, choices=Mode.choices)
    command_version = models.CharField(max_length=32)
    as_of = models.DateTimeField()
    pilot_closed_at = models.DateTimeField(null=True, blank=True)
    executed_at = models.DateTimeField(auto_now_add=True)
    executor = models.CharField(max_length=255)
    result = models.CharField(max_length=16)
    counts = models.JSONField(default=dict)
    errors = models.JSONField(default=list)


class PilotClosure(models.Model):
    """One formal closure for this synthetic pilot, recorded outside the HTTP UI."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    closed_at = models.DateTimeField()
    recorded_at = models.DateTimeField(auto_now_add=True)
    executor = models.CharField(max_length=255)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(pk=1), name="single_pilot_closure")]


class TechnicalLog(models.Model):
    """Minimal application log retained for the approved 30-day window."""

    class Level(models.TextChoices):
        INFO = "info", "Información"
        WARNING = "warning", "Advertencia"
        ERROR = "error", "Error"

    occurred_at = models.DateTimeField(auto_now_add=True)
    level = models.CharField(max_length=16, choices=Level.choices)
    event = models.CharField(max_length=96)
    result = models.CharField(max_length=32, default="success")
    correlation_id = models.UUIDField(null=True, blank=True)
    details = models.JSONField(default=dict)
