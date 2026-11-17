"""Explicit capture-only deployment mode. Never configure an external SMTP target."""

import re
from collections.abc import Mapping

_BCRYPT = re.compile(r"\$2[aby]\$(?:12|13|14|15|16)\$[./A-Za-z0-9]{53}", re.ASCII)


def validate_mail_mode(environment: Mapping[str, str]) -> str:
    mode = environment.get("AMBUSYNC_MAIL_MODE", "brevo")
    if mode not in {"brevo", "mailpit"}:
        raise ValueError("Invalid deployment mail mode.")
    if mode == "mailpit":
        if not _BCRYPT.fullmatch(environment.get("AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH", "")):
            raise ValueError("Private test mailbox credential required.")
        # Do not silently accept settings that could later enable forwarding or
        # redirect delivery. Child process environments are separately allowlisted.
        if any(
            value and name.upper().startswith(("MP_", "SMTP_", "EMAIL_"))
            for name, value in environment.items()
        ):
            raise ValueError("Ambient test mailbox overrides are not permitted.")
    return mode


def mailpit_settings() -> dict:
    return {
        "EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend",
        "EMAIL_HOST": "127.0.0.1",
        "EMAIL_PORT": 1025,
        "EMAIL_TIMEOUT": 3,
        "EMAIL_USE_TLS": False,
        "EMAIL_USE_SSL": False,
        "EMAIL_HOST_USER": "",
        "EMAIL_HOST_PASSWORD": "",
        "DEFAULT_FROM_EMAIL": "AmbuSync Pruebas <ambusync@example.invalid>",
    }
