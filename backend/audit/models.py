import uuid

from django.conf import settings
from django.db import models

from institutions.models import Ambulance, Institution


class AuditEvent(models.Model):
    class Result(models.TextChoices):
        SUCCESS = "success", "Éxito"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="audit_events"
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
    )
    action = models.CharField(max_length=64)
    object_type = models.CharField(max_length=64)
    object_id = models.UUIDField()
    result = models.CharField(max_length=16, choices=Result.choices)
    occurred_at = models.DateTimeField(auto_now_add=True)
    correlation_id = models.UUIDField()

    class Meta:
        ordering = ("-occurred_at", "id")


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
