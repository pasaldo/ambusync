import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth.models import Group
from django.core import mail
from django.db import close_old_connections, transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AccountActivation, User
from audit.models import AuditEvent
from institutions.models import Institution, InstitutionMembership
from institutions.rut import format_company_rut


class InitialActivationFixture:
    def setUp(self):
        self.admin = User.objects.create(username="synthetic-system", is_active=True)
        self.admin.set_unusable_password()
        self.admin.save()
        self.admin.groups.add(Group.objects.get_or_create(name="system_admin")[0])
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        response = self.client.post("/api/v1/system/institutions/", {
            "name": "Hospital Sintetico", "rut": format_company_rut(76123456),
            "address": "Calle ficticia 1", "phone": "", "email": "contact@example.invalid",
            "first_username": "synthetic-first", "first_email": "first@example.invalid",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.institution = Institution.objects.get(pk=response.json()["id"])
        self.target = User.objects.get(username="synthetic-first")
        self.activation = AccountActivation.objects.get(user=self.target)
        self.activation.expires_at = timezone.now() + timedelta(hours=23)
        self.activation.save(update_fields=["expires_at"])
        self.original_token = parse_qs(urlsplit(next(
            word for word in mail.outbox[0].body.split() if "/activar-cuenta#" in word
        )).fragment)["token"][0]
        mail.outbox.clear()
        self.url = f"/api/v1/system/institutions/{self.institution.pk}/resend-first-activation/"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", AMBUSYNC_MAIL_MODE="mailpit")
class SystemFirstActivationTests(InitialActivationFixture, TestCase):
    def test_resend_rotates_token_without_new_accounts_or_privileges(self):
        before = self.activation.token_digest
        created = self.activation.created_at
        counts = (Institution.objects.count(), User.objects.count())
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, 204)
        self.activation.refresh_from_db()
        self.assertNotEqual(self.activation.token_digest, before)
        self.assertEqual(self.activation.created_at, created)
        self.assertEqual((Institution.objects.count(), User.objects.count()), counts)
        self.assertEqual(len(mail.outbox), 1)
        self.assertFalse(self.target.is_active)
        self.assertFalse(self.target.has_usable_password())
        self.assertEqual(set(self.target.groups.values_list("name", flat=True)), {"urgencias", "institution_admin"})
        self.assertFalse(self.admin.institution_memberships.exists())
        self.assertEqual(AuditEvent.objects.filter(action="system.institution.first_activation_resent").count(), 1)
        raw = mail.outbox[0].body.split("token=")[1].split()[0]
        self.assertEqual(hashlib.sha256(raw.encode()).hexdigest(), self.activation.token_digest)

    def test_expired_invitation_can_be_captured_again(self):
        AccountActivation.objects.filter(pk=self.activation.pk).update(expires_at=timezone.now() - timedelta(days=1))
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 204)

    def test_failure_rolls_back_token_and_audit(self):
        previous = self.activation.token_digest
        with patch("institutions.system_activation.send_activation_email", side_effect=OSError):
            response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, 503)
        self.activation.refresh_from_db()
        self.assertEqual(self.activation.token_digest, previous)
        self.assertFalse(AuditEvent.objects.filter(action="system.institution.first_activation_resent").exists())

    def test_cooldown_blocks_duplicate_capture(self):
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 204)
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 429)
        self.assertEqual(len(mail.outbox), 1)

    def test_only_original_pending_admin_is_eligible(self):
        for change in ("activated", "password", "consumed", "disabled", "membership", "groups", "audit"):
            with self.subTest(change=change), transaction.atomic():
                if change == "activated":
                    User.objects.filter(pk=self.target.pk).update(is_active=True)
                elif change == "password":
                    self.target.set_password("Synthetic-personal-password-26")
                    self.target.save(update_fields=["password"])
                elif change == "consumed":
                    AccountActivation.objects.filter(pk=self.activation.pk).update(consumed_at=timezone.now())
                elif change == "disabled":
                    Institution.objects.filter(pk=self.institution.pk).update(enabled=False)
                elif change == "membership":
                    InstitutionMembership.objects.filter(user=self.target).update(active=False)
                elif change == "groups":
                    self.target.groups.clear()
                else:
                    AuditEvent.objects.filter(action="system.institution.first_admin_created").delete()
                self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 404)
                transaction.set_rollback(True)
        self.assertEqual(len(mail.outbox), 0)

    def test_authorization_and_body_no_overrides(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 401)
        other = User.objects.create(username="synthetic-other", is_active=True)
        other.groups.add(Group.objects.get_or_create(name="institution_admin")[0])
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 403)

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(self.url, {"email": "other@example.invalid"}, format="json").status_code, 400)
        # A stale authenticated User instance must not bypass current revocation.
        User.objects.filter(pk=self.admin.pk).update(is_active=False)
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 403)

    def test_session_authenticated_post_requires_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        self.assertEqual(client.post(self.url, {}, format="json").status_code, 403)

    def test_capability_and_mail_mode_are_explicit_without_account_details(self):
        result = self.client.get("/api/v1/system/institutions/").json()[0]
        self.assertIs(result.get("can_resend_first_activation"), True)
        self.assertEqual(result.get("mail_delivery_mode"), "mailpit")
        self.assertNotIn("first_email", result)
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 204)
        self.assertIs(self.client.get("/api/v1/system/institutions/").json()[0]["can_resend_first_activation"], False)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SystemFirstActivationRaceTests(InitialActivationFixture, TransactionTestCase):
    def test_two_resends_capture_one_message(self):
        def resend(_):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(User.objects.get(pk=self.admin.pk))
                return client.post(self.url, {}, format="json").status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            result = list(pool.map(resend, range(2), timeout=15))
        self.assertEqual(sorted(result), [204, 429])
        self.assertEqual(len(mail.outbox), 1)

    def test_activation_and_resend_serialize_without_overwriting_activated_account(self):
        def operation(kind):
            close_old_connections()
            try:
                client = APIClient()
                if kind == "resend":
                    client.force_authenticate(User.objects.get(pk=self.admin.pk))
                    return client.post(self.url, {}, format="json").status_code
                password = "Synthetic-Personal-Password-Activation-26!"
                return client.post("/api/v1/auth/activate/", {
                    "uid": str(self.target.pk), "token": self.original_token,
                    "password": password, "password_confirmation": password,
                }, format="json").status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            result = list(pool.map(operation, ("resend", "activate"), timeout=15))
        self.assertIn(result, ([204, 400], [404, 200]))

    def test_institution_deactivation_and_resend_do_not_deadlock(self):
        def operation(kind):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(User.objects.get(pk=self.admin.pk))
                url = self.url if kind == "resend" else f"/api/v1/system/institutions/{self.institution.pk}/deactivate/"
                return client.post(url, {}, format="json").status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            result = list(pool.map(operation, ("resend", "deactivate"), timeout=15))
        self.assertIn(result[0], (204, 404))
        self.assertEqual(result[1], 200)
        self.institution.refresh_from_db()
        self.assertFalse(self.institution.enabled)
