"""D-013 services available only to local technical commands, never web delegation."""

import re

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts import recovery_delivery
from accounts.models import User
from accounts.recovery import eligible, fingerprint, issue_token
from accounts.recovery_models import IdentityRecoveryCase, PasswordRecovery, RecoveryContact


def checked_text(value, maximum=160):
    if (
        not isinstance(value, str)
        or not value.strip()
        or len(value.strip()) > maximum
        or any(ord(char) < 32 for char in value)
    ):
        raise ValidationError("Revisa los datos técnicos de verificación.")
    return value.strip()


def checked_email(value):
    value = checked_text(value, 254).casefold()
    try:
        validate_email(value)
    except DjangoValidationError:
        raise ValidationError("Indica un correo válido.") from None
    return value


def locked_user(username):
    user = User.objects.select_for_update(no_key=True).filter(username=username).first()
    if not eligible(user):
        raise ValidationError("La cuenta no está disponible para recuperación.")
    return user


@transaction.atomic
def register_contact(username, channel, value, provenance, executor, prior_confirmed):
    if not prior_confirmed:
        raise ValidationError(
            "Se exige constancia de contacto institucional previo; no registrar uno improvisado para el caso actual."
        )
    user = locked_user(username)
    value = checked_text(value, 254)
    if channel == "phone":
        if not re.fullmatch(r"[+0-9 ()-]{6,40}", value):
            raise ValidationError("Revisa el teléfono institucional previo.")
    elif channel == "institutional_email":
        value = checked_email(value)
        if value == user.email.strip().casefold():
            raise ValidationError(
                "El contacto alternativo no puede ser el correo que se intenta recuperar."
            )
    else:
        raise ValidationError("Selecciona un canal institucional admitido.")
    provenance = checked_text(provenance)
    executor = checked_text(executor)
    RecoveryContact.objects.filter(user=user, retired_at__isnull=True).update(
        retired_at=timezone.now()
    )
    return RecoveryContact.objects.create(
        user=user, channel=channel, value=value, provenance=provenance, registered_by=executor
    )


@transaction.atomic
def start_case(username, contact_id, proposed_email):
    user = locked_user(username)
    proposed_email = checked_email(proposed_email)
    if (
        proposed_email == user.email.strip().casefold()
        or User.objects.filter(email__iexact=proposed_email).exists()
    ):
        raise ValidationError("El correo propuesto no está disponible para este caso.")
    contact = (
        RecoveryContact.objects.select_for_update()
        .filter(pk=contact_id, user=user, retired_at__isnull=True)
        .first()
    )
    if contact is None:
        raise ValidationError(
            "No hay contacto previo vigente para esta cuenta; escalar sin habilitar recuperación."
        )
    case = IdentityRecoveryCase.objects.create(
        user=user,
        contact=contact,
        proposed_email=proposed_email,
        fingerprint=fingerprint(user),
    )
    PasswordRecovery.objects.filter(
        user=user, consumed_at__isnull=True, invalidated_at__isnull=True
    ).update(invalidated_at=timezone.now())
    return case


@transaction.atomic
def verify_case(case_id, verifier, method, result):
    initial = IdentityRecoveryCase.objects.filter(pk=case_id).values("user_id").first()
    if initial is None:
        raise ValidationError("El caso no está disponible.")
    user = User.objects.select_for_update(no_key=True).get(pk=initial["user_id"])
    case = IdentityRecoveryCase.objects.select_for_update().get(pk=case_id)
    contact = RecoveryContact.objects.select_for_update().get(pk=case.contact_id)
    latest = IdentityRecoveryCase.objects.filter(user=user).order_by("-created_at", "-id").first()
    if (
        not eligible(user)
        or case.status != "pending"
        or latest.pk != case.pk
        or contact.retired_at
        or contact.created_at > case.created_at
        or case.fingerprint != fingerprint(user)
    ):
        raise ValidationError("El caso o su contacto/ámbito ya no es válido.")
    verifier = checked_text(verifier)
    if (
        verifier.casefold() == user.username.casefold()
        or method != contact.channel
        or result not in ("approved", "rejected")
    ):
        raise ValidationError(
            "La verificación requiere otro responsable, el canal previo y un resultado válido."
        )
    case.verifier = verifier
    case.method = method
    case.verified_at = timezone.now()
    case.status = result
    case.save(update_fields=("verifier", "method", "verified_at", "status"))
    if result == "approved":
        _, url = issue_token(user, case=case)
        # Technical CLI may report delivery failure; rollback preserves pending case.
        if recovery_delivery.deliver_mail(case.proposed_email, url) != 1:
            raise ValidationError("No se pudo entregar la confirmación; el caso no fue aprobado.")
    return case
