import asyncio
import time
import uuid
from unittest.mock import patch

from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.db import connections, transaction
from django.test import Client, TransactionTestCase, override_settings

from accounts.models import User
from emergencies.consumers import ambulance_group_name, institution_group_name
from emergencies.models import Emergency
from emergencies.tests import EmergencyFixtureMixin
from institutions.models import AmbulanceAssignment


@override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}})
class EmergencyWebSocketTests(EmergencyFixtureMixin, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.layer = get_channel_layer()
        self.receiver_channel, self.ambulance_channel = asyncio.run(self.subscribe_audiences())

    def tearDown(self):
        # database_sync_to_async runs in the shared ASGI executor thread, so its
        # connections are invisible to Django's main-thread teardown and would
        # block DROP DATABASE at the end of the suite. Close them here.
        asyncio.run(self.close_executor_db_connections())
        super().tearDown()

    async def close_executor_db_connections(self):
        await database_sync_to_async(connections.close_all)()

    async def subscribe_audiences(self):
        receiver_channel = await self.layer.new_channel("test.receiver")
        ambulance_channel = await self.layer.new_channel("test.ambulance")
        await self.layer.group_add(institution_group_name(self.receiver.pk), receiver_channel)
        await self.layer.group_add(ambulance_group_name(self.ambulance.pk), ambulance_channel)
        return receiver_channel, ambulance_channel

    def receive(self, channel):
        return asyncio.run(asyncio.wait_for(self.layer.receive(channel), timeout=1))

    def communicator_for(self, user=None):
        client = Client()
        if user is not None:
            client.force_login(user)
            session = client.session
            now = time.time()
            session[settings.SESSION_STARTED_AT_KEY] = now
            session["ambusync_last_interaction_at"] = now
            session[settings.SESSION_VERSION_KEY] = user.session_version
            session.save()
        cookie = client.cookies.get(settings.SESSION_COOKIE_NAME)
        headers = [
            (b"host", b"localhost"),
            (b"origin", b"http://localhost"),
        ]
        if cookie:
            headers.append((b"cookie", f"{settings.SESSION_COOKIE_NAME}={cookie.value}".encode()))
        from config.asgi import application

        return WebsocketCommunicator(application, "/ws/emergencies/", headers=headers)

    def test_authenticated_ambulance_user_can_connect(self):
        communicator = self.communicator_for(self.operator)

        async def exercise():
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.disconnect()

        asyncio.run(exercise())

    def test_episode_update_events_reach_socket_as_minimal_envelopes(self):
        communicator = self.communicator_for(self.receiver_user)

        async def exercise():
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            try:
                group = institution_group_name(self.receiver.pk)
                for event_type in (
                    "emergency.updated",
                    "emergency.measurements_added",
                    "emergency.measurement_rectified",
                ):
                    await self.layer.group_send(
                        group,
                        {
                            "type": "emergency.event",
                            "audience_group": group,
                            "event_type": event_type,
                            "event_id": str(uuid.uuid4()),
                            "emergency_id": str(uuid.uuid4()),
                            "version": 2,
                        },
                    )
                    self.assertFalse(
                        await communicator.receive_nothing(timeout=0.2),
                        "el consumidor no debe descartar avisos de D",
                    )
                    event = await communicator.receive_json_from()
                    self.assertEqual(event["type"], event_type)
                    self.assertEqual(set(event), {"event_id", "type", "emergency_id", "version"})
            finally:
                await communicator.disconnect()

        asyncio.run(exercise())

    def assert_two_audience_events(self, event_type, emergency_id, version):
        receiver_event = self.receive(self.receiver_channel)
        ambulance_event = self.receive(self.ambulance_channel)
        for event in (receiver_event, ambulance_event):
            self.assertEqual(
                set(event),
                {
                    "type",
                    "audience_group",
                    "event_id",
                    "event_type",
                    "emergency_id",
                    "version",
                },
            )
            self.assertEqual(event["type"], "emergency.event")
            self.assertEqual(event["event_type"], event_type)
            self.assertEqual(event["emergency_id"], str(emergency_id))
            self.assertEqual(event["version"], version)
        self.assertEqual(receiver_event["event_id"], ambulance_event["event_id"])
        self.assertEqual(receiver_event["audience_group"], institution_group_name(self.receiver.pk))
        self.assertEqual(ambulance_event["audience_group"], ambulance_group_name(self.ambulance.pk))
        return receiver_event["event_id"]

    def post_transition(self, user, emergency, action, **extra):
        self.authenticate_with_csrf(user)
        return self.client.post(
            f"/api/v1/emergencies/{emergency.id}/{action}/",
            {
                "operation_id": str(uuid.uuid4()),
                "expected_version": emergency.version,
                **extra,
            },
            format="json",
        )

    def test_create_and_each_supported_transition_publish_minimal_events(self):
        self.authenticate_with_csrf(self.operator)
        payload = self.payload()
        response = self.client.post("/api/v1/emergencies/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        emergency_id = response.data["id"]
        self.assert_two_audience_events("emergency.created", emergency_id, 1)

        emergency = Emergency.objects.get(pk=emergency_id)
        response = self.post_transition(self.operator, emergency, "transfer-start")
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_two_audience_events("emergency.transfer_started", emergency_id, 2)

        emergency.refresh_from_db()
        response = self.post_transition(self.receiver_user, emergency, "arrival")
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_two_audience_events("emergency.arrived", emergency_id, 3)

        emergency.refresh_from_db()
        response = self.post_transition(self.receiver_user, emergency, "close")
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_two_audience_events("emergency.closed", emergency_id, 4)

        self.authenticate_with_csrf(self.operator)
        replay = self.client.post("/api/v1/emergencies/", payload, format="json")
        self.assertEqual(replay.status_code, 200)
        with self.assertRaises(asyncio.TimeoutError):
            self.receive(self.receiver_channel)

    def test_cancellation_publishes_cancelled_event_to_both_audiences(self):
        self.authenticate_with_csrf(self.operator)
        response = self.client.post("/api/v1/emergencies/", self.payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        emergency_id = response.data["id"]
        self.assert_two_audience_events("emergency.created", emergency_id, 1)

        emergency = Emergency.objects.get(pk=emergency_id)
        response = self.post_transition(
            self.operator, emergency, "cancel", reason="Cancelación sintética"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_two_audience_events("emergency.cancelled", emergency_id, 2)

    def test_rolled_back_creation_does_not_publish(self):
        from emergencies.events import publish_emergency_event

        with self.assertRaisesRegex(RuntimeError, "rollback sentinel"), transaction.atomic():
            emergency = Emergency.objects.create(
                operating_institution=self.operator_institution,
                destination=self.receiver,
                ambulance=self.ambulance,
                created_by=self.operator,
                status=Emergency.Status.NOTIFIED,
                patient_identity_unknown=True,
                reason="Rollback synthetic case",
            )
            publish_emergency_event(emergency.pk, "emergency.created", emergency.version)
            raise RuntimeError("rollback sentinel")

        with self.assertRaises(asyncio.TimeoutError):
            self.receive(self.receiver_channel)
        with self.assertRaises(asyncio.TimeoutError):
            self.receive(self.ambulance_channel)

    def test_notification_transport_failure_does_not_change_api_write_success(self):
        from emergencies.events import publish_emergency_event

        emergency = Emergency.objects.create(
            operating_institution=self.operator_institution,
            destination=self.receiver,
            ambulance=self.ambulance,
            created_by=self.operator,
            status=Emergency.Status.NOTIFIED,
            patient_identity_unknown=True,
            reason="Transport failure synthetic case",
        )

        class UnavailableLayer:
            async def group_send(self, group, message):
                raise OSError("transport unavailable")

        with patch("emergencies.events.get_channel_layer", return_value=UnavailableLayer()):
            publish_emergency_event(emergency.pk, "emergency.created", emergency.version)

        self.assertTrue(Emergency.objects.filter(pk=emergency.pk).exists())

    def test_anonymous_user_is_rejected(self):
        communicator = self.communicator_for()

        async def exercise():
            connected, close_code = await communicator.connect()
            self.assertFalse(connected)
            self.assertEqual(close_code, 4401)

        asyncio.run(exercise())

    def test_session_revoked_before_connection_is_rejected(self):
        communicator = self.communicator_for(self.operator)
        self.operator.session_version += 1
        self.operator.save(update_fields=("session_version",))

        async def exercise():
            connected, close_code = await communicator.connect()
            self.assertFalse(connected)
            self.assertEqual(close_code, 4401)

        asyncio.run(exercise())

    def test_password_changed_before_connection_invalidates_old_session(self):
        communicator = self.communicator_for(self.operator)
        self.operator.set_password("Synthetic-New-Password-26!")
        self.operator.save(update_fields=("password",))

        async def exercise():
            connected, close_code = await communicator.connect()
            self.assertFalse(connected)
            self.assertEqual(close_code, 4401)

        asyncio.run(exercise())

    def test_user_without_current_emergency_scope_is_rejected(self):
        unscoped = User.objects.create_user(
            username="synthetic-unscoped-socket", password="synthetic-test-password"
        )
        communicator = self.communicator_for(unscoped)

        async def exercise():
            connected, close_code = await communicator.connect()
            self.assertFalse(connected)
            self.assertEqual(close_code, 4403)

        asyncio.run(exercise())

    def test_urgencias_user_can_connect_to_its_receiver_scope(self):
        communicator = self.communicator_for(self.receiver_user)

        async def exercise():
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.disconnect()

        asyncio.run(exercise())

    def test_revoked_session_does_not_receive_events_on_existing_connection(self):
        communicator = self.communicator_for(self.operator)

        @database_sync_to_async
        def revoke_session():
            self.operator.session_version += 1
            self.operator.save(update_fields=("session_version",))

        async def exercise():
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            group = ambulance_group_name(self.ambulance.pk)
            await revoke_session()
            await get_channel_layer().group_send(
                group,
                {
                    "type": "emergency.event",
                    "audience_group": group,
                    "event_id": "00000000-0000-0000-0000-000000000001",
                    "event_type": "emergency.created",
                    "emergency_id": "00000000-0000-0000-0000-000000000002",
                    "version": 1,
                },
            )
            output = await communicator.receive_output(timeout=1)
            self.assertEqual(output["type"], "websocket.close")
            self.assertEqual(output["code"], 4401)

        asyncio.run(exercise())

    def test_reassigned_ambulance_does_not_receive_on_old_scope(self):
        communicator = self.communicator_for(self.operator)

        @database_sync_to_async
        def revoke_assignment():
            AmbulanceAssignment.objects.filter(user=self.operator, active=True).update(active=False)

        async def exercise():
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            group = ambulance_group_name(self.ambulance.pk)
            await revoke_assignment()
            await get_channel_layer().group_send(
                group,
                {
                    "type": "emergency.event",
                    "audience_group": group,
                    "event_id": "00000000-0000-0000-0000-000000000003",
                    "event_type": "emergency.created",
                    "emergency_id": "00000000-0000-0000-0000-000000000004",
                    "version": 1,
                },
            )
            output = await communicator.receive_output(timeout=1)
            self.assertEqual(output["type"], "websocket.close")
            self.assertEqual(output["code"], 4403)

        asyncio.run(exercise())

    def test_removed_receiver_membership_closes_existing_connection(self):
        communicator = self.communicator_for(self.receiver_user)

        @database_sync_to_async
        def remove_membership():
            self.receiver_user.institution_memberships.filter(institution=self.receiver).update(
                active=False
            )

        async def exercise():
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await remove_membership()
            group = institution_group_name(self.receiver.pk)
            await get_channel_layer().group_send(
                group,
                {
                    "type": "emergency.event",
                    "audience_group": group,
                    "event_id": "00000000-0000-0000-0000-000000000005",
                    "event_type": "emergency.created",
                    "emergency_id": "00000000-0000-0000-0000-000000000006",
                    "version": 1,
                },
            )
            output = await communicator.receive_output(timeout=1)
            self.assertEqual(output["type"], "websocket.close")
            self.assertEqual(output["code"], 4403)

        asyncio.run(exercise())

    def test_disabled_institution_closes_existing_receiver_connection(self):
        communicator = self.communicator_for(self.receiver_user)

        @database_sync_to_async
        def disable_institution():
            self.receiver.enabled = False
            self.receiver.save(update_fields=("enabled",))

        async def exercise():
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await disable_institution()
            group = institution_group_name(self.receiver.pk)
            await get_channel_layer().group_send(
                group,
                {
                    "type": "emergency.event",
                    "audience_group": group,
                    "event_id": "00000000-0000-0000-0000-000000000007",
                    "event_type": "emergency.created",
                    "emergency_id": "00000000-0000-0000-0000-000000000008",
                    "version": 1,
                },
            )
            output = await communicator.receive_output(timeout=1)
            self.assertEqual(output["type"], "websocket.close")
            self.assertEqual(output["code"], 4403)

        asyncio.run(exercise())
