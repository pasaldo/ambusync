import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.db import IntegrityError, close_old_connections, connections, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from emergencies import tests_updates
from emergencies.models import Emergency, ProcessedOperation
from institutions.models import Institution, InstitutionMembership


class EmergencyMilestoneTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(cls)
        cls.second_receiver = User.objects.create(username="synthetic-e-second", password="!")
        cls.second_receiver.groups.add(Group.objects.get(name="urgencias"))
        InstitutionMembership.objects.create(user=cls.second_receiver, institution=cls.institution)
        other = Institution.objects.create(name="Otro destino sintético E", kind="receiver")
        cls.foreign_receiver = User.objects.create(username="synthetic-e-foreign", password="!")
        cls.foreign_receiver.groups.add(Group.objects.get(name="urgencias"))
        InstitutionMembership.objects.create(user=cls.foreign_receiver, institution=other)
        cls.admin = User.objects.create(username="synthetic-e-admin", password="!")
        cls.admin.groups.add(Group.objects.get_or_create(name="institution_admin")[0])
        InstitutionMembership.objects.create(user=cls.admin, institution=cls.institution)
        cls.system = User.objects.create(username="synthetic-e-system", password="!")
        cls.system.groups.add(Group.objects.get_or_create(name="system_admin")[0])

    def body(self, version=1, **extra):
        return {"operation_id": str(uuid.uuid4()), "expected_version": version, **extra}

    def post(self, action, body=None, actor=None):
        client = APIClient()
        client.force_authenticate(actor or self.receiver)
        return client.post(
            f"/api/v1/emergencies/{self.episode.pk}/{action}/", body or self.body(), format="json"
        )

    def test_get_detail_and_list_never_confirm_reading(self):
        client = APIClient()
        client.force_authenticate(self.receiver)
        detail = client.get(f"/api/v1/emergencies/{self.episode.pk}/")
        listing = client.get("/api/v1/emergencies/")
        self.assertEqual(detail.status_code, 200)
        self.assertIsNone(detail.json().get("read_at"))
        self.assertIsNone(listing.json()["results"][0].get("prepared_at"))
        self.assertFalse(ProcessedOperation.objects.exists())
        self.assertFalse(AuditEvent.objects.exists())

    def test_explicit_read_records_first_actor_server_time_and_minimal_event(self):
        body = self.body()
        before = timezone.now()
        with patch("emergencies.views.publish_emergency_event") as publish:
            response = self.post("read", body)
        self.assertEqual(response.status_code, 200)
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.read_by, self.receiver)
        self.assertGreaterEqual(self.episode.read_at, before)
        self.assertLessEqual(self.episode.read_at, timezone.now())
        self.assertEqual(self.episode.status, "en_traslado")
        self.assertEqual(self.episode.version, 2)
        self.assertIsNone(self.episode.prepared_at)
        publish.assert_called_once_with(self.episode.pk, "emergency.read_confirmed", 2)
        audit = AuditEvent.objects.get(action="emergency.read_confirmed")
        self.assertEqual(audit.actor, self.receiver)
        self.assertEqual(audit.institution, self.institution)
        self.assertEqual(str(audit.correlation_id), body["operation_id"])

    def test_preparation_requires_read_then_records_its_own_first_actor(self):
        self.assertEqual(self.post("prepare").status_code, 409)
        self.assertFalse(ProcessedOperation.objects.exists())
        self.assertEqual(self.post("read").status_code, 200)
        response = self.post("prepare", self.body(2), self.second_receiver)
        self.assertEqual(response.status_code, 200)
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.read_by, self.receiver)
        self.assertEqual(self.episode.prepared_by, self.second_receiver)
        self.assertGreaterEqual(self.episode.prepared_at, self.episode.read_at)
        self.assertEqual(self.episode.status, "en_traslado")
        self.assertEqual(self.episode.version, 3)
        self.assertEqual(
            AuditEvent.objects.filter(action="emergency.preparation_recorded").count(), 1
        )

    def test_another_reader_with_current_version_is_noop_and_uuid_is_reserved(self):
        self.assertEqual(self.post("read").status_code, 200)
        self.episode.refresh_from_db()
        first = self.episode.read_at
        body = self.body(2)
        with patch("emergencies.views.publish_emergency_event") as publish:
            response = self.post("read", body, self.second_receiver)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Milestone-Already-Recorded"], "true")
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.read_by, self.receiver)
        self.assertEqual(self.episode.read_at, first)
        self.assertEqual(self.episode.version, 2)
        self.assertEqual(AuditEvent.objects.count(), 1)
        self.assertEqual(ProcessedOperation.objects.count(), 2)
        publish.assert_not_called()
        self.assertEqual(self.post("prepare", body, self.second_receiver).status_code, 409)
        replay = self.post("read", body, self.second_receiver)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay["Idempotent-Replay"], "true")

    def test_preparation_noop_preserves_first_actor_and_time(self):
        self.post("read")
        self.post("prepare", self.body(2))
        self.episode.refresh_from_db()
        first = self.episode.prepared_at
        response = self.post("prepare", self.body(3), self.second_receiver)
        self.assertEqual(response.status_code, 200)
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.prepared_by, self.receiver)
        self.assertEqual(self.episode.prepared_at, first)
        self.assertEqual(self.episode.version, 3)
        self.assertEqual(AuditEvent.objects.count(), 2)

    def test_new_operation_with_stale_version_is_conflict_even_if_already_read(self):
        self.assertEqual(self.post("read").status_code, 200)
        self.assertEqual(self.post("read", self.body(), self.second_receiver).status_code, 409)
        self.assertEqual(self.post("prepare", self.body()).status_code, 409)

    def test_replay_after_arrival_preserves_milestone_and_requires_current_scope(self):
        body = self.body()
        self.assertEqual(self.post("read", body).status_code, 200)
        self.assertEqual(self.post("arrival", self.body(2)).status_code, 200)
        replay = self.post("read", body)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay["Idempotent-Replay"], "true")
        self.assertEqual(replay.json()["status"], "llegado")
        self.assertEqual(AuditEvent.objects.filter(action="emergency.read_confirmed").count(), 1)
        InstitutionMembership.objects.filter(user=self.receiver).update(active=False)
        self.assertEqual(self.post("read", body).status_code, 404)

    def test_new_milestones_rejected_after_arrival_cancellation_or_closure(self):
        for status in ("llegado", "cancelada", "cerrada"):
            self.episode.status = status
            self.episode.save(update_fields=["status"])
            for action in ("read", "prepare"):
                with self.subTest(status=status, action=action):
                    self.assertEqual(self.post(action).status_code, 409)
        self.episode.refresh_from_db()
        self.assertIsNone(self.episode.read_at)
        self.assertIsNone(self.episode.prepared_at)

    def test_arrival_does_not_require_or_invent_milestones(self):
        self.episode.status = "notificada"
        self.episode.save(update_fields=["status"])
        response = self.post("arrival", self.body(reason="Llegada sintética excepcional"))
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["read_at"])
        self.assertIsNone(response.json()["prepared_at"])

    def test_notified_episode_can_be_read_and_prepared_without_starting_transfer(self):
        self.episode.status = "notificada"
        self.episode.save(update_fields=["status"])
        self.assertEqual(self.post("read").status_code, 200)
        self.assertEqual(self.post("prepare", self.body(2)).status_code, 200)
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.status, "notificada")
        self.assertIsNone(self.episode.transfer_declared_at)

    def test_role_and_destination_scope_checked_for_each_action(self):
        for action in ("read", "prepare"):
            for actor in (self.operator, self.admin, self.system):
                with self.subTest(action=action, role=actor.username):
                    self.assertEqual(self.post(action, actor=actor).status_code, 403)
            self.assertEqual(self.post(action, actor=self.foreign_receiver).status_code, 404)

    def test_invalid_or_spoofed_fields_rejected_and_session_csrf_required(self):
        for action in ("read", "prepare"):
            for extra in (
                {"read_by_id": str(self.receiver.pk)},
                {"read_at": timezone.now().isoformat()},
                {"expected_version": 0},
            ):
                with self.subTest(action=action, extra=extra):
                    self.assertEqual(self.post(action, self.body(**extra)).status_code, 400)
            client = APIClient(enforce_csrf_checks=True)
            client.force_login(self.receiver)
            self.assertEqual(
                client.post(
                    f"/api/v1/emergencies/{self.episode.pk}/{action}/", self.body(), format="json"
                ).status_code,
                403,
            )

    def test_updates_do_not_clear_or_reattribute_first_read_or_preparation(self):
        self.post("read")
        self.post("prepare", self.body(2))
        self.episode.refresh_from_db()
        original = (
            self.episode.read_at,
            self.episode.prepared_at,
            self.episode.read_by_id,
            self.episode.prepared_by_id,
        )
        self.assertEqual(
            self.post(
                "update",
                self.body(3, notes="Nueva nota sintética posterior a lectura"),
                self.backup,
            ).status_code,
            200,
        )
        self.episode.refresh_from_db()
        self.assertEqual(
            (
                self.episode.read_at,
                self.episode.prepared_at,
                self.episode.read_by_id,
                self.episode.prepared_by_id,
            ),
            original,
        )

    def test_database_prevents_partial_actor_time_or_preparation_without_read(self):
        for values in (
            {"read_at": timezone.now()},
            {"read_by": self.receiver},
            {"prepared_at": timezone.now(), "prepared_by": self.receiver},
        ):
            with (
                self.subTest(values=values),
                self.assertRaises(IntegrityError),
                transaction.atomic(),
            ):
                Emergency.objects.filter(pk=self.episode.pk).update(**values)


class EmergencyMilestoneConcurrencyTests(TransactionTestCase):
    post = EmergencyMilestoneTests.post
    body = EmergencyMilestoneTests.body

    def setUp(self):
        EmergencyMilestoneTests.setUpTestData.__func__(type(self))

    def race(self, actions, version=1):
        barrier = Barrier(2)

        def worker(actor, action):
            close_old_connections()
            try:
                with connections["default"].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                barrier.wait(timeout=10)
                return self.post(
                    action, self.body(version), User.objects.get(pk=actor.pk)
                ).status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            jobs = [pool.submit(worker, *action) for action in actions]
            return [job.result(timeout=20) for job in jobs]

    def test_simultaneous_readers_keep_single_first_reader(self):
        results = self.race([(self.receiver, "read"), (self.second_receiver, "read")])
        self.assertEqual(sorted(results), [200, 409])
        self.episode.refresh_from_db()
        self.assertEqual(
            self.episode.read_by, self.receiver if results[0] == 200 else self.second_receiver
        )
        self.assertEqual(self.episode.version, 2)
        self.assertEqual(AuditEvent.objects.count(), 1)

    def test_simultaneous_preparers_keep_single_first_author(self):
        self.assertEqual(self.post("read").status_code, 200)
        results = self.race([(self.receiver, "prepare"), (self.second_receiver, "prepare")], 2)
        self.assertEqual(sorted(results), [200, 409])
        self.episode.refresh_from_db()
        self.assertEqual(
            self.episode.prepared_by, self.receiver if results[0] == 200 else self.second_receiver
        )
        self.assertEqual(self.episode.version, 3)

    def test_read_racing_arrival_does_not_create_retrospective_read(self):
        results = self.race([(self.receiver, "read"), (self.second_receiver, "arrival")])
        self.assertEqual(sorted(results), [200, 409])
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.read_at is None, results[1] == 200)

    def test_preparation_racing_arrival_does_not_create_retrospective_preparation(self):
        self.post("read")
        results = self.race([(self.receiver, "prepare"), (self.second_receiver, "arrival")], 2)
        self.assertEqual(sorted(results), [200, 409])
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.prepared_at is None, results[1] == 200)
