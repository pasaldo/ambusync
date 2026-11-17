"""Offline canaries at the worker/process/API boundaries; never use provider credentials."""

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase, override_settings

from institutions import geocoding_transport, tests_geocoding

SECRET = "synthetic-secret-canary-not-a-key"
ADDRESS = "synthetic-address-canary-not-an-institution"


class GeocodingDiagnosticTransportTests(SimpleTestCase):
    def worker_process(self, failure):
        """Exercise the real CLI; replace only network I/O in a disposable worker."""
        with tempfile.TemporaryDirectory() as root:
            worker = Path(root) / "fixture.py"
            worker.write_text(
                "import runpy,socket,ssl,urllib.error,urllib.request\n"
                "def fail(*args,**kwargs):\n"
                f" raise {failure}\n"
                "urllib.request.OpenerDirector.open=fail\n"
                f"runpy.run_path({str(Path(geocoding_transport.__file__).resolve())!r},"
                "run_name='__main__')\n",
                encoding="utf-8",
            )
            return subprocess.run(
                [sys.executable, str(worker)],
                input=json.dumps({"address": ADDRESS, "api_key": SECRET}).encode(),
                capture_output=True, timeout=10, check=False,
            )

    def test_worker_classifies_network_failures_without_echoing_untrusted_details(self):
        # Removing classification or forwarding str(error) must fail these canaries.
        cases = [
            (f"urllib.error.URLError(socket.gaierror(-2,{SECRET!r}))", "dns_error", None),
            (f"urllib.error.URLError(ssl.SSLError({SECRET!r}))", "tls_error", None),
            (f"urllib.error.URLError(TimeoutError({SECRET!r}))", "upstream_timeout", None),
            (f"urllib.error.URLError(ConnectionRefusedError({SECRET!r}))", "connection_error", None),
            (
                (f"urllib.error.HTTPError('https://invalid.test/?apiKey={SECRET}',403,"
                 f"{ADDRESS!r},None,None)"),
                "http_rejected", 403,
            ),
            (
                f"urllib.error.HTTPError('https://invalid.test',302,{SECRET!r},None,None)",
                "http_rejected", 302,
            ),
            (f"RuntimeError({SECRET!r}+{ADDRESS!r})", "worker_failure", None),
        ]
        for failure, code, status in cases:
            with self.subTest(code=code, status=status):
                result = self.worker_process(failure)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stderr, b"")
                self.assertNotIn(SECRET.encode(), result.stdout)
                self.assertNotIn(ADDRESS.encode(), result.stdout)
                expected = {"code": code}
                if status is not None:
                    expected["http_status"] = status
                self.assertEqual(
                    result.stdout.decode().strip(),
                    json.dumps({"_ambusync_error": expected}, separators=(",", ":")),
                )

    def test_parent_preserves_valid_results_and_rejects_malformed_worker_output(self):
        with tempfile.TemporaryDirectory() as root:
            worker = Path(root) / "fixture.py"
            for output, exit_code, expected_code in [
                ('{"results":[]}', 0, None),
                ('not-json-' + SECRET, 0, "invalid_response"),
                ('{"results":"wrong-shape"}', 0, "invalid_response"),
                ('{"_ambusync_error":{"code":"tls_error"}}', 1, "tls_error"),
                ('{"_ambusync_error":{"code":"tls_error"}}', 0, "invalid_response"),
                ('{"_ambusync_error":{"code":["' + SECRET + '"]}}', 1, "worker_failure"),
                ('{"_ambusync_error":{"code":"http_rejected","http_status":403}}', 1,
                 "http_rejected"),
                ('{"_ambusync_error":{"code":"' + SECRET + '"}}', 1, "worker_failure"),
                ('{"_ambusync_error":{"code":"http_rejected","http_status":true}}', 1,
                 "worker_failure"),
                ('{"_ambusync_error":{"code":"tls_error","url":"' + SECRET + '"}}', 1,
                 "worker_failure"),
                ('', 1, "worker_failure"),
                ('{"results":[]}', 1, "worker_failure"),
            ]:
                with self.subTest(expected=expected_code, exit_code=exit_code):
                    worker.write_text(
                        f"import sys\nsys.stdout.write({output!r})\nsys.exit({exit_code})\n",
                        encoding="utf-8",
                    )
                    try:
                        body = geocoding_transport.run_worker(worker, {}, timeout=5)
                    except geocoding_transport.GeocodingTransportError as error:
                        self.assertIsNotNone(expected_code)
                        self.assertEqual(getattr(error, "code", None), expected_code)
                        self.assertNotIn(SECRET, str(error))
                    else:
                        self.assertIsNone(expected_code)
                        self.assertEqual(body, {"results": []})

    def test_deadline_has_safe_code_and_still_terminates_a_real_child(self):
        import time

        with tempfile.TemporaryDirectory() as root:
            worker = Path(root) / "slow.py"
            worker.write_text("import time\ntime.sleep(30)\n", encoding="utf-8")
            started = time.monotonic()
            with self.assertRaises(TimeoutError) as raised:
                geocoding_transport.run_worker(worker, {"api_key": SECRET}, timeout=0.2)
            self.assertEqual(getattr(raised.exception, "code", None), "deadline_exceeded")
            self.assertLess(time.monotonic() - started, 2)

    def test_oversized_provider_body_is_still_rejected_before_parsing(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, maximum):
                return b"x" * maximum

        with (
            patch("urllib.request.OpenerDirector.open", return_value=Response()),
            self.assertRaises(ValueError),
        ):
            geocoding_transport.fetch_bytes(ADDRESS, SECRET)


@override_settings(GEOAPIFY_API_KEY=SECRET, GEOCODING_DAILY_LIMIT=20)
class GeocodingDiagnosticApiTests(TestCase):
    setUp = tests_geocoding.GeocodingTests.setUp
    lookup = tests_geocoding.GeocodingTests.lookup

    def test_new_failure_has_safe_reason_but_cache_neither_retries_nor_invents_history(self):
        from institutions.geocoding_models import GeocodingLookup, GeocodingQuota

        with patch(
            "institutions.geocoding.fetch_candidates",
            side_effect=geocoding_transport.GeocodingTransportError("http_rejected", 403),
        ):
            response = self.lookup(ADDRESS)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "unavailable")
        self.assertEqual(response.json().get("diagnostic"),
                         {"code": "http_rejected", "http_status": 403})
        self.assertIn("no-store", response["Cache-Control"])
        self.assertEqual(GeocodingQuota.objects.get(pk=1).used, 1)
        row = GeocodingLookup.objects.get(pk=response.json()["lookup_id"])
        self.assertEqual(row.candidates, [])
        self.assertFalse(hasattr(row, "diagnostic"))
        self.assertFalse(hasattr(row, "_diagnostic"))
        with patch(
            "institutions.geocoding.fetch_candidates",
            side_effect=AssertionError("A cache read must not call the provider"),
        ):
            cached = self.lookup(ADDRESS)
        self.assertEqual(cached.json().get("diagnostic"), {"code": "cached_unavailable"})
        self.assertEqual(GeocodingQuota.objects.get(pk=1).used, 1)

    def test_deadline_code_reaches_authorized_api_without_provider_input_or_new_logs(self):
        import logging

        with (
            patch(
                "institutions.geocoding.fetch_candidates",
                side_effect=geocoding_transport.GeocodingDeadlineError("deadline_exceeded"),
            ),
            self.assertNoLogs("institutions", level=logging.DEBUG),
        ):
            response = self.lookup(ADDRESS)
        self.assertEqual(response.json().get("diagnostic"), {"code": "deadline_exceeded"})
        self.assertNotContains(response, SECRET)
        self.assertNotContains(response, ADDRESS)

    def test_unexpected_exception_does_not_disclose_message_or_internal_exception_type(self):
        with patch(
            "institutions.geocoding.fetch_candidates",
            side_effect=RuntimeError("apiKey=" + SECRET + " " + ADDRESS),
        ):
            response = self.lookup(ADDRESS)
        self.assertEqual(response.json().get("diagnostic"), {"code": "worker_failure"})
        self.assertNotContains(response, SECRET)
        self.assertNotContains(response, ADDRESS)
        self.assertNotContains(response, "RuntimeError")

    def test_success_keeps_existing_contract_without_failure_diagnostic(self):
        with patch(
            "institutions.geocoding.fetch_candidates",
            return_value=[{
                "latitude": -33, "longitude": -70, "formatted": "Edificio Sintetico",
                "result_type": "building", "confidence": 1,
            }],
        ):
            response = self.lookup(ADDRESS)
        self.assertEqual(response.json()["status"], "ready")
        self.assertEqual(len(response.json()["candidates"]), 1)
        self.assertNotIn("diagnostic", response.json())

    def test_missing_configuration_does_not_claim_a_transport_diagnosis_or_consume_quota(self):
        from institutions.geocoding_models import GeocodingQuota

        with override_settings(GEOAPIFY_API_KEY=""):
            response = self.lookup(ADDRESS)
        self.assertEqual(response.json()["status"], "not_configured")
        self.assertNotIn("diagnostic", response.json())
        self.assertEqual(GeocodingQuota.objects.get(pk=1).used, 0)

    def test_anonymous_non_system_and_revoked_actors_cannot_obtain_diagnostic(self):
        from rest_framework.test import APIClient

        from institutions.geocoding_models import GeocodingLookup

        with patch(
            "institutions.geocoding.fetch_candidates",
            side_effect=AssertionError("Denied actors must not call the provider"),
        ):
            anonymous = APIClient()
            self.assertEqual(
                anonymous.post("/api/v1/system/geocoding/", {"address": ADDRESS},
                               format="json").status_code,
                401,
            )
            self.admin.groups.clear()
            self.assertEqual(self.lookup(ADDRESS).status_code, 403)
            self.admin.is_active = False
            self.admin.save(update_fields=["is_active"])
            self.assertEqual(self.lookup(ADDRESS).status_code, 403)
        self.assertEqual(GeocodingLookup.objects.count(), 0)
