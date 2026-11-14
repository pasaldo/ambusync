import re
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from emergencies import tests_updates


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_BASE_URL="http://127.0.0.1:5174",
)
class RecoveryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(cls)
        cls.receiver.email = "synthetic-recovery@example.test"
        cls.receiver.set_password("Frase sintética antigua 2026!")
        cls.receiver.save()

    def request_link(self, email=None):
        try:
            from accounts import recovery_delivery  # noqa: F401
        except ImportError:
            return APIClient().post(
                "/api/v1/auth/recovery/request/",
                {"email": email or self.receiver.email},
                format="json",
            )
        # Execute queued mail inline in tests; the public delivery adapter itself is tested separately.
        with (
            patch(
                "accounts.recovery_delivery.enqueue_request",
                side_effect=lambda *args: __import__(
                    "accounts.recovery", fromlist=["request_recovery"]
                ).request_recovery(*args),
            ),
            patch(
                "accounts.recovery_delivery.enqueue_mail",
                side_effect=lambda *args: __import__(
                    "accounts.recovery_delivery", fromlist=["deliver_mail"]
                ).deliver_mail(*args),
            ),
            self.captureOnCommitCallbacks(execute=True),
        ):
            result = APIClient().post(
                "/api/v1/auth/recovery/request/",
                {"email": email or self.receiver.email},
                format="json",
            )
        return result

    def link_data(self):
        self.assertEqual(self.request_link().status_code, 202)
        url = re.search(r"http://\S+", mail.outbox[-1].body)[0]
        parsed = urlsplit(url)
        self.assertEqual(parsed.query, "")
        self.assertEqual(parsed.netloc, "127.0.0.1:5174")
        return {key: values[0] for key, values in parse_qs(parsed.fragment).items()}

    def complete(self, data, password="Nueva frase sintética segura 2026!"):
        return APIClient().post(
            "/api/v1/auth/recovery/complete/",
            {
                **data,
                "password": password,
                "password_confirmation": password,
            },
            format="json",
        )

    def test_public_request_is_generic_and_does_not_expose_account_or_token(self):
        known = self.request_link()
        unknown = self.request_link("unknown@example.test")
        self.assertEqual(known.status_code, 202)
        self.assertEqual(known.json(), unknown.json())
        self.assertNotIn(self.receiver.email, known.content.decode())
        self.assertIn("no-store", known["Cache-Control"])
        self.assertEqual(len(mail.outbox), 1)

    def test_public_response_does_not_wait_for_account_lookup_or_smtp(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with (
            self.captureOnCommitCallbacks(execute=False),
            CaptureQueriesContext(connection) as queries,
        ):
            response = APIClient().post(
                "/api/v1/auth/recovery/request/", {"email": self.receiver.email}, format="json"
            )
        self.assertEqual(response.status_code, 202)
        self.assertFalse(
            any('"accounts_user"' in row["sql"].lower() for row in queries.captured_queries)
        )

    def test_recovery_is_single_use_and_revokes_sessions_without_autologin(self):
        from accounts.recovery_models import PasswordRecovery

        client = APIClient()
        client.force_login(self.receiver)
        from django.conf import settings

        session = client.session
        session[settings.SESSION_STARTED_AT_KEY] = timezone.now().timestamp()
        session["ambusync_last_interaction_at"] = timezone.now().timestamp()
        session[settings.SESSION_VERSION_KEY] = self.receiver.session_version
        session.save()
        data = self.link_data()
        token = PasswordRecovery.objects.get(pk=data["id"])
        self.assertNotEqual(token.token_digest, data["token"])
        result = self.complete(data)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertNotIn("sessionid", result.cookies)
        self.assertEqual(client.get("/api/v1/auth/me/").status_code, 401)
        self.assertEqual(self.complete(data).status_code, 400)
        self.receiver.refresh_from_db()
        self.assertTrue(self.receiver.check_password("Nueva frase sintética segura 2026!"))
        self.assertEqual(self.receiver.session_version, 2)

    def test_expiry_reissue_and_password_validation_do_not_change_account_early(self):
        from accounts.recovery_models import PasswordRecovery

        first = self.link_data()
        second = self.link_data()
        self.assertEqual(self.complete(first).status_code, 400)
        self.assertEqual(self.complete(second, "corta").status_code, 400)
        self.receiver.refresh_from_db()
        self.assertTrue(self.receiver.check_password("Frase sintética antigua 2026!"))
        PasswordRecovery.objects.filter(pk=second["id"]).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        self.assertEqual(self.complete(second).status_code, 400)

    def test_inactive_and_changed_scope_fail_closed(self):
        from institutions.models import InstitutionMembership

        data = self.link_data()
        InstitutionMembership.objects.filter(user=self.receiver).update(active=False)
        self.assertEqual(self.complete(data).status_code, 400)
        before = len(mail.outbox)
        self.assertEqual(self.request_link().status_code, 202)
        self.assertEqual(len(mail.outbox), before)

    def test_public_csrf_and_rate_limit_are_enforced_without_account_enumeration(self):
        client = APIClient(enforce_csrf_checks=True)
        self.assertEqual(
            client.post(
                "/api/v1/auth/recovery/request/", {"email": self.receiver.email}, format="json"
            ).status_code,
            403,
        )
        for _ in range(5):
            self.assertEqual(self.request_link("nobody@example.test").status_code, 202)
        self.assertEqual(self.request_link("nobody@example.test").status_code, 429)
