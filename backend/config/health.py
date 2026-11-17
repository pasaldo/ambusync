"""Minimal deployment probes, deliberately before session/authentication middleware."""

from django.conf import settings
from django.db import connection, transaction
from django.http import HttpResponseNotAllowed, JsonResponse


def probe_response(request, status, code=200):
    response = JsonResponse({"status": status}, status=code)
    response["Cache-Control"] = "no-store"
    response["X-Content-Type-Options"] = "nosniff"
    if request.method == "HEAD":
        response.content = b""
    return response


def live(request):
    return probe_response(request, "ok")


def ready(request):
    try:
        if getattr(settings, "AMBUSYNC_MAIL_MODE", "brevo") == "mailpit":
            from config.test_mailbox import capture_services_ready

            if not capture_services_ready():
                return probe_response(request, "unavailable", 503)
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute("SELECT current_setting('statement_timeout')")
            previous = cursor.fetchone()[0]
            cursor.execute("SET LOCAL statement_timeout = '1000ms'")
            cursor.execute("SELECT 1")
            if cursor.fetchone() != (1,):
                raise ValueError
            cursor.execute("SELECT set_config('statement_timeout', %s, true)", [previous])
        return probe_response(request, "ok")
    except Exception:  # noqa: BLE001 -- database exceptions can contain credentials.
        return probe_response(request, "unavailable", 503)


class HealthProbeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        view = {"/health/live/": live, "/health/ready/": ready}.get(request.path)
        if view is None:
            return self.get_response(request)
        if request.method not in ("GET", "HEAD"):
            return HttpResponseNotAllowed(["GET", "HEAD"])
        return view(request)
