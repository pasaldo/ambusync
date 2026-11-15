import tempfile
import time
from pathlib import Path

from django.test import SimpleTestCase


class ProviderDeadlineTests(SimpleTestCase):
    def test_overall_deadline_terminates_slow_network_worker(self):
        # A socket timeout alone permits indefinite slow-drip responses.
        try:
            from institutions.geocoding_transport import run_worker
        except ImportError:
            self.fail("Geoapify must enforce an overall deadline with a terminated worker.")
        with tempfile.TemporaryDirectory() as root:
            worker = Path(root) / "slow.py"
            worker.write_text("import time\nwhile True:\n time.sleep(0.05)\n", encoding="utf-8")
            started = time.monotonic()
            with self.assertRaises(TimeoutError):
                run_worker(worker, {}, timeout=0.2)
            self.assertLess(time.monotonic() - started, 2)
