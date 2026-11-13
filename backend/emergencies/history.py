import calendar
import re

from django.db.models import Case, DateTimeField, When
from django.db.models.functions import Coalesce, ExtractDay, ExtractMonth, ExtractYear
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.http import NoStoreResourceView
from emergencies.models import Emergency
from emergencies.serializers import emergency_representation
from emergencies.views import EmergencyPagination
from reports.filters import ZONE, choice_filter, read_snapshot, validated_query
from reports.scopes import receiver_institution_ids
from reports.views import detailed


class EmergencyHistoryView(NoStoreResourceView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        with read_snapshot():
            ids = receiver_institution_ids(request.user)
            if not ids.exists():
                raise PermissionDenied("Se requiere Urgencias de un destino habilitado.")
            values = validated_query(request.query_params, ("day", "month", "year", "status"))
            if set(values) & {"date_from", "date_to"}:
                raise ValidationError("El archivo usa día, mes y año del hito.")
            for key, maximum in (("day", 31), ("month", 12), ("year", 9999)):
                if key in values:
                    raw = values[key]
                    if not re.fullmatch(r"[0-9]{1,4}", raw) or not 1 <= int(raw) <= maximum:
                        raise ValidationError({key: "Indica un valor válido."})
                    values[key] = int(raw)
            if (
                "day" in values
                and "month" in values
                and values["day"]
                > calendar.monthrange(values.get("year", 2000), values["month"])[1]
            ):
                raise ValidationError({"day": "El día no existe en ese mes."})
            choice_filter(values, "status", ("cerrada", "cancelada", "llegado"))
            query = Emergency.objects.filter(
                destination_id__in=ids,
                status__in=(values["status"],) if "status" in values else ("cerrada", "cancelada"),
            ).annotate(
                event_date=Case(
                    When(status="cancelada", then=Coalesce("cancelled_at", "created_at")),
                    When(status="cerrada", then=Coalesce("closed_at", "arrived_at", "created_at")),
                    default=Coalesce("arrived_at", "created_at"),
                    output_field=DateTimeField(),
                )
            )
            for key, extractor in (
                ("day", ExtractDay),
                ("month", ExtractMonth),
                ("year", ExtractYear),
            ):
                if key in values:
                    query = query.annotate(**{f"event_{key}": extractor("event_date", tzinfo=ZONE)})
                    query = query.filter(**{f"event_{key}": values[key]})
            paginator = EmergencyPagination()
            page = paginator.paginate_queryset(
                detailed(query).order_by("-event_date", "id"), request, view=self
            )
            rows = [
                {**emergency_representation(row), "event_date": row.event_date.isoformat()}
                for row in page
            ]
            data = paginator.get_paginated_response(rows).data
            data.update(timezone="America/Santiago", date_basis="event_date")
            return Response(data)
