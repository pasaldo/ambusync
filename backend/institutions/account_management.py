import hashlib
import secrets
import smtplib
import uuid
from datetime import timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AccountActivation, User
from audit.models import AuditEvent
from institutions.models import Ambulance, AmbulanceAssignment, Institution, InstitutionMembership

DELEGABLE_GROUPS = {"ambulance", "urgencias"}
ACTIVATION_LIFETIME = timedelta(hours=24)


def administrative_institution(user):
    if not user.is_active or not user.groups.filter(name="institution_admin").exists():
        raise PermissionDenied("Se requiere administración institucional.")
    membership = (
        InstitutionMembership.objects.filter(user=user, active=True, institution__enabled=True)
        .select_related("institution")
        .first()
    )
    if membership is None:
        raise PermissionDenied("La cuenta no tiene un establecimiento habilitado.")
    return membership.institution


def audit_account_action(actor, institution, target, action):
    AuditEvent.objects.create(
        actor=actor,
        institution=institution,
        ambulance=None,
        action=action,
        object_type="account",
        object_id=str(target.pk),
        result=AuditEvent.Result.SUCCESS,
        correlation_id=uuid.uuid4(),
    )


def accounts_created_by(actor):
    return AuditEvent.objects.filter(actor=actor, action="account.created", object_type="account")


def send_activation_email(user, raw_token):
    query = urlencode({"uid": user.pk, "token": raw_token})
    activation_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/activar-cuenta?{query}"
    return send_mail(
        subject="Activa tu cuenta de AmbuSync",
        message=(
            "Se creó una cuenta de prueba de AmbuSync para tu establecimiento. "
            f"Define tu contraseña personal dentro de las próximas 24 horas: {activation_url}\n\n"
            "Si no esperabas este mensaje, contacta a la administración de tu establecimiento."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


class ManagedAmbulanceListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        institution = administrative_institution(request.user)
        if institution.kind not in (Institution.Kind.RECEIVER, Institution.Kind.COMBINED):
            return Response([])
        ambulances = (
            Ambulance.objects.filter(
                institution__enabled=True,
                institution__kind__in=(Institution.Kind.OPERATOR, Institution.Kind.COMBINED),
                enabled=True,
            )
            .select_related("institution")
            .order_by("institution__name", "code")
        )
        return Response(
            [
                {
                    "id": str(item.pk),
                    "code": item.code,
                    "institution_id": str(item.institution_id),
                    "institution_name": item.institution.name,
                }
                for item in ambulances
            ]
        )


class AccountManagementConfigView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        institution = administrative_institution(request.user)
        can_create_accounts = institution.kind in (
            Institution.Kind.RECEIVER,
            Institution.Kind.COMBINED,
        )
        delegable_groups = ["urgencias", "ambulance"] if can_create_accounts else []
        operator_institutions = []
        for operator in (
            Institution.objects.filter(
                enabled=True,
                kind__in=(Institution.Kind.OPERATOR, Institution.Kind.COMBINED),
                ambulances__enabled=True,
            )
            .distinct()
            .order_by("name", "id")
            if can_create_accounts
            else []
        ):
            operator_institutions.append({"id": str(operator.pk), "name": operator.name})
        return Response(
            {
                "institution_name": institution.name,
                "delegable_groups": delegable_groups,
                "operator_institutions": operator_institutions,
                "can_create_accounts": can_create_accounts,
            }
        )


class ManagedAccountListCreateView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        institution = administrative_institution(request.user)
        created_ids = [
            int(value)
            for value in accounts_created_by(request.user).values_list("object_id", flat=True)
            if value.isdigit()
        ]
        memberships = (
            InstitutionMembership.objects.filter(active=True)
            .filter(Q(institution=institution) | Q(user_id__in=created_ids))
            .select_related("user")
            .prefetch_related(
                "user__groups",
                "user__ambulance_assignments__ambulance",
            )
        )
        return Response(
            [
                {
                    "id": str(item.user_id),
                    "username": item.user.get_username(),
                    "email": item.user.email,
                    "institution_name": item.institution.name,
                    "groups": sorted(item.user.groups.values_list("name", flat=True)),
                    "active": item.user.is_active,
                    "ambulance": next(
                        (
                            {"id": str(assignment.ambulance_id), "code": assignment.ambulance.code}
                            for assignment in item.user.ambulance_assignments.all()
                            if assignment.active
                            and assignment.ambulance.institution_id == item.institution_id
                        ),
                        None,
                    ),
                }
                for item in memberships
            ]
        )

    def post(self, request):
        institution = administrative_institution(request.user)
        if institution.kind not in (Institution.Kind.RECEIVER, Institution.Kind.COMBINED):
            raise PermissionDenied("Solo la administración de Urgencias puede crear cuentas.")
        body = request.data
        allowed_fields = {"username", "email", "groups", "ambulance_id", "institution_id"}
        if not isinstance(body, dict) or set(body) - allowed_fields:
            raise ValidationError({"request": "La solicitud contiene campos no admitidos."})

        username = body.get("username")
        email = body.get("email")
        groups = body.get("groups")
        ambulance_id = body.get("ambulance_id")
        if not isinstance(username, str) or not username.strip() or len(username.strip()) > 150:
            raise ValidationError({"username": "Indica un nombre de usuario."})
        if not isinstance(email, str) or not email.strip() or len(email.strip()) > 254:
            raise ValidationError({"email": "Indica un correo institucional o de prueba válido."})
        try:
            validate_email(email.strip())
        except DjangoValidationError as error:
            raise ValidationError(
                {"email": "Indica un correo institucional o de prueba válido."}
            ) from error
        if (
            not isinstance(groups, list)
            or not groups
            or any(not isinstance(group, str) for group in groups)
            or len(set(groups)) != len(groups)
            or not set(groups).issubset(DELEGABLE_GROUPS)
        ):
            raise ValidationError({"groups": "Selecciona permisos operativos delegables."})
        if User.objects.filter(username__iexact=username.strip()).exists():
            raise ValidationError({"username": "Ese nombre de usuario no está disponible."})
        if User.objects.filter(email__iexact=email.strip()).exists():
            raise ValidationError({"email": "Ese correo ya está asociado a una cuenta."})

        if len(groups) != 1:
            raise ValidationError({"groups": "Crea una cuenta por perfil operativo."})
        has_ambulance = "ambulance" in groups
        if has_ambulance != bool(ambulance_id):
            raise ValidationError(
                {"ambulance_id": "La asignación de ambulancia debe corresponder al permiso."}
            )
        target_institution = institution
        if has_ambulance:
            if not body.get("institution_id"):
                raise ValidationError({"institution_id": "Selecciona la institución operadora."})
            target_institution = Institution.objects.filter(
                pk=body["institution_id"],
                enabled=True,
                kind__in=(Institution.Kind.OPERATOR, Institution.Kind.COMBINED),
            ).first()
            if target_institution is None:
                raise ValidationError(
                    {"institution_id": "La institución operadora no está habilitada."}
                )
        elif body.get("institution_id"):
            raise ValidationError(
                {"institution_id": "Las cuentas de Urgencias pertenecen a tu establecimiento."}
            )

        ambulance = None
        if has_ambulance:
            ambulance = Ambulance.objects.filter(
                pk=ambulance_id, institution=target_institution, enabled=True
            ).first()
            if ambulance is None:
                raise ValidationError(
                    {
                        "ambulance_id": "La ambulancia no pertenece al establecimiento o no está habilitada."
                    }
                )

        user = User(
            username=username.strip(),
            email=User.objects.normalize_email(email.strip()),
            is_active=False,
        )
        try:
            User._meta.get_field("username").run_validators(user.username)
        except DjangoValidationError as error:
            raise ValidationError({"username": error.messages}) from error

        raw_token = secrets.token_urlsafe(32)
        try:
            with transaction.atomic():
                user.set_unusable_password()
                user.save()
                user.groups.add(*[Group.objects.get_or_create(name=name)[0] for name in groups])
                InstitutionMembership.objects.create(user=user, institution=target_institution)
                if ambulance:
                    AmbulanceAssignment.objects.create(user=user, ambulance=ambulance)
                AccountActivation.objects.update_or_create(
                    user=user,
                    defaults={
                        "token_digest": hashlib.sha256(raw_token.encode()).hexdigest(),
                        "expires_at": timezone.now() + ACTIVATION_LIFETIME,
                        "consumed_at": None,
                    },
                )
                audit_account_action(request.user, target_institution, user, "account.created")
                sent = send_activation_email(user, raw_token)
                if sent != 1:
                    raise OSError("activation_email_not_sent")
        except OSError, smtplib.SMTPException:
            return Response(
                {
                    "code": "activation_delivery_unavailable",
                    "message": "No se pudo enviar la activación; no se creó la cuenta. Revisa el correo local de desarrollo.",
                    "fields": {},
                    "correlation_id": str(uuid.uuid4()),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except IntegrityError as error:
            raise ValidationError(
                {"account": "El nombre de usuario o correo ya está asociado a otra cuenta."}
            ) from error

        return Response(
            {"id": str(user.pk), "username": user.username, "activation_sent": True},
            status=status.HTTP_201_CREATED,
        )


class ManagedAccountDeactivateView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, user_id):
        institution = administrative_institution(request.user)
        with transaction.atomic():
            membership = (
                InstitutionMembership.objects.select_for_update()
                .filter(user_id=user_id, active=True)
                .select_related("user")
                .first()
            )
            created_event = accounts_created_by(request.user).filter(object_id=str(user_id)).first()
            if membership and membership.institution_id != institution.pk and not created_event:
                membership = None
            if membership is None:
                raise ValidationError({"account": "La cuenta no existe en este establecimiento."})
            target = membership.user
            target_institution = membership.institution
            if target.pk == request.user.pk:
                raise ValidationError({"account": "No puedes desactivar tu propia cuenta."})
            if target.groups.filter(name="institution_admin").exists():
                admins = (
                    InstitutionMembership.objects.filter(
                        institution=target_institution,
                        active=True,
                        user__is_active=True,
                        user__groups__name="institution_admin",
                    )
                    .exclude(user=target)
                    .distinct()
                    .count()
                )
                if admins < 1:
                    raise ValidationError(
                        {"account": "No se puede desactivar al último administrador habilitado."}
                    )

            membership.active = False
            membership.save(update_fields=["active"])
            target.is_active = False
            target.session_version += 1
            target.save(update_fields=["is_active", "session_version"])
            AccountActivation.objects.filter(user=target, consumed_at__isnull=True).update(
                consumed_at=timezone.now()
            )
            assignments = AmbulanceAssignment.objects.filter(
                user=target, active=True, ambulance__institution=target_institution
            )
            from emergencies.models import Emergency

            for assignment in assignments.select_related("ambulance"):
                has_active_cases = Emergency.objects.filter(ambulance=assignment.ambulance).exists()
                if has_active_cases:
                    other_operators = (
                        AmbulanceAssignment.objects.filter(
                            ambulance=assignment.ambulance,
                            active=True,
                            ambulance__enabled=True,
                            user__is_active=True,
                            user__groups__name="ambulance",
                            user__institution_memberships__institution=target_institution,
                            user__institution_memberships__active=True,
                        )
                        .exclude(user=target)
                        .distinct()
                        .count()
                    )
                    if not other_operators:
                        raise ValidationError(
                            {
                                "account": "Asigna otro operador o resuelve los episodios activos antes de desactivar esta cuenta."
                            }
                        )
            assignments.update(active=False, unassigned_at=timezone.now())
            audit_account_action(request.user, target_institution, target, "account.deactivated")
        return Response(status=status.HTTP_204_NO_CONTENT)


class ManagedAccountResendActivationView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, user_id):
        institution = administrative_institution(request.user)
        raw_token = secrets.token_urlsafe(32)
        try:
            with transaction.atomic():
                membership = (
                    InstitutionMembership.objects.select_for_update()
                    .filter(
                        user_id=user_id,
                        active=True,
                        user__is_active=False,
                    )
                    .select_related("user")
                    .first()
                )
                created_event = (
                    accounts_created_by(request.user).filter(object_id=str(user_id)).first()
                )
                if membership and membership.institution_id != institution.pk and not created_event:
                    membership = None
                if membership is None:
                    raise ValidationError(
                        {"account": "No hay una invitación pendiente para esa cuenta."}
                    )
                AccountActivation.objects.update_or_create(
                    user=membership.user,
                    defaults={
                        "token_digest": hashlib.sha256(raw_token.encode()).hexdigest(),
                        "expires_at": timezone.now() + ACTIVATION_LIFETIME,
                        "consumed_at": None,
                    },
                )
                audit_account_action(
                    request.user,
                    membership.institution,
                    membership.user,
                    "account.activation_resent",
                )
                sent = send_activation_email(membership.user, raw_token)
                if sent != 1:
                    raise OSError("activation_email_not_sent")
        except OSError, smtplib.SMTPException:
            return Response(
                {
                    "code": "activation_delivery_unavailable",
                    "message": "No se pudo enviar la activación; no se modificó la invitación.",
                    "fields": {},
                    "correlation_id": str(uuid.uuid4()),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"activation_sent": True}, status=status.HTTP_200_OK)


class AccountActivationView(APIView):
    permission_classes = ()
    authentication_classes = ()

    def post(self, request):
        if not isinstance(request.data, dict):
            raise ValidationError({"request": "Revisa el formato de la solicitud."})
        uid = request.data.get("uid")
        raw_token = request.data.get("token")
        password = request.data.get("password")
        password_confirmation = request.data.get("password_confirmation")
        if set(request.data) != {"uid", "token", "password", "password_confirmation"}:
            raise ValidationError({"request": "La solicitud contiene campos no admitidos."})
        if not all(
            isinstance(value, str) and value
            for value in (uid, raw_token, password, password_confirmation)
        ):
            raise ValidationError({"request": "Revisa el enlace y la contraseña."})
        if password != password_confirmation:
            raise ValidationError({"password_confirmation": "Las contraseñas no coinciden."})
        if len(password) > 128:
            raise ValidationError({"password": "La contraseña supera el máximo de 128 caracteres."})

        try:
            with transaction.atomic():
                activation = (
                    AccountActivation.objects.select_for_update()
                    .select_related("user")
                    .get(
                        user_id=uid,
                    )
                )
                user = activation.user
                valid = (
                    not user.is_active
                    and activation.consumed_at is None
                    and activation.expires_at > timezone.now()
                    and secrets.compare_digest(
                        activation.token_digest,
                        hashlib.sha256(raw_token.encode()).hexdigest(),
                    )
                )
                membership = (
                    InstitutionMembership.objects.filter(
                        user=user, active=True, institution__enabled=True
                    )
                    .select_related("institution")
                    .first()
                )
                if membership is None:
                    valid = False
                if not valid:
                    raise AccountActivation.DoesNotExist
                validate_password(password, user)
                user.set_password(password)
                user.is_active = True
                user.save(update_fields=["password", "is_active"])
                activation.consumed_at = timezone.now()
                activation.save(update_fields=["consumed_at"])
                audit_account_action(user, membership.institution, user, "account.activated")
        except AccountActivation.DoesNotExist as error:
            raise ValidationError(
                {"token": "El enlace de activación no es válido o ya venció."}
            ) from error
        except DjangoValidationError as error:
            raise ValidationError({"password": error.messages}) from error

        return Response({"activated": True}, status=status.HTTP_200_OK)
