"""Isolated bounded HTTPS worker. No Django imports, credentials in stdin only."""

import json
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ERROR_CODES = frozenset({
    "deadline_exceeded", "dns_error", "tls_error", "connection_error",
    "upstream_timeout", "http_rejected", "invalid_response", "worker_failure",
})


class GeocodingTransportError(Exception):
    """Only closed application-owned fields may cross into the API."""

    def __init__(self, code, http_status=None):
        self.code = code if code in ERROR_CODES else "worker_failure"
        self.http_status = (
            http_status if self.code == "http_rejected"
            and type(http_status) is int and 100 <= http_status <= 599 else None
        )
        super().__init__(self.code)

    def diagnostic(self):
        result = {"code": self.code}
        if self.http_status is not None:
            result["http_status"] = self.http_status
        return result


class GeocodingDeadlineError(GeocodingTransportError, TimeoutError):
    pass


def failure_details(error):
    """Classify exception types; never inspect free-text messages or response bodies."""
    if isinstance(error, urllib.error.HTTPError):
        return GeocodingTransportError("http_rejected", error.code).diagnostic()
    reason = error.reason if isinstance(error, urllib.error.URLError) else error
    if isinstance(reason, socket.gaierror):
        code = "dns_error"
    elif isinstance(reason, ssl.SSLError):
        code = "tls_error"
    elif isinstance(reason, TimeoutError):
        code = "upstream_timeout"
    elif isinstance(reason, OSError):
        code = "connection_error"
    elif isinstance(reason, ValueError):
        code = "invalid_response"
    else:
        code = "worker_failure"
    return {"code": code}


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
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise GeocodingDeadlineError("deadline_exceeded") from None
    except OSError:
        raise GeocodingTransportError("worker_failure") from None
    try:
        body = json.loads(result.stdout)
    except (ValueError, UnicodeError):
        code = "invalid_response" if result.returncode == 0 else "worker_failure"
        raise GeocodingTransportError(code) from None
    if isinstance(body, dict) and "_ambusync_error" in body:
        if result.returncode == 0:
            # A successful provider body cannot impersonate our worker's failure protocol.
            raise GeocodingTransportError("invalid_response")
        diagnostic = body["_ambusync_error"]
        if (
            result.returncode != 1
            or set(body) != {"_ambusync_error"}
            or not isinstance(diagnostic, dict)
            or set(diagnostic) not in ({"code"}, {"code", "http_status"})
            or not isinstance(diagnostic.get("code"), str)
            or diagnostic["code"] not in ERROR_CODES
            or (
                "http_status" in diagnostic and (
                    diagnostic["code"] != "http_rejected"
                    or type(diagnostic["http_status"]) is not int
                    or not 100 <= diagnostic["http_status"] <= 599
                )
            )
        ):
            raise GeocodingTransportError("worker_failure")
        raise GeocodingTransportError(diagnostic["code"], diagnostic.get("http_status"))
    if result.returncode != 0:
        raise GeocodingTransportError("worker_failure")
    if not isinstance(body, dict) or not isinstance(body.get("results"), list):
        raise GeocodingTransportError("invalid_response")
    return body


def fetch_json(address, api_key):
    return run_worker(Path(__file__).resolve(), {"address": address, "api_key": api_key})


if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.buffer.read(8192))
        raw = fetch_bytes(payload["address"], payload["api_key"])
        sys.stdout.buffer.write(raw)
    except Exception as error:  # noqa: BLE001 -- closed fields only; no exception text.
        sys.stdout.write(json.dumps(
            {"_ambusync_error": failure_details(error)}, separators=(",", ":"),
        ))
        sys.exit(1)
