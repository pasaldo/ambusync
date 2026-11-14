from django.contrib.auth import logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.recovery import GENERIC_REQUEST, allow_attempt, complete_recovery, request_recovery
from config.api_errors import error_response
from config.http import NoStoreResourceView


class RecoveryRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class RecoveryCompleteSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    token = serializers.CharField(min_length=32, max_length=128, trim_whitespace=False)
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    password_confirmation = serializers.CharField(max_length=128, trim_whitespace=False)


def strict_body(serializer_class, body):
    serializer = serializer_class(data=body)
    if not isinstance(body, dict) or set(body) != set(serializer.fields):
        raise serializers.ValidationError("La solicitud contiene campos no admitidos.")
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


@method_decorator(csrf_protect, name="dispatch")
class RecoveryRequestView(NoStoreResourceView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request):
        data = strict_body(RecoveryRequestSerializer, request.data)
        origin = request.META.get("REMOTE_ADDR", "unknown")
        if not allow_attempt(data["email"], origin, "recovery-request"):
            return error_response(
                "recovery_throttled", "Espera antes de solicitar otra recuperación.", 429
            )
        from functools import partial

        from django.db import transaction

        from accounts.recovery_delivery import enqueue_request

        transaction.on_commit(partial(enqueue_request, data["email"], origin))
        return Response({"message": GENERIC_REQUEST}, status=202)


@method_decorator(csrf_protect, name="dispatch")
class RecoveryCompleteView(NoStoreResourceView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request):
        data = strict_body(RecoveryCompleteSerializer, request.data)
        if not allow_attempt(str(data["id"]), request.META.get("REMOTE_ADDR"), "recovery-confirm"):
            return error_response("recovery_throttled", "Espera antes de volver a intentarlo.", 429)
        complete_recovery(
            data["id"], data["token"], data["password"], data["password_confirmation"]
        )
        logout(request._request)
        return Response({"recovered": True})


@method_decorator(csrf_protect, name="dispatch")
class ManagedRecoveryRequestView(NoStoreResourceView):
    from rest_framework.permissions import IsAuthenticated

    permission_classes = (IsAuthenticated,)

    def post(self, request, user_id):
        from django.db import transaction
        from rest_framework.exceptions import PermissionDenied, ValidationError

        from accounts.recovery import recovery_audit
        from institutions.unit_management import lock_management_users, managed_membership

        if not isinstance(request.data, dict) or request.data:
            raise ValidationError(
                "La solicitud no admite contraseña, correo ni campos adicionales."
            )
        with transaction.atomic():
            actor, institution, target = lock_management_users(request.user.pk, user_id)
            if (
                not actor.is_active
                or actor.is_staff
                or actor.is_superuser
                or actor.groups.filter(name="system_admin").exists()
                or not actor.groups.filter(name="urgencias").exists()
            ):
                raise PermissionDenied("Se requiere administración de Urgencias.")
            managed_membership(actor, institution, target)
            if target.groups.filter(name="system_admin").exists():
                raise PermissionDenied("La cuenta no se gestiona por esta vía.")
            if not allow_attempt(str(target.pk), str(actor.pk), "managed-recovery"):
                return error_response(
                    "recovery_throttled", "Espera antes de volver a solicitar.", 429
                )
            request_recovery(target.email, str(actor.pk))
            recovery_audit(target, "account.recovery_requested", actor)
        return Response({"message": GENERIC_REQUEST}, status=202)
