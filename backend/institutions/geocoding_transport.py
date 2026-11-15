"""Isolated bounded HTTPS worker. No Django imports, credentials in stdin only."""

import json
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_bytes(address, api_key):
    query = urllib.parse.urlencode(
        {
            "text": address,
            "filter": "countrycode:cl",
            "lang": "es",
            "format": "json",
            "limit": 5,
            "apiKey": api_key,
        }
    )
    request = urllib.request.Request(
        "https://api.geoapify.com/v1/geocode/search?" + query,
        headers={"Accept": "application/json", "User-Agent": "AmbuSync-synthetic-pilot"},
    )
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=5) as response:
        raw = response.read(131073)
        if len(raw) > 131072:
            raise ValueError("Provider response too large")
        return raw


def run_worker(script, payload, timeout=5):
    # subprocess.run kills and waits for its child on timeout. A slow header/body cannot
    # tie up a Django worker beyond the overall deadline (plus process cleanup).
    try:
        result = subprocess.run(
            [sys.executable, str(script)],
            input=json.dumps(payload).encode(),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            check=True,
        )
    except subprocess.TimeoutExpired:
        raise TimeoutError("Geocoding deadline exceeded") from None
    return json.loads(result.stdout)


def fetch_json(address, api_key):
    return run_worker(Path(__file__).resolve(), {"address": address, "api_key": api_key})


if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.buffer.read(8192))
        raw = fetch_bytes(payload["address"], payload["api_key"])
        sys.stdout.buffer.write(raw)
    except Exception:  # noqa: BLE001 -- no trace/exception/URL/key on stdout or stderr.
        sys.exit(1)
