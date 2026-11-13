from django.db.models import Count
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from emergencies.models import Emergency
from emergencies.resource_mutations import NoStoreResourceView
from emergencies.serializers import emergency_representation
from emergencies.views import EmergencyPagination
from reports.filters import choice_filter, date_filter, read_snapshot, uuid_filter, validated_query
from reports.scopes import has_report_permission, receiver_institution_ids

STATUSES = ("notificada", "en_traslado", "llegado", "cancelada", "cerrada")
TRIAGES = ("C1", "C2", "C3", "C4", "C5")


def authorized_reports(user):
    ids = receiver_institution_ids(user)
    if not has_report_permission(user) or not ids.exists():
        raise PermissionDenied(
            "Los informes requieren permiso adicional de Urgencias y un destino habilitado."
        )
    return Emergency.objects.filter(destination_id__in=ids)


def detailed(query):
    return query.select_related(
        "operating_institution", "destination", "ambulance", "patient_record"
    ).prefetch_related("vital_measurements__rectification", "patient_context_corrections")


class EmergencyReportListView(NoStoreResourceView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        with read_snapshot():
            base = authorized_reports(request.user)
            values = validated_query(request.query_params, ("status", "triage", "ambulance_id"))
            choice_filter(values, "status", STATUSES)
            choice_filter(values, "triage", (*TRIAGES, "unclassified"))
            unit = uuid_filter(values, "ambulance_id")
            if unit and not base.filter(ambulance_id=unit).exists():
                raise NotFound("La unidad no está disponible para esta consulta.")
            units = list(
                base.order_by("ambulance__code", "ambulance_id")
                .values("ambulance_id", "ambulance__code")
                .distinct()
            )
            query = date_filter(base, values, "created_at")
            if unit:
                query = query.filter(ambulance_id=unit)
            if "status" in values:
                query = query.filter(status=values["status"])
            if values.get("triage") == "unclassified":
                query = query.exclude(triage__in=TRIAGES)
            elif "triage" in values:
                query = query.filter(triage=values["triage"])
            by_status = dict.fromkeys(STATUSES, 0)
            by_triage = dict.fromkeys((*TRIAGES, "unclassified"), 0)
            total = 0
            for row in query.order_by().values("status", "triage").annotate(n=Count("id")):
                total += row["n"]
                by_status[row["status"]] += row["n"]
                by_triage[row["triage"] if row["triage"] in TRIAGES else "unclassified"] += row["n"]
            paginator = EmergencyPagination()
            page = paginator.paginate_queryset(
                detailed(query).order_by("-created_at", "id"), request, view=self
            )
            data = paginator.get_paginated_response(
                [emergency_representation(row) for row in page]
            ).data
            data.update(
                summary={"total": total, "by_status": by_status, "by_triage": by_triage},
                timezone="America/Santiago",
                date_basis="created_at",
                ambulances=[
                    {"id": str(row["ambulance_id"]), "code": row["ambulance__code"]}
                    for row in units
                ],
            )
            return Response(data)


class EmergencyReportDetailView(NoStoreResourceView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, emergency_id):
        with read_snapshot():
            query = authorized_reports(request.user)
            if request.query_params:
                from rest_framework.exceptions import ValidationError

                raise ValidationError({"filters": "El detalle no admite filtros."})
            row = detailed(query).filter(pk=emergency_id).first()
            if row is None:
                raise NotFound("El episodio no está disponible.")
            return Response(emergency_representation(row))
