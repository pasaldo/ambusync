import json
import os
import uuid
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import TestCase, override_settings

from emergencies import tests_retention_policy
from emergencies.models import Emergency


class SyntheticRestoreSafetyTests(TestCase):
    close = tests_retention_policy.PilotRetentionTests.close

    def test_restore_guard_compares_effective_active_config_before_switching_url(self):
        with (
            patch.dict(
                connection.settings_dict,
                {"NAME": "ambusync_restore_drill", "HOST": "localhost", "PORT": "55433"},
            ),
            patch.dict(
                os.environ,
                {
                    "AMBUSYNC_RESTORE_TARGET_URL": "postgresql://synthetic:secret@127.0.0.1:55433/ambusync_restore_drill"
                },
            ),
            self.assertRaises(CommandError),
        ):
            call_command("check_restore_target", compare_active=True, stdout=StringIO())

    @override_settings(SYNTHETIC_RESTORE_ENABLED=True)
    def test_open_confirmation_refuses_snapshot_with_formal_closure(self):
        self.close()
        with self.assertRaises(CommandError):
            call_command("check_restore_target", expect_pilot_open=True, stdout=StringIO())

    def setUp(self):
        tests_retention_policy.PilotRetentionTests.setUp(self)
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "synthetic.json"
        self.new_id = str(uuid.uuid4())
        self.payload = {
            "emergencies": [
                {
                    "id": self.new_id,
                    "defaults": {
                        "operating_institution_id": str(self.institution.pk),
                        "destination_id": str(self.institution.pk),
                        "ambulance_id": str(self.unit.pk),
                        "created_by_id": self.actor.pk,
                        "status": "cerrada",
                        "patient_identity_unknown": True,
                        "reason": "Solo paquete sintético",
                        "closed_at": "2025-01-01T12:00:00Z",
                    },
                }
            ]
        }

    def restore(self, payload=None, **options):
        self.path.write_text(
            json.dumps(self.payload if payload is None else payload), encoding="utf-8"
        )
        output = StringIO()
        call_command("restore_synthetic", str(self.path), stdout=output, **options)
        return json.loads(output.getvalue())

    def test_default_is_validation_without_writing(self):
        report = self.restore()
        self.assertEqual(report["mode"], "dry-run")
        self.assertFalse(Emergency.objects.filter(pk=self.new_id).exists())

    def test_dry_run_validates_entire_package_and_fields(self):
        invalids = [
            [],
            {},
            {"emergencies": [None]},
            {"emergencies": [{"id": "invalid", "defaults": {}}]},
            {"emergencies": [{"id": self.new_id, "defaults": {"unknown": True}}]},
        ]
        for payload in invalids:
            with self.subTest(payload=payload), self.assertRaises(CommandError):
                self.restore(payload, dry_run=True)

    def test_apply_requires_explicit_isolation_configuration(self):
        with override_settings(SYNTHETIC_RESTORE_ENABLED=False), self.assertRaises(CommandError):
            self.restore(apply=True)
        self.assertFalse(Emergency.objects.filter(pk=self.new_id).exists())

    @override_settings(SYNTHETIC_RESTORE_ENABLED=True)
    def test_isolated_restore_reapplies_expired_retention_before_success(self):
        self.close()
        report = self.restore(apply=True, as_of=self.as_of.isoformat())
        self.assertEqual(report["mode"], "apply")
        self.assertEqual(report["retention"]["deleted"]["emergencies"], 2)
        self.assertFalse(Emergency.objects.exists())

    @override_settings(SYNTHETIC_RESTORE_ENABLED=True)
    def test_nonexpired_restore_is_not_overwritten_by_repeating_package(self):
        self.restore(apply=True, as_of=self.as_of.isoformat())
        self.assertTrue(Emergency.objects.filter(pk=self.new_id).exists())
        self.payload["emergencies"][0]["defaults"]["reason"] = "No debe sobrescribir"
        with self.assertRaises(CommandError):
            self.restore(apply=True, as_of=self.as_of.isoformat())
        self.assertEqual(Emergency.objects.get(pk=self.new_id).reason, "Solo paquete sintético")

    @override_settings(SYNTHETIC_RESTORE_ENABLED=True)
    def test_invalid_second_record_leaves_no_partial_writes(self):
        self.payload["emergencies"].append(
            {"id": str(uuid.uuid4()), "defaults": {"status": "invalid"}}
        )
        with self.assertRaises(CommandError):
            self.restore(apply=True)
        self.assertFalse(Emergency.objects.filter(pk=self.new_id).exists())

    @override_settings(SYNTHETIC_RESTORE_ENABLED=True)
    def test_guard_rejects_active_or_remote_database_even_when_enabled(self):
        for target in ({"NAME": "ambusync_dev"}, {"HOST": "remote.example.test"}):
            with (
                self.subTest(target=target),
                patch.dict(connection.settings_dict, target),
                self.assertRaises(CommandError),
            ):
                call_command("check_restore_target", stdout=StringIO())

    @override_settings(SYNTHETIC_RESTORE_ENABLED=True)
    def test_retention_failure_rolls_back_restored_package(self):
        with (
            patch(
                "emergencies.management.commands.apply_retention.Command._delete_emergencies",
                side_effect=RuntimeError("synthetic-failure"),
            ),
            self.assertRaises(CommandError),
        ):
            self.restore(apply=True, as_of=self.as_of.isoformat())
        self.assertFalse(Emergency.objects.filter(pk=self.new_id).exists())
