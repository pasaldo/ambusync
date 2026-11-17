"""Reject libpq routing/default overrides before any deployment connection."""

import os


def reject_ambient_libpq():
    # The deployment URL is the sole authority, including explicit TLS options.
    # Reject rather than erase inherited values: no silent parent/child mismatch.
    if any(name.upper().startswith("PG") and value for name, value in os.environ.items()):
        raise RuntimeError("Ambient PostgreSQL configuration is not permitted.")


def validate_connection_settings(configured):
    reject_ambient_libpq()
    options = configured.get("OPTIONS", {})
    if (
        configured.get("ENGINE") != "django.db.backends.postgresql"
        or not isinstance(options, dict)
        or set(options) - {"sslmode", "sslrootcert", "connect_timeout"}
        or not configured.get("HOST")
        or not configured.get("NAME")
    ):
        raise RuntimeError("PostgreSQL connection override is not permitted.")
