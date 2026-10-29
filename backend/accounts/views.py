import json
import time

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.security import clear_login_failures, login_is_throttled, record_login_failure
from config.api_errors import error_response
from institutions.models import InstitutionMembership


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfTokenView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        return Response({"csrf_token": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request):
        try:
            body = json.loads(request.body or b"{}")
        except json.JSONDecodeError, UnicodeDecodeError:
            return error_response("validation_error", "Revisa las credenciales.", 400)

        username = body.get("username") if isinstance(body, dict) else None
        password = body.get("password") if isinstance(body, dict) else None
        if isinstance(body, dict) and set(body) - {"username", "password"}:
            return error_response(
                "validation_error",
                "La solicitud contiene campos no admitidos.",
                400,
            )
        if not isinstance(username, str) or not isinstance(password, str):
            return error_response(
                "credentials_invalid",
                "Credenciales inválidas o cuenta no disponible.",
                401,
            )

        remote_addr = request.META.get("REMOTE_ADDR", "unknown")
        retry_after = login_is_throttled(username, remote_addr)
        if retry_after:
            response = error_response(
                "login_throttled",
                "No se pudo iniciar sesión. Espera antes de intentarlo nuevamente.",
                429,
            )
            response["Retry-After"] = str(retry_after)
            return response

        user = authenticate(request, username=username, password=password)
        if user is None:
            record_login_failure(username, remote_addr)
            return error_response(
                "credentials_invalid",
                "Credenciales inválidas o cuenta no disponible.",
                401,
            )

        clear_login_failures(username, remote_addr)
        login(request, user)
        now = time.time()
        request.session[settings.SESSION_STARTED_AT_KEY] = now
        request.session["ambusync_last_interaction_at"] = now
        request.session[settings.SESSION_VERSION_KEY] = user.session_version
        request.session.set_expiry(settings.SESSION_IDLE_AGE)
        return Response({"id": str(user.pk), "username": user.get_username()})


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        logout(request)
        return Response(status=204)


class MeView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        memberships = InstitutionMembership.objects.filter(
            user=request.user,
            active=True,
            institution__enabled=True,
        ).select_related("institution")
        return Response(
            {
                "id": str(request.user.pk),
                "username": request.user.get_username(),
                "groups": sorted(request.user.groups.values_list("name", flat=True)),
                "institutions": [
                    {"id": str(item.institution_id), "name": item.institution.name}
                    for item in memberships
                ],
                "session": {
                    "started_at": request.session.get(settings.SESSION_STARTED_AT_KEY),
                    "idle_expires_at": request.session.get("ambusync_last_interaction_at", 0)
                    + settings.SESSION_IDLE_AGE,
                    "absolute_expires_at": request.session.get(settings.SESSION_STARTED_AT_KEY, 0)
                    + settings.SESSION_ABSOLUTE_AGE,
                },
            }
        )
