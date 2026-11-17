from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from institutions.models import Institution, InstitutionMembership


class InstitutionalMailboxContractTests(TestCase):
    def setUp(self):
        institution = Institution.objects.create(name="Receptor Sintetico", kind="receiver")
        user = User.objects.create(username="synthetic-contract", is_active=True)
        user.groups.add(Group.objects.get_or_create(name="institution_admin")[0])
        InstitutionMembership.objects.create(user=user, institution=institution)
        self.client = APIClient()
        self.client.force_authenticate(user)

    @override_settings(AMBUSYNC_MAIL_MODE="mailpit")
    def test_capture_mode_is_explicit_in_authorized_management_config(self):
        response = self.client.get("/api/v1/institutions/management/config/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("mail_delivery_mode"), "mailpit")
        for private in ("password_hash", "mailbox_password", "api_key", "token"):
            self.assertNotIn(private, response.json())

    @override_settings(AMBUSYNC_MAIL_MODE="brevo")
    def test_external_mode_does_not_claim_capture(self):
        response = self.client.get("/api/v1/institutions/management/config/")
        self.assertEqual(response.json().get("mail_delivery_mode"), "brevo")
