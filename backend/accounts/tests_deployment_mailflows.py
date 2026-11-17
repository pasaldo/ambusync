from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth.models import Group
from django.db import close_old_connections, connections
from django.test import SimpleTestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import AccountActivation, OutboundMailBudget, User
from accounts.tests_brevo_mail import MAIL_SETTINGS
from institutions import tests_system_management, tests_unit_management
from institutions.models import Institution


@override_settings(
    **{
        **MAIL_SETTINGS,
        "EMAIL_BACKEND": "accounts.mail_backend.BrevoEmailBackend",
        "DEFAULT_FROM_EMAIL": "AmbuSync <sender@example.test>",
        "BREVO_ALLOWED_RECIPIENTS": [
            "invite@example.test",
            "first-urgencias@example.test",
            "recovery@example.test",
        ],
        "FRONTEND_BASE_URL": "https://synthetic-l.onrender.com",
    }
)
class DeploymentMailflowTests(TransactionTestCase):
    def setUp(self):
        tests_unit_management.UnitManagementTests.setUpTestData.__func__(type(self))
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.accepted = True
        self.messages = []

    def worker(self, payload):
        from accounts.mail_budget import reserve_mail_budget

        def reserve():
            close_old_connections()
            try:
                return reserve_mail_budget()
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=1) as pool:
            if not pool.submit(reserve).result(timeout=5):
                return False
        self.messages.append(payload["message"])
        if isinstance(self.accepted, Exception):
            raise self.accepted
        return self.accepted

    def create(self, username="synthetic-invite"):
        return self.client.post(
            "/api/v1/institutions/management/accounts/",
            {
                "username": username,
                "email": "invite@example.test",
                "groups": ["urgencias"],
            },
            format="json",
        )

    def test_accepted_activation_and_resend_use_fragment_not_query_or_response(self):
        with patch("accounts.mail_backend.run_brevo_worker", side_effect=self.worker):
            response = self.create()
            self.assertEqual(response.status_code, 201)
            user = User.objects.get(username="synthetic-invite")
            first = AccountActivation.objects.get(user=user).token_digest
            self.assertEqual(
                self.client.post(
                    f"/api/v1/institutions/management/accounts/{user.pk}/resend-activation/",
                    {},
                    format="json",
                ).status_code,
                200,
            )
        self.assertEqual(OutboundMailBudget.objects.get(pk=1).used, 2)
        self.assertNotEqual(AccountActivation.objects.get(user=user).token_digest, first)
        for message in self.messages:
            url = urlsplit(
                next(part for part in message["textContent"].split() if "/activar-cuenta" in part)
            )
            self.assertEqual(url.query, "")
            self.assertEqual(url.scheme, "https")
            self.assertEqual(set(parse_qs(url.fragment)), {"uid", "token"})
            self.assertNotIn("token", response.content.decode())
        self.assertFalse(user.is_active)

    def test_failed_activation_rolls_back_user_without_refunding_attempt(self):
        for index, outcome in enumerate((False, TimeoutError("synthetic-secret-provider"))):
            self.accepted = outcome
            with patch("accounts.mail_backend.run_brevo_worker", side_effect=self.worker):
                response = self.create(f"synthetic-failed-{index}")
            self.assertEqual(response.status_code, 503)
            self.assertFalse(User.objects.filter(username=f"synthetic-failed-{index}").exists())
            self.assertNotIn("synthetic-secret-provider", response.content.decode())
            self.assertEqual(OutboundMailBudget.objects.get(pk=1).used, index + 1)

    def test_budget_exhaustion_rejects_creation_without_user_or_message(self):
        from django.utils import timezone

        OutboundMailBudget.objects.create(pk=1, day=timezone.now().date(), used=100)
        with patch("accounts.mail_backend.run_brevo_worker", side_effect=self.worker):
            response = self.create()
        self.assertEqual(response.status_code, 503)
        self.assertFalse(User.objects.filter(username="synthetic-invite").exists())
        self.assertEqual(self.messages, [])

    def test_system_institution_creation_uses_same_backend_and_rollback(self):
        admin = User.objects.create(username="synthetic-global")
        admin.groups.add(Group.objects.get_or_create(name="system_admin")[0])
        self.client.force_authenticate(admin)
        payload = tests_system_management.SystemInstitutionManagementTests.institution_payload(self)
        with patch("accounts.mail_backend.run_brevo_worker", side_effect=self.worker):
            for outcome in (False, TimeoutError("synthetic-secret-provider")):
                self.accepted = outcome
                response = self.client.post("/api/v1/system/institutions/", payload, format="json")
                self.assertEqual(response.status_code, 503)
                self.assertNotIn("synthetic-secret-provider", response.content.decode())
                self.assertFalse(Institution.objects.filter(rut=payload["rut"]).exists())
                self.assertFalse(User.objects.filter(username=payload["first_username"]).exists())
            OutboundMailBudget.objects.filter(pk=1).update(used=100)
            before = len(self.messages)
            self.assertEqual(
                self.client.post(
                    "/api/v1/system/institutions/", payload, format="json"
                ).status_code,
                503,
            )
            self.assertEqual(len(self.messages), before)
            self.assertFalse(Institution.objects.filter(rut=payload["rut"]).exists())
            self.assertFalse(User.objects.filter(username=payload["first_username"]).exists())
            OutboundMailBudget.objects.filter(pk=1).update(used=2)
            self.accepted = True
            self.assertEqual(
                self.client.post(
                    "/api/v1/system/institutions/", payload, format="json"
                ).status_code,
                201,
            )
        self.assertEqual(OutboundMailBudget.objects.get(pk=1).used, 3)

    def test_failed_recovery_delivery_remains_generic_and_does_not_log_secret(self):
        self.operator.email = "recovery@example.test"
        self.operator.set_password("Synthetic-Recovery-Password-26!")
        self.operator.save(update_fields=["email", "password"])
        self.accepted = False
        with (
            patch("accounts.recovery_delivery._executor.submit", side_effect=lambda fn: fn()),
            patch("accounts.mail_backend.run_brevo_worker", side_effect=self.worker),
            self.assertLogs("accounts.recovery_delivery", level="WARNING") as logs,
        ):
            public = APIClient()
            known = public.post(
                "/api/v1/auth/recovery/request/", {"email": self.operator.email}, format="json"
            )
            unknown = public.post(
                "/api/v1/auth/recovery/request/", {"email": "unknown@example.test"}, format="json"
            )
        self.assertEqual(known.status_code, 202)
        self.assertEqual(known.json(), unknown.json())
        self.assertNotIn("recovery@example.test", str(logs.output))
        self.assertNotIn("token=", str(logs.output))
        self.assertEqual(OutboundMailBudget.objects.get(pk=1).used, 1)


class DeploymentLogTests(SimpleTestCase):
    def test_request_log_filter_erases_query_request_and_exception(self):
        import logging

        from config.log_filters import RedactRequestLog

        record = logging.LogRecord(
            "django.request",
            logging.ERROR,
            __file__,
            1,
            "failed /activar-cuenta?token=%s",
            ("synthetic-token",),
            (OSError, OSError("synthetic-token"), None),
        )
        record.request = object()
        record.exc_text = "synthetic-token"
        self.assertTrue(RedactRequestLog().filter(record))
        self.assertNotIn("synthetic-token", record.getMessage())
        self.assertIsNone(record.request)
        self.assertIsNone(record.exc_info)
        self.assertIsNone(record.exc_text)
