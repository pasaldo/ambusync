import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import StringIO
from threading import Barrier, Event
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core.management import call_command
from django.db import close_old_connections, connections, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent, PilotClosure
from emergencies import tests_updates
from emergencies.models import Emergency, ProcessedOperation, VitalMeasurement
from institutions.models import Ambulance, AmbulanceAssignment, Institution, InstitutionMembership


class DestinationChangeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(cls)
        cls.destination = Institution.objects.create(name="Destino sintético F", kind="receiver")
        cls.new_receiver = User.objects.create(username="synthetic-f-receiver", password="!")
        cls.new_receiver.groups.add(Group.objects.get(name="urgencias"))
        InstitutionMembership.objects.create(user=cls.new_receiver, institution=cls.destination)

    def body(self, **extra):
        return {
            "operation_id": str(uuid.uuid4()),
            "expected_version": 1,
            "destination_id": str(self.destination.pk),
            "reason": "Cambio sintético de destino",
            **extra,
        }

    def post(self, body=None, actor=None, episode=None, action="change-destination"):
        client = APIClient()
        client.force_authenticate(actor or self.operator)
        return client.post(
            f"/api/v1/emergencies/{(episode or self.episode).pk}/{action}/",
            body or self.body(),
            format="json",
        )

    def test_atomic_pair_preserves_patient_background_and_original_transfer_declaration(self):
        declared = timezone.now() - timedelta(minutes=20)
        self.episode.transfer_declared_at = declared
        self.episode.transfer_declared_by = self.operator
        self.episode.triage = "C2"
        self.episode.triage_recorded_at = declared
        self.episode.triage_recorded_by = self.operator
        self.episode.read_at = declared
        self.episode.read_by = self.receiver
        self.episode.prepared_at = declared
        self.episode.prepared_by = self.receiver
        self.episode.save()
        before = timezone.now()
        body = self.body()
        with (
            patch("emergencies.views.publish_emergency_event") as old_event,
            patch("emergencies.destination_change.publish_emergency_event") as new_event,
        ):
            response = self.post(body, actor=self.backup)
        self.assertEqual(response.status_code, 200)
        old, new = response.json()["original"], response.json()["replacement"]
        replacement = Emergency.objects.get(pk=new["id"])
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.status, "cancelada")
        self.assertEqual(self.episode.cancelled_by, self.backup)
        self.assertGreaterEqual(self.episode.cancelled_at, before)
        self.assertEqual(self.episode.version, 2)
        self.assertEqual(self.episode.cancellation_reason, body["reason"])
        self.assertEqual(replacement.replaces, self.episode)
        self.assertEqual(old["replaced_by_id"], new["id"])
        self.assertEqual(new["replaces_id"], old["id"])
        self.assertEqual(new["patient"], old["patient"])
        self.assertEqual(replacement.reason, self.episode.reason)
        self.assertEqual(replacement.notes, self.episode.notes)
        self.assertEqual(replacement.created_by, self.backup)
        self.assertGreaterEqual(replacement.created_at, before)
        self.assertEqual(replacement.status, "en_traslado")
        self.assertEqual(replacement.version, 1)
        self.assertEqual(replacement.transfer_declared_at, declared)
        self.assertEqual(replacement.transfer_declared_by, self.operator)
        self.assertEqual(replacement.triage_recorded_by, self.operator)
        self.assertEqual(replacement.triage_recorded_at, declared)
        self.assertEqual(replacement.ambulance_id, self.unit.pk)
        self.assertEqual(replacement.operating_institution_id, self.institution.pk)
        for field in (
            "read_at",
            "read_by_id",
            "prepared_at",
            "prepared_by_id",
            "arrived_at",
            "cancelled_at",
            "closed_at",
        ):
            self.assertIsNone(new[field])
        self.assertEqual(old["read_by_id"], str(self.receiver.pk))
        self.assertEqual(
            set(AuditEvent.objects.values_list("action", flat=True)),
            {"emergency.destination_changed", "emergency.cancelled", "emergency.created"},
        )
        self.assertEqual(AuditEvent.objects.filter(correlation_id=body["operation_id"]).count(), 3)
        old_event.assert_called_once_with(self.episode.pk, "emergency.destination_changed", 2)
        new_event.assert_called_once_with(replacement.pk, "emergency.created", 1)

    def test_notified_replacement_does_not_invent_departure_or_triage_provenance(self):
        self.episode.status = "notificada"
        self.episode.triage = "C2"
        self.episode.save()
        response = self.post()
        self.assertEqual(response.status_code, 200)
        new = response.json()["replacement"]
        self.assertEqual(new["status"], "notificada")
        self.assertIsNone(new["transfer_declared_at"])
        self.assertIsNone(new["triage_recorded_at"])

    def test_inherits_only_measurement_leaves_with_original_provenance_not_new_captures(self):
        correction = VitalMeasurement.objects.create(
            emergency=self.episode,
            recorded_by=self.backup,
            kind="heart_rate",
            value=75,
            unit="lpm",
            measured_at=self.measurement.measured_at,
            rectifies=self.measurement,
            rectification_reason="Corrección sintética",
        )
        independent = VitalMeasurement.objects.create(
            emergency=self.episode,
            recorded_by=self.operator,
            kind="heart_rate",
            value=90,
            unit="lpm",
            measured_at=timezone.now(),
        )
        response = self.post()
        self.assertEqual(response.status_code, 200)
        new_id = response.json()["replacement"]["id"]
        inherited = list(Emergency.objects.get(pk=new_id).vital_measurements.order_by("value"))
        self.assertEqual([item.value for item in inherited], [75, 90])
        self.assertEqual(self.episode.vital_measurements.count(), 3)
        for copy, source in zip(inherited, [correction, independent], strict=True):
            self.assertNotEqual(copy.pk, source.pk)
            self.assertEqual(copy.measured_at, source.measured_at)
            self.assertEqual(copy.recorded_at, source.recorded_at)
            self.assertEqual(copy.recorded_by, source.recorded_by)
            self.assertIsNone(copy.rectifies_id)
            self.assertIsNone(copy.operation_id)
            self.assertIsNotNone(copy.inherited_at)
        data = response.json()["replacement"]["vital_measurements"]
        self.assertTrue(all(item["inherited_at"] for item in data))

    def test_receivers_are_isolated_even_through_links(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        new_id = response.json()["replacement"]["id"]
        for actor, own, foreign in (
            (self.receiver, str(self.episode.pk), new_id),
            (self.new_receiver, new_id, str(self.episode.pk)),
        ):
            client = APIClient()
            client.force_authenticate(actor)
            own_response = client.get(f"/api/v1/emergencies/{own}/")
            self.assertEqual(own_response.status_code, 200)
            self.assertEqual(client.get(f"/api/v1/emergencies/{foreign}/").status_code, 404)
            ids = [item["id"] for item in client.get("/api/v1/emergencies/").json()["results"]]
            self.assertEqual(ids, [own])
            self.assertNotIn("replacement", own_response.json())
            self.assertNotIn("original", own_response.json())

    def test_replay_resolves_after_replacement_arrival_and_destination_disabled(self):
        body = self.body()
        response = self.post(body)
        self.assertEqual(response.status_code, 200)
        replacement = Emergency.objects.get(pk=response.json()["replacement"]["id"])
        arrived = self.post(
            {"operation_id": str(uuid.uuid4()), "expected_version": 1},
            self.new_receiver,
            replacement,
            "arrival",
        )
        self.assertEqual(arrived.status_code, 200)
        self.destination.enabled = False
        self.destination.save()
        replay = self.post(body)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay["Idempotent-Replay"], "true")
        self.assertEqual(replay.json()["replacement"]["status"], "llegado")
        self.assertEqual(Emergency.objects.count(), 2)
        self.assertEqual(AuditEvent.objects.count(), 4)
        AmbulanceAssignment.objects.filter(user=self.operator).update(active=False)
        self.assertEqual(self.post(body).status_code, 404)

    def test_chain_and_replay_keep_immediate_replacement_not_latest_descendant(self):
        body = self.body()
        first = self.post(body)
        self.assertEqual(first.status_code, 200)
        replacement = Emergency.objects.get(pk=first.json()["replacement"]["id"])
        next_response = self.post(
            self.body(destination_id=str(self.institution.pk)), episode=replacement
        )
        self.assertEqual(next_response.status_code, 200)
        replay = self.post(body)
        self.assertEqual(replay.json()["replacement"]["id"], str(replacement.pk))
        self.assertEqual(replay.json()["replacement"]["status"], "cancelada")
        self.assertEqual(Emergency.objects.count(), 3)
        self.assertEqual(
            next_response.json()["replacement"]["vital_measurements"][0]["recorded_at"],
            self.measurement.recorded_at.isoformat(),
        )

    def test_roles_scope_unknown_fields_and_csrf(self):
        for actor, expected in (
            (self.receiver, 403),
            (self.new_receiver, 403),
            (self.outsider, 404),
        ):
            self.assertEqual(self.post(actor=actor).status_code, expected)
        for extra in ({"status": "en_traslado"}, {"read_by_id": str(self.receiver.pk)}):
            self.assertEqual(self.post(self.body(**extra)).status_code, 400)
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.operator)
        self.assertEqual(
            client.post(
                f"/api/v1/emergencies/{self.episode.pk}/change-destination/",
                self.body(),
                format="json",
            ).status_code,
            403,
        )

    def test_invalid_destination_reason_stale_version_and_terminal_states_do_not_cancel(self):
        for extra, expected in (
            ({"destination_id": str(self.institution.pk)}, 400),
            ({"destination_id": str(uuid.uuid4())}, 400),
            ({"reason": " "}, 400),
            ({"expected_version": 2}, 409),
        ):
            self.assertEqual(self.post(self.body(**extra)).status_code, expected)
        self.destination.enabled = False
        self.destination.save()
        self.assertEqual(self.post().status_code, 400)
        self.destination.enabled = True
        self.destination.kind = "operator"
        self.destination.save()
        self.assertEqual(self.post().status_code, 400)
        self.destination.kind = "receiver"
        self.destination.save()
        for terminal in ("llegado", "cerrada", "cancelada"):
            self.episode.status = terminal
            self.episode.save()
            self.assertEqual(self.post().status_code, 409)
        self.assertEqual(Emergency.objects.count(), 1)
        self.assertFalse(ProcessedOperation.objects.exists())

    def test_uuid_reuse_and_new_operation_on_cancelled_original_rejected(self):
        body = self.body()
        self.assertEqual(self.post(body).status_code, 200)
        self.assertEqual(self.post({**body, "reason": "Otro motivo sintético"}).status_code, 409)
        self.assertEqual(
            self.post(
                {
                    "operation_id": body["operation_id"],
                    "expected_version": 1,
                    "reason": body["reason"],
                },
                action="cancel",
            ).status_code,
            409,
        )
        self.assertEqual(self.post(self.body(expected_version=2)).status_code, 409)
        self.assertEqual(Emergency.objects.count(), 2)

    def test_failure_rolls_back_pair_operations_audit_and_commit_callbacks(self):
        with (
            self.captureOnCommitCallbacks(execute=True) as callbacks,
            patch(
                "emergencies.views.ProcessedOperation.objects.create",
                side_effect=RuntimeError("Synthetic transaction failure"),
            ),
            self.assertRaises(RuntimeError),
        ):
            self.post()
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.status, "en_traslado")
        self.assertEqual(self.episode.version, 1)
        self.assertEqual(Emergency.objects.count(), 1)
        self.assertFalse(ProcessedOperation.objects.exists())
        self.assertFalse(AuditEvent.objects.exists())
        self.assertEqual(callbacks, [])

    def test_retention_purges_replacement_chain_without_losing_audit_early(self):
        self.assertEqual(self.post().status_code, 200)
        closure = timezone.now() - timedelta(days=91)
        PilotClosure.objects.create(closed_at=closure, executor="synthetic-test-only")
        output = StringIO()
        call_command("apply_retention", apply=True, stdout=output)
        self.assertFalse(Emergency.objects.exists())
        self.assertFalse(VitalMeasurement.objects.exists())
        self.assertFalse(ProcessedOperation.objects.exists())
        self.assertTrue(AuditEvent.objects.exists())


class DestinationChangeConcurrencyTests(TransactionTestCase):
    post = DestinationChangeTests.post
    body = DestinationChangeTests.body

    def setUp(self):
        DestinationChangeTests.setUpTestData.__func__(type(self))

    def race(self, second_action, actor):
        barrier = Barrier(2)

        def worker(user, action):
            close_old_connections()
            try:
                with connections["default"].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                barrier.wait(timeout=10)
                body = (
                    self.body()
                    if action == "change-destination"
                    else {"operation_id": str(uuid.uuid4()), "expected_version": 1}
                )
                if action == "update":
                    body["notes"] = "Nota concurrente sintética"
                return self.post(body, User.objects.get(pk=user.pk), action=action).status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            jobs = [
                pool.submit(worker, self.operator, "change-destination"),
                pool.submit(worker, actor, second_action),
            ]
            return [job.result(timeout=20) for job in jobs]

    def test_simultaneous_changes_create_one_replacement(self):
        self.assertEqual(sorted(self.race("change-destination", self.backup)), [200, 409])
        self.assertEqual(Emergency.objects.count(), 2)

    def test_arrival_race_has_one_winner_no_replacement_if_arrival_wins(self):
        results = self.race("arrival", self.receiver)
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(Emergency.objects.count(), 2 if results[0] == 200 else 1)
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.status, "cancelada" if results[0] == 200 else "llegado")

    def test_update_race_does_not_copy_uncommitted_or_overwrite_newer_background(self):
        results = self.race("update", self.backup)
        self.assertEqual(sorted(results), [200, 409])
        if results[0] == 200:
            self.assertEqual(
                Emergency.objects.exclude(pk=self.episode.pk).get().notes, "Nota original"
            )

    def test_inherited_author_withdrawal_does_not_deadlock_or_remove_current_operator(self):
        from emergencies.destination_change import EmergencyDestinationChangeView
        from institutions import unit_management

        self.measurement.recorded_by = self.backup
        self.measurement.save(update_fields=["recorded_by"])
        admin = User.objects.create(username="synthetic-f-admin", password="!")
        admin.groups.add(
            *[
                Group.objects.get_or_create(name=name)[0]
                for name in ("urgencias", "institution_admin")
            ]
        )
        InstitutionMembership.objects.create(user=admin, institution=self.institution)
        author_locked, change_locked = Event(), Event()
        original_lock = unit_management.lock_management_users
        original_apply = EmergencyDestinationChangeView.apply_transition

        def lock_author(*args, **kwargs):
            result = original_lock(*args, **kwargs)
            author_locked.set()
            if not change_locked.wait(10):
                raise AssertionError("change did not lock its unit")
            return result

        def apply(view, *args, **kwargs):
            change_locked.set()
            return original_apply(view, *args, **kwargs)

        def withdraw():
            close_old_connections()
            try:
                with connections["default"].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                client = APIClient()
                client.force_authenticate(admin)
                return client.post(
                    f"/api/v1/institutions/management/accounts/{self.backup.pk}/assignment/",
                    {"ambulance_id": None, "expected_ambulance_id": str(self.unit.pk)},
                    format="json",
                ).status_code
            finally:
                connections.close_all()

        def change():
            close_old_connections()
            try:
                if not author_locked.wait(10):
                    raise AssertionError("withdrawal did not lock author")
                with connections["default"].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                return self.post().status_code
            finally:
                connections.close_all()

        with (
            patch.object(unit_management, "lock_management_users", side_effect=lock_author),
            patch.object(EmergencyDestinationChangeView, "apply_transition", apply),
            ThreadPoolExecutor(max_workers=2) as pool,
        ):
            removal = pool.submit(withdraw)
            replacement = pool.submit(change)
            self.assertEqual(replacement.result(timeout=20), 200)
            self.assertEqual(removal.result(timeout=20), 204)
        self.assertTrue(
            AmbulanceAssignment.objects.filter(user=self.operator, active=True).exists()
        )
        self.assertFalse(AmbulanceAssignment.objects.filter(user=self.backup, active=True).exists())

    def test_crossed_operator_destinations_do_not_deadlock_on_institution_foreign_keys(self):
        self.destination.kind = "combined"
        self.destination.save()
        unit_b = Ambulance.objects.create(institution=self.destination, code="SYN-F-CROSS")
        operator_b = User.objects.create(username="synthetic-f-cross", password="!")
        operator_b.groups.add(Group.objects.get(name="ambulance"))
        InstitutionMembership.objects.create(user=operator_b, institution=self.destination)
        AmbulanceAssignment.objects.create(user=operator_b, ambulance=unit_b)
        episode_b = Emergency.objects.create(
            operating_institution=self.destination,
            destination=self.destination,
            ambulance=unit_b,
            created_by=operator_b,
            status="en_traslado",
            patient_identity_unknown=True,
            reason="Episodio sintético cruzado",
        )
        barrier = Barrier(2)
        original_create = Emergency.objects.create

        def create_after_both_destination_locks(**kwargs):
            if "replaces" in kwargs:
                barrier.wait(timeout=10)
            return original_create(**kwargs)

        def worker(user, episode, destination_id):
            close_old_connections()
            try:
                with connections["default"].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                return self.post(
                    self.body(destination_id=str(destination_id)), user, episode
                ).status_code
            finally:
                connections.close_all()

        with (
            patch(
                "emergencies.destination_change.Emergency.objects.create",
                side_effect=create_after_both_destination_locks,
            ),
            ThreadPoolExecutor(max_workers=2) as pool,
        ):
            first = pool.submit(worker, self.operator, self.episode, self.destination.pk)
            second = pool.submit(worker, operator_b, episode_b, self.institution.pk)
            self.assertEqual(first.result(timeout=20), 200)
            self.assertEqual(second.result(timeout=20), 200)
        self.assertEqual(Emergency.objects.count(), 4)

    def test_destination_disabled_before_lock_is_revalidated_without_partial_change(self):
        disabled, requested = Event(), Event()
        original_lock = Institution.objects.select_for_update

        def destination_lock(*args, **kwargs):
            requested.set()
            return original_lock(*args, **kwargs)

        def disable():
            close_old_connections()
            try:
                with transaction.atomic():
                    institution = original_lock().get(pk=self.destination.pk)
                    institution.enabled = False
                    institution.save(update_fields=["enabled"])
                    disabled.set()
                    if not requested.wait(10):
                        raise AssertionError("change did not request destination lock")
            finally:
                connections.close_all()

        def change():
            close_old_connections()
            try:
                if not disabled.wait(10):
                    raise AssertionError("disable did not lock destination")
                return self.post().status_code
            finally:
                connections.close_all()

        with (
            patch(
                "emergencies.destination_change.Institution.objects.select_for_update",
                side_effect=destination_lock,
            ),
            ThreadPoolExecutor(max_workers=2) as pool,
        ):
            deactivation = pool.submit(disable)
            change_result = pool.submit(change)
            self.assertEqual(change_result.result(timeout=20), 400)
            deactivation.result(timeout=20)
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.status, "en_traslado")
        self.assertEqual(Emergency.objects.count(), 1)
        self.assertFalse(ProcessedOperation.objects.exists())

    def test_initiator_withdrawal_racing_change_keeps_only_authorized_outcome(self):
        admin = User.objects.create(username="synthetic-f-departure-admin", password="!")
        admin.groups.add(
            *[
                Group.objects.get_or_create(name=name)[0]
                for name in ("urgencias", "institution_admin")
            ]
        )
        InstitutionMembership.objects.create(user=admin, institution=self.institution)
        barrier = Barrier(2)

        def worker(removal):
            close_old_connections()
            try:
                with connections["default"].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                barrier.wait(timeout=10)
                if not removal:
                    return self.post().status_code
                client = APIClient()
                client.force_authenticate(admin)
                return client.post(
                    f"/api/v1/institutions/management/accounts/{self.operator.pk}/assignment/",
                    {"ambulance_id": None, "expected_ambulance_id": str(self.unit.pk)},
                    format="json",
                ).status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            change_result, removal = pool.submit(worker, False), pool.submit(worker, True)
            result = change_result.result(timeout=20)
            self.assertIn(result, (200, 404))
            self.assertEqual(removal.result(timeout=20), 204)
        self.assertEqual(Emergency.objects.count(), 2 if result == 200 else 1)
        self.assertFalse(
            AmbulanceAssignment.objects.filter(user=self.operator, active=True).exists()
        )
