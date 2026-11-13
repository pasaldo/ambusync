import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from io import StringIO
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core.management import call_command
from django.db import close_old_connections, connection, connections
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from emergencies import tests_updates
from emergencies.models import Emergency
from institutions.models import AmbulanceAssignment, Institution, InstitutionMembership


class ReportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(cls)
        cls.foreign = Institution.objects.create(name="Receptor ajeno sintético H", kind="receiver")

    def get(self, path="/api/v1/reports/emergencies/", actor=None):
        client = APIClient()
        client.force_authenticate(actor or self.receiver)
        return client.get(path)

    def grant(self, actor=None):
        (actor or self.receiver).groups.add(Group.objects.get_or_create(name="view_reports")[0])

    def make_episode(self, **extra):
        return Emergency.objects.create(
            operating_institution=self.institution,
            destination=extra.pop("destination", self.institution),
            ambulance=self.unit,
            created_by=self.operator,
            patient_identity_unknown=True,
            reason="Caso sintético H",
            **extra,
        )

    def test_reports_require_explicit_permission_and_own_destination(self):
        self.assertEqual(self.get().status_code, 403)
        self.grant()
        self.assertEqual(self.get().status_code, 200)
        self.assertEqual(self.get(actor=self.operator).status_code, 403)
        alien = self.make_episode(destination=self.foreign, status="cerrada")
        self.assertEqual(self.get(f"/api/v1/reports/emergencies/{alien.pk}/").status_code, 404)

    def test_terminal_list_excluded_but_urgencias_keeps_basic_detail(self):
        terminal = self.make_episode(status="cerrada")
        for actor in (self.operator, self.receiver):
            response = self.get("/api/v1/emergencies/", actor)
            self.assertNotIn(str(terminal.pk), [row["id"] for row in response.json()["results"]])
            self.assertEqual(
                self.get(f"/api/v1/emergencies/{terminal.pk}/", actor).status_code,
                200 if actor == self.receiver else 404,
            )
        self.grant()
        self.assertEqual(self.get(f"/api/v1/emergencies/{terminal.pk}/").status_code, 200)
        self.assertEqual(self.get(f"/api/v1/reports/emergencies/{terminal.pk}/").status_code, 200)

    def test_operational_list_never_downloads_entire_history_even_for_report_reader(self):
        terminal = self.make_episode(status="cerrada")
        self.grant()
        ids = [row["id"] for row in self.get("/api/v1/emergencies/").json()["results"]]
        self.assertNotIn(str(terminal.pk), ids)

    def test_legacy_report_detail_and_operational_list_are_private_no_store(self):
        terminal = self.make_episode(status="cerrada")
        self.grant()
        for path in ("/api/v1/emergencies/", f"/api/v1/emergencies/{terminal.pk}/"):
            result = self.get(path)
            self.assertEqual(result.status_code, 200)
            self.assertIn("no-store", result.get("Cache-Control", ""))

    def test_combined_roles_cannot_read_own_units_terminal_at_other_destination(self):
        self.receiver.groups.add(Group.objects.get(name="ambulance"))
        AmbulanceAssignment.objects.create(user=self.receiver, ambulance=self.unit)
        self.grant()
        terminal = self.make_episode(destination=self.foreign, status="cancelada")
        self.assertEqual(self.get(f"/api/v1/emergencies/{terminal.pk}/").status_code, 404)
        self.assertEqual(self.get(f"/api/v1/reports/emergencies/{terminal.pk}/").status_code, 404)

    def test_revoked_membership_and_disabled_destination_fail_closed(self):
        self.grant()
        InstitutionMembership.objects.filter(user=self.receiver).update(active=False)
        self.assertEqual(self.get().status_code, 403)
        InstitutionMembership.objects.filter(user=self.receiver).update(active=True)
        Institution.objects.filter(pk=self.institution.pk).update(enabled=False)
        self.assertEqual(self.get().status_code, 403)

    def test_summary_covers_all_filtered_rows_and_pages_have_stable_order(self):
        self.grant()
        for _ in range(27):
            self.make_episode(status="cerrada", triage="C2")
        self.make_episode(status="cancelada", triage="C1", destination=self.foreign)
        result = self.get("/api/v1/reports/emergencies/?status=cerrada&triage=C2&page_size=10")
        self.assertEqual(result.status_code, 200)
        data = result.json()
        self.assertEqual(data["count"], 27)
        self.assertEqual(len(data["results"]), 10)
        self.assertEqual(data["summary"]["total"], 27)
        self.assertEqual(data["summary"]["by_status"]["cerrada"], 27)
        self.assertEqual(data["summary"]["by_triage"]["C2"], 27)
        self.assertEqual(data["timezone"], "America/Santiago")
        self.assertEqual(data["date_basis"], "created_at")
        self.assertIsNotNone(data["next"])
        second = self.get(
            "/api/v1/reports/emergencies/?status=cerrada&triage=C2&page_size=10&page=2"
        ).json()
        self.assertFalse(
            {row["id"] for row in data["results"]} & {row["id"] for row in second["results"]}
        )

    def test_date_boundaries_and_strict_filters(self):
        self.grant()
        before = self.make_episode(status="cerrada")
        inside = self.make_episode(status="cerrada")
        Emergency.objects.filter(pk=before.pk).update(
            created_at=datetime(2026, 11, 13, 2, 59, 59, tzinfo=UTC)
        )
        Emergency.objects.filter(pk=inside.pk).update(
            created_at=datetime(2026, 11, 13, 3, 0, tzinfo=UTC)
        )
        path = "/api/v1/reports/emergencies/"
        response = self.get(f"{path}?date_from=2026-11-13&date_to=2026-11-13&status=cerrada")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.json()["results"]], [str(inside.pk)])
        for query in (
            "patient_alias=synthetic",
            "status=wrong",
            "triage=wrong",
            "date_from=2026-02-30",
            "date_from=2026-11-14&date_to=2026-11-13",
            "ambulance_id=bad",
            "page=0",
            "page_size=101",
            "status=cerrada&status=cancelada",
        ):
            self.assertEqual(self.get(f"{path}?{query}").status_code, 400, query)
        self.assertEqual(self.get(f"{path}?ambulance_id={uuid.uuid4()}").status_code, 404)

    def test_local_grant_and_private_response(self):
        call_command(
            "grant_pilot_permissions", self.receiver.username, view_reports=True, stdout=StringIO()
        )
        result = self.get()
        self.assertEqual(result.status_code, 200)
        self.assertIn("no-store", result["Cache-Control"])
        self.assertTrue(self.receiver.groups.filter(name="view_reports").exists())

    def test_daylight_saving_date_range_and_unclassified_bucket(self):
        self.grant()
        inside = self.make_episode(status="cerrada", triage="")
        next_day = self.make_episode(status="cerrada", triage="C1")
        # Spring DST: Santiago's 2026-09-06 starts at 01:00 local (04:00 UTC).
        Emergency.objects.filter(pk=inside.pk).update(
            created_at=datetime(2026, 9, 6, 4, 0, tzinfo=UTC)
        )
        Emergency.objects.filter(pk=next_day.pk).update(
            created_at=datetime(2026, 9, 7, 3, 0, tzinfo=UTC)
        )
        data = self.get(
            "/api/v1/reports/emergencies/?date_from=2026-09-06&date_to=2026-09-06&triage=unclassified"
        ).json()
        self.assertEqual([row["id"] for row in data["results"]], [str(inside.pk)])
        self.assertEqual(data["summary"]["by_triage"]["unclassified"], 1)

    def test_disallowed_profiles_cannot_obtain_reports_by_extra_group_alone(self):
        for name in ("institution_admin", "system_admin"):
            self.operator.groups.add(Group.objects.get_or_create(name=name)[0])
            self.grant(self.operator)
            self.assertEqual(self.get(actor=self.operator).status_code, 403)
        self.assertEqual(self.get(actor=self.operator).status_code, 403)


class ReportSnapshotTests(TransactionTestCase):
    get = ReportTests.get
    grant = ReportTests.grant
    make_episode = ReportTests.make_episode

    def setUp(self):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(type(self))
        self.grant()

    def test_summary_and_page_share_read_only_repeatable_snapshot_during_creation(self):
        from emergencies.views import EmergencyPagination

        original = EmergencyPagination.paginate_queryset
        observed = []

        def create_concurrently():
            close_old_connections()
            try:
                self.make_episode(status="cerrada")
            finally:
                connections.close_all()

        def paginate(paginator, query, request, view=None):
            with connection.cursor() as cursor:
                cursor.execute("SHOW transaction_isolation")
                observed.append(cursor.fetchone()[0])
                cursor.execute("SHOW transaction_read_only")
                observed.append(cursor.fetchone()[0])
            with ThreadPoolExecutor(max_workers=1) as pool:
                pool.submit(create_concurrently).result(timeout=15)
            return original(paginator, query, request, view=view)

        with patch.object(
            EmergencyPagination, "paginate_queryset", autospec=True, side_effect=paginate
        ):
            result = self.get()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(observed, ["repeatable read", "on"])
        self.assertEqual(result.json()["summary"]["total"], 1)
        self.assertEqual(result.json()["count"], 1)
        self.assertEqual(len(result.json()["results"]), 1)
        self.assertEqual(Emergency.objects.count(), 2)
