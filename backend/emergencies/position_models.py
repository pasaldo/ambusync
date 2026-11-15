import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Position(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    emergency = models.ForeignKey(
        "emergencies.Emergency", on_delete=models.PROTECT, related_name="positions"
    )
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    operation_id = models.UUIDField()
    sequence = models.PositiveIntegerField()
    latitude = models.FloatField()
    longitude = models.FloatField()
    accuracy_m = models.FloatField(null=True)
    captured_at = models.DateTimeField()
    received_at = models.DateTimeField()
    clock_consistent = models.BooleanField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("emergency", "sequence"), name="unique_position_sequence"
            ),
            models.UniqueConstraint(
                fields=("actor", "operation_id"), name="unique_position_actor_operation"
            ),
            models.CheckConstraint(
                condition=Q(
                    latitude__gte=-90, latitude__lte=90, longitude__gte=-180, longitude__lte=180
                ),
                name="position_coordinate_ranges",
            ),
            models.CheckConstraint(
                condition=Q(accuracy_m__isnull=True) | Q(accuracy_m__gte=0),
                name="position_accuracy_nonnegative",
            ),
        ]
        indexes = [
            models.Index(
                fields=("emergency", "-captured_at", "-sequence"), name="position_latest_idx"
            )
        ]
