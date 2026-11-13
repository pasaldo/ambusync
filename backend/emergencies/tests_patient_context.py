import uuid
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditEvent, PilotClosure
from emergencies import tests_updates
from emergencies.models import Emergency, Patient, ProcessedOperation


class PatientContextTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(cls)
        cls.patient = Patient.objects.create(
            operating_institution=cls.institution, patient_identity_unknown=True
        )
        Emergency.objects.filter(pk=cls.episode.pk).update(patient_record=cls.patient)

    def body(self, **extra):
        return {
            "operation_id": str(uuid.uuid4()),
            "expected_version": 1,
            "patient_identity_unknown": False,
            "patient_alias": "Alias sintético corregido",
            "age_value": 29,
            "age_unit": "years",
            "reason": "Error sintético de identificación",
            **extra,
        }

    def post(self, body, actor=None):
        client = APIClient()
        client.force_authenticate(actor or self.operator)
        return client.post(
            f"/api/v1/emergencies/{self.episode.pk}/patient-context/", body, format="json"
        )

    def test_correction_is_episode_local_with_original_author_reason_and_uuid(self):
        body = self.body()
        response = self.post(body, self.backup)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("no-store", response.get("Cache-Control", ""))
        self.assertEqual(data["patient"]["alias"], body["patient_alias"])
        self.assertEqual(data["patient"]["age_value"], 29)
        history = data["patient_context_corrections"]
        self.assertEqual(len(history), 1)
        self.assertTrue(history[0]["previous_patient"]["identity_unknown"])
        self.assertEqual(history[0]["corrected_patient"], data["patient"])
        self.assertEqual(history[0]["operation_id"], body["operation_id"])
        self.assertEqual(history[0]["recorded_by_id"], str(self.backup.pk))
        self.assertEqual(history[0]["episode_version"], 2)
        self.assertTrue(history[0]["recorded_at"])
        self.patient.refresh_from_db()
        self.assertTrue(self.patient.patient_identity_unknown)
        self.assertEqual(self.patient.version, 1)
        self.assertEqual(
            AuditEvent.objects.filter(action="emergency.patient_context_corrected").count(), 1
        )
        client = APIClient()
        client.force_authenticate(self.receiver)
        self.assertEqual(
            client.get(f"/api/v1/emergencies/{self.episode.pk}/").json()["patient"], data["patient"]
        )

    def test_replay_after_arrival_does_not_duplicate_and_new_write_is_blocked(self):
        body = self.body()
        self.assertEqual(self.post(body).status_code, 200)
        Emergency.objects.filter(pk=self.episode.pk).update(status="llegado", version=3)
        replay = self.post(body)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay["Idempotent-Replay"], "true")
        self.assertEqual(len(replay.json()["patient_context_corrections"]), 1)
        self.assertEqual(self.post(self.body(expected_version=3)).status_code, 409)

    def test_permissions_version_and_validation(self):
        self.assertEqual(self.post(self.body(), self.receiver).status_code, 403)
        self.assertEqual(self.post(self.body(), self.outsider).status_code, 404)
        self.assertEqual(self.post(self.body(expected_version=9)).status_code, 409)
        for extra in (
            {"reason": ""},
            {"age_value": -1},
            {"age_unit": "months", "age_value": 12},
            {"patient_alias": "Alias\x00"},
            {"patient_id": str(self.patient.pk)},
        ):
            self.assertEqual(self.post(self.body(**extra)).status_code, 400)

    def test_history_is_chained_and_optional_fields_clear(self):
        first = self.post(self.body())
        self.assertEqual(first.status_code, 200)
        body = self.body(expected_version=2)
        for field in ("patient_alias", "age_value", "age_unit"):
            body.pop(field)
        second = self.post(body)
        self.assertEqual(second.status_code, 200)
        history = second.json()["patient_context_corrections"]
        self.assertEqual(history[1]["previous_patient"], history[0]["corrected_patient"])
        self.assertIsNone(second.json()["patient"]["alias"])
        self.assertIsNone(second.json()["patient"]["age_value"])

    def test_audit_failure_rolls_back_identification_history_and_receipt(self):
        body = self.body()
        with (
            patch(
                "emergencies.views.AuditEvent.objects.create",
                side_effect=RuntimeError("synthetic rollback"),
            ),
            self.assertRaises(RuntimeError),
        ):
            self.post(body)
        self.episode.refresh_from_db()
        self.assertTrue(self.episode.patient_identity_unknown)
        self.assertEqual(self.episode.version, 1)
        self.assertFalse(
            ProcessedOperation.objects.filter(operation_id=body["operation_id"]).exists()
        )
        self.assertFalse(self.episode.patient_context_corrections.exists())

    def test_retention_removes_local_history_and_keeps_independent_audit(self):
        self.assertEqual(self.post(self.body()).status_code, 200)
        PilotClosure.objects.create(
            closed_at=timezone.now() - timedelta(days=91), executor="synthetic-context-test"
        )
        call_command("apply_retention", apply=True, stdout=StringIO())
        self.assertFalse(Emergency.objects.exists())
        self.assertTrue(
            AuditEvent.objects.filter(action="emergency.patient_context_corrected").exists()
        )

    def test_f_copies_current_context_without_previous_receivers_history(self):
        from institutions.models import Institution

        destination = Institution.objects.create(
            name="Receptor sintético contexto", kind="receiver"
        )
        corrected = self.post(self.body()).json()
        client = APIClient()
        client.force_authenticate(self.operator)
        result = client.post(
            f"/api/v1/emergencies/{self.episode.pk}/change-destination/",
            {
                "operation_id": str(uuid.uuid4()),
                "expected_version": 2,
                "destination_id": str(destination.pk),
                "reason": "Cambio sintético de destino",
            },
            format="json",
        )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["replacement"]["patient"], corrected["patient"])
        self.assertEqual(result.json()["replacement"]["patient_context_corrections"], [])
        self.assertEqual(len(result.json()["original"]["patient_context_corrections"]), 1)

    def test_other_episode_of_same_patient_remains_unchanged(self):
        other = Emergency.objects.create(
            operating_institution=self.institution,
            destination=self.institution,
            ambulance=self.unit,
            created_by=self.operator,
            patient_record=self.patient,
            patient_identity_unknown=True,
            reason="Otro episodio sintético",
        )
        self.assertEqual(self.post(self.body()).status_code, 200)
        other.refresh_from_db()
        self.assertTrue(other.patient_identity_unknown)
        self.assertEqual(other.version, 1)
        self.assertFalse(other.patient_context_corrections.exists())

    def test_replay_revalidates_unit_and_conflicting_uuid_does_not_change_history(self):
        body = self.body()
        self.assertEqual(self.post(body).status_code, 200)
        self.assertEqual(self.post({**body, "patient_alias": "Otro alias"}).status_code, 409)
        from institutions.models import AmbulanceAssignment

        AmbulanceAssignment.objects.filter(user=self.operator).update(ambulance=self.other_unit)
        self.assertEqual(self.post(body).status_code, 404)
        self.assertEqual(self.episode.patient_context_corrections.count(), 1)


from django.test import TransactionTestCase


class PatientContextConcurrencyTests(TransactionTestCase):
    race = tests_updates.EpisodeUpdateConcurrencyTests.race

    def setUp(self):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(type(self))

    def test_arrival_and_correction_have_one_version_winner(self):
        values = {
            "patient_identity_unknown": False,
            "patient_alias": "Caso corregido",
            "reason": "Corrección sintética concurrente",
        }
        result = self.race(
            [(self.operator, "patient-context", values), (self.receiver, "arrival", {})]
        )
        self.assertEqual(sorted(result), [200, 409])
        self.assertEqual(
            self.episode.patient_context_corrections.count(), 1 if result[0] == 200 else 0
        )

    def test_two_corrections_preserve_one_original_and_reject_stale_version(self):
        values = {
            "patient_identity_unknown": False,
            "patient_alias": "Caso corregido",
            "reason": "Corrección sintética concurrente",
        }
        result = self.race(
            [
                (self.operator, "patient-context", values),
                (self.backup, "patient-context", {**values, "patient_alias": "Otro alias"}),
            ]
        )
        self.assertEqual(sorted(result), [200, 409])
        self.assertTrue(
            self.episode.patient_context_corrections.get().previous_patient["identity_unknown"]
        )
