import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.db import close_old_connections, connection, connections
from django.test import TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AccountActivation, User
from audit.models import AuditEvent
from emergencies.models import Emergency
from institutions.models import Ambulance, AmbulanceAssignment, Institution, InstitutionMembership


class UnitManagementTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.institution = Institution.objects.create(
            name="Institución combinada sintética", kind="combined"
        )
        cls.foreign = Institution.objects.create(name="Operador ajeno sintético", kind="operator")
        cls.unit = Ambulance.objects.create(institution=cls.institution, code="SYN-A")
        cls.replacement_unit = Ambulance.objects.create(institution=cls.institution, code="SYN-B")
        cls.foreign_unit = Ambulance.objects.create(institution=cls.foreign, code="OTHER")
        cls.admin = User.objects.create(username="synthetic-admin", password="!")
        cls.admin.groups.add(
            *[
                Group.objects.get_or_create(name=name)[0]
                for name in ("urgencias", "institution_admin")
            ]
        )
        InstitutionMembership.objects.create(user=cls.admin, institution=cls.institution)
        cls.operator = User.objects.create(username="synthetic-operator", password="!")
        cls.operator.groups.add(Group.objects.get_or_create(name="ambulance")[0])
        InstitutionMembership.objects.create(user=cls.operator, institution=cls.institution)
        cls.assignment = AmbulanceAssignment.objects.create(user=cls.operator, ambulance=cls.unit)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def assign(self, target, *, expected=None, user=None):
        return self.client.post(
            f"/api/v1/institutions/management/accounts/{(user or self.operator).pk}/assignment/",
            {
                "ambulance_id": str(target.pk) if target else None,
                "expected_ambulance_id": str(expected.pk) if expected else None,
            },
            format="json",
        )

    def episode(self, status):
        return Emergency.objects.create(
            operating_institution=self.institution,
            destination=self.institution,
            ambulance=self.unit,
            created_by=self.operator,
            status=status,
            patient_identity_unknown=True,
            reason="Episodio sintético de continuidad",
        )

    def add_operator(self, *, active=True, valid_membership=True):
        user = User.objects.create(
            username=f"synthetic-backup-{uuid.uuid4().hex}", password="!", is_active=active
        )
        user.groups.add(Group.objects.get(name="ambulance"))
        InstitutionMembership.objects.create(
            user=user, institution=self.institution, active=valid_membership
        )
        AmbulanceAssignment.objects.create(user=user, ambulance=self.unit)
        return user

    def deactivate_unit(self, unit=None):
        return self.client.post(
            f"/api/v1/institutions/management/ambulances/{(unit or self.unit).pk}/deactivate/",
            {},
            format="json",
        )

    def test_reassignment_preserves_history_and_audits_both_ends(self):
        response = self.assign(self.replacement_unit, expected=self.unit)
        self.assertEqual(response.status_code, 200)
        self.assignment.refresh_from_db()
        self.assertFalse(self.assignment.active)
        self.assertIsNotNone(self.assignment.unassigned_at)
        new = AmbulanceAssignment.objects.get(user=self.operator, active=True)
        self.assertEqual(new.ambulance, self.replacement_unit)
        events = AuditEvent.objects.filter(action__startswith="ambulance.assignment_")
        self.assertEqual(events.count(), 2)
        self.assertEqual(set(events.values_list("actor_id", flat=True)), {self.admin.pk})
        self.assertEqual(len(set(events.values_list("correlation_id", flat=True))), 1)
        self.assertTrue(
            events.filter(
                action="ambulance.assignment_ended",
                object_id=str(self.assignment.pk),
                ambulance=self.unit,
            ).exists()
        )
        self.assertTrue(
            events.filter(
                action="ambulance.assignment_started",
                object_id=str(new.pk),
                ambulance=self.replacement_unit,
            ).exists()
        )

    def test_same_unit_retry_does_not_churn_history_or_audit(self):
        response = self.assign(self.unit, expected=self.unit)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AmbulanceAssignment.objects.filter(user=self.operator).count(), 1)
        self.assertFalse(
            AuditEvent.objects.filter(action__startswith="ambulance.assignment_").exists()
        )

    def test_withdrawal_keeps_account_active_and_can_be_assigned_again(self):
        response = self.assign(None, expected=self.unit)
        self.assertEqual(response.status_code, 204)
        self.operator.refresh_from_db()
        self.assertTrue(self.operator.is_active)
        self.assertFalse(
            AmbulanceAssignment.objects.filter(user=self.operator, active=True).exists()
        )
        self.assertTrue(InstitutionMembership.objects.get(user=self.operator).active)
        retry = self.assign(None, expected=self.unit)
        self.assertEqual(retry.status_code, 204)
        self.assertEqual(AuditEvent.objects.filter(action="ambulance.assignment_ended").count(), 1)
        self.assertEqual(self.assign(self.replacement_unit).status_code, 200)

    def test_stale_assignment_is_a_conflict_not_a_silent_overwrite(self):
        response = self.assign(self.replacement_unit, expected=None)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            AmbulanceAssignment.objects.get(user=self.operator, active=True).ambulance, self.unit
        )

    def test_foreign_destination_is_rejected_even_if_visible_to_receiver(self):
        receiver = Institution.objects.create(name="Receptor sintético", kind="receiver")
        self.admin.institution_memberships.update(active=False)
        InstitutionMembership.objects.create(user=self.admin, institution=receiver)
        receiver.operator_institutions.set([self.institution, self.foreign])
        AuditEvent.objects.create(
            actor=self.admin,
            institution=self.institution,
            action="account.created",
            object_type="account",
            object_id=str(self.operator.pk),
            result="success",
            correlation_id=uuid.uuid4(),
        )
        response = self.assign(self.foreign_unit, expected=self.unit)
        self.assertEqual(response.status_code, 400)
        self.assertTrue(
            AmbulanceAssignment.objects.filter(pk=self.assignment.pk, active=True).exists()
        )

    def test_last_operator_cannot_leave_any_nonterminal_episode(self):
        for state in ("notificada", "en_traslado", "llegado"):
            with self.subTest(state=state):
                episode = self.episode(state)
                self.assertEqual(self.assign(None, expected=self.unit).status_code, 400)
                self.assertEqual(
                    self.assign(self.replacement_unit, expected=self.unit).status_code, 400
                )
                self.assertTrue(
                    AmbulanceAssignment.objects.filter(pk=self.assignment.pk, active=True).exists()
                )
                episode.status = "cerrada"
                episode.save(update_fields=["status"])

    def test_valid_replacement_allows_departure_but_preserves_episode_author(self):
        episode = self.episode("en_traslado")
        self.add_operator()
        self.assertEqual(self.assign(self.replacement_unit, expected=self.unit).status_code, 200)
        episode.refresh_from_db()
        self.assertEqual(episode.created_by, self.operator)
        self.assertEqual(episode.ambulance, self.unit)

    def test_inactive_or_nonmember_replacement_does_not_satisfy_continuity(self):
        self.episode("notificada")
        self.add_operator(active=False)
        self.add_operator(valid_membership=False)
        self.assertEqual(self.assign(None, expected=self.unit).status_code, 400)

    def test_terminal_episodes_do_not_block_account_deactivation(self):
        self.episode("cerrada")
        self.episode("cancelada")
        response = self.client.post(
            f"/api/v1/institutions/management/accounts/{self.operator.pk}/deactivate/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.get(pk=self.operator.pk).is_active)
        self.assertTrue(AuditEvent.objects.filter(action="ambulance.assignment_ended").exists())

    def test_unit_deactivation_is_logical_idempotent_and_finishes_assignments(self):
        episode = self.episode("cerrada")
        self.assertEqual(self.deactivate_unit().status_code, 204)
        self.assertEqual(self.deactivate_unit().status_code, 204)
        self.unit.refresh_from_db()
        self.assertFalse(self.unit.enabled)
        self.assertFalse(
            AmbulanceAssignment.objects.filter(ambulance=self.unit, active=True).exists()
        )
        self.assertTrue(Emergency.objects.filter(pk=episode.pk).exists())
        self.assertEqual(AuditEvent.objects.filter(action="ambulance.deactivated").count(), 1)
        self.assertEqual(AuditEvent.objects.filter(action="ambulance.assignment_ended").count(), 1)

    def test_unit_with_nonterminal_episode_cannot_be_deactivated_even_with_backup_operator(self):
        self.episode("llegado")
        self.add_operator()
        self.assertEqual(self.deactivate_unit().status_code, 400)
        self.assertTrue(Ambulance.objects.get(pk=self.unit.pk).enabled)

    def test_combined_admin_cannot_deactivate_foreign_unit(self):
        self.assertEqual(self.deactivate_unit(self.foreign_unit).status_code, 404)

    def test_legacy_shared_directory_does_not_grant_foreign_unit_deactivation(self):
        self.institution.kind = "receiver"
        self.institution.save(update_fields=["kind"])
        self.assertEqual(self.deactivate_unit(self.foreign_unit).status_code, 404)

    def test_operator_role_cannot_manage_assignments_or_units(self):
        self.client.force_authenticate(self.operator)
        self.assertEqual(self.assign(None, expected=self.unit).status_code, 403)
        self.assertEqual(self.deactivate_unit().status_code, 403)

    def test_disabled_unit_is_not_assignable_and_is_visible_only_when_requested(self):
        self.replacement_unit.enabled = False
        self.replacement_unit.save(update_fields=["enabled"])
        self.assertEqual(self.assign(self.replacement_unit, expected=self.unit).status_code, 400)
        active = self.client.get("/api/v1/institutions/management/ambulances/").json()
        all_units = self.client.get(
            "/api/v1/institutions/management/ambulances/?include_disabled=true"
        ).json()
        self.assertNotIn(str(self.replacement_unit.pk), {item["id"] for item in active})
        entry = next(item for item in all_units if item["id"] == str(self.replacement_unit.pk))
        self.assertFalse(entry["enabled"])

    def test_assignment_input_is_strict_and_missing_unit_never_means_withdrawal(self):
        url = f"/api/v1/institutions/management/accounts/{self.operator.pk}/assignment/"
        for body in (
            {},
            {"ambulance_id": "not-a-uuid", "expected_ambulance_id": None},
            {"ambulance_id": None},
            {
                "ambulance_id": None,
                "expected_ambulance_id": str(self.unit.pk),
                "actor_id": self.admin.pk,
            },
        ):
            with self.subTest(body=body):
                response = self.client.post(url, body, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertTrue(
                    AmbulanceAssignment.objects.filter(pk=self.assignment.pk, active=True).exists()
                )

    def test_withdrawal_revokes_old_http_scope_without_deleting_history(self):
        episode = self.episode("cerrada")
        operator_client = APIClient()
        operator_client.force_authenticate(self.operator)
        self.assertEqual(operator_client.get(f"/api/v1/emergencies/{episode.pk}/").status_code, 200)
        self.assertEqual(self.assign(None, expected=self.unit).status_code, 204)
        self.assertEqual(operator_client.get(f"/api/v1/emergencies/{episode.pk}/").status_code, 404)

    def test_unit_creation_is_audited_and_grants_creator_deactivation(self):
        self.institution.kind = "receiver"
        self.institution.save(update_fields=["kind"])
        response = self.client.post(
            "/api/v1/institutions/management/ambulances/create/",
            {
                "institution_id": str(self.foreign.pk),
                "code": "SYN-CREATED",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        unit = Ambulance.objects.get(pk=response.json()["id"])
        self.assertTrue(
            AuditEvent.objects.filter(
                actor=self.admin, action="ambulance.created", ambulance=unit, object_id=str(unit.pk)
            ).exists()
        )
        self.assertEqual(self.deactivate_unit(unit).status_code, 204)

    def test_unit_creation_rejects_invalid_and_extra_fields(self):
        url = "/api/v1/institutions/management/ambulances/create/"
        for body in (
            {"institution_id": "invalid", "code": "SYN-INVALID"},
            {"institution_id": str(self.institution.pk), "code": "SYN-EXTRA", "enabled": False},
        ):
            with self.subTest(body=body):
                self.assertEqual(self.client.post(url, body, format="json").status_code, 400)

    def test_account_creation_rechecks_unit_after_concurrent_deactivation(self):
        def deactivate_before_transaction(_size):
            self.assertEqual(self.deactivate_unit().status_code, 204)
            return "synthetic-token"

        with patch(
            "institutions.account_management.secrets.token_urlsafe",
            side_effect=deactivate_before_transaction,
        ):
            response = self.client.post(
                "/api/v1/institutions/management/accounts/",
                {
                    "username": "synthetic-racing-invite",
                    "email": "racing@example.test",
                    "groups": ["ambulance"],
                    "institution_id": str(self.institution.pk),
                    "ambulance_id": str(self.unit.pk),
                },
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="synthetic-racing-invite").exists())
        self.assertFalse(
            AmbulanceAssignment.objects.filter(ambulance=self.unit, active=True).exists()
        )

    def test_resend_locks_users_before_membership(self):
        self.operator.is_active = False
        self.operator.save(update_fields=["is_active"])
        with (
            patch("institutions.account_management.send_activation_email", return_value=1),
            CaptureQueriesContext(connection) as queries,
        ):
            response = self.client.post(
                f"/api/v1/institutions/management/accounts/{self.operator.pk}/resend-activation/",
                {},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        locks = [
            item["sql"]
            for item in queries
            if "FOR UPDATE" in item["sql"] or "FOR NO KEY UPDATE" in item["sql"]
        ]
        self.assertIn('FROM "accounts_user"', locks[0])
        self.assertIn("FOR NO KEY UPDATE", locks[0])
        membership_lock = next(
            sql for sql in locks if 'FROM "institutions_institutionmembership"' in sql
        )
        self.assertIn('FOR UPDATE OF "institutions_institutionmembership"', membership_lock)

    def test_activation_locks_user_before_activation_to_match_deactivation(self):
        self.operator.is_active = False
        self.operator.save(update_fields=["is_active"])
        AccountActivation.objects.create(
            user=self.operator,
            token_digest=hashlib.sha256(b"synthetic-token").hexdigest(),
            expires_at=timezone.now() + timedelta(hours=1),
        )
        with CaptureQueriesContext(connection) as queries:
            response = self.client.post(
                "/api/v1/auth/activate/",
                {
                    "uid": str(self.operator.pk),
                    "token": "synthetic-token",
                    "password": "Synthetic-Activation-Password-26!",
                    "password_confirmation": "Synthetic-Activation-Password-26!",
                },
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        locks = [item["sql"] for item in queries if "FOR UPDATE" in item["sql"]]
        self.assertIn('FROM "accounts_user"', locks[0])

    def test_transition_does_not_lock_joined_unit_or_institution(self):
        episode = self.episode("en_traslado")
        with CaptureQueriesContext(connection) as queries:
            response = self.client.post(
                f"/api/v1/emergencies/{episode.pk}/arrival/",
                {
                    "operation_id": str(uuid.uuid4()),
                    "expected_version": 1,
                },
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        locks = [item["sql"] for item in queries if "FOR UPDATE" in item["sql"]]
        emergency_lock = next(sql for sql in locks if 'FROM "emergencies_emergency"' in sql)
        self.assertIn('FOR UPDATE OF "emergencies_emergency"', emergency_lock)
        membership_lock = next(
            sql for sql in locks if 'FROM "institutions_institutionmembership"' in sql
        )
        self.assertIn('FOR UPDATE OF "institutions_institutionmembership"', membership_lock)


class UnitManagementConcurrencyTests(TransactionTestCase):
    def setUp(self):
        UnitManagementTests.setUpTestData.__func__(type(self))
        self.second_admin = User.objects.create(username="synthetic-second-admin", password="!")
        self.second_admin.groups.add(Group.objects.get(name="institution_admin"))
        InstitutionMembership.objects.create(user=self.second_admin, institution=self.institution)

    def race(self, *actions):
        barrier = Barrier(len(actions))

        def worker(action):
            close_old_connections()
            try:
                # Fail quickly on a lock-order regression rather than hanging CI.
                with connections["default"].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                barrier.wait(timeout=10)
                return action()
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=len(actions)) as pool:
            futures = [pool.submit(worker, action) for action in actions]
            return [future.result(timeout=20) for future in futures]

    def post(self, actor_id, url, payload):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=actor_id))
        return client.post(url, payload, format="json").status_code

    def withdraw(self, actor_id, user_id):
        return self.post(
            actor_id,
            f"/api/v1/institutions/management/accounts/{user_id}/assignment/",
            {
                "ambulance_id": None,
                "expected_ambulance_id": str(self.unit.pk),
            },
        )

    def create_episode(self):
        return self.post(
            self.operator.pk,
            "/api/v1/emergencies/",
            {
                "operation_id": str(uuid.uuid4()),
                "destination_id": str(self.institution.pk),
                "transfer_started": False,
                "patient_identity_unknown": True,
                "reason": "Prueba sintética concurrente",
            },
        )

    def test_simultaneous_last_two_withdrawals_leave_one_valid_operator(self):
        backup = UnitManagementTests.add_operator(self)
        UnitManagementTests.episode(self, "notificada")
        results = self.race(
            lambda: self.withdraw(self.admin.pk, self.operator.pk),
            lambda: self.withdraw(self.second_admin.pk, backup.pk),
        )
        self.assertEqual(sorted(results), [204, 400])
        self.assertEqual(
            AmbulanceAssignment.objects.filter(ambulance=self.unit, active=True).count(), 1
        )

    def test_episode_creation_racing_with_withdrawal_preserves_continuity(self):
        results = self.race(
            self.create_episode, lambda: self.withdraw(self.admin.pk, self.operator.pk)
        )
        if results[0] == 201:
            self.assertEqual(results[1], 400)
            self.assertTrue(
                AmbulanceAssignment.objects.filter(user=self.operator, active=True).exists()
            )
        else:
            self.assertEqual(results, [403, 204])
            self.assertFalse(Emergency.objects.exists())

    def test_episode_creation_racing_with_unit_deactivation_is_serialized(self):
        results = self.race(
            self.create_episode,
            lambda: self.post(
                self.admin.pk,
                f"/api/v1/institutions/management/ambulances/{self.unit.pk}/deactivate/",
                {},
            ),
        )
        if results[0] == 201:
            self.assertEqual(results[1], 400)
            self.assertTrue(Ambulance.objects.get(pk=self.unit.pk).enabled)
        else:
            self.assertEqual(results, [403, 204])
            self.assertFalse(Emergency.objects.exists())

    def test_transition_and_valid_departure_do_not_deadlock(self):
        UnitManagementTests.add_operator(self)
        episode = UnitManagementTests.episode(self, "en_traslado")
        results = self.race(
            lambda: self.post(
                self.admin.pk,
                f"/api/v1/emergencies/{episode.pk}/arrival/",
                {
                    "operation_id": str(uuid.uuid4()),
                    "expected_version": 1,
                },
            ),
            lambda: self.withdraw(self.second_admin.pk, self.operator.pk),
        )
        self.assertEqual(results, [200, 204])

    def test_resend_and_deactivation_do_not_deadlock_or_restore_membership(self):
        self.operator.is_active = False
        self.operator.save(update_fields=["is_active"])
        with patch("institutions.account_management.send_activation_email", return_value=1):
            results = self.race(
                lambda: self.post(
                    self.admin.pk,
                    f"/api/v1/institutions/management/accounts/{self.operator.pk}/resend-activation/",
                    {},
                ),
                lambda: self.post(
                    self.second_admin.pk,
                    f"/api/v1/institutions/management/accounts/{self.operator.pk}/deactivate/",
                    {},
                ),
            )
        self.assertIn(results[0], [200, 404])
        self.assertEqual(results[1], 204)
        self.assertFalse(InstitutionMembership.objects.get(user=self.operator).active)
        self.assertFalse(
            AmbulanceAssignment.objects.filter(user=self.operator, active=True).exists()
        )
