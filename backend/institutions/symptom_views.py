from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied

from emergencies.resource_mutations import ResourceMutationView
from emergencies.serializers import EmergencyOperationSerializer, validate_label
from emergencies.views import EmergencyPagination, OperationConflict
from institutions.models import Institution, InstitutionMembership, Symptom
from institutions.symptom_catalog import symptom_key


def catalog_institution(actor):
    if (
        actor.groups.filter(name="system_admin").exists()
        or not actor.groups.filter(
            name__in=("ambulance", "urgencias", "institution_admin")
        ).exists()
    ):
        raise PermissionDenied("El catálogo requiere un ámbito institucional autorizado.")
    membership = InstitutionMembership.objects.filter(
        user=actor, active=True, institution__enabled=True
    ).first()
    if membership is None:
        raise PermissionDenied("No hay institución habilitada.")
    return membership.institution_id


def symptom_representation(target):
    return {
        "id": str(target.pk),
        "institution_id": str(target.institution_id),
        "description": target.description,
        "enabled": target.enabled,
        "version": target.version,
    }


class SymptomCreateSerializer(EmergencyOperationSerializer):
    description = serializers.CharField(max_length=120, validators=[validate_label])


class SymptomListCreateView(ResourceMutationView):
    required_groups = ("manage_symptoms",)
    target_field = "symptom"
    action = "symptom.created"
    serializer_class = SymptomCreateSerializer
    success_status = 201
    representation = staticmethod(symptom_representation)

    def get(self, request):
        institution_id = catalog_institution(request.user)
        rows = Symptom.objects.filter(institution_id=institution_id)
        if not request.user.groups.filter(name="manage_symptoms").exists():
            rows = rows.filter(enabled=True)
        paginator = EmergencyPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response([symptom_representation(row) for row in page])

    def authorize(self, actor, kwargs):
        # Membership row is the authorization guard, no institution-wide clinical access.
        institution_id = catalog_institution(actor)
        if (
            not InstitutionMembership.objects.select_for_update(of=("self",))
            .filter(user=actor, institution_id=institution_id, active=True)
            .first()
        ):
            raise PermissionDenied("El ámbito institucional cambió.")
        if (
            not Institution.objects.select_for_update(no_key=True)
            .filter(pk=institution_id, enabled=True)
            .first()
        ):
            raise PermissionDenied("La institución no está habilitada.")
        return institution_id

    def target(self, context):
        return None

    def authorize_replay(self, target, context):
        if target is None or target.institution_id != context:
            raise NotFound("El síntoma no está disponible.")

    def institution_id(self, target):
        return target.institution_id

    def apply(self, actor, target, context, values):
        description = " ".join(values["description"].split())
        normalized = symptom_key(description)
        if Symptom.objects.filter(institution_id=context, normalized=normalized).exists():
            raise OperationConflict(
                "Ya existe ese síntoma en el catálogo, incluso si está desactivado."
            )
        return Symptom.objects.create(
            institution_id=context, description=description, normalized=normalized
        ), True


class SymptomDeactivateView(ResourceMutationView):
    required_groups = ("manage_symptoms",)
    target_field = "symptom"
    action = "symptom.deactivated"
    serializer_class = EmergencyOperationSerializer
    representation = staticmethod(symptom_representation)

    def authorize(self, actor, kwargs):
        institution_id = catalog_institution(actor)
        if (
            not Institution.objects.select_for_update(no_key=True)
            .filter(pk=institution_id, enabled=True)
            .first()
        ):
            raise PermissionDenied("La institución ya no está habilitada.")
        target = (
            Symptom.objects.select_for_update(no_key=True)
            .filter(pk=kwargs["symptom_id"], institution_id=institution_id)
            .first()
        )
        if target is None:
            raise NotFound("El síntoma no está disponible en esta institución.")
        return target

    def institution_id(self, target):
        return target.institution_id

    def apply(self, actor, target, context, values):
        if not target.enabled:
            return target, False
        target.enabled = False
        target.version += 1
        target.save(update_fields=["enabled", "version"])
        return target, True
