import json
import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.conf import settings
from django.db import connection
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.test.utils import CaptureQueriesContext

BACKEND = Path(__file__).resolve().parent.parent


class DeploymentFrontendTests(SimpleTestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name) / "dist"
        (root / "assets").mkdir(parents=True)
        (root / "icons").mkdir()
        (root / "index.html").write_text("<html>synthetic-public-shell</html>")
        (root / "sw.js").write_text("// synthetic worker")
        (root / "manifest.webmanifest").write_text('{"name":"Synthetic"}')
        (root / "icons/icon-192.png").write_bytes(b"synthetic-image")
        (root / "assets/index-Ab12Cd34.js").write_text("/* synthetic-script */")
        (root / "assets/index-Ab12Cd34.css").write_text("body{}")
        (root / "assets/secret.env").write_text("PRIVATE-SENTINEL")
        (root / ".env").write_text("PRIVATE-SENTINEL")
        self.root = root
        context = override_settings(
            AMBUSYNC_SERVE_FRONTEND=True,
            AMBUSYNC_FRONTEND_ROOT=root,
            SECURE_SSL_REDIRECT=False,
        )
        context.enable()
        self.addCleanup(context.disable)

    def test_known_spa_routes_and_public_identity_are_served_without_private_data(self):
        for path in (
            "/",
            "/local",
            "/local/",
            "/sistema",
            "/ambulancia",
            "/urgencias",
            "/activar-cuenta",
            "/recuperar-cuenta",
            "/restablecer-cuenta",
            "/index.html",
        ):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                body = (
                    b"".join(response.streaming_content) if response.streaming else response.content
                )
                self.assertEqual(body, b"<html>synthetic-public-shell</html>")
                response.close()
                self.assertIn("no-store", response["Cache-Control"])
        self.assertEqual(self.client.post("/local", {}).status_code, 405)

    def test_api_errors_and_unknown_paths_never_fall_back_to_html_shell(self):
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)
        for path in ("/api/no-such-route", "/ws/no-such-route", "/unknown", "/local/unknown"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 404)
            self.assertNotContains(response, "synthetic-public-shell", status_code=404)

    def test_assets_mime_head_and_cache_policy(self):
        for path, mime in (
            ("/assets/index-Ab12Cd34.js", "javascript"),
            ("/assets/index-Ab12Cd34.css", "text/css"),
            ("/icons/icon-192.png", "image/png"),
            ("/sw.js", "javascript"),
            ("/manifest.webmanifest", "application/manifest+json"),
        ):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertIn(mime, response["Content-Type"])
                body = (
                    b"".join(response.streaming_content) if response.streaming else response.content
                )
                self.assertTrue(body)
                if path.startswith("/assets/"):
                    self.assertIn("immutable", response["Cache-Control"])
                else:
                    self.assertIn("no-store", response["Cache-Control"])
                head = self.client.head(path)
                self.assertEqual(head.status_code, 200)
                self.assertEqual(head.content, b"")

    def test_traversal_and_non_build_files_are_not_published(self):
        for path in (
            "/.env",
            "/assets/secret.env",
            "/assets/../.env",
            "/assets/%2e%2e/.env",
            "/assets/%252e%252e/.env",
            "/assets/%5c..%5c.env",
            "/assets/index-Ab12Cd34.js/extra",
        ):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 404)
                self.assertNotContains(response, "PRIVATE-SENTINEL", status_code=404)

    def test_symlink_outside_dist_is_not_served(self):
        outside = self.root.parent / "private.js"
        outside.write_text("PRIVATE-SENTINEL")
        link = self.root / "assets/outside-Ab12Cd34.js"
        try:
            link.symlink_to(outside)
        except OSError:
            self.skipTest("OS did not permit a synthetic file symlink; Linux CI must cover it.")
        self.assertEqual(self.client.get("/assets/outside-Ab12Cd34.js").status_code, 404)

    def test_local_profile_does_not_implicitly_publish_frontend(self):
        with override_settings(AMBUSYNC_SERVE_FRONTEND=False):
            self.assertEqual(self.client.get("/local").status_code, 404)


class DeploymentProfileTests(SimpleTestCase):
    def profile(self, changes=None):
        with TemporaryDirectory() as directory:
            Path(directory, "index.html").write_text("synthetic-shell")
            env = {
                key: value
                for key, value in os.environ.items()
                if key in ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE")
            }
            env.update(
                DJANGO_SECRET_KEY="synthetic-deployment-secret-" * 3,
                FRONTEND_BASE_URL="https://synthetic-l.onrender.com",
                DATABASE_URL="postgresql://synthetic:unused@dpg-synthetic-a/synthetic_l?sslmode=require",
                VALKEY_URL="redis://red-synthetic:6379/0",
                AMBUSYNC_DATABASE_NETWORK="internal",
                AMBUSYNC_EXPECTED_DATABASE_HOST="dpg-synthetic-a",
                AMBUSYNC_EXPECTED_DATABASE_NAME="synthetic_l",
                AMBUSYNC_EXPECTED_VALKEY_HOST="red-synthetic",
                AMBUSYNC_FRONTEND_ROOT=directory,
            )
            for key, value in (changes or {}).items():
                if value is None:
                    env.pop(key, None)
                else:
                    env[key] = value
            script = """
import json
from unittest.mock import patch
with patch('dotenv.load_dotenv', side_effect=AssertionError('dotenv must not load')):
    import config.deployment_settings as s
print(json.dumps({
 'debug': s.DEBUG, 'hosts': s.ALLOWED_HOSTS, 'origins': s.CSRF_TRUSTED_ORIGINS,
 'secure': s.SESSION_COOKIE_SECURE and s.CSRF_COOKIE_SECURE,
 'redirect': s.SECURE_SSL_REDIRECT, 'referrer': s.SECURE_REFERRER_POLICY,
 'sslmode': s.DATABASES['default']['OPTIONS']['sslmode'],
}))
"""
            return subprocess.run(
                [sys.executable, "-c", script],
                cwd=BACKEND,
                env=env,
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )

    def test_profile_is_fail_closed_without_using_development_dotenv(self):
        result = self.profile()
        self.assertEqual(result.returncode, 0, result.stderr[-500:])
        self.assertEqual(
            json.loads(result.stdout),
            {
                "debug": False,
                "hosts": ["synthetic-l.onrender.com"],
                "origins": ["https://synthetic-l.onrender.com"],
                "secure": True,
                "redirect": True,
                "referrer": "no-referrer",
                "sslmode": "require",
            },
        )
        for key in (
            "DJANGO_SECRET_KEY",
            "DATABASE_URL",
            "VALKEY_URL",
            "FRONTEND_BASE_URL",
            "AMBUSYNC_FRONTEND_ROOT",
            "AMBUSYNC_EXPECTED_DATABASE_HOST",
            "AMBUSYNC_EXPECTED_DATABASE_NAME",
            "AMBUSYNC_EXPECTED_VALKEY_HOST",
        ):
            with self.subTest(key=key):
                self.assertNotEqual(self.profile({key: None}).returncode, 0)

    def test_public_database_cannot_downgrade_certificate_verification(self):
        changes = {
            "AMBUSYNC_DATABASE_NETWORK": "external",
            "AMBUSYNC_EXPECTED_DATABASE_HOST": "dpg-synthetic-a.oregon-postgres.render.com",
            "DATABASE_URL": "postgresql://synthetic:unused@dpg-synthetic-a.oregon-postgres.render.com/synthetic_l?sslmode=require",
        }
        self.assertNotEqual(self.profile(changes).returncode, 0)
        changes["DATABASE_URL"] = changes["DATABASE_URL"].replace("require", "verify-full")
        result = self.profile(changes)
        self.assertEqual(result.returncode, 0, result.stderr[-500:])

    def test_invalid_origins_hosts_or_smoke_public_bypass_are_rejected(self):
        for changes in (
            {"FRONTEND_BASE_URL": "http://synthetic-l.onrender.com"},
            {"FRONTEND_BASE_URL": "https://*.onrender.com"},
            {"FRONTEND_BASE_URL": "https://synthetic-l.onrender.com/extra"},
            {"FRONTEND_BASE_URL": "https://user:secret@synthetic-l.onrender.com"},
            {"AMBUSYNC_EXPECTED_DATABASE_HOST": "different-host"},
            {"AMBUSYNC_EXPECTED_DATABASE_NAME": "ambusync_dev"},
            {"AMBUSYNC_LOCAL_SMOKE": "1"},
        ):
            with self.subTest(changes=changes):
                self.assertNotEqual(self.profile(changes).returncode, 0)

    def test_isolated_runner_help_can_execute_without_running_tests(self):
        result = subprocess.run(
            [sys.executable, "scripts/test_isolated.py", "--help"],
            cwd=BACKEND,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr[-500:])
        self.assertIn("--noinput", result.stdout)


class DeploymentHealthTests(TestCase):
    def setUp(self):
        middleware = list(settings.MIDDLEWARE)
        middleware.insert(1, "config.health.HealthProbeMiddleware")
        self.context = override_settings(MIDDLEWARE=middleware, SECURE_SSL_REDIRECT=False)
        self.context.enable()
        self.addCleanup(self.context.disable)
        self.client = Client()
        self.client.cookies["sessionid"] = "expired-synthetic-cookie"

    def test_live_never_touches_sessions_or_database_even_with_cookie(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get("/health/live/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertEqual(len(queries), 0)
        self.assertNotIn("sessionid", response.cookies)
        self.assertIn("no-store", response["Cache-Control"])

    def test_ready_reads_database_but_does_not_renew_session(self):
        response = self.client.get("/health/ready/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertFalse(response.cookies)
        with patch("config.health.connection.cursor", side_effect=OSError("SECRET-SENTINEL")):
            failed = self.client.get("/health/ready/")
        self.assertEqual(failed.status_code, 503)
        self.assertEqual(failed.json(), {"status": "unavailable"})
        self.assertNotContains(failed, "SECRET-SENTINEL", status_code=503)
        self.assertEqual(self.client.post("/health/live/", {}).status_code, 405)
