import logging
from functools import partial
from uuid import uuid4

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

from emergencies.consumers import ambulance_group_name, institution_group_name
from emergencies.models import Emergency

logger = logging.getLogger(__name__)

EMERGENCY_EVENT_TYPES = frozenset(
    {
        "emergency.created",
        "emergency.transfer_started",
        "emergency.arrived",
        "emergency.cancelled",
        "emergency.closed",
        "emergency.updated",
        "emergency.measurements_added",
        "emergency.measurement_rectified",
        "emergency.read_confirmed",
        "emergency.preparation_recorded",
        "emergency.destination_changed",
        "emergency.patient_context_corrected",
    }
)


def publish_emergency_event(emergency_id, event_type, version):
    if event_type not in EMERGENCY_EVENT_TYPES:
        raise ValueError("Unsupported emergency event type.")
    if version < 1:
        raise ValueError("Emergency event version must be positive.")

    transaction.on_commit(partial(_publish_committed_event, emergency_id, event_type, version))


def _publish_committed_event(emergency_id, event_type, version):
    try:
        emergency = Emergency.objects.only("destination_id", "ambulance_id").get(pk=emergency_id)
        layer = get_channel_layer()
        if layer is None:
            return

        event_id = str(uuid4())
        base_event = {
            "type": "emergency.event",
            "event_id": event_id,
            "event_type": event_type,
            "emergency_id": str(emergency_id),
            "version": version,
        }
        for audience_group in (
            institution_group_name(emergency.destination_id),
            ambulance_group_name(emergency.ambulance_id),
        ):
            async_to_sync(layer.group_send)(
                audience_group,
                {**base_event, "audience_group": audience_group},
            )
    except Exception:  # noqa: BLE001 - notification failure must not fail a committed write.
        # Persistence is authoritative; a notification failure is recovered by API reconciliation.
        logger.warning(
            "Emergency notification publication failed.",
            extra={"emergency_id": str(emergency_id), "event_type": event_type},
        )
