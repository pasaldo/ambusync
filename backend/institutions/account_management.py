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
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
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


def operator_institutions_for_admin(institution):
    operators = Institution.objects.filter(
        enabled=True,
        kind__in=(Institution.Kind.OPERATOR, Institution.Kind.COMBINED),
    )
    if institution.kind == Institution.Kind.COMBINED:
        return operators.filter(pk=institution.pk)
    configured_operators = institution.operator_institutions.all()
    if configured_operators.exists():
        return operators.filter(pk__in=configured_operators.values("pk"))
    # Preserve the shared legacy directory for receivers that have no explicit allowlist.
    return operators


def send_activation_email(user, raw_token, *, institution_name=None):
    query = urlencode({"uid": user.pk, "token": raw_token})
    activation_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/activar-cuenta?{query}"
    institution_message = (
        f" para {institution_name}" if institution_name else " para tu establecimiento"
    )
    return send_mail(
        subject="Activa tu cuenta de AmbuSync",
        message=(
            f"Se creó una cuenta de AmbuSync{institution_message}. "
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
        from institutions.unit_management import can_deactivate_unit

        include_disabled = request.query_params.get("include_disabled", "false")
        if include_disabled not in ("true", "false"):
            raise ValidationError({"include_disabled": "Usa true o false."})
        operators = operator_institutions_for_admin(institution)
        ambulances = (
            Ambulance.objects.filter(
                institution__in=operators,
            )
            .select_related("institution")
            .order_by("institution__name", "code")
        )
        if include_disabled != "true":
            ambulances = ambulances.filter(enabled=True)
        if institution.kind == Institution.Kind.COMBINED:
            ambulances = ambulances.filter(institution=institution)
        return Response(
            [
                {
                    "id": str(item.pk),
                    "code": item.code,
                    "institution_id": str(item.institution_id),
                    "institution_name": item.institution.name,
                    "enabled": item.enabled,
                    "can_deactivate": can_deactivate_unit(request.user, institution, item),
                }
                for item in ambulances
            ]
        )


class AccountManagementConfigView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        institution = administrative_institution(request.user)
        can_create_accounts = (
            institution.kind
            in (
                Institution.Kind.RECEIVER,
                Institution.Kind.COMBINED,
            )
            and request.user.groups.filter(name="urgencias").exists()
        )
        delegable_groups = ["urgencias", "ambulance"] if can_create_accounts else []
        operator_institutions = []
        if can_create_accounts:
            operator_institutions = [
                {"id": str(operator.pk), "name": operator.name}
                for operator in operator_institutions_for_admin(institution).order_by("name", "id")
            ]
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
        created_account_ids = [
            int(object_id)
            for object_id in accounts_created_by(request.user).values_list("object_id", flat=True)
            if object_id.isdecimal()
        ]
        memberships = (
            InstitutionMembership.objects.filter(active=True)
            .filter(Q(institution=institution) | Q(user_id__in=created_account_ids))
            .distinct()
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
                    "institution_id": str(item.institution_id),
                    "groups": sorted(item.user.groups.values_list("name", flat=True)),
                    "active": item.user.is_active,
                    "ambulance": next(
                        (
                            {"id": str(assignment.ambulance_id), "code": assignment.ambulance.code}
                            for assignment in item.user.ambulance_assignments.all()
                            if assignment.active and assignment.ambulance.institution.enabled
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
            target_institution = (
                operator_institutions_for_admin(institution)
                .filter(pk=body["institution_id"])
                .first()
            )
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
                from institutions.unit_management import lock_management_users

                actor, fresh_institution, _ = lock_management_users(request.user.pk)
                if fresh_institution.pk != institution.pk:
                    raise PermissionDenied("El ámbito administrativo cambió; actualiza la sesión.")
                if ambulance:
                    ambulance = (
                        Ambulance.objects.select_for_update()
                        .filter(
                            pk=ambulance.pk,
                            institution__in=operator_institutions_for_admin(fresh_institution),
                            institution=target_institution,
                            enabled=True,
                        )
                        .first()
                    )
                    if ambulance is None:
                        raise ValidationError(
                            {
                                "ambulance_id": "La unidad dejó de estar habilitada; actualiza la administración."
                            }
                        )
                user.set_unusable_password()
                user.save()
                user.groups.add(*[Group.objects.get_or_create(name=name)[0] for name in groups])
                InstitutionMembership.objects.create(user=user, institution=target_institution)
                if ambulance:
                    from institutions.unit_management import audit_unit_action

                    assignment = AmbulanceAssignment.objects.create(user=user, ambulance=ambulance)
                    audit_unit_action(
                        actor,
                        ambulance,
                        "ambulance.assignment_started",
                        "ambulance_assignment",
                        assignment.pk,
                        uuid.uuid4(),
                    )
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
        from institutions.unit_management import deactivate_account

        if request.data != {}:
            raise ValidationError({"request": "Envía un objeto vacío para confirmar la baja."})
        deactivate_account(request.user.pk, user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ManagedAccountResendActivationView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, user_id):
        from institutions.unit_management import lock_management_users, managed_membership

        administrative_institution(request.user)
        raw_token = secrets.token_urlsafe(32)
        try:
            with transaction.atomic():
                actor, institution, target = lock_management_users(request.user.pk, user_id)
                membership = managed_membership(actor, institution, target)
                if target.is_active:
                    raise NotFound("La invitación no está disponible en este establecimiento.")
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


class ManagedAmbulanceCreateView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        from institutions.unit_management import audit_unit_action, lock_management_users

        institution = administrative_institution(request.user)
        if institution.kind not in (Institution.Kind.RECEIVER, Institution.Kind.COMBINED):
            raise PermissionDenied("Solo la administración de Urgencias puede crear unidades.")
        if not isinstance(request.data, dict) or set(request.data) != {"institution_id", "code"}:
            raise ValidationError(
                {"request": "Indica institución y código, sin campos adicionales."}
            )
        target_institution_id = serializers.UUIDField().run_validation(
            request.data["institution_id"]
        )
        code = request.data["code"]
        if not isinstance(code, str) or not code.strip() or len(code.strip()) > 40:
            raise ValidationError({"code": "Indica un código de unidad válido."})
        try:
            with transaction.atomic():
                actor, institution, _ = lock_management_users(request.user.pk)
                target_institution = (
                    operator_institutions_for_admin(institution)
                    .filter(pk=target_institution_id)
                    .first()
                )
                if target_institution is None:
                    raise ValidationError(
                        {"institution_id": "Selecciona una institución operadora habilitada."}
                    )
                ambulance = Ambulance.objects.create(
                    institution=target_institution, code=code.strip()
                )
                audit_unit_action(
                    actor, ambulance, "ambulance.created", "ambulance", ambulance.pk, uuid.uuid4()
                )
        except IntegrityError as error:
            raise ValidationError(
                {"code": "Ya existe una unidad con ese código en tu institución."}
            ) from error
        return Response(
            {
                "id": str(ambulance.pk),
                "code": ambulance.code,
                "institution_id": str(target_institution.pk),
                "institution_name": target_institution.name,
                "enabled": ambulance.enabled,
                "can_deactivate": True,
            },
            status=status.HTTP_201_CREATED,
        )


class ManagedAccountAssignmentView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, user_id):
        from institutions.unit_management import AssignmentSerializer, change_assignment

        administrative_institution(request.user)
        serializer = AssignmentSerializer(data=request.data)
        if not isinstance(request.data, dict) or set(request.data) - set(serializer.fields):
            raise ValidationError({"request": "La solicitud contiene campos no admitidos."})
        serializer.is_valid(raise_exception=True)
        ambulance = change_assignment(
            request.user.pk,
            user_id,
            serializer.validated_data["ambulance_id"],
            serializer.validated_data["expected_ambulance_id"],
        )
        if ambulance is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response({"id": str(ambulance.pk), "code": ambulance.code})


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
                # Same user-first order as resend and administrative revocation.
                user = User.objects.select_for_update().filter(pk=uid).first()
                if user is None:
                    raise AccountActivation.DoesNotExist
                activation = AccountActivation.objects.select_for_update(of=("self",)).get(
                    user_id=uid,
                )
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
