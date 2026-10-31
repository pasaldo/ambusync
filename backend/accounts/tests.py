import time
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import LoginThrottle, User
from accounts.security import revoke_user_sessions
from audit.models import SessionRevocationEvent
from institutions.models import AmbulanceAssignment, Institution, InstitutionMembership


class SyntheticBootstrapTests(TestCase):
    @patch(
        "accounts.management.commands.seed_synthetic.getpass",
        side_effect=[
            "Faro-Clinico-Sintetico-2026!",
            "Faro-Clinico-Sintetico-2026!",
            "Rio-Urgencias-Sintetico-2026!",
            "Rio-Urgencias-Sintetico-2026!",
        ],
    )
    def test_creates_synthetic_accounts_without_printing_passwords(self, _getpass):
        output = StringIO()
        call_command("seed_synthetic", stdout=output)

        operator = User.objects.get(username="demo_ambulancia")
        receiver = User.objects.get(username="demo_urgencias")
        self.assertTrue(operator.check_password("Faro-Clinico-Sintetico-2026!"))
        self.assertTrue(receiver.check_password("Rio-Urgencias-Sintetico-2026!"))
        self.assertEqual(operator.groups.get().name, "ambulance")
        self.assertEqual(receiver.groups.get().name, "urgencias")
        self.assertTrue(
            InstitutionMembership.objects.filter(
                user=operator, institution__name="Hospital Operador Demo", active=True
            ).exists()
        )
        self.assertTrue(
            InstitutionMembership.objects.filter(
                user=receiver, institution__name="Hospital Central Demo", active=True
            ).exists()
        )
        self.assertEqual(AmbulanceAssignment.objects.filter(user=operator, active=True).count(), 1)
        self.assertEqual(InstitutionMembership.objects.filter(active=True).count(), 2)
        self.assertNotIn("Faro-Clinico", output.getvalue())

    def test_rerunning_bootstrap_keeps_existing_passwords(self):
        with patch(
            "accounts.management.commands.seed_synthetic.getpass",
            side_effect=[
                "Faro-Clinico-Sintetico-2026!",
                "Faro-Clinico-Sintetico-2026!",
                "Rio-Urgencias-Sintetico-2026!",
                "Rio-Urgencias-Sintetico-2026!",
            ],
        ):
            call_command("seed_synthetic", stdout=StringIO())

        with patch(
            "accounts.management.commands.seed_synthetic.getpass", side_effect=AssertionError
        ):
            call_command("seed_synthetic", stdout=StringIO())

        self.assertTrue(
            User.objects.get(username="demo_ambulancia").check_password(
                "Faro-Clinico-Sintetico-2026!"
            )
        )

    def test_bootstrap_renames_legacy_demo_institutions(self):
        Institution.objects.create(name="Demo sintética operadora", kind="operator")
        Institution.objects.create(name="Demo sintética receptora", kind="receiver")
        with patch(
            "accounts.management.commands.seed_synthetic.getpass",
            side_effect=[
                "Faro-Clinico-Sintetico-2026!",
                "Faro-Clinico-Sintetico-2026!",
                "Rio-Urgencias-Sintetico-2026!",
                "Rio-Urgencias-Sintetico-2026!",
            ],
        ):
            call_command("seed_synthetic", stdout=StringIO())

        self.assertFalse(Institution.objects.filter(name="Demo sintética operadora").exists())
        self.assertFalse(Institution.objects.filter(name="Demo sintética receptora").exists())


class SessionSecurityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="synthetic-session-user",
            password="synthetic-session-password",
        )
        self.client = APIClient(enforce_csrf_checks=True)

    def login(self):
        csrf = self.client.get("/api/v1/auth/csrf/")
        self.client.defaults["HTTP_X_CSRFTOKEN"] = csrf.cookies["csrftoken"].value
        return self.client.post(
            "/api/v1/auth/login/",
            {"username": self.user.username, "password": "synthetic-session-password"},
            format="json",
        )

    def test_anonymous_session_lookup_returns_unauthorized(self):
        response = self.client.get("/api/v1/auth/me/")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "not_authenticated")
        self.assertEqual(response.json()["message"], "La sesión no está iniciada.")

    def test_absolute_twelve_hour_session_expiry(self):
        self.assertEqual(self.login().status_code, 200)
        session = self.client.session
        session["ambusync_session_started_at"] = time.time() - (12 * 60 * 60 + 1)
        session.save()

        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "session_expired")

    def test_session_revocation_takes_effect_on_next_request(self):
        self.assertEqual(self.login().status_code, 200)
        revoke_user_sessions(
            self.user,
            executor="synthetic-test-operator",
            reason="Cuenta sintética de prueba comprometida.",
        )

        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "session_expired")

    def test_idle_activity_requires_explicit_interaction_marker(self):
        self.assertEqual(self.login().status_code, 200)
        original_last_activity = self.client.session["ambusync_last_interaction_at"]

        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.client.session["ambusync_last_interaction_at"], original_last_activity
        )

        self.client.defaults["HTTP_X_AMBUSYNC_USER_INTERACTION"] = "1"
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(
            self.client.session["ambusync_last_interaction_at"], original_last_activity
        )

    def test_idle_timeout_expires_even_if_other_requests_occur(self):
        self.assertEqual(self.login().status_code, 200)
        session = self.client.session
        session["ambusync_last_interaction_at"] = time.time() - (30 * 60 + 1)
        session.save()

        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "session_expired")

    def test_revoke_sessions_command_invalidates_active_session(self):
        self.assertEqual(self.login().status_code, 200)
        call_command(
            "revoke_sessions",
            self.user.username,
            "--reason",
            "Prueba de revocación sintética.",
            stdout=StringIO(),
        )
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)
        event = SessionRevocationEvent.objects.get(target_user=self.user)
        self.assertEqual(event.reason, "Prueba de revocación sintética.")
        self.assertEqual(event.executor, __import__("getpass").getuser())
        self.assertEqual(event.resulting_session_version, self.user.session_version + 1)


class LoginThrottleTests(TestCase):
    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        csrf = self.client.get("/api/v1/auth/csrf/")
        self.client.defaults["HTTP_X_CSRFTOKEN"] = csrf.cookies["csrftoken"].value

    def test_five_failures_throttle_account_and_origin(self):
        for attempt in range(5):
            response = self.client.post(
                "/api/v1/auth/login/",
                {"username": "synthetic-unknown", "password": f"wrong-{attempt}"},
                format="json",
            )
            self.assertEqual(response.status_code, 401)

        blocked = self.client.post(
            "/api/v1/auth/login/",
            {"username": "synthetic-unknown", "password": "wrong-again"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data["code"], "login_throttled")
        self.assertGreater(int(blocked["Retry-After"]), 0)

    def test_progressive_backoff_increases_after_repeated_windows(self):
        current_time = [timezone.now()]
        with patch("accounts.security.timezone.now", side_effect=lambda: current_time[0]):
            for attempt in range(5):
                self.client.post(
                    "/api/v1/auth/login/",
                    {"username": "synthetic-unknown", "password": f"wrong-{attempt}"},
                    format="json",
                )

            current_time[0] += timedelta(seconds=31)
            for attempt in range(5, 10):
                response = self.client.post(
                    "/api/v1/auth/login/",
                    {"username": "synthetic-unknown", "password": f"wrong-{attempt}"},
                    format="json",
                )
                self.assertEqual(response.status_code, 401)

            blocked = self.client.post(
                "/api/v1/auth/login/",
                {"username": "synthetic-unknown", "password": "wrong-again"},
                format="json",
            )
        self.assertEqual(blocked.status_code, 429)
        self.assertGreaterEqual(int(blocked["Retry-After"]), 60)

    def test_successful_login_clears_prior_failures(self):
        user = User.objects.create_user(
            username="synthetic-valid-login",
            password="synthetic-valid-password",
        )
        for attempt in range(4):
            response = self.client.post(
                "/api/v1/auth/login/",
                {"username": user.username, "password": f"wrong-{attempt}"},
                format="json",
            )
            self.assertEqual(response.status_code, 401)

        response = self.client.post(
            "/api/v1/auth/login/",
            {"username": user.username, "password": "synthetic-valid-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(LoginThrottle.objects.count(), 0)
