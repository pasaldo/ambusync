import re
from datetime import timedelta
from urllib.parse import parse_qs, urlsplit

from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.tests_recovery import RecoveryTests


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_BASE_URL="http://127.0.0.1:5174",
)
class RecoverySupportTests(RecoveryTests):
    def contact(self):
        from accounts.recovery_support import register_contact

        return register_contact(
            self.receiver.username,
            "phone",
            "+00000000000",
            "Registro institucional sintético previo",
            "synthetic-support",
            True,
        )

    def start(self, contact=None):
        from accounts.recovery_support import start_case

        return start_case(
            self.receiver.username, (contact or self.contact()).pk, "replacement@example.test"
        )

    def verify(self, case, result="approved"):
        from accounts.recovery_support import verify_case

        return verify_case(case.pk, "synthetic-verifier", "phone", result)

    def data_from_mail(self):
        url = re.search(r"http://\S+", mail.outbox[-1].body)[0]
        return {key: values[0] for key, values in parse_qs(urlsplit(url).fragment).items()}

    def test_case_needs_prior_contact_and_explicit_human_verification(self):
        import uuid

        from accounts.recovery_support import register_contact, start_case

        with self.assertRaises(ValidationError):
            start_case(self.receiver.username, uuid.uuid4(), "replacement@example.test")
        with self.assertRaises(ValidationError):
            register_contact(
                self.receiver.username, "phone", "+00000000000", "Previo", "support", False
            )
        case = self.start()
        self.receiver.refresh_from_db()
        self.assertEqual(self.receiver.email, "synthetic-recovery@example.test")
        self.assertEqual(len(mail.outbox), 0)
        self.verify(case, "rejected")
        self.assertEqual(len(mail.outbox), 0)

    def test_verified_case_only_changes_email_after_single_use_confirmation(self):
        case = self.start()
        self.verify(case)
        self.receiver.refresh_from_db()
        self.assertEqual(self.receiver.email, "synthetic-recovery@example.test")
        data = self.data_from_mail()
        self.assertEqual(mail.outbox[-1].to, ["replacement@example.test"])
        self.assertEqual(self.complete(data).status_code, 200)
        self.receiver.refresh_from_db()
        self.assertEqual(self.receiver.email, "replacement@example.test")
        self.assertEqual(self.complete(data).status_code, 400)

    def test_contact_rotation_and_scope_changes_invalidate_case(self):
        from accounts.recovery_support import register_contact

        case = self.start()
        self.verify(case)
        data = self.data_from_mail()
        register_contact(
            self.receiver.username, "phone", "+00000000001", "Otro contacto previo", "support", True
        )
        self.assertEqual(self.complete(data).status_code, 400)

    def test_smtp_failure_rolls_back_technical_approval_and_new_email(self):
        from unittest.mock import patch

        from accounts.recovery_models import PasswordRecovery

        case = self.start()
        with (
            patch("accounts.recovery_delivery.deliver_mail", side_effect=OSError("SMTP secret")),
            self.assertRaises(OSError),
        ):
            self.verify(case)
        case.refresh_from_db()
        self.receiver.refresh_from_db()
        self.assertEqual(case.status, "pending")
        self.assertEqual(PasswordRecovery.objects.count(), 0)
        self.assertEqual(self.receiver.email, "synthetic-recovery@example.test")

    def test_scope_drift_or_new_email_collision_cannot_apply_partial_change(self):
        from institutions.models import InstitutionMembership

        case = self.start()
        self.verify(case)
        data = self.data_from_mail()
        self.operator.email = "replacement@example.test"
        self.operator.save(update_fields=("email",))
        self.assertEqual(self.complete(data).status_code, 400)
        self.receiver.refresh_from_db()
        self.assertEqual(self.receiver.email, "synthetic-recovery@example.test")
        self.assertTrue(self.receiver.check_password("Frase sintética antigua 2026!"))
        InstitutionMembership.objects.filter(user=self.receiver).update(active=False)
        self.assertEqual(self.complete(data).status_code, 400)

    def test_technical_case_cannot_be_self_verified_or_bypass_mailbox_confirmation(self):
        from accounts.recovery_support import verify_case

        case = self.start()
        with self.assertRaises(ValidationError):
            verify_case(case.pk, self.receiver.username, "phone", "approved")
        with self.assertRaises(ValidationError):
            verify_case(case.pk, "verifier", "unknown", "approved")
        self.verify(case)
        from accounts.recovery_models import PasswordRecovery

        PasswordRecovery.objects.filter(identity_case=case).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        self.assertEqual(self.complete(self.data_from_mail()).status_code, 400)

    def test_public_old_mail_cannot_override_open_technical_case(self):
        old = self.link_data()
        case = self.start()
        before = len(mail.outbox)
        self.assertEqual(self.request_link().status_code, 202)
        self.assertEqual(len(mail.outbox), before)
        self.assertEqual(self.complete(old).status_code, 400)
        self.verify(case)
        data = self.data_from_mail()
        self.assertEqual(self.request_link().status_code, 202)
        self.assertEqual(self.complete(data).status_code, 200)

    def test_administrative_request_requires_scope_and_never_returns_link(self):
        from django.contrib.auth.models import Group

        from audit.models import AuditEvent

        self.receiver.groups.add(Group.objects.get_or_create(name="institution_admin")[0])
        client = APIClient()
        client.force_authenticate(self.receiver)
        with self.captureOnCommitCallbacks(execute=False):
            response = client.post(
                f"/api/v1/institutions/management/accounts/{self.operator.pk}/recovery/",
                {},
                format="json",
            )
        # Operator in test fixture has no deliverable email/password; known target still receives generic result.
        self.assertEqual(response.status_code, 202)
        self.assertNotIn("token", response.content.decode())
        self.assertTrue(AuditEvent.objects.filter(action="account.recovery_requested").exists())
        self.assertEqual(
            client.post(
                f"/api/v1/institutions/management/accounts/{self.operator.pk}/recovery/",
                [],
                format="json",
            ).status_code,
            400,
        )
        self.assertEqual(
            client.post(
                "/api/v1/institutions/management/accounts/999999/recovery/", {}, format="json"
            ).status_code,
            404,
        )
        client.force_authenticate(self.operator)
        self.assertEqual(
            client.post(
                f"/api/v1/institutions/management/accounts/{self.receiver.pk}/recovery/",
                {},
                format="json",
            ).status_code,
            403,
        )

    def test_system_admin_group_never_inherits_institutional_recovery_delegation(self):
        from django.contrib.auth.models import Group

        self.receiver.groups.add(
            Group.objects.get_or_create(name="institution_admin")[0],
            Group.objects.get_or_create(name="system_admin")[0],
        )
        client = APIClient()
        client.force_authenticate(self.receiver)
        self.assertEqual(
            client.post(
                f"/api/v1/institutions/management/accounts/{self.operator.pk}/recovery/",
                {},
                format="json",
            ).status_code,
            403,
        )

    def test_technical_commands_never_print_contact_email_password_or_recovery_token(self):
        from io import StringIO
        from unittest.mock import patch

        from django.core.management import call_command

        from accounts.recovery_models import IdentityRecoveryCase, RecoveryContact

        output = StringIO()
        with (
            patch(
                "accounts.management.commands.register_recovery_contact.getpass",
                return_value="+00000000000",
            ),
            patch(
                "accounts.management.commands.register_recovery_contact.getuser",
                return_value="synthetic-support",
            ),
        ):
            call_command(
                "register_recovery_contact",
                self.receiver.username,
                "--channel",
                "phone",
                "--provenance",
                "Previo sintético",
                "--confirmed-prior-contact",
                stdout=output,
            )
        contact = RecoveryContact.objects.get(user=self.receiver)
        with patch(
            "accounts.management.commands.start_email_recovery.getpass",
            return_value="replacement@example.test",
        ):
            call_command(
                "start_email_recovery",
                self.receiver.username,
                "--contact",
                str(contact.pk),
                stdout=output,
            )
        case = IdentityRecoveryCase.objects.get(user=self.receiver)
        call_command(
            "verify_email_recovery",
            str(case.pk),
            "--verifier",
            "synthetic-verifier",
            "--method",
            "phone",
            "--result",
            "approved",
            stdout=output,
        )
        raw = self.data_from_mail()["token"]
        for secret in (contact.value, case.proposed_email, raw, "Frase sintética antigua 2026!"):
            self.assertNotIn(secret, output.getvalue())
