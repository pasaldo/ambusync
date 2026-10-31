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
