import uuid

from django.db import models


class RecoveryContact(models.Model):
    """Technical security configuration, never an institutional membership."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT)
    channel = models.CharField(
        max_length=24,
        choices=(
            ("phone", "Teléfono institucional"),
            ("institutional_email", "Correo institucional alternativo"),
        ),
    )
    value = models.CharField(max_length=254)
    provenance = models.CharField(max_length=160)
    registered_by = models.CharField(max_length=160)
    created_at = models.DateTimeField(auto_now_add=True)
    retired_at = models.DateTimeField(null=True, blank=True)


class IdentityRecoveryCase(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT)
    contact = models.ForeignKey(RecoveryContact, on_delete=models.PROTECT)
    fingerprint = models.CharField(max_length=64)
    proposed_email = models.EmailField()
    status = models.CharField(
        max_length=16,
        default="pending",
        choices=((value, value) for value in ("pending", "rejected", "approved", "completed")),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    verifier = models.CharField(max_length=160, blank=True)
    method = models.CharField(max_length=24, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)


class PasswordRecovery(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT)
    identity_case = models.ForeignKey(
        IdentityRecoveryCase, null=True, blank=True, on_delete=models.CASCADE
    )
    token_digest = models.CharField(max_length=64)
    fingerprint = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    invalidated_at = models.DateTimeField(null=True, blank=True)
