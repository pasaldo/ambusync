"""Institutional addresses only. Never send episode/device information to this service."""

import hashlib
import math
import unicodedata
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from institutions.geocoding_models import GeocodingLookup, GeocodingQuota
from institutions.geocoding_transport import GeocodingTransportError, fetch_json

ATTRIBUTION = "Powered by Geoapify · © OpenStreetMap contributors"


def normalized_address(address):
    if not isinstance(address, str) or not address.strip() or len(address) > 255:
        raise ValidationError(
            {"address": "Indica una dirección institucional completa (máximo255caracteres)."}
        )
    return " ".join(unicodedata.normalize("NFC", address).split()).casefold()


def finite_number(value, low, high):
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and math.isfinite(value)
        and low <= value <= high
    )


def parse_candidates(body):
    rows = body.get("results") if isinstance(body, dict) else None
    if not isinstance(rows, list):
        raise TypeError("Invalid provider result")
    candidates = []
    for row in rows[:5]:
        if not isinstance(row, dict):
            continue
        lat, lon = row.get("lat"), row.get("lon")
        if (
            not finite_number(lat, -90, 90)
            or not finite_number(lon, -180, 180)
            or row.get("country_code") != "cl"
            or row.get("result_type") not in ("building", "amenity")
            or not isinstance(row.get("formatted"), str)
            or not 1 <= len(row["formatted"]) <= 500
        ):
            continue
        rank = row.get("rank")
        confidence = rank.get("confidence") if isinstance(rank, dict) else None
        candidates.append(
            {
                "latitude": lat,
                "longitude": lon,
                "formatted": row["formatted"],
                "result_type": row["result_type"],
                "confidence": confidence if finite_number(confidence, 0, 1) else None,
            }
        )
    return candidates


def fetch_candidates(address):
    return parse_candidates(fetch_json(address, settings.GEOAPIFY_API_KEY))


def lookup_address(address, retry=False):
    address = normalized_address(address)
    key = hashlib.sha256(("geoapify:cl:es:v1:" + address).encode()).hexdigest()
    now = timezone.now()
    # No HTTP while holding database locks. A reserved lookup remains pending after process loss;
    # an explicit retry can reclaim it after the timeout, always using a fresh quota reservation.
    with transaction.atomic():
        GeocodingQuota.objects.get_or_create(pk=1, defaults={"day": now.date()})
        quota = GeocodingQuota.objects.select_for_update().get(pk=1)
        row, created = GeocodingLookup.objects.get_or_create(pk=key, defaults={"address": address})
        configuration_restored = row.status == "not_configured" and bool(settings.GEOAPIFY_API_KEY)
        if (
            not created
            and not configuration_restored
            and (
                row.status in ("ready", "not_found")
                or not retry
                or now - row.updated_at < timedelta(seconds=10)
            )
        ):
            return row
        if not settings.GEOAPIFY_API_KEY:
            row.status = "not_configured"
            row.save()
            return row
        if quota.day != now.date():
            quota.day, quota.used = now.date(), 0
        if quota.used >= min(settings.GEOCODING_DAILY_LIMIT, 3000):
            row.status = "quota_exceeded"
            row.save()
            return row
        if quota.last_request_at and now - quota.last_request_at < timedelta(seconds=1):
            row.status = "rate_limited"
            row.save()
            return row
        quota.used += 1
        quota.last_request_at = now
        quota.save()
        row.status = "pending"
        row.save()
    diagnostic = None
    try:
        candidates = fetch_candidates(address)
        status = "ready" if candidates else "not_found"
    except GeocodingTransportError as error:
        candidates, status = [], "unavailable"
        diagnostic = error.diagnostic()
    except Exception:  # noqa: BLE001 -- provider exceptions may contain apiKey in URL; never log/echo them.
        candidates, status = [], "unavailable"
        diagnostic = {"code": "worker_failure"}
    GeocodingLookup.objects.filter(pk=key).update(
        candidates=candidates, status=status, updated_at=timezone.now()
    )
    row.refresh_from_db()
    if diagnostic is not None:
        # Request-local only: do not persist error data or overwrite candidate storage.
        row._diagnostic = diagnostic
    return row


def confirmed_location(address, selection):
    if selection is None:
        return None
    if not isinstance(selection, dict) or set(selection) != {"lookup_id", "index"}:
        raise ValidationError(
            {"location_selection": "Selecciona una ubicación encontrada, no coordenadas libres."}
        )
    if (
        not isinstance(selection["lookup_id"], str)
        or len(selection["lookup_id"]) != 64
        or type(selection["index"]) is not int
    ):
        raise ValidationError({"location_selection": "La selección no es válida."})
    row = GeocodingLookup.objects.filter(
        pk=selection["lookup_id"], address=normalized_address(address), status="ready"
    ).first()
    if row is None or not 0 <= selection["index"] < len(row.candidates):
        raise ValidationError(
            {"location_selection": "La dirección cambió o la ubicación ya no está disponible."}
        )
    return {
        **row.candidates[selection["index"]],
        "address": address.strip(),
        "provider": "geoapify",
        "attribution": ATTRIBUTION,
        "resolved_at": row.updated_at.isoformat(),
        "confirmed_at": timezone.now().isoformat(),
    }
