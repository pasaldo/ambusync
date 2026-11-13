import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower


class Institution(models.Model):
    class Kind(models.TextChoices):
        OPERATOR = "operator", "Operadora"
        RECEIVER = "receiver", "Receptora"
        COMBINED = "combined", "Operadora y receptora"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    enabled = models.BooleanField(default=True)
    rut = models.CharField(max_length=12, blank=True, default="")
    address = models.CharField(max_length=255, blank=True, default="")
    phone = models.CharField(max_length=15, blank=True, default="")
    email = models.EmailField(max_length=254, blank=True, default="")
    operator_institutions = models.ManyToManyField(
        "self",
        symmetrical=False,
        related_name="receiving_institutions",
        blank=True,
    )

    class Meta:
        ordering = ("name", "id")
        constraints = [
            models.UniqueConstraint(
                Lower("rut"), condition=~Q(rut=""), name="uniq_institution_rut_ci_nonempty"
            ),
            models.UniqueConstraint(
                Lower("email"), condition=~Q(email=""), name="uniq_institution_email_ci_nonempty"
            ),
        ]

    def __str__(self):
        return self.name


class InstitutionMembership(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="institution_memberships"
    )
    institution = models.ForeignKey(
        Institution, on_delete=models.PROTECT, related_name="memberships"
    )
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user", "institution"), name="uniq_user_institution_membership"
            ),
            models.UniqueConstraint(
                fields=("user",), condition=Q(active=True), name="uniq_active_institution_per_user"
            ),
        ]


class Symptom(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(
        Institution, on_delete=models.PROTECT, related_name="symptom_catalog"
    )
    description = models.CharField(max_length=120)
    normalized = models.CharField(max_length=240)
    enabled = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ("description", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("institution", "normalized"), name="unique_institution_symptom_normalized"
            )
        ]


class Ambulance(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institution = models.ForeignKey(
        Institution, on_delete=models.PROTECT, related_name="ambulances"
    )
    code = models.CharField(max_length=40)
    enabled = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("institution", "code"), name="uniq_ambulance_code_per_institution"
            ),
        ]
        ordering = ("institution__name", "code")


class AmbulanceAssignment(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ambulance_assignments"
    )
    ambulance = models.ForeignKey(Ambulance, on_delete=models.PROTECT, related_name="assignments")
    active = models.BooleanField(default=True)
    assigned_at = models.DateTimeField(auto_now_add=True)
    unassigned_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user",), condition=Q(active=True), name="uniq_active_ambulance_per_user"
            ),
        ]
        ordering = ("-assigned_at",)
