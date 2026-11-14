import uuid

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from audit.models import AuditEvent
from emergencies import tests_updates
from institutions.models import Institution, InstitutionMembership


class AdministrativeHistoryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(cls)
        cls.receiver.groups.add(Group.objects.get_or_create(name="institution_admin")[0])
        cls.foreign = Institution.objects.create(
            name="Institución ajena sintética H", kind="receiver"
        )

    def event(self, action="account.created", institution=None, **extra):
        return AuditEvent.objects.create(
            institution=institution or self.institution,
            actor=self.receiver,
            action=action,
            object_type="account",
            object_id="synthetic-account",
            result="success",
            correlation_id=uuid.uuid4(),
            **extra,
        )

    def get(self, query="", actor=None):
        client = APIClient()
        client.force_authenticate(actor or self.receiver)
        return client.get(f"/api/v1/institutions/audit/{query}")

    def test_admin_audit_excludes_clinical_and_foreign_events_even_with_manipulated_filters(self):
        own = self.event()
        self.event(institution=self.foreign)
        self.event(action="emergency.patient_context_corrected")
        result = self.get()
        self.assertEqual(result.status_code, 200)
        self.assertEqual([row["id"] for row in result.json()["results"]], [str(own.pk)])
        self.assertEqual(self.get("?action=emergency.patient_context_corrected").status_code, 400)
        self.assertEqual(self.get("?institution_id=" + str(self.foreign.pk)).status_code, 400)
        self.assertEqual(self.get(actor=self.operator).status_code, 403)
        # Removing the clinical role must not remove administrative-only rights.
        self.receiver.groups.remove(Group.objects.get(name="urgencias"))
        self.assertEqual(self.get().status_code, 200)
        self.assertEqual(self.get("?object_type=patient").status_code, 400)

    def test_minimal_projection_drops_executor_and_all_free_text(self):
        self.event()
        AuditEvent.objects.create(
            institution=self.institution,
            executor="sensitive synthetic diagnostic not for UI",
            action="permission.view_reports_granted",
            object_type="account",
            object_id="synthetic-target",
            result="success",
            correlation_id=uuid.uuid4(),
        )
        result = self.get()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(
            set(result.json()["results"][0]),
            {
                "id",
                "actor_id",
                "occurred_at",
                "action",
                "object_type",
                "object_id",
                "result",
                "correlation_id",
                "display",
            },
        )
        self.assertIn("no-store", result["Cache-Control"])
        self.assertNotContains(result, "sensitive synthetic")

    def test_action_with_wrong_object_type_never_enters_admin_audit(self):
        event = self.event()
        AuditEvent.objects.filter(pk=event.pk).update(object_type="patient")
        self.assertEqual(self.get().json()["count"], 0)

    def test_recovery_events_are_minimal_readable_administrative_actions(self):
        for action in ("account.recovery_requested", "account.password_recovered"):
            event = self.event(action=action)
            AuditEvent.objects.filter(pk=event.pk).update(object_id=str(self.operator.pk))
        response = self.get()
        self.assertEqual(response.json()["count"], 2)
        self.assertEqual(
            response.json()["results"][0]["display"]["account"], self.operator.username
        )
        self.assertNotContains(response, "token_digest")

    def test_pagination_filters_and_revocation(self):
        for _ in range(28):
            self.event()
        result = self.get("?page_size=10&action=account.created")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["count"], 28)
        self.assertEqual(len(result.json()["results"]), 10)
        self.assertIsNotNone(result.json()["next"])
        for query in (
            "?page_size=101",
            "?action=account.created&action=account.activated",
            "?date_from=2026-02-30",
            "?executor=foo",
        ):
            self.assertEqual(self.get(query).status_code, 400)
        InstitutionMembership.objects.filter(user=self.receiver).update(active=False)
        self.assertEqual(self.get().status_code, 403)

    def test_readable_account_references_are_current_local_and_keep_inactive_accounts(self):
        event = self.event()
        AuditEvent.objects.filter(pk=event.pk).update(object_id=str(self.operator.pk))
        InstitutionMembership.objects.filter(user=self.operator).update(active=False)
        data = self.get().json()["results"][0]
        self.assertEqual(data["display"]["actor"], self.receiver.username)
        self.assertEqual(data["display"]["account"], self.operator.username)
        self.assertEqual(data["display"]["reference_basis"], "current_records")
        type(self.operator).objects.filter(pk=self.operator.pk).update(
            username="synthetic-renamed-current"
        )
        self.assertEqual(
            self.get().json()["results"][0]["display"]["account"], "synthetic-renamed-current"
        )

    def test_readable_references_never_reveal_foreign_or_transferred_usernames_or_executor(self):
        event = self.event()
        InstitutionMembership.objects.filter(user=self.operator).update(active=False)
        InstitutionMembership.objects.create(user=self.operator, institution=self.foreign)
        AuditEvent.objects.filter(pk=event.pk).update(
            actor=self.operator, object_id=str(self.operator.pk)
        )
        result = self.get()
        self.assertNotContains(result, self.operator.username)
        self.assertIn("no disponible", result.json()["results"][0]["display"]["account"])
        self.assertIn("fuera", result.json()["results"][0]["display"]["actor"])
        AuditEvent.objects.filter(pk=event.pk).update(actor=None, executor="SECRET-HOST-EXECUTOR")
        result = self.get()
        self.assertEqual(result.json()["results"][0]["display"]["actor"], "Proceso técnico")
        self.assertNotContains(result, "SECRET-HOST-EXECUTOR")

    def test_readable_assignment_resolves_event_assignment_not_current_assignment(self):
        from institutions.models import AmbulanceAssignment

        assignment = AmbulanceAssignment.objects.get(user=self.operator, active=True)
        assignment.active = False
        assignment.save()
        event = self.event(action="ambulance.assignment_ended")
        AuditEvent.objects.filter(pk=event.pk).update(
            object_type="ambulance_assignment", object_id=str(assignment.pk), ambulance=self.unit
        )
        data = self.get().json()["results"][0]["display"]
        self.assertEqual(data["account"], self.operator.username)
        self.assertEqual(data["unit"], self.unit.code)
        AuditEvent.objects.filter(pk=event.pk).update(ambulance=self.other_unit)
        data = self.get().json()["results"][0]["display"]
        self.assertNotEqual(data["account"], self.operator.username)

    def test_reference_resolution_is_batched_and_exact_to_each_event_institution(self):
        from audit.presentation import administrative_displays
        from institutions.models import Ambulance, AmbulanceAssignment

        assignment = AmbulanceAssignment.objects.get(user=self.operator, active=True)
        event = self.event(action="ambulance.assignment_started")
        AuditEvent.objects.filter(pk=event.pk).update(
            object_type="ambulance_assignment", object_id=str(assignment.pk), ambulance=self.unit
        )
        event.refresh_from_db()
        with self.assertNumQueries(4):
            display = administrative_displays([event] * 25)[event.pk]
        self.assertEqual(display["account"], self.operator.username)
        foreign_unit = Ambulance.objects.create(
            institution=self.foreign, code="SECRET-FOREIGN-UNIT"
        )
        AuditEvent.objects.filter(pk=event.pk).update(ambulance=foreign_unit)
        event.refresh_from_db()
        # Even a page containing events from both institutions cannot union their labels.
        foreign_event = self.event(institution=self.foreign)
        foreign_event.object_id = str(self.receiver.pk)
        data = administrative_displays([event, foreign_event])
        self.assertNotIn("SECRET-FOREIGN-UNIT", str(data[event.pk]))
        self.assertNotIn(self.receiver.username, str(data[foreign_event.pk]))
