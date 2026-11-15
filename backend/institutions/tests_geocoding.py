from unittest.mock import patch

from django.test import TestCase, override_settings

from institutions import tests_system_management
from institutions.models import Institution


@override_settings(GEOAPIFY_API_KEY="synthetic-not-a-real-key", GEOCODING_DAILY_LIMIT=2)
class GeocodingTests(TestCase):
    setUp = tests_system_management.SystemInstitutionManagementTests.setUp
    institution_payload = (
        tests_system_management.SystemInstitutionManagementTests.institution_payload
    )

    def lookup(self, address="Avenida Sintética 123, Santiago", **extra):
        return self.client.post(
            "/api/v1/system/geocoding/", {"address": address, **extra}, format="json"
        )

    def candidates(self):
        try:
            from institutions import geocoding  # noqa: F401
        except ImportError:
            return self.lookup()
        with patch(
            "institutions.geocoding.fetch_candidates",
            return_value=[
                {
                    "latitude": -33.45,
                    "longitude": -70.66,
                    "formatted": "Avenida Sintética 123, Santiago",
                    "result_type": "building",
                    "confidence": 0.99,
                }
            ],
        ):
            return self.lookup()

    def test_lookup_is_cached_and_institution_requires_matching_confirmation(self):
        result = self.candidates()
        self.assertEqual(result.status_code, 200, result.content)
        data = result.json()
        payload = self.institution_payload(
            location_selection={"lookup_id": data["lookup_id"], "index": 0}
        )
        result = self.client.post("/api/v1/system/institutions/", payload, format="json")
        self.assertEqual(result.status_code, 201, result.content)
        self.assertEqual(result.json()["location"]["latitude"], -33.45)
        self.assertEqual(result.json()["location_status"], "confirmed")
        from institutions.geocoding import lookup_address

        with patch(
            "institutions.geocoding.fetch_candidates",
            side_effect=AssertionError("cached lookup must not use network"),
        ):
            self.assertEqual(lookup_address(payload["address"]).pk, data["lookup_id"])

    def test_changed_address_rejects_candidate_and_clears_old_location(self):
        result = self.candidates()
        self.assertEqual(result.status_code, 200)
        selection = {"lookup_id": result.json()["lookup_id"], "index": 0}
        payload = self.institution_payload(
            location_selection=selection, address="Otra dirección sintética"
        )
        response = self.client.post("/api/v1/system/institutions/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Institution.objects.count(), 0)
        payload["address"] = "Avenida Sintética 123, Santiago"
        response = self.client.post("/api/v1/system/institutions/", payload, format="json")
        institution_id = response.json()["id"]
        response = self.client.patch(
            f"/api/v1/system/institutions/{institution_id}/",
            {"address": "Dirección nueva"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["location"])

    def test_failures_use_quota_without_exposing_key_and_do_not_block_pending_creation(self):
        try:
            from institutions import geocoding  # noqa: F401
        except ImportError:
            self.assertEqual(self.lookup().status_code, 200)
            return
        with patch(
            "institutions.geocoding.fetch_candidates",
            side_effect=OSError("synthetic-not-a-real-key"),
        ):
            for address in ("ficticia uno", "ficticia dos"):
                from institutions.geocoding_models import GeocodingQuota

                GeocodingQuota.objects.update(last_request_at=None)
                response = self.lookup(address)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "unavailable")
                self.assertNotContains(response, "synthetic-not-a-real-key")
            self.assertEqual(self.lookup("ficticia tres").json()["status"], "quota_exceeded")
        response = self.client.post(
            "/api/v1/system/institutions/", self.institution_payload(), format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.json()["location"])

    def test_only_global_admin_can_query_and_get_never_triggers_lookup(self):
        with patch("urllib.request.OpenerDirector.open", side_effect=AssertionError("no network")):
            self.assertEqual(self.client.get("/api/v1/system/institutions/").status_code, 200)
        self.admin.groups.clear()
        self.assertEqual(self.lookup().status_code, 403)

    def test_arbitrary_coordinates_cannot_be_submitted_as_confirmation(self):
        result = self.client.post(
            "/api/v1/system/institutions/",
            self.institution_payload(location_selection={"latitude": -33, "longitude": -70}),
            format="json",
        )
        self.assertEqual(result.status_code, 400)

    def test_provider_parser_filters_invalid_and_coarse_results(self):
        from institutions.geocoding import parse_candidates

        result = parse_candidates(
            {
                "results": [
                    {
                        "lat": -33,
                        "lon": -70,
                        "formatted": "Destino sintético",
                        "result_type": "building",
                        "rank": {"confidence": 0.9},
                        "country_code": "cl",
                    },
                    {
                        "lat": -33,
                        "lon": -70,
                        "formatted": "Solo ciudad",
                        "result_type": "city",
                        "country_code": "cl",
                    },
                    {
                        "lat": float("nan"),
                        "lon": -70,
                        "formatted": "Inválido",
                        "result_type": "building",
                        "country_code": "cl",
                    },
                    {
                        "lat": -33,
                        "lon": -70,
                        "formatted": "Otro país",
                        "result_type": "building",
                        "country_code": "ar",
                    },
                ]
            }
        )
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["latitude"], -33)

    def test_network_adapter_never_follows_redirect_and_discards_oversized_body(self):
        from institutions.geocoding_transport import NoRedirect, fetch_bytes

        self.assertIsNone(
            NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.test/")
        )

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, limit):
                return b"x" * limit

        class FakeOpener:
            def open(self, request, timeout):
                # Reject any regression sending non-address application data or a different host.
                from urllib.parse import parse_qs, urlsplit

                url = urlsplit(request.full_url)
                if (
                    url.scheme != "https"
                    or url.netloc != "api.geoapify.com"
                    or set(parse_qs(url.query))
                    != {"text", "filter", "lang", "format", "limit", "apiKey"}
                ):
                    raise AssertionError("Unexpected provider request")
                return FakeResponse()

        with (
            patch("urllib.request.build_opener", return_value=FakeOpener()),
            self.assertRaises(ValueError),
        ):
            fetch_bytes("Dirección institucional sintética", "synthetic-not-a-real-key")
