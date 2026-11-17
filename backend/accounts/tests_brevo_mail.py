import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch

from django.core.mail import EmailMessage
from django.db import close_old_connections, connection, connections, transaction
from django.test import SimpleTestCase, TransactionTestCase, override_settings
from django.utils import timezone

MAIL_SETTINGS = {
    "BREVO_API_KEY": "synthetic-key-NEVER-REAL",
    "BREVO_SENDER_EMAIL": "sender@example.test",
    "BREVO_ALLOWED_RECIPIENTS": ["recipient@example.test"],
    "BREVO_DAILY_LIMIT": 100,
}


@override_settings(**MAIL_SETTINGS)
class BrevoBackendTests(SimpleTestCase):
    def setUp(self):
        # A mock failure must never render credentials from development settings.
        configured = {
            **connection.settings_dict,
            "NAME": "synthetic_l",
            "HOST": "127.0.0.1",
            "USER": "synthetic",
            "PASSWORD": "synthetic-only",
        }
        context = patch.object(connection, "settings_dict", configured)
        context.start()
        self.addCleanup(context.stop)

    def test_ambient_route_or_option_override_cannot_send_worker_to_a_different_database(self):
        from accounts.mail_backend import BrevoEmailBackend

        for name in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"):
            with (
                self.subTest(variable=name),
                patch.dict(os.environ, {name: "synthetic-untrusted-override"}),
                patch("accounts.mail_backend.run_brevo_worker") as worker,
                self.assertRaises(OSError),
            ):
                BrevoEmailBackend().send_messages([self.message()])
            worker.assert_not_called()

        configured = dict(connection.settings_dict)
        configured["OPTIONS"] = {**configured.get("OPTIONS", {}), "hostaddr": "203.0.113.17"}
        with (
            patch.object(connection, "settings_dict", configured),
            patch("accounts.mail_backend.run_brevo_worker") as worker,
            self.assertRaises(OSError),
        ):
            BrevoEmailBackend().send_messages([self.message()])
        worker.assert_not_called()

    def message(self, **extra):
        return EmailMessage(
            "Synthetic activation",
            "synthetic-secret-link",
            "AmbuSync <sender@example.test>",
            ["recipient@example.test"],
            **extra,
        )

    def test_only_accepted_delivery_is_counted_and_worker_uses_effective_db(self):
        from accounts.mail_backend import BrevoEmailBackend

        payloads = []

        def accepted(payload, **_kwargs):
            payloads.append(payload)
            return True

        with patch("accounts.mail_backend.run_brevo_worker", side_effect=accepted):
            self.assertEqual(BrevoEmailBackend().send_messages([self.message()]), 1)
        self.assertEqual(payloads[0]["database"]["NAME"], connection.settings_dict["NAME"])
        self.assertEqual(payloads[0]["message"]["to"], [{"email": "recipient@example.test"}])
        self.assertEqual(payloads[0]["message"]["sender"]["email"], "sender@example.test")

    def test_invalid_envelopes_never_reach_worker(self):
        from accounts.mail_backend import BrevoEmailBackend

        for change in ("sender", "recipient", "cc", "bcc", "attachment", "large", "header"):
            message = self.message()
            if change == "sender":
                message.from_email = "foreign@example.test"
            elif change == "recipient":
                message.to = ["foreign@example.test"]
            elif change == "cc":
                message.cc = ["foreign@example.test"]
            elif change == "bcc":
                message.bcc = ["foreign@example.test"]
            elif change == "attachment":
                message.attach("synthetic.txt", "private")
            elif change == "large":
                message.body = "x" * 65536
            else:
                message.subject = "bad\nheader"
            with (
                self.subTest(change=change),
                patch("accounts.mail_backend.run_brevo_worker") as worker,
            ):
                with self.assertRaises(OSError) as caught:
                    BrevoEmailBackend().send_messages([message])
                self.assertNotIn("synthetic-secret", str(caught.exception))
                worker.assert_not_called()

    def test_failures_cannot_claim_success_or_expose_provider_exception(self):
        from accounts.mail_backend import BrevoEmailBackend

        for result in (False, OSError("synthetic-key-NEVER-REAL synthetic-secret-link")):
            with patch(
                "accounts.mail_backend.run_brevo_worker",
                side_effect=result if isinstance(result, Exception) else None,
                return_value=result,
            ):
                with self.assertRaises(OSError) as caught:
                    BrevoEmailBackend().send_messages([self.message()])
                self.assertNotIn("synthetic-key", str(caught.exception))
                self.assertEqual(
                    BrevoEmailBackend(fail_silently=True).send_messages([self.message()]), 0
                )
        with (
            override_settings(BREVO_API_KEY=""),
            patch("accounts.mail_backend.run_brevo_worker") as worker,
        ):
            self.assertEqual(
                BrevoEmailBackend(fail_silently=True).send_messages([self.message()]), 0
            )
            worker.assert_not_called()

    def test_worker_deadline_uses_stdin_and_rejects_saturation(self):
        from accounts import mail_backend

        with patch(
            "accounts.mail_backend.subprocess.run",
            side_effect=subprocess.TimeoutExpired("synthetic", 5),
        ) as run:
            with self.assertRaises(OSError):
                mail_backend.run_brevo_worker({"key": "synthetic-key"}, timeout=0.2)
            args, kwargs = run.call_args
            self.assertNotIn("synthetic-key", str(args))
            self.assertIn(b"synthetic-key", kwargs["input"])
            self.assertEqual(kwargs["timeout"], 0.2)
            self.assertFalse(kwargs.get("shell", False))
        self.assertTrue(mail_backend._slots.acquire(blocking=False))
        self.assertTrue(mail_backend._slots.acquire(blocking=False))
        try:
            with self.assertRaises(OSError):
                mail_backend.run_brevo_worker({})
        finally:
            mail_backend._slots.release()
            mail_backend._slots.release()


class BrevoTransportTests(SimpleTestCase):
    def test_only_valid_201_ack_is_accepted_without_provider_data_in_errors(self):
        from accounts.brevo_worker import send_https

        class Response:
            def __init__(self, status, body):
                self.status, self.body = status, body

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, size):
                return self.body[:size]

        for status, body, expected in (
            (201, b'{"messageId":"synthetic-accepted"}', True),
            (200, b'{"messageId":"synthetic-accepted"}', False),
            (201, b"{}", False),
            (201, b"not-json", False),
            (302, b"{}", False),
            (400, b"{}", False),
            (401, b"{}", False),
            (429, b"{}", False),
            (500, b"{}", False),
            (201, b"x" * 65537, False),
        ):
            with (
                self.subTest(status=status, body_size=len(body)),
                patch("accounts.brevo_worker.urllib.request.build_opener") as opener,
            ):
                opener.return_value.open.return_value = Response(status, body)
                self.assertEqual(send_https({"subject": "synthetic"}, "synthetic-key"), expected)
                request = opener.return_value.open.call_args.args[0]
                self.assertEqual(request.full_url, "https://api.brevo.com/v3/smtp/email")
                self.assertEqual(request.method, "POST")


@override_settings(**MAIL_SETTINGS)
class MailBudgetTests(TransactionTestCase):
    def payload(self):
        from accounts.mail_backend import effective_database

        return {
            "database": effective_database(),
            "limit": 100,
            "key": "synthetic-key",
            "message": {
                "sender": {"name": "AmbuSync", "email": "sender@example.test"},
                "to": [{"email": "recipient@example.test"}],
                "subject": "synthetic",
                "textContent": "synthetic",
            },
        }

    def test_malformed_worker_envelope_never_reserves_or_sends(self):
        from accounts.brevo_worker import execute
        from accounts.models import OutboundMailBudget

        for field, value in (
            ("to", []),
            ("sender", {}),
            ("subject", ["invalid"]),
            ("textContent", None),
        ):
            payload = self.payload()
            payload["message"][field] = value
            with self.subTest(field=field), patch("accounts.brevo_worker.send_https") as send:
                self.assertFalse(execute(payload))
                send.assert_not_called()
                self.assertFalse(OutboundMailBudget.objects.exists())

    def test_real_worker_waiting_for_budget_is_killed_without_reserving(self):
        from accounts.mail_backend import run_brevo_worker
        from accounts.models import OutboundMailBudget

        OutboundMailBudget.objects.create(pk=1, day=timezone.now().date(), used=0)
        with transaction.atomic():
            OutboundMailBudget.objects.select_for_update().get(pk=1)
            with self.assertRaises(OSError):
                run_brevo_worker(self.payload(), timeout=0.5)
        self.assertEqual(OutboundMailBudget.objects.get(pk=1).used, 0)

    def test_daily_limit_and_forward_only_rollover(self):
        from accounts.mail_budget import reserve_mail_budget
        from accounts.models import OutboundMailBudget

        self.assertTrue(all(reserve_mail_budget() for _ in range(100)))
        self.assertFalse(reserve_mail_budget())
        self.assertEqual(OutboundMailBudget.objects.get(pk=1).used, 100)
        tomorrow = timezone.now() + timedelta(days=1)
        with patch("accounts.mail_budget.timezone.now", return_value=tomorrow):
            self.assertTrue(reserve_mail_budget())
        self.assertTrue(reserve_mail_budget())
        self.assertEqual(OutboundMailBudget.objects.get(pk=1).used, 2)

    def test_concurrent_last_slot_can_only_be_reserved_once(self):
        from accounts.mail_budget import reserve_mail_budget
        from accounts.models import OutboundMailBudget

        OutboundMailBudget.objects.create(pk=1, day=timezone.now().date(), used=99)
        barrier = Barrier(2)

        def work():
            close_old_connections()
            try:
                barrier.wait(timeout=5)
                return reserve_mail_budget()
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: work(), range(2)))
        self.assertEqual(sorted(results), [False, True])

    def test_quota_is_committed_independently_of_outer_rollback(self):
        from accounts.mail_backend import effective_database
        from accounts.models import OutboundMailBudget, User

        script = """
import json, sys
from accounts.brevo_worker import configure_budget_database
configure_budget_database(json.load(sys.stdin), 100)
from accounts.mail_budget import reserve_mail_budget
print(json.dumps(reserve_mail_budget()))
"""
        try:
            with transaction.atomic():
                User.objects.create(username="synthetic-rollback")
                result = subprocess.run(
                    [sys.executable, "-c", script],
                    input=json.dumps(effective_database()),
                    text=True,
                    capture_output=True,
                    timeout=10,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, "Synthetic budget child failed.")
                self.assertEqual(result.stdout.strip(), "true")
                raise OSError("synthetic outer rollback")
        except OSError:
            pass
        self.assertFalse(User.objects.filter(username="synthetic-rollback").exists())
        self.assertEqual(OutboundMailBudget.objects.get(pk=1).used, 1)

    def test_failed_provider_consumes_budget_but_invalid_payload_does_not(self):
        from accounts.brevo_worker import execute
        from accounts.mail_backend import effective_database
        from accounts.models import OutboundMailBudget

        payload = {
            "database": effective_database(),
            "limit": 100,
            "key": "synthetic-key",
            "message": {
                "sender": {"name": "AmbuSync", "email": "sender@example.test"},
                "to": [{"email": "recipient@example.test"}],
                "subject": "synthetic",
                "textContent": "synthetic",
            },
        }
        with patch("accounts.brevo_worker.send_https", return_value=False):
            self.assertFalse(execute(payload))
        self.assertEqual(OutboundMailBudget.objects.get(pk=1).used, 1)
        payload["limit"] = 301
        with patch("accounts.brevo_worker.send_https") as transport:
            self.assertFalse(execute(payload))
            transport.assert_not_called()
        self.assertEqual(OutboundMailBudget.objects.get(pk=1).used, 1)
