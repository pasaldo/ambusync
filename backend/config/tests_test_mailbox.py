"""No database or provider connections: settings and SMTP boundary contracts."""

import importlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HASH = "$2b$12$" + "A" * 53  # Synthetic syntax fixture, not an operator credential.


class TestMailboxSettings(unittest.TestCase):
    def module(self):
        return importlib.import_module("config.test_mailbox")

    def test_default_preserves_brevo(self):
        self.assertEqual(self.module().validate_mail_mode({}), "brevo")

    def test_unknown_mode_refused(self):
        for value in ("", "smtp", "MAILPIT", "mailpit ", "console"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.module().validate_mail_mode({"AMBUSYNC_MAIL_MODE": value})

    def test_missing_mailbox_hash_refused(self):
        for value in ("", "plaintext-synthetic", "$2b$04$" + "A" * 53, HASH + "\n"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.module().validate_mail_mode({
                    "AMBUSYNC_MAIL_MODE": "mailpit",
                    "AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH": value,
                })

    def test_relay_forward_webhook_overrides_refused(self):
        for name in (
            "MP_SMTP_RELAY_ALL", "MP_SMTP_FORWARD_CONFIG", "MP_WEBHOOK_URL",
            "MP_SMTP_BIND_ADDR", "MP_UI_AUTH", "EMAIL_HOST", "EMAIL_PORT",
            "EMAIL_HOST_USER", "EMAIL_HOST_PASSWORD", "SMTP_HOST", "SMTP_PORT",
        ):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.module().validate_mail_mode({
                    "AMBUSYNC_MAIL_MODE": "mailpit",
                    "AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH": HASH,
                    name: "synthetic-override",
                })

    def test_mailpit_uses_only_fixed_loopback(self):
        module = self.module()
        self.assertEqual(module.validate_mail_mode({
            "AMBUSYNC_MAIL_MODE": "mailpit",
            "AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH": HASH,
        }), "mailpit")
        settings = module.mailpit_settings()
        self.assertEqual(settings["EMAIL_BACKEND"], "django.core.mail.backends.smtp.EmailBackend")
        self.assertEqual(settings["EMAIL_HOST"], "127.0.0.1")
        self.assertEqual(settings["EMAIL_PORT"], 1025)
        self.assertEqual(settings["EMAIL_TIMEOUT"], 3)
        self.assertFalse(settings["EMAIL_USE_SSL"])
        self.assertFalse(settings["EMAIL_USE_TLS"])
        self.assertEqual(settings["EMAIL_HOST_USER"], "")
        self.assertEqual(settings["EMAIL_HOST_PASSWORD"], "")

    def test_smtp_failure_is_not_reported_as_capture_success(self):
        from django.core.mail import EmailMessage, get_connection
        settings = self.module().mailpit_settings()
        connection = get_connection(
            settings["EMAIL_BACKEND"], host=settings["EMAIL_HOST"],
            port=settings["EMAIL_PORT"], timeout=settings["EMAIL_TIMEOUT"],
            username="", password="", use_tls=False, use_ssl=False,
            fail_silently=False,
        )
        with patch("smtplib.SMTP", side_effect=ConnectionRefusedError), self.assertRaises(OSError):
            connection.send_messages([
                EmailMessage("Synthetic", "No token", "test@example.invalid", ["user@example.invalid"])
            ])

    def profile(self, mode=None):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "index.html").write_text("synthetic")
            env = {key: value for key, value in os.environ.items()
                   if key in ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE")}
            env.update(
                DJANGO_SECRET_KEY="synthetic-secret-not-used-for-sessions-" * 2,
                FRONTEND_BASE_URL="https://synthetic-l.onrender.com",
                DATABASE_URL="postgresql://synthetic:unused@dpg-synthetic-a/synthetic_l?sslmode=require",
                VALKEY_URL="redis://red-synthetic:6379/0",
                AMBUSYNC_DATABASE_NETWORK="internal",
                AMBUSYNC_EXPECTED_DATABASE_HOST="dpg-synthetic-a",
                AMBUSYNC_EXPECTED_DATABASE_NAME="synthetic_l",
                AMBUSYNC_EXPECTED_VALKEY_HOST="red-synthetic",
                AMBUSYNC_FRONTEND_ROOT=directory,
                AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH=HASH,
            )
            if mode is not None:
                env["AMBUSYNC_MAIL_MODE"] = mode
            script = """
import json
from unittest.mock import patch
with patch('dotenv.load_dotenv', side_effect=AssertionError('dotenv forbidden')):
    import config.deployment_settings as s
print(json.dumps({'mode':getattr(s,'AMBUSYNC_MAIL_MODE',None),'backend':s.EMAIL_BACKEND,
'host':s.EMAIL_HOST,'port':s.EMAIL_PORT,'sender':s.DEFAULT_FROM_EMAIL}))
"""
            result = subprocess.run(
                [sys.executable, "-c", script], env=env,
                cwd=Path(__file__).resolve().parent.parent, capture_output=True, text=True,
                timeout=15, check=False,
            )
            self.assertEqual(result.returncode, 0, "Synthetic profile import failed")
            return json.loads(result.stdout)

    def test_capture_never_calls_brevo(self):
        result = self.profile("mailpit")
        self.assertEqual(result["mode"], "mailpit")
        self.assertEqual(result["backend"], "django.core.mail.backends.smtp.EmailBackend")
        self.assertEqual(result["host"], "127.0.0.1")
        self.assertEqual(result["port"], 1025)
        self.assertEqual(result["sender"], "AmbuSync Pruebas <ambusync@example.invalid>")

    def test_deployment_default_still_uses_brevo(self):
        result = self.profile()
        self.assertEqual(result["mode"], "brevo")
        self.assertEqual(result["backend"], "accounts.mail_backend.BrevoEmailBackend")
