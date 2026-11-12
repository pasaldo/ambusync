import json
import uuid
from datetime import UTC, timedelta
from io import StringIO
from pathlib import Path
from tempfile import NamedTemporaryFile

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import User
from audit.models import AuditEvent, PilotClosure, RetentionExecution, TechnicalLog
from emergencies.models import Emergency, ProcessedOperation, VitalMeasurement
from institutions.models import Ambulance, Institution


class RetentionCommandTests(TestCase):
    def setUp(self):
        self.as_of = timezone.datetime(2026, 11, 5, 12, tzinfo=UTC)
        call_command(
            "record_pilot_closure",
            closed_at=(self.as_of - timedelta(days=91)).isoformat(),
            executor="synthetic-test",
            stdout=StringIO(),
        )
        operator = Institution.objects.create(name="Operadora retención", kind="operator")
        receiver = Institution.objects.create(name="Receptora retención", kind="receiver")
        ambulance = Ambulance.objects.create(institution=operator, code="RET-01")
        actor = User.objects.create_user(
            username="retention-user", password="synthetic-retention-password"
        )
        self.emergency = Emergency.objects.create(
            operating_institution=operator,
            destination=receiver,
            ambulance=ambulance,
            created_by=actor,
            status=Emergency.Status.CLOSED,
            patient_identity_unknown=True,
            reason="Caso sintético de retención",
            closed_at=self.as_of - timedelta(days=91),
        )
        VitalMeasurement.objects.create(
            emergency=self.emergency,
            kind=VitalMeasurement.Kind.HEART_RATE,
            value=70,
            unit=VitalMeasurement.Unit.BEATS_PER_MINUTE,
            measured_at=self.as_of - timedelta(days=91),
            recorded_by=actor,
        )
        ProcessedOperation.objects.create(
            actor=actor,
            operation_id=uuid.uuid4(),
            request_hash="a" * 64,
            emergency=self.emergency,
            created_at=self.as_of - timedelta(days=91),
        )
        AuditEvent.objects.create(
            actor=actor,
            institution=receiver,
            action="emergency.closed",
            object_type="emergency",
            object_id=str(self.emergency.pk),
            result=AuditEvent.Result.SUCCESS,
            correlation_id=uuid.uuid4(),
            occurred_at=self.as_of - timedelta(days=366),
        )

    def test_dry_run_reports_without_deleting(self):
        output = StringIO()
        call_command("apply_retention", "--as-of", "2026-11-05T12:00:00Z", stdout=output)
        report = json.loads(output.getvalue())
        self.assertEqual(report["mode"], "dry-run")
        self.assertEqual(report["counts"]["emergencies"], 1)
        execution = RetentionExecution.objects.get()
        self.assertEqual(execution.mode, RetentionExecution.Mode.DRY_RUN)
        self.assertEqual(execution.command_version, "d010-d011-v2")
        self.assertEqual(execution.result, "planned")
        self.assertTrue(TechnicalLog.objects.filter(event="retention.simulated").exists())
        self.assertTrue(Emergency.objects.filter(pk=self.emergency.pk).exists())

    def test_apply_is_replayable_and_removes_related_data(self):
        output = StringIO()
        call_command("apply_retention", "--as-of", "2026-11-05T12:00:00Z", "--apply", stdout=output)
        execution = RetentionExecution.objects.get(mode=RetentionExecution.Mode.APPLY)
        self.assertEqual(execution.result, "applied")
        self.assertEqual(execution.counts["emergencies"], 1)
        self.assertTrue(TechnicalLog.objects.filter(event="retention.applied").exists())
        self.assertFalse(Emergency.objects.filter(pk=self.emergency.pk).exists())
        self.assertFalse(VitalMeasurement.objects.filter(emergency_id=self.emergency.pk).exists())
        self.assertEqual(ProcessedOperation.objects.count(), 0)
        call_command(
            "apply_retention", "--as-of", "2026-11-05T12:00:00Z", "--apply", stdout=StringIO()
        )

    def test_application_boundary_is_strictly_after_90_days(self):
        as_of = timezone.datetime(2026, 11, 5, 12, tzinfo=UTC)
        for label, age in (("before", 89), ("boundary", 90), ("after", 91)):
            PilotClosure.objects.update(closed_at=as_of - timedelta(days=age))
            emergency = self._make_closed_emergency(as_of - timedelta(days=age), label)
            output = StringIO()
            call_command("apply_retention", "--as-of", as_of.isoformat(), stdout=output)
            report = json.loads(output.getvalue())
            ids = report["emergency_ids"]
            if label == "after":
                self.assertIn(str(emergency.pk), ids)
            else:
                self.assertNotIn(str(emergency.pk), ids)

    def test_audit_boundary_is_strictly_after_12_months(self):
        as_of = timezone.datetime(2026, 11, 5, 12, tzinfo=UTC)
        for label, age in (("before", 364), ("boundary", 365), ("after", 366)):
            PilotClosure.objects.update(closed_at=as_of - timedelta(days=age))
            emergency = self._make_closed_emergency(as_of - timedelta(days=91), label)
            AuditEvent.objects.create(
                actor=emergency.created_by,
                institution=emergency.destination,
                action=f"retention.{label}",
                object_type="emergency",
                object_id=str(emergency.pk),
                result=AuditEvent.Result.SUCCESS,
                correlation_id=uuid.uuid4(),
                occurred_at=as_of - timedelta(days=age),
            )
            output = StringIO()
            call_command("apply_retention", "--as-of", as_of.isoformat(), stdout=output)
            report = json.loads(output.getvalue())
            audit = AuditEvent.objects.filter(action=f"retention.{label}").first()
            self.assertEqual(label == "after", str(audit.pk) in report["audit_ids"])

    def test_technical_logs_are_retained_for_30_days_and_purged_after(self):
        as_of = timezone.datetime(2026, 11, 5, 12, tzinfo=UTC)
        for label, age in (("before", 29), ("boundary", 30), ("after", 31)):
            log = TechnicalLog.objects.create(
                level=TechnicalLog.Level.INFO,
                event=f"technical.boundary.{label}",
            )
            TechnicalLog.objects.filter(pk=log.pk).update(occurred_at=as_of - timedelta(days=age))
            output = StringIO()
            call_command("apply_retention", "--as-of", as_of.isoformat(), stdout=output)
            report = json.loads(output.getvalue())
            self.assertEqual(label == "after", str(log.pk) in report["technical_log_ids"])

    def test_invalid_as_of_is_rejected(self):
        with self.assertRaisesMessage(Exception, "--as-of debe ser una fecha ISO 8601 válida"):
            call_command("apply_retention", "--as-of", "not-a-date", stdout=StringIO())

    @override_settings(SYNTHETIC_RESTORE_ENABLED=True)
    def test_restore_synthetic_repurges_expired_record_before_returning(self):
        package = {
            "emergencies": [
                {
                    "id": str(self.emergency.pk),
                    "defaults": {
                        "operating_institution_id": str(self.emergency.operating_institution_id),
                        "destination_id": str(self.emergency.destination_id),
                        "ambulance_id": str(self.emergency.ambulance_id),
                        "created_by_id": str(self.emergency.created_by_id),
                        "status": Emergency.Status.CLOSED,
                        "patient_identity_unknown": True,
                        "reason": "Registro sintético restaurado",
                        "closed_at": "2026-08-01T12:00:00Z",
                    },
                }
            ]
        }
        with NamedTemporaryFile(mode="w", suffix=".json", encoding="utf-8", delete=False) as file:
            json.dump(package, file)
            path = file.name
        self.addCleanup(Path(path).unlink, missing_ok=True)
        ProcessedOperation.objects.filter(emergency_id=self.emergency.pk).delete()
        VitalMeasurement.objects.filter(emergency_id=self.emergency.pk).delete()
        Emergency.objects.filter(pk=self.emergency.pk).delete()
        call_command(
            "restore_synthetic", path, apply=True, as_of=self.as_of.isoformat(), stdout=StringIO()
        )
        self.assertFalse(Emergency.objects.filter(pk=self.emergency.pk).exists())
        output = StringIO()
        call_command("apply_retention", "--as-of", "2026-11-05T12:00:00Z", stdout=output)
        self.assertNotIn(str(self.emergency.pk), json.loads(output.getvalue())["emergency_ids"])

    def _make_closed_emergency(self, closed_at, label):
        return Emergency.objects.create(
            operating_institution=self.emergency.operating_institution,
            destination=self.emergency.destination,
            ambulance=self.emergency.ambulance,
            created_by=self.emergency.created_by,
            status=Emergency.Status.CLOSED,
            patient_identity_unknown=True,
            reason=f"Caso sintético límite {label}",
            closed_at=closed_at,
        )
