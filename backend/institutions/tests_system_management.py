import hashlib
from io import StringIO
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.contrib.auth.models import Group
from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import AccountActivation, User
from audit.models import AuditEvent
from emergencies.models import Emergency
from institutions.models import Ambulance, Institution, InstitutionMembership
from institutions.rut import format_company_rut, normalize_company_rut


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SystemInstitutionManagementTests(TestCase):
    def setUp(self):
        system_admin_group, _ = Group.objects.get_or_create(name="system_admin")
        self.admin = User.objects.create_user(
            username="synthetic-system-admin",
            email="system-admin@example.test",
            password="Synthetic-System-Admin-26!",
        )
        self.admin.groups.add(system_admin_group)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def institution_payload(self, **overrides):
        payload = {
            "name": "Hospital Nuevo Demo",
            "rut": format_company_rut(76_123_456),
            "address": "Avenida Sintética 123, Santiago",
            "phone": "+56 2 2000 0000",
            "email": "contacto-nuevo@example.test",
            "first_username": "synthetic-first-urgencias",
            "first_email": "first-urgencias@example.test",
        }
        payload.update(overrides)
        return payload

    def test_rut_validator_enforces_range_and_module_eleven(self):
        valid = format_company_rut(76_123_456)
        self.assertEqual(normalize_company_rut(valid)[1], valid)
        self.assertIsNone(normalize_company_rut("76.123.456-1"))
        self.assertIsNone(normalize_company_rut(format_company_rut(75_999_999)))
        self.assertIsNone(normalize_company_rut(format_company_rut(80_000_000)))

    def test_system_admin_creates_receiver_and_pending_urgencias_admin(self):
        response = self.client.post(
            "/api/v1/system/institutions/", self.institution_payload(), format="json"
        )

        self.assertEqual(response.status_code, 201, response.content)
        institution = Institution.objects.get(rut=self.institution_payload()["rut"])
        user = User.objects.get(username="synthetic-first-urgencias")
        self.assertEqual(institution.kind, Institution.Kind.RECEIVER)
        self.assertTrue(institution.enabled)
        self.assertFalse(user.is_active)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(
            set(user.groups.values_list("name", flat=True)), {"urgencias", "institution_admin"}
        )
        self.assertTrue(
            InstitutionMembership.objects.filter(
                user=user, institution=institution, active=True
            ).exists()
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(institution.name, mail.outbox[0].body)
        activation = AccountActivation.objects.get(user=user)
        token = parse_qs(
            urlparse(
                next(part for part in mail.outbox[0].body.split() if "/activar-cuenta?" in part)
            ).query
        )["token"][0]
        self.assertEqual(activation.token_digest, hashlib.sha256(token.encode()).hexdigest())
        self.assertEqual(
            AuditEvent.objects.filter(
                institution=institution, actor=self.admin, action__startswith="system.institution."
            ).count(),
            2,
        )

    @patch("institutions.system_management.send_activation_email", side_effect=OSError("mail down"))
    def test_email_failure_rolls_back_institution_account_and_audit(self, _send_email):
        response = self.client.post(
            "/api/v1/system/institutions/", self.institution_payload(), format="json"
        )

        self.assertEqual(response.status_code, 503)
        self.assertFalse(Institution.objects.filter(name="Hospital Nuevo Demo").exists())
        self.assertFalse(User.objects.filter(username="synthetic-first-urgencias").exists())
        self.assertFalse(AccountActivation.objects.exists())
        self.assertFalse(
            AuditEvent.objects.filter(action__startswith="system.institution.").exists()
        )

    def test_rejects_invalid_name_rut_phone_and_duplicate_institution_data(self):
        invalid_values = (
            {"name": "Hospital <Demo>"},
            {"rut": "76.123.456-1"},
            {"rut": format_company_rut(80_000_000)},
            {"phone": "1234567890123456"},
            {"phone": "123/456"},
            {"email": "no-es-correo"},
        )
        for invalid in invalid_values:
            response = self.client.post(
                "/api/v1/system/institutions/",
                self.institution_payload(**invalid),
                format="json",
            )
            self.assertEqual(response.status_code, 400, invalid)
            self.assertFalse(Institution.objects.exists(), invalid)

        created = self.client.post(
            "/api/v1/system/institutions/", self.institution_payload(), format="json"
        )
        self.assertEqual(created.status_code, 201, created.content)
        duplicate = self.client.post(
            "/api/v1/system/institutions/",
            self.institution_payload(
                name="Otra Institución Demo",
                first_username="synthetic-second-urgencias",
                first_email="second-urgencias@example.test",
            ),
            format="json",
        )
        self.assertEqual(duplicate.status_code, 400)
        duplicate_contact = self.client.post(
            "/api/v1/system/institutions/",
            self.institution_payload(
                name="Otra Institución Demo",
                rut=format_company_rut(76_222_222),
                first_username="synthetic-third-urgencias",
                first_email="third-urgencias@example.test",
            ),
            format="json",
        )
        self.assertEqual(duplicate_contact.status_code, 400)

    def test_system_admin_can_list_edit_and_reactivate_but_not_change_kind(self):
        institution = Institution.objects.create(
            name="Hospital Legado Demo",
            kind=Institution.Kind.RECEIVER,
            rut=format_company_rut(76_333_333),
            address="Dirección sintética",
            phone="",
            email="legado@example.test",
            enabled=False,
        )
        listed = self.client.get("/api/v1/system/institutions/?status=inactive").json()
        self.assertIn(str(institution.pk), {item["id"] for item in listed})

        changed = self.client.patch(
            f"/api/v1/system/institutions/{institution.pk}/",
            {"name": "Hospital Editado Demo"},
            format="json",
        )
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertEqual(changed.json()["kind"], Institution.Kind.RECEIVER)
        self.assertEqual(changed.json()["address"], "Dirección sintética")
        forbidden_kind = self.client.patch(
            f"/api/v1/system/institutions/{institution.pk}/",
            {**self.institution_payload(), "kind": Institution.Kind.OPERATOR},
            format="json",
        )
        self.assertEqual(forbidden_kind.status_code, 400)
        reactivated = self.client.post(
            f"/api/v1/system/institutions/{institution.pk}/reactivate/", {}, format="json"
        )
        self.assertEqual(reactivated.status_code, 200)
        self.assertTrue(reactivated.json()["enabled"])
        self.assertTrue(
            AuditEvent.objects.filter(
                institution=institution, action="system.institution.reactivated"
            ).exists()
        )

    def test_deactivation_is_blocked_by_open_emergency_as_operator_or_destination(self):
        operator = Institution.objects.create(name="Operadora Demo", kind="operator")
        receiver = Institution.objects.create(name="Receptora Demo", kind="receiver")
        ambulance = Ambulance.objects.create(institution=operator, code="SYSTEM-01")
        actor = User.objects.create_user(username="synthetic-system-operator", password="unused")
        for target in (operator, receiver):
            emergency = Emergency.objects.create(
                operating_institution=operator,
                destination=receiver,
                ambulance=ambulance,
                created_by=actor,
                status=Emergency.Status.NOTIFIED,
                patient_identity_unknown=True,
                reason="Episodio abierto sintético",
            )
            response = self.client.post(
                f"/api/v1/system/institutions/{target.pk}/deactivate/", {}, format="json"
            )
            self.assertEqual(response.status_code, 400)
            target.refresh_from_db()
            self.assertTrue(target.enabled)
            emergency.delete()

    def test_deactivation_revokes_member_sessions_and_reactivation_restores_access(self):
        institution = Institution.objects.create(
            name="Receptora Revocable Demo", kind=Institution.Kind.RECEIVER
        )
        user = User.objects.create_user(
            username="synthetic-institution-user",
            email="member@example.test",
            password="Synthetic-Member-Password-26!",
        )
        group, _ = Group.objects.get_or_create(name="urgencias")
        user.groups.add(group)
        membership = InstitutionMembership.objects.create(user=user, institution=institution)
        previous_version = user.session_version

        deactivated = self.client.post(
            f"/api/v1/system/institutions/{institution.pk}/deactivate/", {}, format="json"
        )
        self.assertEqual(deactivated.status_code, 200)
        user.refresh_from_db()
        membership.refresh_from_db()
        self.assertEqual(user.session_version, previous_version + 1)
        self.assertTrue(membership.active)
        self.assertEqual(
            self.client.post(
                "/api/v1/auth/login/",
                {"username": user.username, "password": "Synthetic-Member-Password-26!"},
                format="json",
            ).status_code,
            401,
        )

        reactivated = self.client.post(
            f"/api/v1/system/institutions/{institution.pk}/reactivate/", {}, format="json"
        )
        self.assertEqual(reactivated.status_code, 200)
        self.assertEqual(
            self.client.post(
                "/api/v1/auth/login/",
                {"username": user.username, "password": "Synthetic-Member-Password-26!"},
                format="json",
            ).status_code,
            200,
        )

    def test_non_system_admin_and_mixed_role_cannot_use_global_api(self):
        ordinary = User.objects.create_user(
            username="synthetic-not-system-admin", password="unused"
        )
        ordinary_client = APIClient()
        ordinary_client.force_authenticate(ordinary)
        self.assertEqual(ordinary_client.get("/api/v1/system/institutions/").status_code, 403)

        mixed_admin = User.objects.create_user(
            username="synthetic-mixed-system-admin", password="unused"
        )
        mixed_admin.groups.add(Group.objects.get(name="system_admin"))
        urgency_group, _ = Group.objects.get_or_create(name="urgencias")
        mixed_admin.groups.add(urgency_group)
        mixed_client = APIClient()
        mixed_client.force_authenticate(mixed_admin)
        self.assertEqual(mixed_client.get("/api/v1/system/institutions/").status_code, 403)
        mixed_admin.set_password("Synthetic-Mixed-Admin-Password-26!")
        mixed_admin.save()
        login_response = APIClient().post(
            "/api/v1/auth/login/",
            {"username": mixed_admin.username, "password": "Synthetic-Mixed-Admin-Password-26!"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 401)

    @patch(
        "accounts.management.commands.create_system_admin.getpass",
        side_effect=[
            "Synthetic-Global-Admin-Password-26!",
            "Synthetic-Global-Admin-Password-26!",
            "Synthetic-Global-Admin-Password-26!",
            "Synthetic-Global-Admin-Password-26!",
        ],
    )
    def test_local_command_creates_multiple_exclusive_global_admins(self, _getpass):
        call_command(
            "create_system_admin",
            "synthetic-global-one",
            "global-one@example.test",
            stdout=StringIO(),
        )
        call_command(
            "create_system_admin",
            "synthetic-global-two",
            "global-two@example.test",
            stdout=StringIO(),
        )
        self.assertEqual(
            set(
                User.objects.filter(groups__name="system_admin").values_list("username", flat=True)
            ),
            {"synthetic-system-admin", "synthetic-global-one", "synthetic-global-two"},
        )
        self.assertFalse(
            InstitutionMembership.objects.filter(user__groups__name="system_admin").exists()
        )

    def test_new_urgencias_account_activates_and_authenticates_with_institution(self):
        response = self.client.post(
            "/api/v1/system/institutions/", self.institution_payload(), format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        user = User.objects.get(username="synthetic-first-urgencias")
        activation_url = next(
            part for part in mail.outbox[-1].body.split() if "/activar-cuenta?" in part
        )
        query = parse_qs(urlparse(activation_url).query)
        activate = APIClient().post(
            "/api/v1/auth/activate/",
            {
                "uid": str(user.pk),
                "token": query["token"][0],
                "password": "Synthetic-Activated-Password-26!",
                "password_confirmation": "Synthetic-Activated-Password-26!",
            },
            format="json",
        )
        self.assertEqual(activate.status_code, 200, activate.content)
        login_client = APIClient()
        login_response = login_client.post(
            "/api/v1/auth/login/",
            {
                "username": user.username,
                "password": "Synthetic-Activated-Password-26!",
            },
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        current = login_client.get("/api/v1/auth/me/").json()
        self.assertEqual(set(current["groups"]), {"urgencias", "institution_admin"})
        self.assertEqual(current["institutions"][0]["name"], "Hospital Nuevo Demo")
