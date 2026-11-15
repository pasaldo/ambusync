from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from django.db import close_old_connections, connections
from django.test import TransactionTestCase, override_settings


@override_settings(GEOAPIFY_API_KEY="synthetic-not-a-real-key", GEOCODING_DAILY_LIMIT=1)
class GeocodingRaceTests(TransactionTestCase):
    def test_last_quota_credit_cannot_be_spent_twice_by_different_workers(self):
        from institutions.geocoding import lookup_address
        from institutions.geocoding_models import GeocodingQuota

        def run(address):
            close_old_connections()
            try:
                return lookup_address(address).status
            finally:
                connections.close_all()

        with (
            patch("institutions.geocoding.fetch_candidates", return_value=[]),
            ThreadPoolExecutor(max_workers=2) as pool,
        ):
            results = list(
                pool.map(run, ["Dirección sintética uno", "Dirección sintética dos"], timeout=20)
            )
        self.assertCountEqual(results, ["not_found", "quota_exceeded"])
        self.assertEqual(GeocodingQuota.objects.get(pk=1).used, 1)
