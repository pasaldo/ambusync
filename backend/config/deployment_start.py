"""Fail-closed, single-instance deployment startup. Never used by local development."""

import os
import re
import sys
from contextlib import contextmanager
from io import StringIO
from pathlib import Path

import django
from django.conf import settings
from django.core.management import call_command
from django.db import connection

BUILD_SHA_FILE = Path(__file__).resolve().parent.parent / "build-sha"
MIGRATION_LOCK = 481731923


def verify_database():
    connection.ensure_connection()
    expected_host = settings.AMBUSYNC_EXPECTED_DATABASE_HOST
    expected_name = settings.AMBUSYNC_EXPECTED_DATABASE_NAME
    # Read the driver's effective host as well as the server's actual database.
    # OPTIONS/service overrides must not silently redirect the migration.
    with connection.cursor() as cursor:
        cursor.execute("SELECT current_database()")
        actual_name = cursor.fetchone()[0]
    if connection.connection.info.host != expected_host or actual_name != expected_name:
        raise RuntimeError("Deployment database mismatch.")


@contextmanager
def migration_lock():
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(%s)", [MIGRATION_LOCK])
        if cursor.fetchone() != (True,):
            raise RuntimeError("Deployment migration lock unavailable.")
    try:
        yield
    finally:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_unlock(%s)", [MIGRATION_LOCK])


def prepare_database(build_sha, approval):
    if not re.fullmatch(r"[0-9a-f]{40}", build_sha) or (approval and approval != build_sha):
        raise RuntimeError("Deployment approval mismatch.")
    verify_database()
    with migration_lock():
        try:
            call_command(
                "migrate",
                check=True,
                interactive=False,
                verbosity=0,
                stdout=StringIO(),
                stderr=StringIO(),
            )
        except SystemExit as pending:
            if pending.code != 1 or approval != build_sha:
                raise RuntimeError("Deployment migrations require approval.") from None
            call_command(
                "migrate", interactive=False, verbosity=0, stdout=StringIO(), stderr=StringIO()
            )
            call_command(
                "migrate",
                check=True,
                interactive=False,
                verbosity=0,
                stdout=StringIO(),
                stderr=StringIO(),
            )


def main():
    try:
        if os.environ.get("DJANGO_SETTINGS_MODULE") != "config.deployment_settings":
            raise ValueError
        port = int(os.environ.get("PORT", "10000"))
        if not 1024 <= port <= 65535:
            raise ValueError
        build_sha = BUILD_SHA_FILE.read_text(encoding="ascii").strip()
        django.setup()
        prepare_database(build_sha, os.environ.get("AMBUSYNC_MIGRATION_APPROVAL_SHA", ""))
        connection.close()
        os.execv(
            sys.executable,
            [
                sys.executable,
                "-m",
                "daphne",
                "-b",
                "0.0.0.0",
                "-p",
                str(port),
                "--access-log",
                os.devnull,
                "-v",
                "0",
                "config.asgi:application",
            ],
        )
        return 0
    except Exception, SystemExit:  # noqa: BLE001 -- startup failures must never disclose private configuration.
        # No URL, token, SQL or exception text is safe for deployment startup logs.
        sys.stderr.write(
            "Deployment startup refused; verify configuration and migration approval.\n"
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
