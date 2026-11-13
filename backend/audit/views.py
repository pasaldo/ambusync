"""Institutional administration only; never a general clinical audit endpoint."""

from django.db.models import Q
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from audit.models import AuditEvent
from emergencies.resource_mutations import NoStoreResourceView
from emergencies.views import EmergencyPagination
from institutions.models import InstitutionMembership
from reports.filters import choice_filter, date_filter, read_snapshot, validated_query

ADMIN_ACTIONS = {
    "account.created": "account",
    "account.activated": "account",
    "account.activation_resent": "account",
    "account.deactivated": "account",
    "ambulance.created": "ambulance",
    "ambulance.deactivated": "ambulance",
    "ambulance.assignment_started": "ambulance_assignment",
    "ambulance.assignment_ended": "ambulance_assignment",
    "institution_admin.provisioned": "account",
    "permission.manage_symptoms_granted": "account",
    "permission.deactivate_patients_granted": "account",
    "permission.view_reports_granted": "account",
}


class AdministrativeAuditView(NoStoreResourceView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        with read_snapshot():
            actor = request.user
            if (
                not actor.is_active
                or actor.groups.filter(name="system_admin").exists()
                or not actor.groups.filter(name="institution_admin").exists()
            ):
                raise PermissionDenied("Se requiere administración de la institución.")
            ids = InstitutionMembership.objects.filter(
                user=actor, active=True, institution__enabled=True
            ).values_list("institution_id", flat=True)
            if not ids.exists():
                raise PermissionDenied("No hay institución habilitada.")
            values = validated_query(request.query_params, ("action", "object_type"))
            choice_filter(values, "action", ADMIN_ACTIONS)
            choice_filter(values, "object_type", set(ADMIN_ACTIONS.values()))
            allowed = Q(pk__in=[])
            for action, object_type in ADMIN_ACTIONS.items():
                allowed |= Q(action=action, object_type=object_type)
            query = AuditEvent.objects.filter(allowed, institution_id__in=ids)
            query = date_filter(query, values, "occurred_at")
            for key in ("action", "object_type"):
                if key in values:
                    query = query.filter(**{key: values[key]})
            paginator = EmergencyPagination()
            page = paginator.paginate_queryset(
                query.order_by("-occurred_at", "id"), request, view=self
            )
            rows = [
                {
                    "id": str(row.pk),
                    "actor_id": str(row.actor_id) if row.actor_id else None,
                    "occurred_at": row.occurred_at.isoformat(),
                    "action": row.action,
                    "object_type": row.object_type,
                    "object_id": row.object_id,
                    "result": row.result,
                    "correlation_id": str(row.correlation_id),
                }
                for row in page
            ]
            return paginator.get_paginated_response(rows)
