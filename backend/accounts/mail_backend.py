"""Brevo HTTPS backend: no provider calls in the caller's database transaction."""

import json
import os
import subprocess
import sys
from email.utils import parseaddr
from pathlib import Path
from threading import BoundedSemaphore

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend
from django.core.validators import validate_email
from django.db import connection

_slots = BoundedSemaphore(2)


def effective_database():
    configured = connection.settings_dict
    if configured["ENGINE"] != "django.db.backends.postgresql":
        raise OSError("Mail budget requires PostgreSQL.")
    result = {
        key: configured[key] for key in ("ENGINE", "NAME", "HOST", "PORT", "USER", "PASSWORD")
    }
    result["OPTIONS"] = dict(configured.get("OPTIONS", {}))
    result["OPTIONS"]["connect_timeout"] = 3
    return result


def run_brevo_worker(payload, *, timeout=5):
    if not _slots.acquire(blocking=False):
        raise OSError("Mail delivery capacity unavailable.")
    try:
        raw = json.dumps(payload).encode()
        if len(raw) > 65536:
            raise ValueError
        environment = {
            key: value
            for key, value in os.environ.items()
            if key in ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE")
        }
        result = subprocess.run(
            [sys.executable, "-m", "accounts.brevo_worker"],
            cwd=Path(__file__).resolve().parent.parent,
            input=raw,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            check=True,
            env=environment,
        )
        return len(result.stdout) <= 32 and json.loads(result.stdout) is True
    except Exception:  # noqa: BLE001 -- subprocess/provider errors may contain secrets.
        raise OSError("Mail delivery unavailable.") from None
    finally:
        _slots.release()


class BrevoEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages or []:
            try:
                key = getattr(settings, "BREVO_API_KEY", "")
                sender = getattr(settings, "BREVO_SENDER_EMAIL", "")
                allowed = getattr(settings, "BREVO_ALLOWED_RECIPIENTS", [])
                limit = getattr(settings, "BREVO_DAILY_LIMIT", 100)
                validate_email(sender)
                if (
                    not isinstance(key, str)
                    or not key.strip()
                    or type(limit) is not int
                    or not 1 <= limit <= 100
                    or not isinstance(allowed, (list, tuple))
                    or len(message.to) != 1
                    or message.cc
                    or message.bcc
                    or message.attachments
                    or message.reply_to
                    or message.extra_headers
                    or getattr(message, "alternatives", [])
                    or message.content_subtype != "plain"
                    or parseaddr(message.from_email)[1].casefold() != sender.casefold()
                ):
                    raise ValueError
                recipient = message.to[0]
                validate_email(recipient)
                if recipient.casefold() not in {item.casefold() for item in allowed}:
                    raise ValueError
                message.message()  # Django rejects newline/header injection.
                payload = {
                    "key": key,
                    "limit": limit,
                    "database": effective_database(),
                    "message": {
                        "sender": {"name": "AmbuSync", "email": sender},
                        "to": [{"email": recipient}],
                        "subject": message.subject,
                        "textContent": message.body,
                    },
                }
                if len(json.dumps(payload).encode()) > 65536:
                    raise ValueError
                if run_brevo_worker(payload) is not True:
                    raise ValueError
                sent += 1
            except Exception:  # noqa: BLE001 -- never propagate addresses, tokens or API keys.
                if not self.fail_silently:
                    raise OSError("Mail delivery unavailable.") from None
        return sent
