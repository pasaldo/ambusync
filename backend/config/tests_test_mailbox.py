"""No database or provider connections: settings and SMTP boundary contracts."""

import importlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
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
                self.module().validate_mail_mode(
                    {
                        "AMBUSYNC_MAIL_MODE": "mailpit",
                        "AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH": value,
                    }
                )

    def test_relay_forward_webhook_overrides_refused(self):
        for name in (
            "MP_SMTP_RELAY_ALL",
            "MP_SMTP_FORWARD_CONFIG",
            "MP_WEBHOOK_URL",
            "MP_SMTP_BIND_ADDR",
            "MP_UI_AUTH",
            "EMAIL_HOST",
            "EMAIL_PORT",
            "EMAIL_HOST_USER",
            "EMAIL_HOST_PASSWORD",
            "SMTP_HOST",
            "SMTP_PORT",
        ):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.module().validate_mail_mode(
                    {
                        "AMBUSYNC_MAIL_MODE": "mailpit",
                        "AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH": HASH,
                        name: "synthetic-override",
                    }
                )

    def test_mailpit_uses_only_fixed_loopback(self):
        module = self.module()
        self.assertEqual(
            module.validate_mail_mode(
                {
                    "AMBUSYNC_MAIL_MODE": "mailpit",
                    "AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH": HASH,
                }
            ),
            "mailpit",
        )
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
            settings["EMAIL_BACKEND"],
            host=settings["EMAIL_HOST"],
            port=settings["EMAIL_PORT"],
            timeout=settings["EMAIL_TIMEOUT"],
            username="",
            password="",
            use_tls=False,
            use_ssl=False,
            fail_silently=False,
        )
        with patch("smtplib.SMTP", side_effect=ConnectionRefusedError), self.assertRaises(OSError):
            connection.send_messages(
                [
                    EmailMessage(
                        "Synthetic", "No token", "test@example.invalid", ["user@example.invalid"]
                    )
                ]
            )

    def profile(self, mode=None):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "index.html").write_text("synthetic")
            env = {
                key: value
                for key, value in os.environ.items()
                if key in ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE")
            }
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
                [sys.executable, "-c", script],
                env=env,
                cwd=Path(__file__).resolve().parent.parent,
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
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


class TestMailboxProcesses(unittest.TestCase):
    def module(self):
        return importlib.import_module("config.deployment_processes")

    def test_child_environments_do_not_receive_application_secrets(self):
        module = self.module()
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "synthetic-private-db",
                "BREVO_API_KEY": "synthetic-private-key",
                "GEOAPIFY_API_KEY": "synthetic-private-geo",
                "MP_SMTP_RELAY_ALL": "true",
            },
        ):
            specs = module.process_specs(
                10000, "/tmp/synthetic", HASH, "https://synthetic.onrender.com"
            )
        self.assertEqual(len(specs), 3)
        for name, args, env in specs:
            if name != "daphne":
                self.assertFalse(set(env) & {"DATABASE_URL", "BREVO_API_KEY", "GEOAPIFY_API_KEY"})
            self.assertNotIn("MP_SMTP_RELAY_ALL", env)
            self.assertNotIn(HASH, args)
        mailpit = specs[0]
        self.assertEqual(mailpit[0], "mailpit")
        for value in ("127.0.0.1:1025", "127.0.0.1:8025", "100", "24h", "--disable-version-check"):
            self.assertIn(value, mailpit[1])

    def test_child_death_stops_and_reaps_all_other_children(self):
        module = self.module()
        children = []

        class Child:
            code = None
            terminated = False
            reaped = False

            def poll(self):
                return self.code

            def terminate(self):
                self.terminated = True
                self.code = 0

            def wait(self, timeout=None):
                self.reaped = True
                return self.code

            def kill(self):
                self.code = -9

        def spawn(*args, **kwargs):
            child = Child()
            children.append(child)
            return child

        def ready(*args):
            children[0].code = 7

        with (
            patch.object(module.subprocess, "Popen", side_effect=spawn),
            patch.object(module, "wait_until_ready", side_effect=ready),
            patch.dict(
                os.environ,
                {
                    "AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH": HASH,
                    "FRONTEND_BASE_URL": "https://synthetic.onrender.com",
                },
            ),
        ):
            self.assertEqual(module.run_deployment_processes(10000, "mailpit"), 1)
        self.assertEqual(len(children), 3)
        self.assertTrue(all(c.reaped for c in children))
        self.assertTrue(all(c.terminated for c in children[1:]))

    def test_startup_failure_still_stops_children(self):
        module = self.module()
        child = SimpleNamespace(poll=lambda: None)
        from unittest.mock import Mock

        child.terminate, child.wait, child.kill = Mock(), Mock(), Mock()
        with (
            patch.object(module.subprocess, "Popen", return_value=child),
            patch.object(module, "wait_until_ready", side_effect=TimeoutError),
            patch.dict(
                os.environ,
                {
                    "AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH": HASH,
                    "FRONTEND_BASE_URL": "https://synthetic.onrender.com",
                },
            ),
        ):
            self.assertEqual(module.run_deployment_processes(10000, "mailpit"), 1)
        self.assertTrue(child.terminate.called)
        self.assertTrue(child.wait.called)

    def test_readiness_fails_before_database_when_capture_unavailable(self):
        from django.test import RequestFactory, override_settings

        from config.health import ready

        with (
            override_settings(AMBUSYNC_MAIL_MODE="mailpit"),
            patch("config.test_mailbox.capture_services_ready", return_value=False),
        ):
            response = ready(RequestFactory().get("/health/ready/"))
        self.assertEqual(response.status_code, 503)

    def test_sigterm_stops_unit_cleanly_and_restores_handler(self):
        import signal
        from unittest.mock import Mock

        module = self.module()
        old = signal.getsignal(signal.SIGTERM)
        child = SimpleNamespace(poll=lambda: None, terminate=Mock(), wait=Mock(), kill=Mock())
        with (
            patch.object(module.subprocess, "Popen", return_value=child),
            patch.object(
                module,
                "wait_until_ready",
                side_effect=lambda *_: signal.raise_signal(signal.SIGTERM),
            ),
            patch.dict(
                os.environ,
                {
                    "AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH": HASH,
                    "FRONTEND_BASE_URL": "https://synthetic.onrender.com",
                },
            ),
        ):
            self.assertEqual(module.run_deployment_processes(10000, "mailpit"), 0)
        self.assertTrue(child.terminate.called)
        self.assertTrue(child.wait.called)
        self.assertEqual(signal.getsignal(signal.SIGTERM), old)
