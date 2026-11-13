from datetime import UTC, datetime

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from emergencies import tests_updates
from emergencies.models import Emergency
from institutions.models import AmbulanceAssignment, Institution, InstitutionMembership


class EmergencyHistoryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(cls)
        cls.foreign = Institution.objects.create(
            name="Destino ajeno sintético archivo", kind="receiver"
        )
        cls.closed = Emergency.objects.create(
            operating_institution=cls.institution,
            destination=cls.institution,
            ambulance=cls.unit,
            created_by=cls.operator,
            status="cerrada",
            patient_identity_unknown=True,
            reason="Histórico sintético previo",
        )

    def get(self, path="/api/v1/emergencies/history/", actor=None):
        client = APIClient()
        client.force_authenticate(actor or self.receiver)
        return client.get(path)

    def test_normal_urgencias_has_history_without_reports_or_audit_permissions(self):
        result = self.get()
        self.assertEqual(result.status_code, 200)
        self.assertEqual([row["id"] for row in result.json()["results"]], [str(self.closed.pk)])
        self.assertNotIn("summary", result.json())
        self.assertEqual(
            result.json()["ambulances"], [{"id": str(self.unit.pk), "code": self.unit.code}]
        )
        self.assertEqual(self.get(f"/api/v1/emergencies/{self.closed.pk}/").status_code, 200)
        self.assertEqual(self.get("/api/v1/reports/emergencies/").status_code, 403)
        self.assertEqual(self.get("/api/v1/institutions/audit/").status_code, 403)
        self.receiver.groups.add(Group.objects.get_or_create(name="institution_admin")[0])
        self.assertEqual(self.get().status_code, 200)
        self.assertEqual(self.get("/api/v1/institutions/audit/").status_code, 200)
        self.assertEqual(self.get("/api/v1/reports/emergencies/").status_code, 403)

    def test_nonclinical_admin_and_ambulance_do_not_gain_clinical_history(self):
        self.assertEqual(self.get(actor=self.operator).status_code, 403)
        self.assertEqual(
            self.get(f"/api/v1/emergencies/{self.closed.pk}/", self.operator).status_code, 404
        )
        self.receiver.groups.remove(Group.objects.get(name="urgencias"))
        self.receiver.groups.add(Group.objects.get_or_create(name="institution_admin")[0])
        self.assertEqual(self.get().status_code, 403)
        self.assertEqual(self.get(f"/api/v1/emergencies/{self.closed.pk}/").status_code, 404)
        self.assertEqual(self.get("/api/v1/institutions/audit/").status_code, 200)

    def test_destination_scope_remains_independent_from_ambulance_assignment(self):
        self.receiver.groups.add(Group.objects.get(name="ambulance"))
        AmbulanceAssignment.objects.create(user=self.receiver, ambulance=self.unit)
        Emergency.objects.filter(pk=self.closed.pk).update(destination=self.foreign)
        self.assertEqual(self.get().json()["count"], 0)
        self.assertEqual(self.get(f"/api/v1/emergencies/{self.closed.pk}/").status_code, 404)
        InstitutionMembership.objects.filter(user=self.receiver).update(active=False)
        self.assertEqual(self.get().status_code, 403)

    def test_archive_filters_use_event_date_not_creation_date_and_are_paginated(self):
        Emergency.objects.filter(pk=self.closed.pk).update(
            created_at=datetime(2025, 1, 1, 12, tzinfo=UTC),
            closed_at=datetime(2026, 11, 14, 2, 0, tzinfo=UTC),
        )
        result = self.get("/api/v1/emergencies/history/?day=13&month=11&year=2026&status=cerrada")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["count"], 1)
        self.assertEqual(result.json()["date_basis"], "event_date")
        self.assertIn("event_date", result.json()["results"][0])
        self.assertIn("no-store", result["Cache-Control"])
        for query in (
            "day=32",
            "month=13",
            "day=30&month=2",
            "year=0",
            "status=notificada",
            "triage=C2",
            "day=1&day=2",
        ):
            self.assertEqual(
                self.get("/api/v1/emergencies/history/?" + query).status_code, 400, query
            )
        for _ in range(27):
            self.closed.pk = None
            self.closed.save(force_insert=True)
        page = self.get("/api/v1/emergencies/history/?page_size=10").json()
        self.assertEqual(page["count"], 28)
        self.assertEqual(len(page["results"]), 10)
        self.assertIsNotNone(page["next"])

    def test_event_fallbacks_arrivals_dst_and_disabled_destination(self):
        Emergency.objects.filter(pk=self.closed.pk).update(
            status="cancelada",
            created_at=datetime(2025, 1, 1, 12, tzinfo=UTC),
            cancelled_at=datetime(2026, 9, 6, 4, 0, tzinfo=UTC),
        )
        path = "/api/v1/emergencies/history/"
        data = self.get(path + "?day=6&month=9&year=2026&status=cancelada").json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(self.get(path + "?day=5&month=9&year=2026").json()["count"], 0)
        Emergency.objects.filter(pk=self.closed.pk).update(
            status="llegado", arrived_at=datetime(2026, 2, 28, 12, tzinfo=UTC)
        )
        self.assertEqual(self.get().json()["count"], 0)
        self.assertEqual(self.get(path + "?status=llegado&month=2").json()["count"], 1)
        Emergency.objects.filter(pk=self.closed.pk).update(status="cerrada", closed_at=None)
        self.assertEqual(self.get(path + "?day=28&month=2&year=2026").json()["count"], 1)
        Emergency.objects.filter(pk=self.closed.pk).update(arrived_at=None)
        self.assertEqual(self.get(path + "?year=2025").json()["count"], 1)
        for query in (
            "day=29&month=2&year=2026",
            "date_from=2026-01-01",
            "page_size=101",
            "page=0",
        ):
            self.assertEqual(self.get(path + "?" + query).status_code, 400, query)
        Institution.objects.filter(pk=self.institution.pk).update(enabled=False)
        self.assertEqual(self.get().status_code, 403)

    def test_archive_unit_filter_options_are_destination_scoped_and_paginated(self):
        from institutions.models import Ambulance

        other = Ambulance.objects.create(institution=self.institution, code="SYN-HISTORY-OTHER")
        foreign = Ambulance.objects.create(institution=self.foreign, code="SYN-FOREIGN-HIDDEN")
        for unit, destination in ((other, self.institution), (foreign, self.foreign)):
            Emergency.objects.create(
                operating_institution=unit.institution,
                destination=destination,
                ambulance=unit,
                created_by=self.operator,
                status="cancelada",
                patient_identity_unknown=True,
                reason="Caso sintético filtro de unidad",
            )
        path = "/api/v1/emergencies/history/"
        result = self.get(path + f"?ambulance_id={self.unit.pk}&page_size=1")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["count"], 1)
        self.assertEqual(result.json()["results"][0]["ambulance_id"], str(self.unit.pk))
        self.assertEqual(
            {row["id"] for row in result.json()["ambulances"]}, {str(self.unit.pk), str(other.pk)}
        )
        self.assertNotContains(result, "SYN-FOREIGN-HIDDEN")
        self.assertNotIn("summary", result.json())
        self.assertEqual(self.get(path + "?ambulance_id=invalid").status_code, 400)
        self.assertEqual(self.get(path + f"?ambulance_id={foreign.pk}").status_code, 404)
        Ambulance.objects.filter(pk=other.pk).update(enabled=False)
        self.assertEqual(self.get(path + f"?ambulance_id={other.pk}").status_code, 200)
