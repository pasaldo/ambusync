import uuid

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from emergencies.models import Emergency
from institutions.models import Ambulance, AmbulanceAssignment, Institution, InstitutionMembership


class EmergencyFlowTests(TestCase):
    def setUp(self):
        self.operator_institution = Institution.objects.create(
            name="Operadora sintética", kind="operator"
        )
        self.receiver = Institution.objects.create(name="Receptora sintética", kind="receiver")
        self.other_receiver = Institution.objects.create(
            name="Otra receptora sintética", kind="receiver"
        )
        self.ambulance = Ambulance.objects.create(
            institution=self.operator_institution, code="SIM-01"
        )

        self.ambulance_group = Group.objects.create(name="ambulance")
        self.urgencias_group = Group.objects.create(name="urgencias")

        self.operator = User.objects.create_user(
            username="synthetic-operator", password="local-test-password"
        )
        self.operator.groups.add(self.ambulance_group)
        InstitutionMembership.objects.create(
            user=self.operator, institution=self.operator_institution
        )
        AmbulanceAssignment.objects.create(user=self.operator, ambulance=self.ambulance)

        self.receiver_user = User.objects.create_user(
            username="synthetic-receiver", password="local-test-password"
        )
        self.receiver_user.groups.add(self.urgencias_group)
        InstitutionMembership.objects.create(user=self.receiver_user, institution=self.receiver)

        self.other_user = User.objects.create_user(
            username="synthetic-outsider", password="local-test-password"
        )
        self.other_user.groups.add(self.urgencias_group)
        InstitutionMembership.objects.create(user=self.other_user, institution=self.other_receiver)

        self.client = APIClient(enforce_csrf_checks=True)

    def payload(self, **updates):
        payload = {
            "operation_id": str(uuid.uuid4()),
            "destination_id": str(self.receiver.pk),
            "transfer_started": False,
            "patient_identity_unknown": True,
            "reason": "Caso sintético de prueba",
        }
        payload.update(updates)
        return payload

    def authenticate_with_csrf(self, user):
        self.client.force_login(user)
        response = self.client.get("/api/v1/auth/csrf/")
        self.assertEqual(response.status_code, 200)
        self.client.defaults["HTTP_X_CSRFTOKEN"] = response.cookies["csrftoken"].value

    def test_login_requires_csrf_and_returns_generic_failure(self):
        response = self.client.post(
            "/api/v1/auth/login/",
            {"username": self.operator.username, "password": "wrong"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "csrf_failed")

        csrf = self.client.get("/api/v1/auth/csrf/")
        self.client.defaults["HTTP_X_CSRFTOKEN"] = csrf.cookies["csrftoken"].value
        response = self.client.post(
            "/api/v1/auth/login/",
            {"username": self.operator.username, "password": "wrong"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "credentials_invalid")
        self.assertNotIn("synthetic-operator", str(response.data))

    def test_login_me_and_logout_use_the_session(self):
        csrf = self.client.get("/api/v1/auth/csrf/")
        self.client.defaults["HTTP_X_CSRFTOKEN"] = csrf.cookies["csrftoken"].value
        login_response = self.client.post(
            "/api/v1/auth/login/",
            {"username": self.operator.username, "password": "local-test-password"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200, login_response.data)

        current_user = self.client.get("/api/v1/auth/me/")
        self.assertEqual(current_user.status_code, 200)
        self.assertIn("ambulance", current_user.data["groups"])
        self.assertLess(
            current_user.data["session"]["started_at"],
            current_user.data["session"]["absolute_expires_at"],
        )
        destinations = self.client.get("/api/v1/institutions/destinations/")
        self.assertEqual(destinations.status_code, 200)
        self.assertIn(str(self.receiver.pk), [item["id"] for item in destinations.data])

        refreshed_csrf = self.client.get("/api/v1/auth/csrf/")
        self.client.defaults["HTTP_X_CSRFTOKEN"] = refreshed_csrf.cookies["csrftoken"].value
        logout_response = self.client.post("/api/v1/auth/logout/", {}, format="json")
        self.assertEqual(logout_response.status_code, 204)
        self.assertNotEqual(self.client.get("/api/v1/auth/me/").status_code, 200)

    def test_create_is_idempotent_and_visible_only_in_authorized_scope(self):
        self.authenticate_with_csrf(self.operator)
        payload = self.payload(transfer_started=True)
        first = self.client.post("/api/v1/emergencies/", payload, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["status"], Emergency.Status.IN_TRANSIT)
        emergency_id = first.data["id"]

        replay = self.client.post("/api/v1/emergencies/", payload, format="json")
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(replay["Idempotent-Replay"], "true")
        self.assertEqual(Emergency.objects.count(), 1)
        self.assertEqual(AuditEvent.objects.count(), 1)
        audit = AuditEvent.objects.get()
        self.assertEqual(audit.action, "emergency.created")
        self.assertEqual(audit.object_id, uuid.UUID(emergency_id))

        receiver_client = APIClient()
        receiver_client.force_login(self.receiver_user)
        self.assertEqual(
            receiver_client.get(f"/api/v1/emergencies/{emergency_id}/").status_code, 200
        )
        receiver_list = receiver_client.get("/api/v1/emergencies/")
        self.assertEqual(receiver_list.status_code, 200)
        self.assertEqual([item["id"] for item in receiver_list.data["results"]], [emergency_id])

        outsider_client = APIClient()
        outsider_client.force_login(self.other_user)
        self.assertEqual(
            outsider_client.get(f"/api/v1/emergencies/{emergency_id}/").status_code, 404
        )

        AmbulanceAssignment.objects.filter(user=self.operator).update(active=False)
        replay_after_revocation = self.client.post("/api/v1/emergencies/", payload, format="json")
        self.assertEqual(replay_after_revocation.status_code, 403)

    def test_same_operation_id_with_different_payload_conflicts(self):
        self.authenticate_with_csrf(self.operator)
        operation_id = str(uuid.uuid4())
        first = self.client.post(
            "/api/v1/emergencies/",
            self.payload(operation_id=operation_id),
            format="json",
        )
        self.assertEqual(first.status_code, 201, first.data)

        second = self.client.post(
            "/api/v1/emergencies/",
            self.payload(
                operation_id=operation_id,
                reason="Otro caso sintético",
                vitals={"hr": 70, "taken_at": "2026-10-29T17:00:00Z"},
            ),
            format="json",
        )
        self.assertEqual(second.status_code, 409, second.data)
        self.assertEqual(Emergency.objects.count(), 1)

    def test_same_operation_id_with_different_vitals_conflicts(self):
        self.authenticate_with_csrf(self.operator)
        operation_id = str(uuid.uuid4())
        measured_at = "2026-10-29T17:00:00Z"
        first = self.client.post(
            "/api/v1/emergencies/",
            self.payload(
                operation_id=operation_id,
                vitals={"hr": 80, "taken_at": measured_at},
            ),
            format="json",
        )
        self.assertEqual(first.status_code, 201, first.data)

        replay_with_changed_vitals = self.client.post(
            "/api/v1/emergencies/",
            self.payload(
                operation_id=operation_id,
                vitals={"hr": 81, "taken_at": measured_at},
            ),
            format="json",
        )
        self.assertEqual(replay_with_changed_vitals.status_code, 409)
        self.assertEqual(Emergency.objects.count(), 1)

    def test_operator_without_active_unit_cannot_create(self):
        self.authenticate_with_csrf(self.operator)
        AmbulanceAssignment.objects.filter(user=self.operator).update(active=False)
        response = self.client.post("/api/v1/emergencies/", self.payload(), format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Emergency.objects.count(), 0)

    def test_receiver_cannot_list_operational_destinations(self):
        client = APIClient()
        client.force_login(self.receiver_user)
        response = client.get("/api/v1/institutions/destinations/")
        self.assertEqual(response.status_code, 403)

    def test_unknown_create_fields_are_rejected(self):
        self.authenticate_with_csrf(self.operator)
        response = self.client.post(
            "/api/v1/emergencies/",
            self.payload(unapproved_field="must not be silently accepted"),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "validation_error")
