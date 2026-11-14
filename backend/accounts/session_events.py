import hashlib
import logging
from functools import partial

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction


def user_session_group(user_id):
    return "session.user." + hashlib.sha256(str(user_id).encode()).hexdigest()[:32]


def publish_session_revocation(user_id):
    transaction.on_commit(partial(_publish, user_id))


def _publish(user_id):
    try:
        layer = get_channel_layer()
        if layer is not None:
            async_to_sync(layer.group_send)(
                user_session_group(user_id), {"type": "session.revoked"}
            )
    except Exception:  # noqa: BLE001 -- DB version is authoritative; never log secrets.
        logging.getLogger(__name__).warning("Session revocation notification unavailable.")
