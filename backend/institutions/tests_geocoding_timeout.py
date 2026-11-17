"""Offline timeout canaries at the worker boundary; never use provider credentials."""

import tempfile
import time
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase

from institutions import geocoding_transport

NEW_WORKER_TIMEOUT = 10


class GeocodingTimeoutTests(SimpleTestCase):
    def test_worker_timeout_is_above_previous_five_seconds(self):
        # The previous deadline of 5s rejected a real Render request at 5.26s.
        self.assertGreaterEqual(geocoding_transport.run_worker.__defaults__[0], NEW_WORKER_TIMEOUT)

    def test_slow_real_child_is_terminated_within_the_new_worker_timeout(self):
        with tempfile.TemporaryDirectory() as root:
            worker = Path(root) / "slow.py"
            worker.write_text("import time\ntime.sleep(30)\n", encoding="utf-8")
            started = time.monotonic()
            with self.assertRaises(geocoding_transport.GeocodingDeadlineError):
                geocoding_transport.run_worker(worker, {}, timeout=NEW_WORKER_TIMEOUT)
            self.assertLess(time.monotonic() - started, NEW_WORKER_TIMEOUT + 1)

    def test_fetch_bytes_passes_bounded_http_timeout_to_opener(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, limit):
                return b'{"results":[]}'

        with patch(
            "urllib.request.OpenerDirector.open",
            return_value=FakeResponse(),
        ) as mock_open:
            geocoding_transport.fetch_bytes(
                "Dirección institucional sintética", "synthetic-not-a-real-key"
            )
        call_kwargs = mock_open.call_args.kwargs
        self.assertIn("timeout", call_kwargs)
        self.assertGreaterEqual(call_kwargs["timeout"], NEW_WORKER_TIMEOUT)
