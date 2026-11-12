import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, timedelta
from io import StringIO
from threading import Barrier

from django.contrib.auth.models import Group
from django.core.management import call_command
from django.db import close_old_connections, connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from emergencies.models import Emergency, ProcessedOperation, VitalMeasurement
from institutions.models import Ambulance, AmbulanceAssignment, Institution, InstitutionMembership


class EpisodeUpdateTests(TestCase):
    def test_unchanged_triage_preserves_author_and_timestamp_when_other_operator_saves_notes(self):
        recorded_at = timezone.datetime(2026, 11, 12, 12, tzinfo=UTC)
        self.episode.triage = "C2"
        self.episode.triage_recorded_at = recorded_at
        self.episode.triage_recorded_by = self.operator
        self.episode.save(update_fields=["triage", "triage_recorded_at", "triage_recorded_by"])
        response = self.post(
            "update",
            self.body(notes="Nota sintética de otro operador", triage="C2"),
            actor=self.backup,
        )
        self.assertEqual(response.status_code, 200)
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.triage_recorded_by, self.operator)
        self.assertEqual(self.episode.triage_recorded_at, recorded_at)
        self.assertFalse(AuditEvent.objects.filter(action="emergency.triage_changed").exists())

    def test_unchanged_legacy_triage_does_not_invent_provenance(self):
        self.episode.triage = "C2"
        self.episode.save(update_fields=["triage"])
        response = self.post(
            "update", self.body(notes="Nota sintética nueva", triage="C2"), actor=self.backup
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["triage_recorded_by_id"])
        self.assertIsNone(response.json()["triage_recorded_at"])
        self.assertFalse(AuditEvent.objects.filter(action="emergency.triage_changed").exists())

    @classmethod
    def setUpTestData(cls):
        cls.institution = Institution.objects.create(
            name="Actualizaciones sintéticas", kind="combined"
        )
        cls.unit = Ambulance.objects.create(institution=cls.institution, code="SYN-D-A")
        cls.other_unit = Ambulance.objects.create(institution=cls.institution, code="SYN-D-B")
        for attr, name, group, unit in (
            ("operator", "synthetic-d-operator", "ambulance", cls.unit),
            ("backup", "synthetic-d-backup", "ambulance", cls.unit),
            ("outsider", "synthetic-d-other", "ambulance", cls.other_unit),
            ("receiver", "synthetic-d-receiver", "urgencias", None),
        ):
            user = User.objects.create(username=name, password="!")
            user.groups.add(Group.objects.get_or_create(name=group)[0])
            InstitutionMembership.objects.create(user=user, institution=cls.institution)
            if unit:
                AmbulanceAssignment.objects.create(user=user, ambulance=unit)
            setattr(cls, attr, user)
        cls.episode = Emergency.objects.create(
            operating_institution=cls.institution,
            destination=cls.institution,
            ambulance=cls.unit,
            created_by=cls.operator,
            status="en_traslado",
            patient_identity_unknown=True,
            reason="Caso sintético original",
            notes="Nota original",
        )
        cls.measurement = VitalMeasurement.objects.create(
            emergency=cls.episode,
            recorded_by=cls.operator,
            kind="heart_rate",
            value=70,
            unit="lpm",
            measured_at=timezone.now(),
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.operator)

    def body(self, **extra):
        return {"operation_id": str(uuid.uuid4()), "expected_version": 1, **extra}

    def post(self, action, body, *, actor=None):
        if actor:
            self.client.force_authenticate(actor)
        return self.client.post(
            f"/api/v1/emergencies/{self.episode.pk}/{action}/", body, format="json"
        )

    def correction(self, **extra):
        return self.body(
            measurement_id=str(self.measurement.pk),
            value=80,
            unit="lpm",
            measured_at=self.measurement.measured_at.isoformat(),
            reason="Error sintético de digitación",
            **extra,
        )

    def test_any_assigned_operator_updates_background_and_triage_with_audit(self):
        response = self.post(
            "update",
            self.body(
                reason="Motivo sintético actualizado",
                notes="Antecedentes nuevos",
                symptoms=["Disnea"],
                triage="C2",
            ),
            actor=self.backup,
        )
        self.assertEqual(response.status_code, 200)
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.version, 2)
        self.assertEqual(self.episode.created_by, self.operator)
        self.assertEqual(self.episode.triage_recorded_by, self.backup)
        self.assertIsNotNone(self.episode.triage_recorded_at)
        self.assertEqual(response.json()["triage_recorded_by_id"], str(self.backup.pk))
        self.assertTrue(
            AuditEvent.objects.filter(actor=self.backup, action="emergency.triage_changed").exists()
        )
        self.assertTrue(AuditEvent.objects.filter(action="emergency.updated").exists())

    def test_omission_preserves_fields_and_explicit_triage_null_clears_without_inference(self):
        self.episode.triage = "C1"
        self.episode.save(update_fields=["triage"])
        response = self.post("update", self.body(notes="", triage=None))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reason"], "Caso sintético original")
        self.assertIsNone(response.json()["triage"])
        self.assertEqual(response.json()["notes"], "")

    def test_update_validation_rejects_unknown_empty_duplicate_and_control_text(self):
        for extra in (
            {},
            {"destination_id": str(self.institution.pk)},
            {"triage": "C0"},
            {"reason": " "},
            {"notes": "bad\x00text"},
            {"symptoms": ["Disnea", "disnea"]},
        ):
            with self.subTest(extra=extra):
                self.assertEqual(self.post("update", self.body(**extra)).status_code, 400)
        self.assertFalse(ProcessedOperation.objects.exists())

    def test_append_series_preserves_original_and_capture_author_operation(self):
        captured = "2026-11-12T10:00:00Z"
        body = self.body(vitals={"hr": 90, "bp_sys": 0, "taken_at": captured})
        response = self.post("measurements", body)
        self.assertEqual(response.status_code, 200)
        self.measurement.refresh_from_db()
        self.assertEqual(self.measurement.value, 70)
        self.assertEqual(VitalMeasurement.objects.filter(emergency=self.episode).count(), 3)
        new = VitalMeasurement.objects.get(emergency=self.episode, value=90)
        self.assertEqual(new.operation_id, uuid.UUID(body["operation_id"]))
        self.assertEqual(new.recorded_by, self.operator)
        self.assertEqual(new.measured_at.isoformat(), "2026-11-12T10:00:00+00:00")
        self.assertTrue(
            all(
                "id" in item and "is_current" in item
                for item in response.json()["vital_measurements"]
            )
        )

    def test_append_requires_actual_measurement_and_valid_values(self):
        for vitals in (
            {},
            {"hr": None},
            {"hr": 80},
            {"hr": -1, "taken_at": "2026-11-12T10:00:00Z"},
            {"spo2": 101, "taken_at": "2026-11-12T10:00:00Z"},
            {"hr": 3.5, "taken_at": "2026-11-12T10:00:00Z"},
        ):
            with self.subTest(vitals=vitals):
                self.assertEqual(
                    self.post("measurements", self.body(vitals=vitals)).status_code, 400
                )

    def test_rectification_creates_linked_replacement_without_changing_original(self):
        response = self.post("measurements/rectify", self.correction())
        self.assertEqual(response.status_code, 200)
        self.measurement.refresh_from_db()
        self.assertEqual(self.measurement.value, 70)
        replacement = VitalMeasurement.objects.get(rectifies=self.measurement)
        self.assertEqual(replacement.value, 80)
        self.assertEqual(replacement.rectification_reason, "Error sintético de digitación")
        values = {item["id"]: item for item in response.json()["vital_measurements"]}
        self.assertFalse(values[str(self.measurement.pk)]["is_current"])
        self.assertEqual(values[str(self.measurement.pk)]["rectified_by_id"], str(replacement.pk))
        self.assertTrue(values[str(replacement.pk)]["is_current"])
        self.assertTrue(
            AuditEvent.objects.filter(action="emergency.measurement_rectified").exists()
        )

    def test_rectification_chain_rejects_reusing_original_but_accepts_leaf(self):
        self.assertEqual(self.post("measurements/rectify", self.correction()).status_code, 200)
        replacement = VitalMeasurement.objects.get(rectifies=self.measurement)
        body = self.correction()
        body["expected_version"] = 2
        self.assertEqual(self.post("measurements/rectify", body).status_code, 409)
        body["measurement_id"] = str(replacement.pk)
        self.assertEqual(self.post("measurements/rectify", body).status_code, 200)
        self.assertEqual(VitalMeasurement.objects.count(), 3)

    def test_rectification_rejects_other_episode_wrong_unit_bad_value_and_empty_reason(self):
        foreign = Emergency.objects.create(
            operating_institution=self.institution,
            destination=self.institution,
            ambulance=self.other_unit,
            created_by=self.outsider,
            status="en_traslado",
            patient_identity_unknown=True,
            reason="Otro caso sintético",
        )
        other = VitalMeasurement.objects.create(
            emergency=foreign,
            kind="heart_rate",
            value=60,
            unit="lpm",
            recorded_by=self.outsider,
            measured_at=timezone.now(),
        )
        for patch, status in (
            ({"measurement_id": str(other.pk)}, 404),
            ({"unit": "mmHg"}, 400),
            ({"value": 2.3}, 400),
            ({"value": -1}, 400),
            ({"reason": " "}, 400),
        ):
            with self.subTest(patch=patch):
                self.assertEqual(
                    self.post("measurements/rectify", {**self.correction(), **patch}).status_code,
                    status,
                )

    def test_new_writes_stop_on_arrival_and_terminal_states(self):
        for state in ("llegado", "cerrada", "cancelada"):
            self.episode.status = state
            self.episode.save(update_fields=["status"])
            for action, body in (
                ("update", self.body(notes="Sintético")),
                (
                    "measurements",
                    self.body(
                        vitals={"hr": 80, "taken_at": self.measurement.measured_at.isoformat()}
                    ),
                ),
                ("measurements/rectify", self.correction()),
            ):
                with self.subTest(state=state, action=action):
                    self.assertEqual(self.post(action, body).status_code, 409)

    def test_roles_and_unit_scope_are_checked_for_all_new_actions(self):
        for action, body in (
            ("update", self.body(notes="Sintético")),
            (
                "measurements",
                self.body(vitals={"hr": 80, "taken_at": self.measurement.measured_at.isoformat()}),
            ),
            ("measurements/rectify", self.correction()),
        ):
            with self.subTest(action=action):
                self.assertEqual(self.post(action, body, actor=self.receiver).status_code, 403)
                self.assertEqual(self.post(action, body, actor=self.outsider).status_code, 404)

    def test_replay_after_arrival_is_allowed_without_churn_and_reused_uuid_conflicts(self):
        body = self.correction()
        self.assertEqual(self.post("measurements/rectify", body).status_code, 200)
        self.episode.refresh_from_db()
        self.episode.status = "llegado"
        self.episode.save(update_fields=["status"])
        retry = self.post("measurements/rectify", body)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry["Idempotent-Replay"], "true")
        self.assertEqual(VitalMeasurement.objects.count(), 2)
        self.assertEqual(self.post("measurements/rectify", {**body, "value": 100}).status_code, 409)
        self.assertEqual(
            self.post(
                "update", {**self.body(notes="Otro"), "operation_id": body["operation_id"]}
            ).status_code,
            409,
        )

    def test_stale_version_does_not_overwrite_or_append(self):
        body = self.body(notes="Primer cambio")
        self.assertEqual(self.post("update", body).status_code, 200)
        self.assertEqual(self.post("measurements/rectify", self.correction()).status_code, 409)
        self.assertEqual(VitalMeasurement.objects.count(), 1)

    def test_all_new_actions_require_csrf_with_session_authentication(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.operator)
        for action in ("update", "measurements", "measurements/rectify"):
            self.assertEqual(
                client.post(
                    f"/api/v1/emergencies/{self.episode.pk}/{action}/",
                    self.body(notes="Sintético"),
                    format="json",
                ).status_code,
                403,
            )

    def test_initial_triage_and_measurements_record_server_metadata(self):
        body = {
            "operation_id": str(uuid.uuid4()),
            "destination_id": str(self.institution.pk),
            "patient_identity_unknown": True,
            "reason": "Alta sintética",
            "triage": "C3",
            "vitals": {"hr": 80, "taken_at": self.measurement.measured_at.isoformat()},
        }
        response = self.client.post("/api/v1/emergencies/", body, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["triage_recorded_by_id"], str(self.operator.pk))
        self.assertEqual(
            response.json()["vital_measurements"][0]["operation_id"], body["operation_id"]
        )

    def test_retention_c_purges_whole_rectification_chain_after_formal_deadline(self):
        self.assertEqual(self.post("measurements/rectify", self.correction()).status_code, 200)
        as_of = timezone.datetime(2026, 11, 12, 12, tzinfo=UTC)
        call_command(
            "record_pilot_closure",
            closed_at=(as_of - timedelta(days=91)).isoformat(),
            executor="synthetic",
            stdout=StringIO(),
        )
        output = StringIO()
        call_command("apply_retention", apply=True, as_of=as_of.isoformat(), stdout=output)
        self.assertEqual(json.loads(output.getvalue())["deleted"]["vital_measurements"], 2)
        self.assertFalse(VitalMeasurement.objects.exists())

    def test_capture_timestamps_require_explicit_timezone(self):
        self.assertEqual(
            self.post(
                "measurements", self.body(vitals={"hr": 80, "taken_at": "2026-11-12T10:00:00"})
            ).status_code,
            400,
        )
        self.assertEqual(
            self.post(
                "measurements/rectify", {**self.correction(), "measured_at": "2026-11-12T10:00:00"}
            ).status_code,
            400,
        )

    def test_temperature_rectification_accepts_one_decimal_without_padding_error(self):
        self.measurement.kind = "temperature"
        self.measurement.unit = "°C"
        self.measurement.value = 36
        self.measurement.save(update_fields=["kind", "unit", "value"])
        response = self.post(
            "measurements/rectify", {**self.correction(), "value": 36.5, "unit": "°C"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            float(VitalMeasurement.objects.get(rectifies=self.measurement).value), 36.5
        )

    def test_symptom_labels_reject_multiline_control_characters(self):
        self.assertEqual(
            self.post("update", self.body(symptoms=["Disnea\nTexto"])).status_code, 400
        )


class EpisodeUpdateConcurrencyTests(TransactionTestCase):
    def setUp(self):
        EpisodeUpdateTests.setUpTestData.__func__(type(self))

    def race(self, actions):
        barrier = Barrier(len(actions))

        def worker(action):
            close_old_connections()
            try:
                with connections["default"].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                barrier.wait(timeout=10)
                actor, path, extra = action
                client = APIClient()
                client.force_authenticate(User.objects.get(pk=actor.pk))
                return client.post(
                    f"/api/v1/emergencies/{self.episode.pk}/{path}/",
                    {"operation_id": str(uuid.uuid4()), "expected_version": 1, **extra},
                    format="json",
                ).status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=len(actions)) as pool:
            futures = [pool.submit(worker, action) for action in actions]
            return [future.result(timeout=20) for future in futures]

    def test_two_rectifications_have_single_winner_and_preserve_original(self):
        extra = {
            "measurement_id": str(self.measurement.pk),
            "value": 80,
            "unit": "lpm",
            "measured_at": self.measurement.measured_at.isoformat(),
            "reason": "Corrección sintética concurrente",
        }
        results = self.race(
            [
                (self.operator, "measurements/rectify", extra),
                (self.backup, "measurements/rectify", {**extra, "value": 90}),
            ]
        )
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(VitalMeasurement.objects.count(), 2)
        self.measurement.refresh_from_db()
        self.assertEqual(self.measurement.value, 70)

    def test_arrival_racing_measurement_is_serialized_by_episode_version(self):
        results = self.race(
            [
                (
                    self.operator,
                    "measurements",
                    {"vitals": {"hr": 80, "taken_at": self.measurement.measured_at.isoformat()}},
                ),
                (self.receiver, "arrival", {}),
            ]
        )
        self.assertEqual(sorted(results), [200, 409])
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.version, 2)
        self.assertEqual(VitalMeasurement.objects.count(), 2 if results[0] == 200 else 1)
