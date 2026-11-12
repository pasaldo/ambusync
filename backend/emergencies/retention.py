"""D-010: global pilot deadlines, independent of episode/audit timestamps."""

from calendar import monthrange
from datetime import datetime, timedelta

from django.core.management.base import CommandError
from django.utils import timezone


def parse_timestamp(raw, name="--as-of"):
    if raw is None:
        return timezone.now()
    try:
        value = datetime.fromisoformat(raw)
    except (ValueError, TypeError, AttributeError) as error:
        raise CommandError(
            f"{name} debe ser una fecha ISO 8601 válida con zona horaria."
        ) from error
    if timezone.is_naive(value):
        raise CommandError(f"{name} debe incluir zona horaria.")
    return value


def deadlines(closed_at):
    if closed_at is None:
        return None, None
    year = closed_at.year + 1
    day = min(closed_at.day, monthrange(year, closed_at.month)[1])
    return closed_at + timedelta(days=90), closed_at.replace(year=year, day=day)
