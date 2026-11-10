import hashlib
import re
import secrets
import smtplib
import unicodedata
import uuid
from datetime import timedelta

from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AccountActivation, User
from accounts.security import revoke_user_sessions
from audit.models import AuditEvent
from emergencies.models import Emergency
from institutions.account_management import send_activation_email
from institutions.models import Institution, InstitutionMembership
from institutions.rut import normalize_company_rut

PHONE_PATTERN = re.compile(r"^[0-9+ ()-]{0,15}$")
INSTITUTION_FIELDS = {"name", "rut", "address", "phone", "email"}
CREATE_FIELDS = INSTITUTION_FIELDS | {"first_username", "first_email"}
SYSTEM_ADMIN_GROUP = "system_admin"
OPERATIONAL_GROUPS = {"ambulance", "urgencias", "institution_admin"}


def require_system_admin(user):
    groups = set(user.groups.values_list("name", flat=True))
    if (
        not user.is_active
        or user.is_staff
        or user.is_superuser
        or groups != {SYSTEM_ADMIN_GROUP}
        or InstitutionMembership.objects.filter(user=user).exists()
    ):
        raise PermissionDenied("Se requiere una cuenta exclusiva de administración global.")


def validate_institution_fields(data, *, creating=False):
    allowed = CREATE_FIELDS if creating else INSTITUTION_FIELDS
    if not isinstance(data, dict) or set(data) - allowed:
        raise ValidationError({"request": "La solicitud contiene campos no admitidos."})

    values = {}
    errors = {}
    name = data.get("name")
    if creating or "name" in data:
        if not isinstance(name, str):
            errors["name"] = "Indica el nombre de la institución."
        else:
            name = " ".join(unicodedata.normalize("NFC", name).split())
            if (
                not name
                or len(name) > 160
                or not any(char.isalpha() or char.isdigit() for char in name)
                or not all(char.isalpha() or char.isdigit() or char in " -" for char in name)
            ):
                errors["name"] = "Usa letras, números, espacios y guiones (máximo 160 caracteres)."
            else:
                values["name"] = name

    raw_rut = data.get("rut")
    if creating or "rut" in data:
        rut_result = normalize_company_rut(raw_rut) if isinstance(raw_rut, str) else None
        if rut_result is None:
            errors["rut"] = "El RUT está equivocado."
        else:
            values["rut_normalized"], values["rut"] = rut_result

    address = data.get("address")
    if creating or "address" in data:
        if not isinstance(address, str) or not address.strip() or len(address.strip()) > 255:
            errors["address"] = "Indica una dirección de hasta 255 caracteres."
        else:
            values["address"] = address.strip()

    if creating or "phone" in data:
        phone = data.get("phone", "")
        if not isinstance(phone, str) or not PHONE_PATTERN.fullmatch(phone):
            errors["phone"] = "Usa hasta 15 caracteres: dígitos, +, espacios, paréntesis o guiones."
        else:
            values["phone"] = phone.strip()

    email = data.get("email")
    if creating or "email" in data:
        if not isinstance(email, str) or not email.strip() or len(email.strip()) > 254:
            errors["email"] = "Indica un correo institucional válido."
        else:
            email = email.strip().lower()
            try:
                validate_email(email)
            except DjangoValidationError:
                errors["email"] = "Indica un correo institucional válido."
            else:
                values["email"] = email

    if creating:
        username = data.get("first_username")
        if not isinstance(username, str) or not username.strip() or len(username.strip()) > 150:
            errors["first_username"] = "Indica un nombre de usuario válido."
        else:
            username = username.strip()
            user_probe = User(username=username)
            try:
                User._meta.get_field("username").run_validators(username)
            except DjangoValidationError as error:
                errors["first_username"] = error.messages
            else:
                if User.objects.filter(username__iexact=username).exists():
                    errors["first_username"] = "Ese nombre de usuario no está disponible."
                else:
                    values["first_username"] = user_probe.username

        first_email = data.get("first_email")
        if (
            not isinstance(first_email, str)
            or not first_email.strip()
            or len(first_email.strip()) > 254
        ):
            errors["first_email"] = "Indica el correo de activación de la cuenta."
        else:
            first_email = first_email.strip()
            try:
                validate_email(first_email)
            except DjangoValidationError:
                errors["first_email"] = "Indica un correo de activación válido."
            else:
                if User.objects.filter(email__iexact=first_email).exists():
                    errors["first_email"] = "Ese correo ya está asociado a una cuenta."
                else:
                    values["first_email"] = User.objects.normalize_email(first_email)

    if errors:
        raise ValidationError(errors)
    return values


def check_institution_uniqueness(values, *, exclude_pk=None):
    queryset = Institution.objects.all()
    if exclude_pk is not None:
        queryset = queryset.exclude(pk=exclude_pk)
    if "rut" in values and queryset.filter(rut__iexact=values["rut"]).exists():
        raise ValidationError({"rut": "Ese RUT ya está registrado."})
    if "email" in values and queryset.filter(email__iexact=values["email"]).exists():
        raise ValidationError({"email": "Ese correo ya está registrado para otra institución."})


def audit_system_action(actor, institution, action, object_id=None, *, object_type="institution"):
    AuditEvent.objects.create(
        actor=actor,
        institution=institution,
        ambulance=None,
        action=action,
        object_type=object_type,
        object_id=str(object_id or institution.pk),
        result=AuditEvent.Result.SUCCESS,
        correlation_id=uuid.uuid4(),
    )


def institution_payload(institution):
    return {
        "id": str(institution.pk),
        "name": institution.name,
        "kind": institution.kind,
        "enabled": institution.enabled,
        "rut": institution.rut,
        "address": institution.address,
        "phone": institution.phone,
        "email": institution.email,
    }


class SystemInstitutionListCreateView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        require_system_admin(request.user)
        queryset = Institution.objects.all().order_by("name", "id")
        status_filter = request.query_params.get("status", "all")
        if status_filter == "active":
            queryset = queryset.filter(enabled=True)
        elif status_filter == "inactive":
            queryset = queryset.filter(enabled=False)
        elif status_filter != "all":
            raise ValidationError({"status": "Usa all, active o inactive."})
        search = request.query_params.get("q", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(rut__icontains=search))
        return Response([institution_payload(item) for item in queryset])

    def post(self, request):
        require_system_admin(request.user)
        values = validate_institution_fields(request.data, creating=True)
        check_institution_uniqueness(values)
        token = secrets.token_urlsafe(32)
        try:
            with transaction.atomic():
                institution = Institution.objects.create(
                    name=values["name"],
                    kind=Institution.Kind.COMBINED,
                    rut=values["rut"],
                    address=values["address"],
                    phone=values["phone"],
                    email=values["email"],
                )
                user = User(
                    username=values["first_username"],
                    email=values["first_email"],
                    is_active=False,
                )
                user.set_unusable_password()
                user.save()
                urgencias_group, _ = Group.objects.get_or_create(name="urgencias")
                admin_group, _ = Group.objects.get_or_create(name="institution_admin")
                user.groups.add(urgencias_group, admin_group)
                InstitutionMembership.objects.create(user=user, institution=institution)
                AccountActivation.objects.create(
                    user=user,
                    token_digest=hashlib.sha256(token.encode()).hexdigest(),
                    expires_at=timezone.now() + timedelta(hours=24),
                )
                audit_system_action(
                    request.user, institution, "system.institution.created", institution.pk
                )
                audit_system_action(
                    request.user,
                    institution,
                    "system.institution.first_admin_created",
                    user.pk,
                    object_type="account",
                )
                sent = send_activation_email(user, token, institution_name=institution.name)
                if sent != 1:
                    raise OSError("activation_email_not_sent")
        except OSError, smtplib.SMTPException:
            return Response(
                {
                    "code": "activation_delivery_unavailable",
                    "message": "No se pudo enviar la activación; no se creó la institución ni su cuenta.",
                    "fields": {},
                    "correlation_id": str(uuid.uuid4()),
                },
                status=503,
            )
        except IntegrityError as error:
            raise ValidationError(
                {"request": "El RUT, correo, usuario o correo de cuenta ya está registrado."}
            ) from error
        return Response(
            {
                **institution_payload(institution),
                "first_account": {"id": str(user.pk), "username": user.username},
                "activation_sent": True,
            },
            status=201,
        )


class SystemInstitutionDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def patch(self, request, institution_id):
        require_system_admin(request.user)
        institution = self._get(institution_id)
        values = validate_institution_fields(request.data)
        update_fields = sorted(set(values) & INSTITUTION_FIELDS)
        if not update_fields:
            raise ValidationError({"request": "Indica al menos un dato para actualizar."})
        check_institution_uniqueness(values, exclude_pk=institution.pk)
        try:
            with transaction.atomic():
                for field in update_fields:
                    setattr(institution, field, values[field])
                institution.save(update_fields=update_fields)
                audit_system_action(
                    request.user, institution, "system.institution.updated", institution.pk
                )
        except IntegrityError as error:
            raise ValidationError(
                {"request": "El RUT o correo ya está registrado para otra institución."}
            ) from error
        return Response(institution_payload(institution))

    @staticmethod
    def _get(institution_id):
        try:
            return Institution.objects.get(pk=institution_id)
        except (Institution.DoesNotExist, ValueError) as error:
            raise NotFound("La institución no existe.") from error


class SystemInstitutionDeactivateView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, institution_id):
        require_system_admin(request.user)
        institution = SystemInstitutionDetailView._get(institution_id)
        if not institution.enabled:
            return Response(institution_payload(institution))
        open_statuses = (
            Emergency.Status.NOTIFIED,
            Emergency.Status.IN_TRANSIT,
            Emergency.Status.ARRIVED,
        )
        has_open_emergencies = Emergency.objects.filter(
            Q(operating_institution=institution) | Q(destination=institution),
            status__in=open_statuses,
        ).exists()
        if has_open_emergencies:
            raise ValidationError(
                {"institution": "No se puede desactivar: participa en episodios no terminales."}
            )
        with transaction.atomic():
            institution.enabled = False
            institution.save(update_fields=["enabled"])
            for membership in InstitutionMembership.objects.filter(
                institution=institution, active=True
            ).select_related("user"):
                revoke_user_sessions(
                    membership.user,
                    executor=request.user.get_username(),
                    reason="Desactivación de la institución por administración global.",
                )
            audit_system_action(
                request.user, institution, "system.institution.deactivated", institution.pk
            )
        return Response(institution_payload(institution))


class SystemInstitutionReactivateView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, institution_id):
        require_system_admin(request.user)
        institution = SystemInstitutionDetailView._get(institution_id)
        if institution.enabled:
            return Response(institution_payload(institution))
        institution.enabled = True
        institution.save(update_fields=["enabled"])
        audit_system_action(
            request.user, institution, "system.institution.reactivated", institution.pk
        )
        return Response(institution_payload(institution))
