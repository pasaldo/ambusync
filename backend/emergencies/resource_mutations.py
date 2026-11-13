"""Actor-scoped idempotency shared with emergencies; no durable browser queue."""

import hashlib
import json

from django.contrib.auth import get_user_model
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils.cache import add_never_cache_headers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import AuditEvent
from emergencies.models import ProcessedOperation
from emergencies.views import OperationConflict


class NoStoreResourceView(APIView):
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        add_never_cache_headers(response)
        return response


class ResourceMutationView(NoStoreResourceView):
    permission_classes = (IsAuthenticated,)
    required_groups = ()
    action = ""
    target_field = ""
    success_status = 200

    def post(self, request, **kwargs):
        if not isinstance(request.data, dict):
            raise ValidationError({"request": "Revisa el formato de la solicitud."})
        serializer = self.serializer_class(data=request.data)
        if set(request.data) - set(serializer.fields):
            raise ValidationError({"request": "La solicitud contiene campos no admitidos."})
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        digest = hashlib.sha256(
            json.dumps(
                {"action": self.action, "path": request.path, **values},
                sort_keys=True,
                cls=DjangoJSONEncoder,
            ).encode()
        ).hexdigest()
        with transaction.atomic():
            actor = (
                get_user_model()
                .objects.select_for_update(no_key=True)
                .filter(pk=request.user.pk, is_active=True)
                .first()
            )
            if (
                actor is None
                or actor.groups.filter(name="system_admin").exists()
                or any(
                    not actor.groups.filter(name=group).exists() for group in self.required_groups
                )
            ):
                raise PermissionDenied("Esta acción requiere un permiso adicional explícito.")
            context = self.authorize(actor, kwargs)
            previous = ProcessedOperation.objects.filter(
                actor=actor, operation_id=values["operation_id"]
            ).first()
            if previous:
                if previous.action != self.action or previous.request_hash != digest:
                    raise OperationConflict()
                target = getattr(previous, self.target_field)
                self.authorize_replay(target, context)
                return Response(self.representation(target), headers={"Idempotent-Replay": "true"})
            target = self.target(context)
            if target is not None and target.version != values["expected_version"]:
                raise OperationConflict("El registro cambió; revisa su versión antes de enviar.")
            target, changed = self.apply(actor, target, context, values)
            ProcessedOperation.objects.create(
                actor=actor,
                operation_id=values["operation_id"],
                action=self.action,
                request_hash=digest,
                **{self.target_field: target},
            )
            if changed:
                AuditEvent.objects.create(
                    actor=actor,
                    institution_id=self.institution_id(target),
                    action=self.action,
                    object_type=self.target_field,
                    object_id=str(target.pk),
                    result=AuditEvent.Result.SUCCESS,
                    correlation_id=values["operation_id"],
                )
        return Response(self.representation(target), status=self.success_status)

    def target(self, context):
        return context

    def authorize_replay(self, target, context):
        if target is None or self.target(context).pk != target.pk:
            raise OperationConflict()
