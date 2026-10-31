import time
import uuid

from django.conf import settings
from django.contrib.auth import logout
from django.http import JsonResponse


class AbsoluteSessionMiddleware:
    """Enforce a 12-hour absolute lifetime and immediate user-session revocation."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            started_at = request.session.get(settings.SESSION_STARTED_AT_KEY)
            last_interaction_at = request.session.get("ambusync_last_interaction_at")
            session_version = request.session.get(settings.SESSION_VERSION_KEY)

            if started_at is None or last_interaction_at is None or session_version is None:
                # Migrate an authenticated pre-middleware local session to the current policy.
                request.session[settings.SESSION_STARTED_AT_KEY] = time.time()
                request.session["ambusync_last_interaction_at"] = time.time()
                request.session[settings.SESSION_VERSION_KEY] = user.session_version
            elif (
                time.time() - float(started_at) >= settings.SESSION_ABSOLUTE_AGE
                or time.time() - float(last_interaction_at) >= settings.SESSION_IDLE_AGE
                or session_version != user.session_version
            ):
                logout(request)
                return JsonResponse(
                    {
                        "code": "session_expired",
                        "message": "La sesión expiró o fue revocada; inicia sesión nuevamente.",
                        "fields": {},
                        "correlation_id": str(uuid.uuid4()),
                    },
                    status=401,
                )
            elif request.headers.get("X-AmbuSync-User-Interaction") == "1":
                # Polling/telemetry requests must omit this marker and never extend idle expiry.
                request.session["ambusync_last_interaction_at"] = time.time()
                request.session.set_expiry(settings.SESSION_IDLE_AGE)

        return self.get_response(request)
