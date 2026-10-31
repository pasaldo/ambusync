import hashlib
from datetime import timedelta
from io import StringIO
from urllib.parse import parse_qs, urlparse

from django.contrib.auth.models import Group
from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AccountActivation, User
from audit.models import AuditEvent
from emergencies.models import Emergency
from institutions.models import Ambulance, AmbulanceAssignment, Institution, InstitutionMembership


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class InstitutionAccountManagementTests(TestCase):
    def setUp(self):
        self.operator = Institution.objects.create(
            name="Establecimiento Operador Sintético", kind=Institution.Kind.OPERATOR
        )
        self.other_operator = Institution.objects.create(
            name="Otro Operador Sintético", kind=Institution.Kind.OPERATOR
        )
        self.receiver = Institution.objects.create(
            name="Receptor Sintético", kind=Institution.Kind.RECEIVER
        )
        self.ambulance = Ambulance.objects.create(institution=self.operator, code="SYN-01")
        self.other_ambulance = Ambulance.objects.create(
            institution=self.other_operator, code="SYN-02"
        )
        self.admin = User.objects.create_user(
            username="synthetic-institution-admin",
            email="admin@example.test",
            password="Synthetic-Admin-Password-26!",
        )
        admin_group, _ = Group.objects.get_or_create(name="institution_admin")
        self.admin.groups.add(admin_group)
        InstitutionMembership.objects.create(user=self.admin, institution=self.receiver)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def create_account(self, **overrides):
        payload = {
            "username": "synthetic-operator-01",
            "email": "operator01@example.test",
            "groups": ["ambulance"],
            "ambulance_id": str(self.ambulance.pk),
            "institution_id": str(self.operator.pk),
        }
        payload.update(overrides)
        return self.client.post("/api/v1/institutions/management/accounts/", payload, format="json")

    def activation_payload(self, user, email_message=None):
        activation = AccountActivation.objects.get(user=user)
        message = email_message or mail.outbox[-1]
        # The activation URL appears in the message body; locate it without logging the token.
        activation_url = next(part for part in message.body.split() if "/activar-cuenta?" in part)
        query = parse_qs(urlparse(activation_url).query)
        return {
            "uid": str(user.pk),
            "token": query["token"][0],
            "password": "Synthetic-New-Password-26!",
            "password_confirmation": "Synthetic-New-Password-26!",
        }, activation

    def test_creates_pending_account_bound_to_admin_institution_and_sends_activation(self):
        response = self.create_account()

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="synthetic-operator-01")
        self.assertFalse(user.is_active)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(list(user.groups.values_list("name", flat=True)), ["ambulance"])
        self.assertTrue(
            InstitutionMembership.objects.filter(
                user=user, institution=self.operator, active=True
            ).exists()
        )
        self.assertTrue(
            AmbulanceAssignment.objects.filter(
                user=user, ambulance=self.ambulance, active=True
            ).exists()
        )
        self.assertEqual(len(mail.outbox), 1)
        activation = AccountActivation.objects.get(user=user)
        self.assertNotIn(activation.token_digest, mail.outbox[0].body)
        self.assertEqual(
            activation.token_digest,
            hashlib.sha256(self.activation_payload(user)[0]["token"].encode()).hexdigest(),
        )
        audit = AuditEvent.objects.get(action="account.created")
        self.assertEqual(audit.actor, self.admin)
        self.assertEqual(audit.institution, self.operator)
        self.assertIsNone(audit.ambulance)
        self.assertEqual(audit.object_id, str(user.pk))

    def test_urgencias_admin_can_create_an_urgencias_account_in_own_institution(self):
        response = self.create_account(
            username="synthetic-er-user",
            email="er-user@example.test",
            groups=["urgencias"],
            ambulance_id=None,
            institution_id=None,
        )

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="synthetic-er-user")
        self.assertTrue(
            InstitutionMembership.objects.filter(
                user=user, institution=self.receiver, active=True
            ).exists()
        )
        self.assertEqual(list(user.groups.values_list("name", flat=True)), ["urgencias"])
        self.assertFalse(AmbulanceAssignment.objects.filter(user=user, active=True).exists())

    def test_admin_cannot_grant_administration_or_link_another_institution(self):
        escalation = self.create_account(groups=["institution_admin"])
        foreign_unit = self.create_account(ambulance_id=str(self.other_ambulance.pk))

        self.assertEqual(escalation.status_code, 400)
        self.assertEqual(foreign_unit.status_code, 400)
        self.assertFalse(User.objects.filter(username="synthetic-operator-01").exists())
        self.assertEqual(mail.outbox, [])

    def test_only_urgencias_admin_can_create_and_operator_admin_is_denied(self):
        operator_admin = User.objects.create_user(
            username="synthetic-operator-admin", password="unused"
        )
        operator_admin.groups.add(Group.objects.get(name="institution_admin"))
        InstitutionMembership.objects.create(user=operator_admin, institution=self.operator)
        operator_client = APIClient()
        operator_client.force_authenticate(operator_admin)

        response = operator_client.post(
            "/api/v1/institutions/management/accounts/",
            {
                "username": "should-not-be-created",
                "email": "denied@example.test",
                "groups": ["ambulance"],
                "ambulance_id": str(self.ambulance.pk),
                "institution_id": str(self.operator.pk),
            },
            format="json",
        )
        config = operator_client.get("/api/v1/institutions/management/config/").json()

        self.assertEqual(response.status_code, 403)
        self.assertFalse(config["can_create_accounts"])
        self.assertEqual(config["delegable_groups"], [])
        self.assertFalse(User.objects.filter(username="should-not-be-created").exists())

    def test_unauthorized_accounts_are_denied_and_admin_data_is_tenant_scoped(self):
        ordinary = User.objects.create_user(username="synthetic-ordinary", password="unused")
        ordinary_client = APIClient()
        ordinary_client.force_authenticate(ordinary)
        denied = ordinary_client.get("/api/v1/institutions/management/accounts/")

        self.assertEqual(denied.status_code, 403)
        self.assertEqual(
            self.client.get("/api/v1/institutions/management/ambulances/").json(),
            [
                {
                    "id": str(self.ambulance.pk),
                    "code": "SYN-01",
                    "institution_id": str(self.operator.pk),
                    "institution_name": self.operator.name,
                },
                {
                    "id": str(self.other_ambulance.pk),
                    "code": "SYN-02",
                    "institution_id": str(self.other_operator.pk),
                    "institution_name": self.other_operator.name,
                },
            ],
        )

        foreign = User.objects.create_user(username="synthetic-foreign-account", password="unused")
        InstitutionMembership.objects.create(user=foreign, institution=self.other_operator)
        accounts = self.client.get("/api/v1/institutions/management/accounts/").json()
        self.assertEqual({item["id"] for item in accounts}, {str(self.admin.pk)})

    def test_first_institution_admin_is_provisioned_only_for_existing_member(self):
        user = User.objects.create_user(username="synthetic-new-admin", password="unused")
        InstitutionMembership.objects.create(user=user, institution=self.receiver)
        output = StringIO()

        call_command(
            "provision_institution_admin",
            user.username,
            self.receiver.name,
            stdout=output,
        )
        call_command(
            "provision_institution_admin",
            user.username,
            self.receiver.name,
            stdout=StringIO(),
        )

        self.assertTrue(user.groups.filter(name="institution_admin").exists())
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertIn("provisionada", output.getvalue())
        provision_event = AuditEvent.objects.get(action="institution_admin.provisioned")
        self.assertIsNone(provision_event.actor)
        self.assertTrue(provision_event.executor)
        self.assertEqual(provision_event.institution, self.receiver)

    def test_technical_staff_account_cannot_become_institution_admin(self):
        technical = User.objects.create_user(
            username="synthetic-technical-account", password="unused", is_staff=True
        )
        InstitutionMembership.objects.create(user=technical, institution=self.receiver)

        with self.assertRaises(CommandError):
            call_command("provision_institution_admin", technical.username, self.receiver.name)

        self.assertFalse(technical.groups.filter(name="institution_admin").exists())

    def test_account_creation_requires_session_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        csrf = client.get("/api/v1/auth/csrf/")
        client.defaults["HTTP_X_CSRFTOKEN"] = csrf.cookies["csrftoken"].value
        login = client.post(
            "/api/v1/auth/login/",
            {"username": self.admin.username, "password": "Synthetic-Admin-Password-26!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        rotated_csrf = client.get("/api/v1/auth/csrf/").cookies["csrftoken"].value
        payload = {
            "username": "csrf-checked-synthetic-operator",
            "email": "csrf-checked@example.test",
            "groups": ["ambulance"],
            "ambulance_id": str(self.ambulance.pk),
            "institution_id": str(self.operator.pk),
        }

        client.defaults.pop("HTTP_X_CSRFTOKEN")
        without_csrf = client.post(
            "/api/v1/institutions/management/accounts/", payload, format="json"
        )
        client.defaults["HTTP_X_CSRFTOKEN"] = rotated_csrf
        with_csrf = client.post("/api/v1/institutions/management/accounts/", payload, format="json")

        self.assertEqual(without_csrf.status_code, 403)
        self.assertEqual(with_csrf.status_code, 201)

    def test_account_activation_sets_password_and_consumes_single_use_link(self):
        self.assertEqual(self.create_account().status_code, 201)
        user = User.objects.get(username="synthetic-operator-01")
        payload, activation = self.activation_payload(user)
        not_yet_activated = APIClient().post(
            "/api/v1/auth/login/",
            {"username": user.username, "password": payload["password"]},
            format="json",
        )

        response = APIClient().post("/api/v1/auth/activate/", payload, format="json")
        self.assertEqual(not_yet_activated.status_code, 401)
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        activation.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertTrue(user.check_password(payload["password"]))
        self.assertIsNotNone(activation.consumed_at)
        self.assertEqual(
            APIClient().post("/api/v1/auth/activate/", payload, format="json").status_code, 400
        )
        self.assertEqual(
            APIClient()
            .post(
                "/api/v1/auth/login/",
                {"username": user.username, "password": payload["password"]},
                format="json",
            )
            .status_code,
            200,
        )

    def test_expired_or_modified_activation_token_is_rejected(self):
        self.assertEqual(self.create_account().status_code, 201)
        user = User.objects.get(username="synthetic-operator-01")
        payload, activation = self.activation_payload(user)
        activation.expires_at = timezone.now() - timedelta(seconds=1)
        activation.save(update_fields=["expires_at"])

        expired = APIClient().post("/api/v1/auth/activate/", payload, format="json")
        payload["token"] = "modified-synthetic-token"
        modified = APIClient().post("/api/v1/auth/activate/", payload, format="json")

        self.assertEqual(expired.status_code, 400)
        self.assertEqual(modified.status_code, 400)
        self.assertFalse(User.objects.get(pk=user.pk).is_active)

    def test_resending_activation_rotates_the_old_token(self):
        self.assertEqual(self.create_account().status_code, 201)
        user = User.objects.get(username="synthetic-operator-01")
        old_payload, _ = self.activation_payload(user, mail.outbox[0])

        response = self.client.post(
            f"/api/v1/institutions/management/accounts/{user.pk}/resend-activation/",
            {},
            format="json",
        )
        new_payload, _ = self.activation_payload(user, mail.outbox[-1])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(
            APIClient().post("/api/v1/auth/activate/", old_payload, format="json").status_code, 400
        )
        self.assertEqual(
            APIClient().post("/api/v1/auth/activate/", new_payload, format="json").status_code, 200
        )

    def test_activation_email_failure_rolls_back_account_and_audit(self):
        with override_settings(
            EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend", EMAIL_PORT=1
        ):
            response = self.create_account()

        self.assertEqual(response.status_code, 503)
        self.assertFalse(User.objects.filter(username="synthetic-operator-01").exists())
        self.assertFalse(AuditEvent.objects.filter(action="account.created").exists())

    def test_deactivation_revokes_sessions_and_removes_assignment(self):
        self.assertEqual(self.create_account().status_code, 201)
        user = User.objects.get(username="synthetic-operator-01")
        version = user.session_version

        response = self.client.post(
            f"/api/v1/institutions/management/accounts/{user.pk}/deactivate/", {}, format="json"
        )

        self.assertEqual(response.status_code, 204)
        user.refresh_from_db()
        self.assertFalse(user.is_active)
        self.assertEqual(user.session_version, version + 1)
        self.assertFalse(InstitutionMembership.objects.get(user=user).active)
        assignment = AmbulanceAssignment.objects.get(user=user)
        self.assertFalse(assignment.active)
        self.assertIsNotNone(assignment.unassigned_at)
        self.assertTrue(
            AuditEvent.objects.filter(action="account.deactivated", object_id=str(user.pk)).exists()
        )

    def test_deactivating_pending_invitation_invalidates_its_activation_link(self):
        self.assertEqual(self.create_account().status_code, 201)
        user = User.objects.get(username="synthetic-operator-01")
        payload, _ = self.activation_payload(user)
        deactivated = self.client.post(
            f"/api/v1/institutions/management/accounts/{user.pk}/deactivate/", {}, format="json"
        )

        activation = APIClient().post("/api/v1/auth/activate/", payload, format="json")

        self.assertEqual(deactivated.status_code, 204)
        self.assertEqual(activation.status_code, 400)
        user.refresh_from_db()
        self.assertFalse(user.is_active)

    def test_cannot_deactivate_self_and_preserves_another_admin(self):
        self_member = self.client.post(
            f"/api/v1/institutions/management/accounts/{self.admin.pk}/deactivate/",
            {},
            format="json",
        )
        other_admin = User.objects.create_user(username="synthetic-admin-two", password="unused")
        other_admin.groups.add(Group.objects.get(name="institution_admin"))
        InstitutionMembership.objects.create(user=other_admin, institution=self.receiver)
        last_admin = self.client.post(
            f"/api/v1/institutions/management/accounts/{other_admin.pk}/deactivate/",
            {},
            format="json",
        )

        self.assertEqual(self_member.status_code, 400)
        self.assertEqual(last_admin.status_code, 204)
        other_admin.refresh_from_db()
        self.assertFalse(other_admin.is_active)
        self.assertTrue(self.admin.is_active)

    def test_cannot_deactivate_last_operator_for_ambulance_with_active_cases(self):
        self.assertEqual(self.create_account().status_code, 201)
        operator = User.objects.get(username="synthetic-operator-01")
        payload, _ = self.activation_payload(operator)
        APIClient().post("/api/v1/auth/activate/", payload, format="json")
        Emergency.objects.create(
            operating_institution=self.operator,
            destination=self.receiver,
            ambulance=self.ambulance,
            created_by=operator,
            status=Emergency.Status.NOTIFIED,
            patient_identity_unknown=True,
            reason="Motivo de prueba sintético",
        )

        response = self.client.post(
            f"/api/v1/institutions/management/accounts/{operator.pk}/deactivate/", {}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        operator.refresh_from_db()
        self.assertTrue(operator.is_active)
