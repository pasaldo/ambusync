import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from importlib import import_module
from io import StringIO
from threading import Barrier, Event
from types import SimpleNamespace
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.db import close_old_connections, connection, connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditEvent, PilotClosure
from emergencies import models, tests_updates
from institutions.models import Institution, InstitutionMembership


class PatientCatalogTests(TestCase):
    def test_new_patient_resource_responses_explicitly_forbid_browser_cache_storage(self):
        first = self.patient()
        listing = self.request("get", "/api/v1/patients/")
        update = self.request(
            "post",
            f"/api/v1/patients/{first['patient_id']}/update/",
            self.operation(patient_identity_unknown=True),
        )
        for response in (listing, update):
            self.assertIn("no-store", response.get("Cache-Control", ""))
            self.assertIn("private", response.get("Cache-Control", ""))

    @classmethod
    def setUpTestData(cls):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(cls)
        cls.destination = Institution.objects.create(
            name="Otro receptor sintético G", kind="receiver"
        )

    def request(self, method, path, body=None, actor=None):
        client = APIClient()
        client.force_authenticate(actor or self.operator)
        return (
            getattr(client, method)(path, body, format="json")
            if body is not None
            else getattr(client, method)(path)
        )

    def operation(self, version=1, **fields):
        return {"operation_id": str(uuid.uuid4()), "expected_version": version, **fields}

    def create(self, **fields):
        return self.request(
            "post",
            "/api/v1/emergencies/",
            {
                "operation_id": str(uuid.uuid4()),
                "destination_id": str(self.institution.pk),
                "patient_identity_unknown": False,
                "patient_alias": "Paciente sintético G",
                "age_value": 8,
                "age_unit": "months",
                "reason": "Caso sintético G",
                **fields,
            },
        )

    def patient(self):
        result = self.create()
        self.assertEqual(result.status_code, 201)
        self.assertIsNotNone(result.json().get("patient_id"))
        return result.json()

    def grant(self, actor, name):
        actor.groups.add(Group.objects.get_or_create(name=name)[0])

    def test_create_new_patient_and_reuse_only_copies_identification_snapshot(self):
        first = self.patient()
        response = self.create(
            patient_id=first["patient_id"],
            patient_version=1,
            patient_identity_unknown=None,
            patient_alias=None,
            age_value=None,
            age_unit=None,
        )
        self.assertEqual(
            response.status_code, 400, "selected patient must not accept client snapshot overrides"
        )
        response = self.request(
            "post",
            "/api/v1/emergencies/",
            {
                "operation_id": str(uuid.uuid4()),
                "patient_id": first["patient_id"],
                "patient_version": 1,
                "destination_id": str(self.destination.pk),
                "reason": "Otro episodio sin heredar antecedentes",
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["patient"], first["patient"])
        self.assertEqual(response.json()["patient_id"], first["patient_id"])
        self.assertEqual(response.json()["symptoms"], [])
        self.assertEqual(response.json()["vital_measurements"], [])
        self.assertEqual(models.Patient.objects.count(), 1)

    def test_directory_is_only_assigned_unit_and_never_available_to_receiver(self):
        first = self.patient()
        for actor, expected in (
            (self.operator, 200),
            (self.backup, 200),
            (self.outsider, 200),
            (self.receiver, 403),
        ):
            response = self.request("get", "/api/v1/patients/", actor=actor)
            self.assertEqual(response.status_code, expected)
            if expected == 200:
                self.assertEqual(
                    [row["id"] for row in response.json()["results"]],
                    [] if actor == self.outsider else [first["patient_id"]],
                )
        body = {
            "operation_id": str(uuid.uuid4()),
            "patient_id": first["patient_id"],
            "patient_version": 1,
            "destination_id": str(self.institution.pk),
            "reason": "No reutilizar paciente de otra unidad",
        }
        self.assertEqual(
            self.request("post", "/api/v1/emergencies/", body, self.outsider).status_code, 404
        )

    def test_master_correction_preserves_old_snapshots_and_f_replacement_uses_episode_snapshot(
        self,
    ):
        first = self.patient()
        body = self.operation(
            patient_identity_unknown=False,
            patient_alias="Alias sintético corregido",
            age_value=9,
            age_unit="months",
            recorded_sex="X",
        )
        updated = self.request("post", f"/api/v1/patients/{first['patient_id']}/update/", body)
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["version"], 2)
        detail = self.request("get", f"/api/v1/emergencies/{first['id']}/", actor=self.receiver)
        self.assertEqual(detail.json()["patient"], first["patient"])
        self.assertNotIn("master", detail.json())
        changed = self.request(
            "post",
            f"/api/v1/emergencies/{first['id']}/change-destination/",
            self.operation(destination_id=str(self.destination.pk), reason="Cambio sintético G"),
        )
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json()["replacement"]["patient"], first["patient"])
        self.assertEqual(changed.json()["replacement"]["patient_id"], first["patient_id"])

    def test_master_version_and_replay_reserve_global_operation_uuid(self):
        first = self.patient()
        body = self.operation(patient_identity_unknown=True)
        path = f"/api/v1/patients/{first['patient_id']}/update/"
        self.assertEqual(self.request("post", path, body).status_code, 200)
        replay = self.request("post", path, body)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay["Idempotent-Replay"], "true")
        self.assertEqual(
            self.request("post", path, {**body, "patient_alias": "Otro"}).status_code, 400
        )
        self.assertEqual(
            self.request("post", path, self.operation(patient_identity_unknown=True)).status_code,
            409,
        )
        self.assertEqual(self.create(operation_id=body["operation_id"]).status_code, 409)
        self.assertEqual(
            self.request(
                "post", path, self.operation(2, patient_identity_unknown=True), actor=self.outsider
            ).status_code,
            404,
        )

    def test_deactivation_requires_explicit_permission_and_no_nonterminal_episode(self):
        first = self.patient()
        path = f"/api/v1/emergencies/{first['id']}/patient-deactivate/"
        self.assertEqual(
            self.request("post", path, self.operation(), self.receiver).status_code, 403
        )
        self.grant(self.receiver, "deactivate_patients")
        self.assertEqual(
            self.request("post", path, self.operation(), self.receiver).status_code, 409
        )
        models.Emergency.objects.filter(pk=first["id"]).update(status="cerrada")
        body = self.operation()
        response = self.request("post", path, body, self.receiver)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()), {"id", "enabled", "version"})
        self.assertFalse(response.json()["enabled"])
        self.assertEqual(
            self.request("post", path, body, self.receiver)["Idempotent-Replay"], "true"
        )
        self.assertTrue(models.Emergency.objects.filter(pk=first["id"]).exists())
        self.assertEqual(self.request("get", "/api/v1/patients/").json()["results"], [])
        reuse = {
            "operation_id": str(uuid.uuid4()),
            "patient_id": first["patient_id"],
            "patient_version": 2,
            "destination_id": str(self.institution.pk),
            "reason": "No reutilizar paciente inactivo",
        }
        self.assertEqual(self.request("post", "/api/v1/emergencies/", reuse).status_code, 409)

    def test_catalog_base_and_management_permission_normalization_and_immutable_episode_label(self):
        path = "/api/v1/institutions/symptoms/"
        base = self.request("get", path)
        self.assertEqual(base.status_code, 200)
        self.assertTrue(any(item["description"] == "Disnea" for item in base.json()["results"]))
        body = self.operation(description="  Síntoma   sintético G  ")
        self.assertEqual(self.request("post", path, body).status_code, 403)
        self.grant(self.operator, "manage_symptoms")
        created = self.request("post", path, body)
        self.assertEqual(created.status_code, 201)
        label = created.json()["description"]
        self.assertEqual(label, "Síntoma sintético G")
        self.assertEqual(
            self.request(
                "post", path, self.operation(description="SÍNTOMA SINTÉTICO G")
            ).status_code,
            409,
        )
        episode = self.create(symptoms=[label])
        self.assertEqual(episode.status_code, 201)
        symptom_id = created.json()["id"]
        disabled = self.request("post", f"{path}{symptom_id}/deactivate/", self.operation())
        self.assertEqual(disabled.status_code, 200)
        self.assertEqual(self.create(symptoms=[label]).status_code, 400)
        detail = self.request(
            "get", f"/api/v1/emergencies/{episode.json()['id']}/", actor=self.receiver
        )
        self.assertEqual(detail.json()["symptoms"], [label])
        updated = self.request(
            "post",
            f"/api/v1/emergencies/{episode.json()['id']}/update/",
            self.operation(notes="Mantener descripción histórica", symptoms=[label]),
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["symptoms"], [label])

    def test_catalog_cannot_be_managed_cross_institution_or_autocreated_from_text(self):
        self.grant(self.operator, "manage_symptoms")
        response = self.request(
            "post",
            "/api/v1/institutions/symptoms/",
            self.operation(description="Síntoma sintético privado"),
        )
        self.assertEqual(response.status_code, 201)
        InstitutionMembership.objects.filter(user=self.receiver).update(active=False)
        InstitutionMembership.objects.create(user=self.receiver, institution=self.destination)
        self.grant(self.receiver, "manage_symptoms")
        self.assertEqual(
            self.request(
                "post",
                f"/api/v1/institutions/symptoms/{response.json()['id']}/deactivate/",
                self.operation(),
                self.receiver,
            ).status_code,
            404,
        )
        self.assertEqual(self.create(symptoms=["Texto no catalogado G"]).status_code, 400)
        listing = self.request("get", "/api/v1/institutions/symptoms/").json()["results"]
        self.assertFalse(any(item["description"] == "Texto no catalogado G" for item in listing))

    def test_patient_validation_unknown_age_unicode_and_no_clinical_identity_in_urls(self):
        for fields in (
            {"age_value": -1},
            {"age_value": 12, "age_unit": "months"},
            {"recorded_sex": "unknown"},
            {"patient_alias": "Sintético\x00"},
        ):
            self.assertEqual(self.create(**fields).status_code, 400)
        valid = self.create(
            patient_alias="  Caso O’Prueba-Ñ  ", age_value=0, age_unit="days", recorded_sex=None
        )
        self.assertEqual(valid.status_code, 201)
        self.assertEqual(valid.json()["patient"]["alias"], "Caso O’Prueba-Ñ")
        self.assertEqual(valid.json()["patient"]["age_value"], 0)

    def test_local_grants_are_explicit_and_do_not_turn_admin_into_clinical_role(self):
        output = StringIO()
        call_command(
            "grant_pilot_permissions",
            self.operator.username,
            manage_symptoms=True,
            deactivate_patients=False,
            stdout=output,
        )
        self.assertTrue(self.operator.groups.filter(name="manage_symptoms").exists())
        self.assertFalse(self.operator.groups.filter(name="deactivate_patients").exists())
        self.assertFalse(self.operator.groups.filter(name="urgencias").exists())

    def test_catalog_accepts_120_unicode_characters_even_when_normalization_expands(self):
        self.grant(self.operator, "manage_symptoms")
        label = "\ufdfa" * 120
        response = self.request(
            "post", "/api/v1/institutions/symptoms/", self.operation(description=label)
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["description"], label)

    def test_retention_expires_patient_master_and_receipts_but_keeps_audit(self):
        first = self.patient()
        self.assertEqual(
            self.request(
                "post",
                f"/api/v1/patients/{first['patient_id']}/update/",
                self.operation(patient_identity_unknown=True),
            ).status_code,
            200,
        )
        PilotClosure.objects.create(
            closed_at=timezone.now() - timedelta(days=91), executor="synthetic-G-test"
        )
        call_command("apply_retention", apply=True, stdout=StringIO())
        self.assertFalse(models.Patient.objects.exists())
        self.assertFalse(models.ProcessedOperation.objects.filter(patient__isnull=False).exists())
        self.assertTrue(AuditEvent.objects.exists())

    def test_legacy_linking_keeps_replacement_chain_and_does_not_merge_same_alias(self):
        root = self.episode
        other = models.Emergency.objects.create(
            operating_institution=self.institution,
            destination=self.institution,
            ambulance=self.unit,
            created_by=self.operator,
            status="cancelada",
            patient_identity_unknown=True,
            reason="Otra persona desconocida sintética",
        )
        replacement = models.Emergency.objects.create(
            operating_institution=self.institution,
            destination=self.destination,
            ambulance=self.unit,
            created_by=self.operator,
            status="en_traslado",
            patient_identity_unknown=True,
            reason="Reemplazo sintético",
            replaces=root,
        )
        import_module("emergencies.migrations.0009_legacy_patient_contexts").link_legacy(
            apps, SimpleNamespace(connection=connection)
        )
        root.refresh_from_db()
        other.refresh_from_db()
        replacement.refresh_from_db()
        self.assertEqual(root.patient_record_id, replacement.patient_record_id)
        self.assertNotEqual(root.patient_record_id, other.patient_record_id)
        self.assertIsNone(root.patient_record.created_by)


class PatientCatalogConcurrencyTests(TransactionTestCase):
    request = PatientCatalogTests.request
    operation = PatientCatalogTests.operation
    create = PatientCatalogTests.create
    patient = PatientCatalogTests.patient
    grant = PatientCatalogTests.grant

    def setUp(self):
        PatientCatalogTests.setUpTestData.__func__(type(self))

    def race(self, first, second):
        barrier = Barrier(2)

        def worker(action):
            close_old_connections()
            try:
                with connections["default"].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                barrier.wait(timeout=10)
                return action()
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            jobs = [pool.submit(worker, action) for action in (first, second)]
            return [job.result(timeout=20) for job in jobs]

    def reuse(self, patient_id, version=1):
        return self.request(
            "post",
            "/api/v1/emergencies/",
            {
                "operation_id": str(uuid.uuid4()),
                "patient_id": patient_id,
                "patient_version": version,
                "destination_id": str(self.institution.pk),
                "reason": "Nuevo episodio sintético concurrente",
            },
        )

    def test_reuse_racing_deactivation_has_no_active_episode_of_disabled_patient(self):
        first = self.patient()
        models.Emergency.objects.filter(pk=first["id"]).update(status="cerrada")
        self.grant(self.receiver, "deactivate_patients")
        results = self.race(
            lambda: self.reuse(first["patient_id"]).status_code,
            lambda: (
                self.request(
                    "post",
                    f"/api/v1/emergencies/{first['id']}/patient-deactivate/",
                    self.operation(),
                    self.receiver,
                ).status_code
            ),
        )
        self.assertIn(results, ([201, 409], [409, 200]))
        patient = models.Patient.objects.get(pk=first["patient_id"])
        if not patient.enabled:
            self.assertFalse(patient.episodes.exclude(status__in=("cerrada", "cancelada")).exists())

    def test_master_update_racing_reuse_never_rebases_observed_snapshot_version(self):
        first = self.patient()
        result = self.race(
            lambda: self.reuse(first["patient_id"]),
            lambda: self.request(
                "post",
                f"/api/v1/patients/{first['patient_id']}/update/",
                self.operation(patient_identity_unknown=True),
                self.backup,
            ),
        )
        self.assertEqual(result[1].status_code, 200)
        self.assertIn(result[0].status_code, (201, 409))
        if result[0].status_code == 201:
            self.assertEqual(result[0].json()["patient"], first["patient"])

    def test_two_catalog_creators_with_same_normalized_label_have_one_success(self):
        self.grant(self.operator, "manage_symptoms")
        self.grant(self.backup, "manage_symptoms")
        result = self.race(
            lambda: (
                self.request(
                    "post",
                    "/api/v1/institutions/symptoms/",
                    self.operation(description="Síntoma sintético concurrente"),
                ).status_code
            ),
            lambda: (
                self.request(
                    "post",
                    "/api/v1/institutions/symptoms/",
                    self.operation(description="  SÍNTOMA SINTÉTICO CONCURRENTE "),
                    self.backup,
                ).status_code
            ),
        )
        self.assertEqual(sorted(result), [201, 409])

    def test_symptom_deactivation_racing_episode_creation_does_not_accept_inactive_new_selection(
        self,
    ):
        self.grant(self.backup, "manage_symptoms")
        rows = self.request("get", "/api/v1/institutions/symptoms/", actor=self.backup).json()[
            "results"
        ]
        symptom = next(item for item in rows if item["description"] == "Disnea")
        result = self.race(
            lambda: self.create(symptoms=["Disnea"]).status_code,
            lambda: (
                self.request(
                    "post",
                    f"/api/v1/institutions/symptoms/{symptom['id']}/deactivate/",
                    self.operation(),
                    self.backup,
                ).status_code
            ),
        )
        self.assertIn(result[0], (201, 400))
        self.assertEqual(result[1], 200)

    def test_cross_unit_creation_and_symptom_update_use_consistent_institution_order(self):
        from emergencies import views

        other = self.request(
            "post",
            "/api/v1/emergencies/",
            {
                "operation_id": str(uuid.uuid4()),
                "destination_id": str(self.institution.pk),
                "patient_identity_unknown": True,
                "reason": "Episodio sintético de otra unidad",
                "symptoms": ["Disnea"],
            },
            self.outsider,
        )
        self.assertEqual(other.status_code, 201)
        created_locked, update_progress = Event(), Event()
        original_assignment = views.active_assignment_for

        def assignment(*args, **kwargs):
            result = original_assignment(*args, **kwargs)
            if args[0].pk == self.operator.pk and kwargs.get("lock"):
                created_locked.set()
                if not update_progress.wait(10):
                    raise AssertionError("update did not request institution or lock symptom")
            return result

        def creation():
            close_old_connections()
            try:
                return self.create(symptoms=["Disnea"]).status_code
            finally:
                connections.close_all()

        def update():
            close_old_connections()
            try:
                if not created_locked.wait(10):
                    raise AssertionError("creation did not hold its institution")

                def observe(execute, sql, params, many, context):
                    if 'FROM "institutions_institution"' in sql and "FOR NO KEY UPDATE" in sql:
                        update_progress.set()
                    result = execute(sql, params, many, context)
                    if 'FROM "institutions_symptom"' in sql and "FOR NO KEY UPDATE" in sql:
                        update_progress.set()
                    return result

                with connections["default"].execute_wrapper(observe):
                    return self.request(
                        "post",
                        f"/api/v1/emergencies/{other.json()['id']}/update/",
                        self.operation(
                            symptoms=["Disnea"], notes="Actualización sintética de otra unidad"
                        ),
                        self.outsider,
                    ).status_code
            finally:
                connections.close_all()

        with (
            patch.object(views, "active_assignment_for", side_effect=assignment),
            ThreadPoolExecutor(max_workers=2) as pool,
        ):
            create_result, update_result = pool.submit(creation), pool.submit(update)
            self.assertEqual(create_result.result(timeout=20), 201)
            self.assertEqual(update_result.result(timeout=20), 200)
