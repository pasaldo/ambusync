"""Isolated HTTPS + quota worker; all private inputs arrive via stdin, not argv/env."""

import json
import sys
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def configure_budget_database(database, limit):
    import django
    from django.conf import settings
    from django.db import connection

    if not isinstance(database, dict) or database.get("ENGINE") != "django.db.backends.postgresql":
        raise ValueError
    if not database.get("NAME") or not database.get("HOST"):
        raise ValueError
    if settings.configured:
        if (
            connection.settings_dict["NAME"] != database["NAME"]
            or connection.settings_dict["HOST"] != database["HOST"]
            or getattr(settings, "BREVO_DAILY_LIMIT", 100) != limit
        ):
            raise ValueError
        return
    settings.configure(
        DATABASES={"default": database},
        INSTALLED_APPS=["django.contrib.auth", "django.contrib.contenttypes", "accounts"],
        AUTH_USER_MODEL="accounts.User",
        DEFAULT_AUTO_FIELD="django.db.models.BigAutoField",
        SECRET_KEY="isolated-mail-budget-worker-does-not-sign-sessions",
        TIME_ZONE="UTC",
        USE_TZ=True,
        BREVO_DAILY_LIMIT=limit,
    )
    django.setup()


def send_https(message, key):
    try:
        request = urllib.request.Request(
            "https://api.brevo.com/v3/smtp/email",
            data=json.dumps(message).encode(),
            headers={
                "api-key": key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=3) as response:
            raw = response.read(65537)
            if response.status != 201 or len(raw) > 65536:
                return False
            body = json.loads(raw)
            return (
                isinstance(body, dict)
                and isinstance(body.get("messageId"), str)
                and bool(body["messageId"].strip())
            )
    except Exception:  # noqa: BLE001 -- no provider text/URL/key crosses this boundary.
        return False


def valid_message(message):
    from django.core.validators import validate_email

    if (
        not isinstance(message, dict)
        or set(message) != {"sender", "to", "subject", "textContent"}
        or not isinstance(message["sender"], dict)
        or set(message["sender"]) != {"name", "email"}
        or message["sender"]["name"] != "AmbuSync"
        or not isinstance(message["to"], list)
        or len(message["to"]) != 1
        or not isinstance(message["to"][0], dict)
        or set(message["to"][0]) != {"email"}
        or not isinstance(message["subject"], str)
        or not message["subject"].strip()
        or len(message["subject"]) > 998
        or "\r" in message["subject"]
        or "\n" in message["subject"]
        or not isinstance(message["textContent"], str)
    ):
        return False
    for address in (message["sender"]["email"], message["to"][0]["email"]):
        if not isinstance(address, str):
            return False
        validate_email(address)
    return True


def execute(payload):
    try:
        if (
            not isinstance(payload, dict)
            or set(payload) != {"database", "limit", "key", "message"}
            or type(payload["limit"]) is not int
            or not 1 <= payload["limit"] <= 100
            or not isinstance(payload["key"], str)
            or not payload["key"].strip()
            or not valid_message(payload["message"])
            or len(json.dumps(payload).encode()) > 65536
        ):
            return False
        configure_budget_database(payload["database"], payload["limit"])
        from accounts.mail_budget import reserve_mail_budget

        if not reserve_mail_budget():
            return False
        return send_https(payload["message"], payload["key"]) is True
    except Exception:  # noqa: BLE001 -- payload/DB/transport errors are all private.
        return False
    finally:
        from django.conf import settings

        if settings.configured:
            from django.db import connections

            connections.close_all()


if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(65537)
        accepted = len(raw) <= 65536 and execute(json.loads(raw))
    except Exception:  # noqa: BLE001 -- never print traceback/input.
        accepted = False
    sys.stdout.write(json.dumps(accepted))
