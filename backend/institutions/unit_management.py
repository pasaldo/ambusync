"""Transactional assignment/withdrawal and logical unit deactivation."""

import uuid

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AccountActivation, User
from audit.models import AuditEvent
from emergencies.models import Emergency
from institutions.account_management import (
    accounts_created_by,
    administrative_institution,
    audit_account_action,
    operator_institutions_for_admin,
)
from institutions.models import Ambulance, AmbulanceAssignment, Institution, InstitutionMembership


class AssignmentConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "assignment_conflict"
    default_detail = "La asignación cambió. Actualiza las cuentas antes de volver a decidir."


class AssignmentSerializer(serializers.Serializer):
    ambulance_id = serializers.UUIDField(allow_null=True)
    expected_ambulance_id = serializers.UUIDField(allow_null=True)


def lock_management_users(actor_id, target_id=None):
    users = {
        user.pk: user
        for user in User.objects.select_for_update()
        .filter(pk__in={actor_id, target_id} - {None})
        .order_by("pk")
    }
    actor = users.get(actor_id)
    if actor is None:
        raise PermissionDenied("Se requiere administración institucional.")
    institution = administrative_institution(actor)
    return actor, institution, users.get(target_id)


def managed_membership(actor, institution, target):
    if target is None:
        raise NotFound("La cuenta no está disponible en este establecimiento.")
    membership = (
        InstitutionMembership.objects.select_for_update(of=("self",))
        .select_related("institution")
        .filter(user=target, active=True, institution__enabled=True)
        .first()
    )
    if membership is None:
        raise NotFound("La cuenta no está disponible en este establecimiento.")
    if membership.institution_id != institution.pk and (
        not accounts_created_by(actor).filter(object_id=str(target.pk)).exists()
        or not operator_institutions_for_admin(institution)
        .filter(pk=membership.institution_id)
        .exists()
    ):
        raise NotFound("La cuenta no está disponible en este establecimiento.")
    return membership


def lock_units(unit_ids):
    return {
        unit.pk: unit
        for unit in Ambulance.objects.select_for_update()
        .filter(pk__in=set(unit_ids) - {None})
        .order_by("pk")
    }


def unit_has_open_episodes(unit):
    return (
        Emergency.objects.filter(ambulance=unit)
        .exclude(status__in=(Emergency.Status.CLOSED, Emergency.Status.CANCELLED))
        .exists()
    )


def ensure_departure_is_safe(unit, user_id):
    if not unit_has_open_episodes(unit):
        return
    replacement_exists = (
        AmbulanceAssignment.objects.filter(
            ambulance=unit,
            active=True,
            ambulance__enabled=True,
            user__is_active=True,
            user__groups__name="ambulance",
            user__institution_memberships__institution_id=unit.institution_id,
            user__institution_memberships__active=True,
        )
        .exclude(user_id=user_id)
        .exists()
    )
    if not replacement_exists:
        raise ValidationError(
            {
                "account": "Asigna otro operador habilitado o resuelve los episodios activos antes de retirar al último operador."
            }
        )


def audit_unit_action(actor, unit, action, object_type, object_id, correlation_id):
    AuditEvent.objects.create(
        actor=actor,
        institution_id=unit.institution_id,
        ambulance=unit,
        action=action,
        object_type=object_type,
        object_id=str(object_id),
        result=AuditEvent.Result.SUCCESS,
        correlation_id=correlation_id,
    )


def end_assignment(assignment, actor, unit, correlation_id):
    assignment.active = False
    assignment.unassigned_at = timezone.now()
    assignment.save(update_fields=["active", "unassigned_at"])
    audit_unit_action(
        actor,
        unit,
        "ambulance.assignment_ended",
        "ambulance_assignment",
        assignment.pk,
        correlation_id,
    )


@transaction.atomic
def change_assignment(actor_id, target_id, new_unit_id, expected_unit_id):
    actor, institution, target = lock_management_users(actor_id, target_id)
    membership = managed_membership(actor, institution, target)
    if not target.groups.filter(name="ambulance").exists() or (
        not target.is_active
        and not AccountActivation.objects.filter(user=target, consumed_at__isnull=True).exists()
    ):
        raise NotFound("La cuenta de ambulancia no está disponible en tu institución.")
    current_id = (
        AmbulanceAssignment.objects.filter(user=target, active=True)
        .values_list("ambulance_id", flat=True)
        .first()
    )
    units = lock_units([current_id, new_unit_id])
    if new_unit_id is not None:
        destination = units.get(new_unit_id)
        if (
            destination is None
            or not destination.enabled
            or destination.institution_id != membership.institution_id
            or not operator_institutions_for_admin(institution)
            .filter(pk=destination.institution_id)
            .exists()
        ):
            raise ValidationError(
                {
                    "ambulance_id": "La unidad no pertenece a la institución del operador o no está habilitada."
                }
            )
    current = (
        AmbulanceAssignment.objects.select_for_update().filter(user=target, active=True).first()
    )
    actual_id = current.ambulance_id if current else None
    if actual_id == new_unit_id:
        return units.get(new_unit_id)
    if actual_id != expected_unit_id:
        raise AssignmentConflict()
    correlation_id = uuid.uuid4()
    if current:
        unit = units[current.ambulance_id]
        ensure_departure_is_safe(unit, target.pk)
        end_assignment(current, actor, unit, correlation_id)
    if new_unit_id is None:
        return None
    assignment = AmbulanceAssignment.objects.create(user=target, ambulance_id=new_unit_id)
    audit_unit_action(
        actor,
        units[new_unit_id],
        "ambulance.assignment_started",
        "ambulance_assignment",
        assignment.pk,
        correlation_id,
    )
    return units[new_unit_id]


@transaction.atomic
def deactivate_account(actor_id, target_id):
    actor, institution, target = lock_management_users(actor_id, target_id)
    membership = managed_membership(actor, institution, target)
    if actor.pk == target.pk:
        raise ValidationError({"account": "No puedes desactivar tu propia cuenta."})
    if target.groups.filter(name="institution_admin").exists():
        others = (
            InstitutionMembership.objects.filter(
                institution_id=membership.institution_id,
                active=True,
                user__is_active=True,
                user__groups__name="institution_admin",
            )
            .exclude(user=target)
            .exists()
        )
        if not others:
            raise ValidationError(
                {"account": "No se puede desactivar al último administrador habilitado."}
            )
    unit_ids = list(
        AmbulanceAssignment.objects.filter(user=target, active=True).values_list(
            "ambulance_id", flat=True
        )
    )
    units = lock_units(unit_ids)
    correlation_id = uuid.uuid4()
    for assignment in AmbulanceAssignment.objects.select_for_update().filter(
        user=target, active=True
    ):
        unit = units[assignment.ambulance_id]
        ensure_departure_is_safe(unit, target.pk)
        end_assignment(assignment, actor, unit, correlation_id)
    membership.active = False
    membership.save(update_fields=["active"])
    target.is_active = False
    target.session_version += 1
    target.save(update_fields=["is_active", "session_version"])
    AccountActivation.objects.filter(user=target, consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )
    audit_account_action(actor, membership.institution, target, "account.deactivated")


def can_deactivate_unit(actor, institution, unit):
    if institution.kind == Institution.Kind.COMBINED:
        return unit.institution_id == institution.pk
    if institution.kind != Institution.Kind.RECEIVER:
        return False
    return (
        institution.operator_institutions.filter(pk=unit.institution_id).exists()
        or AuditEvent.objects.filter(
            actor=actor, action="ambulance.created", object_type="ambulance", object_id=str(unit.pk)
        ).exists()
    )


class ManagedAmbulanceDeactivateView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, ambulance_id):
        if request.data != {}:
            raise ValidationError({"request": "Envía un objeto vacío para confirmar la baja."})
        with transaction.atomic():
            actor, institution, _ = lock_management_users(request.user.pk)
            unit = (
                Ambulance.objects.select_for_update(of=("self",))
                .filter(
                    pk=ambulance_id, institution__in=operator_institutions_for_admin(institution)
                )
                .first()
            )
            if unit is None or not can_deactivate_unit(actor, institution, unit):
                raise NotFound("La unidad no está disponible en tu institución.")
            if not unit.enabled:
                return Response(status=status.HTTP_204_NO_CONTENT)
            if unit_has_open_episodes(unit):
                raise ValidationError(
                    {"ambulance": "No se puede desactivar una unidad con episodios activos."}
                )
            correlation_id = uuid.uuid4()
            for assignment in AmbulanceAssignment.objects.select_for_update().filter(
                ambulance=unit, active=True
            ):
                end_assignment(assignment, actor, unit, correlation_id)
            unit.enabled = False
            unit.save(update_fields=["enabled"])
            audit_unit_action(
                actor, unit, "ambulance.deactivated", "ambulance", unit.pk, correlation_id
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
