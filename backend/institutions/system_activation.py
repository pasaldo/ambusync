"""Resend only the audited, still-pending first administrator invitation."""

import hashlib
import secrets
import smtplib
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, Throttled, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AccountActivation, User
from audit.models import AuditEvent
from institutions.account_management import send_activation_email
from institutions.models import AmbulanceAssignment, Institution, InstitutionMembership

LIFETIME = timedelta(hours=24)
COOLDOWN = timedelta(seconds=60)


def _first_user_id(institution):
    events = list(AuditEvent.objects.filter(
        institution=institution, action="system.institution.first_admin_created",
        object_type="account", result=AuditEvent.Result.SUCCESS,
    ).values_list("object_id", flat=True)[:2])
    if len(events) != 1:
        return None
    try:
        return int(events[0])
    except (ValueError, TypeError):
        return None


def _pending_invitation(institution, *, locked=False):
    target_id = _first_user_id(institution)
    users = User.objects.select_for_update(no_key=True) if locked else User.objects
    target = users.filter(pk=target_id).first()
    if (
        target is None or target.is_active or target.is_staff or target.is_superuser
        or target.has_usable_password() or target.user_permissions.exists()
        or set(target.groups.values_list("name", flat=True)) != {"urgencias", "institution_admin"}
        or AmbulanceAssignment.objects.filter(user=target).exists()
    ):
        return None
    memberships = InstitutionMembership.objects.filter(user=target, active=True)
    if locked:
        memberships = memberships.select_for_update(of=("self",))
    rows = list(memberships)
    if len(rows) != 1 or rows[0].institution_id != institution.pk:
        return None
    invitations = AccountActivation.objects.filter(user=target, consumed_at__isnull=True)
    if locked:
        invitations = invitations.select_for_update(of=("self",))
    invitation = invitations.first()
    if invitation is None:
        return None
    return target, invitation


def can_resend_first_activation(institution) -> bool:
    if not institution.enabled:
        return False
    pending = _pending_invitation(institution)
    return bool(pending and timezone.now() - (pending[1].expires_at - LIFETIME) >= COOLDOWN)


def mail_delivery_mode() -> str:
    return "mailpit" if getattr(settings, "AMBUSYNC_MAIL_MODE", "brevo") == "mailpit" else "brevo"


class SystemFirstActivationView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, institution_id):
        from institutions.system_management import audit_system_action, require_system_admin

        require_system_admin(request.user)
        if request.data != {}:
            raise ValidationError({"request": "Envía un objeto vacío para reenviar la activación."})
        try:
            with transaction.atomic():
                actor = User.objects.select_for_update(no_key=True).get(pk=request.user.pk)
                require_system_admin(actor)
                institution = Institution.objects.filter(pk=institution_id).first()
                if institution is None:
                    raise NotFound("La invitación inicial no está disponible.")
                pending = _pending_invitation(institution, locked=True)
                # Read enabled after the target-user lock, shared by activation/
                # membership management. Do not introduce institution→user lock inversion.
                institution.refresh_from_db(fields=["enabled", "name"])
                if not institution.enabled or pending is None:
                    raise NotFound("La invitación inicial no está disponible.")
                target, invitation = pending
                now = timezone.now()
                if now - (invitation.expires_at - LIFETIME) < COOLDOWN:
                    raise Throttled(wait=60, detail="Espera antes de reenviar la activación.")
                raw = secrets.token_urlsafe(32)
                invitation.token_digest = hashlib.sha256(raw.encode()).hexdigest()
                invitation.expires_at = now + LIFETIME
                invitation.save(update_fields=["token_digest", "expires_at"])
                audit_system_action(
                    actor, institution, "system.institution.first_activation_resent",
                    target.pk, object_type="account",
                )
                if send_activation_email(target, raw, institution_name=institution.name) != 1:
                    raise OSError("activation_capture_unavailable")
        except (OSError, smtplib.SMTPException):
            return Response({
                "code": "activation_delivery_unavailable",
                "message": "No se pudo enviar la activación; no se modificó la invitación.",
                "fields": {},
            }, status=503)
        return Response(status=204)
