import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from django.db import close_old_connections, connections
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from emergencies import tests_updates
from emergencies.models import Emergency, Position


@override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}})
class PositionRaceTests(TransactionTestCase):
    def setUp(self):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(type(self))

    def run_requests(self, jobs):
        def run(job):
            close_old_connections()
            try:
                actor, action, body = job
                client = APIClient()
                client.force_authenticate(actor)
                return client.post(
                    f"/api/v1/emergencies/{self.episode.pk}/{action}/", body, format="json"
                ).status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(run, jobs, timeout=20))

    def body(self, **extra):
        return {
            "operation_id": str(uuid.uuid4()),
            "latitude": -33,
            "longitude": -70,
            "accuracy_m": 1,
            "captured_at": timezone.now().isoformat(),
            **extra,
        }

    def test_duplicate_race_writes_one_receipt_and_no_clinical_increment(self):
        body = self.body()
        self.assertCountEqual(
            self.run_requests([(self.operator, "positions", body)] * 2), [201, 200]
        )
        self.assertEqual(Position.objects.count(), 1)
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.version, 1)

    def test_arrival_race_serializes_and_late_position_always_rejected(self):
        outcomes = self.run_requests(
            [
                (self.operator, "positions", self.body()),
                (
                    self.receiver,
                    "arrival",
                    {"operation_id": str(uuid.uuid4()), "expected_version": 1},
                ),
            ]
        )
        self.assertEqual(outcomes[1], 200)
        self.assertIn(outcomes[0], [201, 409])
        client = APIClient()
        client.force_authenticate(self.operator)
        self.assertEqual(
            client.post(
                f"/api/v1/emergencies/{self.episode.pk}/positions/", self.body(), format="json"
            ).status_code,
            409,
        )
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.status, "llegado")

    def test_multiple_emitters_cannot_make_latest_regress_by_network_order(self):
        now = timezone.now()
        self.run_requests(
            [
                (self.operator, "positions", self.body(latitude=-31, captured_at=now.isoformat())),
                (
                    self.backup,
                    "positions",
                    self.body(latitude=-32, captured_at=(now - timedelta(seconds=2)).isoformat()),
                ),
            ]
        )
        client = APIClient()
        client.force_authenticate(self.receiver)
        result = client.get(f"/api/v1/emergencies/{self.episode.pk}/positions/")
        self.assertEqual(result.json()["latest"]["latitude"], -31)
        self.assertEqual(sorted(Position.objects.values_list("sequence", flat=True)), [1, 2])

    def test_replacement_starts_empty_and_new_receiver_cannot_read_old_positions(self):
        from django.contrib.auth.models import Group

        from accounts.models import User
        from institutions.models import Institution, InstitutionMembership

        target = Institution.objects.create(name="Otro receptor sintético", kind="receiver")
        receiver = User.objects.create(username="synthetic-new-receiver", password="!")
        receiver.groups.add(Group.objects.get(name="urgencias"))
        InstitutionMembership.objects.create(user=receiver, institution=target)
        client = APIClient()
        client.force_authenticate(self.operator)
        self.assertEqual(
            client.post(
                f"/api/v1/emergencies/{self.episode.pk}/positions/", self.body(), format="json"
            ).status_code,
            201,
        )
        result = client.post(
            f"/api/v1/emergencies/{self.episode.pk}/change-destination/",
            {
                "operation_id": str(uuid.uuid4()),
                "expected_version": 1,
                "destination_id": str(target.pk),
                "reason": "Cambio sintético de destino",
            },
            format="json",
        )
        self.assertEqual(result.status_code, 200, result.content)
        replacement = Emergency.objects.get(replaces=self.episode)
        self.assertFalse(Position.objects.filter(emergency=replacement).exists())
        self.assertEqual(
            client.post(
                f"/api/v1/emergencies/{self.episode.pk}/positions/", self.body(), format="json"
            ).status_code,
            409,
        )
        client.force_authenticate(receiver)
        self.assertEqual(
            client.get(f"/api/v1/emergencies/{self.episode.pk}/positions/").status_code, 404
        )

    def test_destination_change_racing_position_never_copies_or_accepts_post_cancel_sample(self):
        from institutions.models import Institution

        target = Institution.objects.create(name="Receptor carrera sintética", kind="receiver")
        results = self.run_requests(
            [
                (self.operator, "positions", self.body()),
                (
                    self.backup,
                    "change-destination",
                    {
                        "operation_id": str(uuid.uuid4()),
                        "expected_version": 1,
                        "destination_id": str(target.pk),
                        "reason": "Cambio sintético concurrente",
                    },
                ),
            ]
        )
        self.assertEqual(results[1], 200)
        self.assertIn(results[0], (201, 409))
        replacement = Emergency.objects.get(replaces=self.episode)
        self.assertFalse(Position.objects.filter(emergency=replacement).exists())
        client = APIClient()
        client.force_authenticate(self.operator)
        self.assertEqual(
            client.post(
                f"/api/v1/emergencies/{self.episode.pk}/positions/", self.body(), format="json"
            ).status_code,
            409,
        )
