import hashlib
import time
from uuid import UUID

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from django.contrib.sessions.backends.db import SessionStore

from accounts.models import User
from institutions.models import AmbulanceAssignment, InstitutionMembership


def institution_group_name(institution_id):
    opaque_id = hashlib.sha256(str(institution_id).encode("ascii")).hexdigest()[:32]
    return f"emergency.destination.{opaque_id}"


def ambulance_group_name(ambulance_id):
    opaque_id = hashlib.sha256(str(ambulance_id).encode("ascii")).hexdigest()[:32]
    return f"emergency.ambulance.{opaque_id}"


@database_sync_to_async
def current_socket_access(user_id, session_key):
    if not session_key:
        return "unauthenticated", set()

    session = SessionStore(session_key=session_key)
    session_data = session.load()
    if (
        session.get_expiry_age() <= 0
        or str(session_data.get("_auth_user_id")) != str(user_id)
        or session_data.get(settings.SESSION_VERSION_KEY) is None
    ):
        return "unauthenticated", set()

    try:
        session_version = int(session_data[settings.SESSION_VERSION_KEY])
        started_at = float(session_data[settings.SESSION_STARTED_AT_KEY])
        last_interaction_at = float(session_data["ambusync_last_interaction_at"])
    except KeyError, TypeError, ValueError:
        return "unauthenticated", set()

    now = time.time()
    if (
        now - started_at >= settings.SESSION_ABSOLUTE_AGE
        or now - last_interaction_at >= settings.SESSION_IDLE_AGE
    ):
        return "unauthenticated", set()

    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None or user.session_version != session_version:
        return "unauthenticated", set()

    groups = set(user.groups.values_list("name", flat=True))
    audience_groups = set()
    memberships = InstitutionMembership.objects.filter(
        user_id=user_id,
        active=True,
        institution__enabled=True,
    )
    if "urgencias" in groups:
        audience_groups.update(
            institution_group_name(institution_id)
            for institution_id in memberships.values_list("institution_id", flat=True)
        )

    if "ambulance" in groups:
        member_institutions = memberships.values_list("institution_id", flat=True)
        assignments = AmbulanceAssignment.objects.filter(
            user_id=user_id,
            active=True,
            ambulance__enabled=True,
            ambulance__institution__enabled=True,
            ambulance__institution_id__in=member_institutions,
        )
        audience_groups.update(
            ambulance_group_name(ambulance_id)
            for ambulance_id in assignments.values_list("ambulance_id", flat=True)
        )

    return "authorized", audience_groups


class EmergencyEventsConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return

        session = self.scope.get("session")
        session_key = getattr(session, "session_key", None)
        status, groups = await current_socket_access(user.pk, session_key)
        if status != "authorized":
            await self.close(code=4401 if status == "unauthenticated" else 4403)
            return
        if not groups:
            await self.close(code=4403)
            return

        self.user_id = str(user.pk)
        self.session_key = session_key
        self.audience_groups = groups
        for group in groups:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        for group in getattr(self, "audience_groups", set()):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # This is a server-to-client notification channel, not a write API.
        await self.close(code=4400)

    async def emergency_event(self, event):
        status, current_groups = await current_socket_access(self.user_id, self.session_key)
        if status == "unauthenticated":
            await self.close(code=4401)
            return

        self.audience_groups.intersection_update(current_groups)
        audience_group = event.get("audience_group")
        if not self.audience_groups:
            await self.close(code=4403)
            return
        if audience_group not in self.audience_groups:
            await self.channel_layer.group_discard(audience_group, self.channel_name)
            return

        try:
            UUID(str(event["event_id"]))
            UUID(str(event["emergency_id"]))
            version = int(event["version"])
        except KeyError, TypeError, ValueError:
            return
        if version < 1:
            return

        event_type = event.get("event_type")
        if event_type not in {
            "emergency.created",
            "emergency.transfer_started",
            "emergency.arrived",
            "emergency.cancelled",
            "emergency.closed",
        }:
            return

        await self.send_json(
            {
                "event_id": str(event["event_id"]),
                "type": event_type,
                "emergency_id": str(event["emergency_id"]),
                "version": version,
            }
        )
