import json
import secrets
from datetime import timedelta
from functools import partial
from urllib.parse import urlencode, urlsplit

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts import recovery_delivery
from accounts.models import User
from accounts.recovery_models import IdentityRecoveryCase, PasswordRecovery, RecoveryContact
from accounts.security import _digest, _locked_rows, revoke_user_sessions
from accounts.views import LoginView
from institutions.models import AmbulanceAssignment, InstitutionMembership

GENERIC_REQUEST = "Si la cuenta está disponible, recibirás instrucciones en su correo registrado. Revisa el correo; la solicitud no garantiza la entrega."
INVALID_LINK = "El enlace de recuperación no es válido, ya se usó o venció. Solicita uno nuevo."


def eligible(user):
    return bool(
        user
        and user.is_active
        and not user.is_staff
        and not user.is_superuser
        and user.email
        and user.has_usable_password()
        and user.groups.filter(
            name__in=("system_admin", "urgencias", "ambulance", "institution_admin")
        ).exists()
        and LoginView._account_has_enabled_scope(user)
    )


def fingerprint(user):
    return _digest(
        json.dumps(
            {
                "id": user.pk,
                "email": user.email.strip().casefold(),
                "password": user.password,
                "version": user.session_version,
                "active": user.is_active,
                "groups": sorted(user.groups.values_list("name", flat=True)),
                "memberships": sorted(
                    (str(i), active, enabled)
                    for i, active, enabled in InstitutionMembership.objects.filter(
                        user=user
                    ).values_list("institution_id", "active", "institution__enabled")
                ),
                "assignments": sorted(
                    (str(i), active, enabled)
                    for i, active, enabled in AmbulanceAssignment.objects.filter(
                        user=user
                    ).values_list("ambulance_id", "active", "ambulance__enabled")
                ),
            },
            sort_keys=True,
        )
    )


def allow_attempt(identifier, origin, purpose):
    now = timezone.now()
    keys = {
        _digest(f"{purpose}:account:{identifier.strip().casefold()}"): 5,
        _digest(f"{purpose}:origin:{origin or 'unknown'}"): 20,
    }
    with transaction.atomic():
        rows = _locked_rows(keys)
        for row in rows:
            if row.window_started_at is None or now - row.window_started_at >= timedelta(
                minutes=15
            ):
                row.window_started_at = now
                row.failures = 0
            if row.failures >= keys[row.pk]:
                return False
        for row in rows:
            row.failures += 1
            row.save(update_fields=("window_started_at", "failures", "updated_at"))
    return True


def issue_token(user, *, case=None):
    now = timezone.now()
    PasswordRecovery.objects.filter(
        user=user, consumed_at__isnull=True, invalidated_at__isnull=True
    ).update(invalidated_at=now)
    raw = secrets.token_urlsafe(32)
    item = PasswordRecovery.objects.create(
        user=user,
        identity_case=case,
        token_digest=_digest("recovery:" + raw),
        fingerprint=fingerprint(user),
        expires_at=now + timedelta(minutes=30),
    )
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    parsed = urlsplit(base)
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.netloc
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Invalid configured frontend origin.")
    url = base + "/restablecer-cuenta#" + urlencode({"id": str(item.pk), "token": raw})
    return item, url


@transaction.atomic
def request_recovery(email, origin):
    user = User.objects.select_for_update(no_key=True).filter(email__iexact=email.strip()).first()
    if not eligible(user):
        return
    latest_case = (
        IdentityRecoveryCase.objects.filter(user=user).order_by("-created_at", "-id").first()
    )
    if latest_case and latest_case.status in ("pending", "approved"):
        return
    _, url = issue_token(user)
    transaction.on_commit(partial(recovery_delivery.enqueue_mail, user.email, url))


def recovery_audit(user, action, actor=None):
    import uuid

    from audit.models import AuditEvent

    membership = InstitutionMembership.objects.filter(
        user=user, active=True, institution__enabled=True
    ).first()
    if membership:
        AuditEvent.objects.create(
            institution_id=membership.institution_id,
            actor=actor or user,
            action=action,
            object_type="account",
            object_id=str(user.pk),
            result="success",
            correlation_id=uuid.uuid4(),
        )


@transaction.atomic
def complete_recovery(item_id, raw, password, confirmation):
    initial = (
        PasswordRecovery.objects.filter(pk=item_id).values("user_id", "identity_case_id").first()
    )
    if not initial:
        raise ValidationError(INVALID_LINK)
    user = User.objects.select_for_update(no_key=True).get(pk=initial["user_id"])
    case = None
    if initial["identity_case_id"]:
        case = IdentityRecoveryCase.objects.select_for_update().get(pk=initial["identity_case_id"])
        contact = RecoveryContact.objects.select_for_update().get(pk=case.contact_id)
        if (
            case.status != "approved"
            or contact.retired_at is not None
            or contact.created_at > case.created_at
            or case.fingerprint != fingerprint(user)
        ):
            raise ValidationError(INVALID_LINK)
    item = PasswordRecovery.objects.select_for_update().get(pk=item_id)
    if (
        not eligible(user)
        or item.consumed_at
        or item.invalidated_at
        or item.expires_at <= timezone.now()
        or not secrets.compare_digest(item.token_digest, _digest("recovery:" + raw))
        or not secrets.compare_digest(item.fingerprint, fingerprint(user))
    ):
        raise ValidationError(INVALID_LINK)
    if password != confirmation:
        raise ValidationError({"password_confirmation": "Las contraseñas no coinciden."})
    if len(password) > 128:
        raise ValidationError({"password": "La contraseña supera el máximo de 128 caracteres."})
    if case:
        user.email = case.proposed_email
    try:
        validate_password(password, user)
    except DjangoValidationError as error:
        raise ValidationError({"password": error.messages}) from None
    user.set_password(password)
    try:
        with transaction.atomic():
            user.save(update_fields=("password", "email"))
    except IntegrityError:
        raise ValidationError(INVALID_LINK) from None
    now = timezone.now()
    item.consumed_at = now
    item.save(update_fields=("consumed_at",))
    PasswordRecovery.objects.filter(user=user, consumed_at__isnull=True).update(invalidated_at=now)
    if case:
        case.status = "completed"
        case.save(update_fields=("status",))
    revoke_user_sessions(
        user, executor="account-recovery", reason="Recuperación de cuenta confirmada."
    )
    recovery_audit(user, "account.password_recovered")
