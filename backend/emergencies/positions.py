import hashlib
import json
from datetime import UTC, timedelta

from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from config.http import NoStoreResourceView
from emergencies.events import publish_emergency_event
from emergencies.models import Emergency, Position, ProcessedOperation
from emergencies.serializers import MeasurementTimestampField
from emergencies.views import EmergencyTransitionView, OperationConflict, authorized_emergencies
from institutions.geocoding import finite_number


class PositionInput(serializers.Serializer):
    operation_id = serializers.UUIDField()
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    accuracy_m = serializers.FloatField(min_value=0, allow_null=True, default=None)
    captured_at = MeasurementTimestampField()

    def validate(self, values):
        for key, low, high in (
            ("latitude", -90, 90),
            ("longitude", -180, 180),
            ("accuracy_m", 0, 1e9),
        ):
            raw = self.initial_data.get(key)
            if values.get(key) is not None and (
                type(raw) not in (int, float) or not finite_number(values[key], low, high)
            ):
                raise ValidationError({key: "Indica un número finito dentro del rango permitido."})
        return values


def position_payload(item):
    if item is None:
        return None
    return {
        "id": str(item.pk),
        "sequence": item.sequence,
        "latitude": item.latitude,
        "longitude": item.longitude,
        "accuracy_m": item.accuracy_m,
        "captured_at": item.captured_at.astimezone(UTC).isoformat(),
        "received_at": item.received_at.astimezone(UTC).isoformat(),
        "clock_consistent": item.clock_consistent,
    }


class PositionsView(NoStoreResourceView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, emergency_id):
        emergency = (
            authorized_emergencies(request.user, include_terminal=True)
            .filter(pk=emergency_id)
            .first()
        )
        if emergency is None:
            raise NotFound("El episodio no está disponible.")
        latest = (
            Position.objects.filter(emergency=emergency, clock_consistent=True)
            .order_by("-captured_at", "-sequence")
            .first()
        )
        recent = Position.objects.filter(emergency=emergency).order_by("-sequence").first()
        return Response(
            {
                "latest": position_payload(latest),
                "last_received": position_payload(recent),
                "target": emergency.destination.location,
                "server_time": timezone.now().isoformat(),
                "status": emergency.status,
            }
        )

    def post(self, request, emergency_id):
        if not isinstance(request.data, dict):
            raise ValidationError("Revisa la solicitud de posición.")
        serializer = PositionInput(data=request.data)
        if set(request.data) - set(serializer.fields):
            raise ValidationError("La solicitud contiene campos no admitidos.")
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        digest = hashlib.sha256(
            json.dumps(
                {"emergency_id": str(emergency_id), **values}, sort_keys=True, cls=DjangoJSONEncoder
            ).encode()
        ).hexdigest()
        with transaction.atomic():
            actor = (
                User.objects.select_for_update(no_key=True)
                .filter(pk=request.user.pk, is_active=True)
                .first()
            )
            if (
                actor is None
                or not actor.groups.filter(name="ambulance").exists()
                or actor.groups.filter(name="system_admin").exists()
            ):
                raise PermissionDenied("Se requiere permiso de ambulancia.")
            emergency = (
                Emergency.objects.select_for_update(of=("self",))
                .select_related("destination", "operating_institution", "ambulance")
                .filter(pk=emergency_id)
                .first()
            )
            if emergency is None:
                raise NotFound("El episodio no está disponible.")
            scope = EmergencyTransitionView()
            scope.actor_group = "ambulance"
            scope.authorize_scope(actor, emergency)
            previous = ProcessedOperation.objects.filter(
                actor=actor, operation_id=values["operation_id"]
            ).first()
            if previous:
                if (
                    previous.action != "emergency.position_recorded"
                    or previous.request_hash != digest
                    or previous.emergency_id != emergency.pk
                ):
                    raise OperationConflict()
                position = Position.objects.get(actor=actor, operation_id=values["operation_id"])
                return Response(
                    {"position": position_payload(position)}, headers={"Idempotent-Replay": "true"}
                )
            if (
                emergency.status not in ("notificada", "en_traslado")
                or not emergency.destination.enabled
            ):
                raise OperationConflict("El episodio ya no admite seguimiento.")
            if (
                emergency.status == "notificada"
                and Position.objects.filter(emergency=emergency, actor=actor).exists()
            ):
                raise OperationConflict(
                    "La primera captura ya se registró; inicia el traslado para continuar."
                )
            now = timezone.now()
            position = Position.objects.create(
                emergency=emergency,
                actor=actor,
                sequence=(
                    Position.objects.filter(emergency=emergency).aggregate(last=Max("sequence"))[
                        "last"
                    ]
                    or 0
                )
                + 1,
                received_at=now,
                clock_consistent=emergency.created_at - timedelta(seconds=30)
                <= values["captured_at"]
                <= now + timedelta(seconds=5),
                **values,
            )
            ProcessedOperation.objects.create(
                actor=actor,
                operation_id=values["operation_id"],
                action="emergency.position_recorded",
                emergency=emergency,
                request_hash=digest,
            )
            publish_emergency_event(emergency.pk, "emergency.position_recorded", position.sequence)
        return Response({"position": position_payload(position)}, status=201)
