import json
import uuid
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from emergencies import tests_updates
from emergencies.models import Emergency


class PositionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        tests_updates.EpisodeUpdateTests.setUpTestData.__func__(cls)

    def body(self, **extra):
        return {
            "operation_id": str(uuid.uuid4()),
            "latitude": 0,
            "longitude": 0,
            "accuracy_m": 5,
            "captured_at": timezone.now().isoformat(),
            **extra,
        }

    def client_for(self, actor):
        client = APIClient()
        client.force_authenticate(actor)
        return client

    def post(self, body, actor=None):
        return self.client_for(actor or self.operator).post(
            f"/api/v1/emergencies/{self.episode.pk}/positions/", body, format="json"
        )

    def get(self, actor=None):
        return self.client_for(actor or self.receiver).get(
            f"/api/v1/emergencies/{self.episode.pk}/positions/"
        )

    def test_position_does_not_change_clinical_version_and_replays_exact_sample(self):
        body = self.body()
        first = self.post(body)
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(first.json()["position"]["latitude"], 0)
        self.post(self.body(latitude=-33))
        replay = self.post(body)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json(), first.json())
        self.assertEqual(replay["Idempotent-Replay"], "true")
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.version, 1)
        self.assertEqual(self.post({**body, "latitude": 1}).status_code, 409)

    def test_late_or_future_sample_never_replaces_fresh_last_position(self):
        now = timezone.now()
        for captured, lat in (
            (now, -33),
            (now - timedelta(seconds=60), -34),
            (now + timedelta(days=1), -35),
        ):
            self.assertEqual(
                self.post(self.body(captured_at=captured.isoformat(), latitude=lat)).status_code,
                201,
            )
        result = self.get()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["latest"]["latitude"], -33)
        self.assertEqual(result.json()["latest"]["sequence"], 1)

    def test_write_scope_stop_states_and_replay_revalidate_assignment(self):
        body = self.body()
        self.assertEqual(self.post(body, self.outsider).status_code, 404)
        self.assertEqual(self.post(body, self.receiver).status_code, 403)
        self.assertEqual(self.post(body).status_code, 201)
        Emergency.objects.filter(pk=self.episode.pk).update(status="llegado")
        self.assertEqual(self.post(self.body()).status_code, 409)
        self.assertEqual(self.post(body).status_code, 200)
        from institutions.models import AmbulanceAssignment

        AmbulanceAssignment.objects.filter(user=self.operator).update(active=False)
        self.assertEqual(self.post(body).status_code, 404)
        self.assertEqual(self.get(self.outsider).status_code, 404)

    def test_strict_coordinates_and_initial_notified_capture_only_once_per_actor(self):
        for changes in (
            {"latitude": 91},
            {"longitude": -181},
            {"accuracy_m": -1},
            {"latitude": True},
            {"captured_at": "2026-11-15T12:00:00"},
            {"unexpected": "no"},
        ):
            self.assertEqual(self.post(self.body(**changes)).status_code, 400)
        Emergency.objects.filter(pk=self.episode.pk).update(status="notificada")
        self.assertEqual(self.post(self.body()).status_code, 201)
        self.assertEqual(self.post(self.body()).status_code, 409)

    def test_destination_is_only_confirmed_and_position_retention_follows_episode(self):
        from audit.models import PilotClosure

        self.assertIsNone(self.get().json()["target"])
        self.institution.location = {
            "latitude": -33,
            "longitude": -70,
            "provider": "geoapify",
            "confirmed_at": timezone.now().isoformat(),
        }
        self.institution.save(update_fields=("location",))
        self.assertEqual(self.get().json()["target"]["latitude"], -33)
        self.assertEqual(self.post(self.body()).status_code, 201)
        now = timezone.now()
        PilotClosure.objects.create(closed_at=now - timedelta(days=91), executor="synthetic")
        output = StringIO()
        call_command("apply_retention", apply=True, as_of=now.isoformat(), stdout=output)
        self.assertEqual(json.loads(output.getvalue())["deleted"]["positions"], 1)
