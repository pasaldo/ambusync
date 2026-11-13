"""Strict non-identifying query filters shared by clinical and administrative reads."""

import re
import uuid
from contextlib import contextmanager
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db import connection, transaction
from rest_framework.exceptions import ValidationError

ZONE = ZoneInfo("America/Santiago")
PAGING = {"page", "page_size", "date_from", "date_to"}


@contextmanager
def read_snapshot():
    # A pre-existing transaction owns its isolation. Ordinary HTTP views enter
    # here without one; all scope, counts, summaries and rows share one snapshot.
    owns_transaction = not connection.in_atomic_block
    with transaction.atomic():
        if owns_transaction:
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        yield


def validated_query(params, extra=()):
    if set(params) - (PAGING | set(extra)) or any(len(params.getlist(key)) != 1 for key in params):
        raise ValidationError(
            {"filters": "Revisa los filtros; no se admiten parámetros desconocidos ni repetidos."}
        )
    values = dict(params.items())
    for key, default, maximum in (("page", 1, 2147483647), ("page_size", 25, 100)):
        raw = values.get(key, str(default))
        if not re.fullmatch(r"[0-9]{1,10}", raw) or not 1 <= int(raw) <= maximum:
            raise ValidationError({key: "Indica un entero positivo dentro del rango permitido."})
        values[key] = int(raw)
    for key in ("date_from", "date_to"):
        if key in values:
            try:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", values[key]):
                    raise ValueError
                values[key] = date.fromisoformat(values[key])
                if key == "date_to":
                    values[key] + timedelta(days=1)
            except ValueError, OverflowError:
                raise ValidationError({key: "Usa una fecha válida YYYY-MM-DD."}) from None
    if (
        values.get("date_from")
        and values.get("date_to")
        and values["date_from"] > values["date_to"]
    ):
        raise ValidationError({"date_to": "La fecha final no puede preceder a la inicial."})
    return values


def date_filter(query, values, field):
    for key, suffix in (("date_from", "gte"), ("date_to", "lt")):
        if key in values:
            day = values[key] + (timedelta(days=1) if suffix == "lt" else timedelta())
            instant = datetime.combine(day, time.min, tzinfo=ZONE).astimezone(UTC)
            query = query.filter(**{f"{field}__{suffix}": instant})
    return query


def choice_filter(values, key, choices):
    if key in values and values[key] not in choices:
        raise ValidationError({key: "Selecciona un valor permitido."})


def uuid_filter(values, key):
    if key not in values:
        return None
    try:
        return uuid.UUID(values[key])
    except ValueError, AttributeError:
        raise ValidationError({key: "Indica un ID válido."}) from None
