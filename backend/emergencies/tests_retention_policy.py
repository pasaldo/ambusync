import json
import uuid
from datetime import UTC, timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command, get_commands
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from audit.models import AuditEvent, RetentionExecution, SessionRevocationEvent, TechnicalLog
from emergencies.models import Emergency, ProcessedOperation, VitalMeasurement
from institutions.models import Ambulance, Institution


class PilotRetentionTests(TestCase):
    def setUp(self):
        self.as_of = timezone.datetime(2026, 11, 12, 12, tzinfo=UTC)
        self.institution = Institution.objects.create(name="Retención sintética", kind="combined")
        self.unit = Ambulance.objects.create(institution=self.institution, code="SYN-RET")
        self.actor = User.objects.create(username="synthetic-retention", password="!")
        self.episode = Emergency.objects.create(
            operating_institution=self.institution,
            destination=self.institution,
            ambulance=self.unit,
            created_by=self.actor,
            status="cerrada",
            closed_at=self.as_of - timedelta(days=500),
            patient_identity_unknown=True,
            reason="Caso sintético antiguo",
        )
        self.operation = ProcessedOperation.objects.create(
            actor=self.actor,
            operation_id=uuid.uuid4(),
            request_hash="a" * 64,
            emergency=self.episode,
        )
        self.measurement = VitalMeasurement.objects.create(
            emergency=self.episode,
            recorded_by=self.actor,
            kind="heart_rate",
            value=70,
            unit="lpm",
            measured_at=self.as_of,
        )
        self.audit = AuditEvent.objects.create(
            actor=self.actor,
            institution=self.institution,
            ambulance=self.unit,
            action="emergency.created",
            object_type="emergency",
            object_id=str(self.episode.pk),
            result="success",
            correlation_id=uuid.uuid4(),
        )

    def close(self, at=None):
        self.assertIn("record_pilot_closure", get_commands(), "falta registrar el cierre formal")
        call_command(
            "record_pilot_closure",
            closed_at=(at or self.as_of - timedelta(days=91)).isoformat(),
            executor="synthetic-responsible",
            stdout=StringIO(),
        )

    def run_retention(self, at=None, apply=False):
        output = StringIO()
        call_command(
            "apply_retention", as_of=(at or self.as_of).isoformat(), apply=apply, stdout=output
        )
        return json.loads(output.getvalue())

    def test_no_formal_closure_never_purges_application_or_audit(self):
        AuditEvent.objects.filter(pk=self.audit.pk).update(
            occurred_at=self.as_of - timedelta(days=800)
        )
        report = self.run_retention(apply=True)
        self.assertTrue(Emergency.objects.filter(pk=self.episode.pk).exists())
        self.assertTrue(ProcessedOperation.objects.filter(pk=self.operation.pk).exists())
        self.assertTrue(AuditEvent.objects.filter(pk=self.audit.pk).exists())
        self.assertEqual(report["deleted"]["emergencies"], 0)

    def test_global_closure_preserves_old_episodes_until_ninety_days(self):
        self.close(self.as_of - timedelta(days=89))
        self.assertEqual(self.run_retention()["counts"]["emergencies"], 0)

    def test_exact_application_boundary_is_preserved_then_all_states_expire(self):
        closed_at = self.as_of - timedelta(days=90)
        self.close(closed_at)
        for state in ("notificada", "en_traslado", "llegado", "cancelada"):
            self.episode.pk = uuid.uuid4()
            self.episode.status = state
            self.episode.save(force_insert=True)
        self.assertEqual(self.run_retention()["counts"]["emergencies"], 0)
        report = self.run_retention(self.as_of + timedelta(microseconds=1), apply=True)
        self.assertEqual(report["deleted"]["emergencies"], 5)
        self.assertEqual(report["deleted"]["operations"], 1)
        self.assertEqual(report["deleted"]["vital_measurements"], 1)
        self.assertFalse(Emergency.objects.exists())
        self.assertTrue(AuditEvent.objects.filter(pk=self.audit.pk).exists())

    def test_audit_expires_independently_after_episode_is_gone(self):
        closure = timezone.datetime(2025, 10, 1, 12, tzinfo=UTC)
        self.close(closure)
        # Administrative events are also functional audit, not only emergencies.
        self.audit.object_type = "account"
        self.audit.object_id = str(self.actor.pk)
        self.audit.save(update_fields=["object_type", "object_id"])
        self.run_retention(closure + timedelta(days=91), apply=True)
        self.assertTrue(AuditEvent.objects.exists())
        report = self.run_retention(timezone.datetime(2026, 10, 1, 12, tzinfo=UTC), apply=True)
        self.assertEqual(report["deleted"]["audit"], 0)
        report = self.run_retention(
            timezone.datetime(2026, 10, 1, 12, 0, 1, tzinfo=UTC), apply=True
        )
        self.assertEqual(report["deleted"]["audit"], 1)

    def test_twelve_months_is_calendar_anniversary_including_leap_day(self):
        self.close(timezone.datetime(2024, 2, 29, 12, tzinfo=UTC))
        self.assertEqual(
            self.run_retention(timezone.datetime(2025, 2, 28, 12, tzinfo=UTC))["counts"]["audit"], 0
        )
        self.assertEqual(
            self.run_retention(timezone.datetime(2025, 2, 28, 12, 0, 1, tzinfo=UTC))["counts"][
                "audit"
            ],
            1,
        )

    def test_dry_run_and_replay_preserve_counts_and_do_not_duplicate_deletions(self):
        self.close()
        report = self.run_retention()
        self.assertEqual(
            report["counts"]["operations"], 1, "operación reciente vive hasta eliminar su episodio"
        )
        self.assertTrue(Emergency.objects.exists())
        self.assertEqual(self.run_retention(apply=True)["deleted"]["emergencies"], 1)
        self.assertEqual(self.run_retention(apply=True)["deleted"]["emergencies"], 0)
        self.assertEqual(RetentionExecution.objects.count(), 3)

    def test_technical_logs_roll_thirty_days_even_without_closure(self):
        for event in ("ordinary.synthetic", "retention.simulated"):
            log = TechnicalLog.objects.create(level="info", event=event)
            TechnicalLog.objects.filter(pk=log.pk).update(
                occurred_at=self.as_of - timedelta(days=31)
            )
        boundary = TechnicalLog.objects.create(level="info", event="boundary.synthetic")
        TechnicalLog.objects.filter(pk=boundary.pk).update(
            occurred_at=self.as_of - timedelta(days=30)
        )
        report = self.run_retention(apply=True)
        self.assertEqual(report["deleted"]["technical_logs"], 2)
        self.assertTrue(TechnicalLog.objects.filter(pk=boundary.pk).exists())

    def test_failure_rolls_back_data_and_records_minimal_error(self):
        self.close()
        with (
            patch(
                "emergencies.management.commands.apply_retention.Command._delete_emergencies",
                side_effect=RuntimeError("secret-patient-token"),
            ),
            self.assertRaises(CommandError),
        ):
            self.run_retention(apply=True)
        self.assertTrue(Emergency.objects.exists())
        self.assertTrue(ProcessedOperation.objects.exists())
        record = RetentionExecution.objects.get(result="failed")
        self.assertNotIn("secret-patient-token", str(record.errors))

    def test_closure_is_recorded_once_and_conflicting_date_is_rejected(self):
        self.close()
        self.close()
        from audit.models import PilotClosure

        self.assertEqual(PilotClosure.objects.count(), 1)
        self.assertEqual(PilotClosure.objects.get().executor, "synthetic-responsible")
        with self.assertRaises(CommandError):
            self.close(self.as_of - timedelta(days=92))

    def test_naive_and_invalid_reference_dates_are_rejected(self):
        for value in ("not-a-date", "2026-11-12T12:00:00"):
            with self.subTest(value=value), self.assertRaises(CommandError):
                call_command("apply_retention", as_of=value, stdout=StringIO())

    def test_session_revocation_audit_uses_same_global_twelve_month_window(self):
        self.close(timezone.datetime(2025, 10, 1, 12, tzinfo=UTC))
        event = SessionRevocationEvent.objects.create(
            target_user=self.actor,
            executor="synthetic",
            reason="Motivo sintético",
            resulting_session_version=2,
        )
        self.run_retention(timezone.datetime(2026, 10, 1, 12, tzinfo=UTC), apply=True)
        self.assertTrue(SessionRevocationEvent.objects.filter(pk=event.pk).exists())
        report = self.run_retention(
            timezone.datetime(2026, 10, 1, 12, 0, 1, tzinfo=UTC), apply=True
        )
        self.assertFalse(SessionRevocationEvent.objects.filter(pk=event.pk).exists())
        self.assertEqual(report["deleted"]["audit"], 2)
        self.assertEqual(report["deleted"]["session_revocations"], 1)

    def test_formal_closure_rejects_future_naive_and_missing_executor(self):
        for at, executor in (
            ((timezone.now() + timedelta(days=1)).isoformat(), "synthetic"),
            ("2026-01-01T12:00:00", "synthetic"),
            ("2026-01-01T12:00:00Z", " "),
        ):
            with self.subTest(at=at, executor=executor), self.assertRaises(CommandError):
                call_command(
                    "record_pilot_closure", closed_at=at, executor=executor, stdout=StringIO()
                )
