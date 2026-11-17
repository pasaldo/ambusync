"""Conservative UTC quota, reserved only on an independently committed connection."""

from datetime import UTC

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone

from accounts.models import OutboundMailBudget


def reserve_mail_budget():
    limit = getattr(settings, "BREVO_DAILY_LIMIT", 100)
    if type(limit) is not int or not 1 <= limit <= 100 or connection.in_atomic_block:
        raise OSError("Mail budget unavailable.")
    day = timezone.now().astimezone(UTC).date()
    with transaction.atomic():
        OutboundMailBudget.objects.get_or_create(pk=1, defaults={"day": day})
        row = OutboundMailBudget.objects.select_for_update().get(pk=1)
        if day > row.day:
            row.day, row.used = day, 0
        if row.used >= limit:
            return False
        row.used += 1
        row.save(update_fields=["day", "used"])
    return True
