import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import StringIO
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.core.management import call_command
from django.db import close_old_connections, connections, transaction
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.tests_recovery import RecoveryTests


class RecoveryIntegrityTests(RecoveryTests):
    def test_email_and_password_changes_invalidate_issued_link(self):
        data = self.link_data()
        type(self.receiver).objects.filter(pk=self.receiver.pk).update(email="changed@example.test")
        self.assertEqual(self.complete(data).status_code, 400)

    def test_contact_and_case_metadata_follow_audit_retention_not_clinical_purge(self):
        from accounts.recovery_models import IdentityRecoveryCase, PasswordRecovery, RecoveryContact
        from accounts.recovery_support import register_contact, start_case
        from audit.models import PilotClosure

        contact = register_contact(
            self.receiver.username, "phone", "+00000000000", "Previo sintético", "support", True
        )
        case = start_case(self.receiver.username, contact.pk, "replacement@example.test")
        from accounts.recovery import issue_token

        issue_token(self.receiver, case=case)
        now = timezone.now()
        PilotClosure.objects.create(closed_at=now - timedelta(days=91), executor="synthetic-test")
        call_command("apply_retention", apply=True, as_of=now.isoformat(), stdout=StringIO())
        self.assertTrue(IdentityRecoveryCase.objects.filter(pk=case.pk).exists())
        PilotClosure.objects.update(closed_at=now - timedelta(days=367))
        output = StringIO()
        call_command("apply_retention", apply=True, as_of=now.isoformat(), stdout=output)
        self.assertEqual(IdentityRecoveryCase.objects.count(), 0)
        self.assertEqual(PasswordRecovery.objects.count(), 0)
        self.assertEqual(RecoveryContact.objects.count(), 1)
        self.assertEqual(json.loads(output.getvalue())["deleted"]["identity_recovery_cases"], 1)

    def test_public_delivery_failure_does_not_disclose_recipient_or_secret(self):
        from accounts.recovery_delivery import enqueue_mail

        with (
            patch("accounts.recovery_delivery._executor.submit", side_effect=lambda fn: fn()),
            patch(
                "accounts.recovery_delivery.deliver_mail",
                side_effect=OSError("SECRET RECIPIENT AND TOKEN"),
            ),
            self.assertLogs("accounts.recovery_delivery", level="WARNING") as logs,
        ):
            enqueue_mail("secret@example.test", "http://local/#token=SECRET")
        self.assertNotIn("SECRET", str(logs.output))
        self.assertNotIn("secret@example.test", str(logs.output))


@override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}})
class RecoveryRaceTests(TransactionTestCase):
    def setUp(self):
        RecoveryTests.setUpTestData.__func__(type(self))

    def test_two_confirmations_change_credentials_once(self):
        from accounts.models import User
        from accounts.recovery import complete_recovery, issue_token
        from audit.models import SessionRevocationEvent

        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=self.receiver.pk)
            item, url = issue_token(user)
        raw = parse_qs(urlsplit(url).fragment)["token"][0]

        def complete():
            close_old_connections()
            try:
                complete_recovery(
                    item.pk,
                    raw,
                    "Nueva frase sintética segura 2026!",
                    "Nueva frase sintética segura 2026!",
                )
                return "confirmed"
            except ValidationError:
                return "rejected"
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: complete(), range(2)))
        self.assertCountEqual(results, ["confirmed", "rejected"])
        self.assertEqual(
            SessionRevocationEvent.objects.filter(target_user=self.receiver).count(), 1
        )

    def test_reissue_racing_confirmation_leaves_only_a_current_authorization(self):
        from accounts.models import User
        from accounts.recovery import complete_recovery, fingerprint, issue_token, request_recovery
        from accounts.recovery_models import PasswordRecovery

        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=self.receiver.pk)
            item, url = issue_token(user)
        raw = parse_qs(urlsplit(url).fragment)["token"][0]

        def operation(which):
            close_old_connections()
            try:
                if which == "request":
                    request_recovery(self.receiver.email, "synthetic-origin")
                    return "issued"
                complete_recovery(
                    item.pk,
                    raw,
                    "Nueva frase sintética segura 2026!",
                    "Nueva frase sintética segura 2026!",
                )
                return "confirmed"
            except ValidationError:
                return "rejected"
            finally:
                connections.close_all()

        with (
            patch("accounts.recovery_delivery.enqueue_mail"),
            ThreadPoolExecutor(max_workers=2) as pool,
        ):
            outcomes = list(pool.map(operation, ("confirm", "request"), timeout=20))
        self.assertEqual(outcomes[1], "issued")
        self.receiver.refresh_from_db()
        current = PasswordRecovery.objects.get(
            user=self.receiver, consumed_at__isnull=True, invalidated_at__isnull=True
        )
        self.assertEqual(current.fingerprint, fingerprint(self.receiver))
        self.assertEqual(self.receiver.session_version, 2 if outcomes[0] == "confirmed" else 1)
