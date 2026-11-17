"""Explicit synthetic deployment profile. Importing it never reads a local .env."""

import os
import re
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

from django.core.exceptions import ImproperlyConfigured

from config.database_guard import reject_ambient_libpq, validate_connection_settings
from config.test_mailbox import mailpit_settings, validate_mail_mode

os.environ["AMBUSYNC_LOAD_DOTENV"] = "false"
reject_ambient_libpq()


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ImproperlyConfigured(f"Missing deployment setting: {name}")
    return value


def invalid():
    # Never include a URL, credential, sender, or raw parsing exception.
    raise ImproperlyConfigured("Invalid synthetic deployment configuration.") from None


for _name in ("DJANGO_SECRET_KEY", "DATABASE_URL", "VALKEY_URL"):
    required(_name)
if len(required("DJANGO_SECRET_KEY")) < 50:
    invalid()

try:
    _origin = urlsplit(required("FRONTEND_BASE_URL"))
    _db = urlsplit(required("DATABASE_URL"))
    _db_options = parse_qsl(_db.query, keep_blank_values=True, strict_parsing=True)
    if any(
        name not in {"sslmode", "sslrootcert"} or not value for name, value in _db_options
    ) or len({name for name, _value in _db_options}) != len(_db_options):
        invalid()
    _kv = urlsplit(required("VALKEY_URL"))
    _smoke = os.environ.get("AMBUSYNC_LOCAL_SMOKE") == "1"
    _expected_host = required("AMBUSYNC_EXPECTED_DATABASE_HOST")
    _expected_name = required("AMBUSYNC_EXPECTED_DATABASE_NAME")
    _expected_kv = required("AMBUSYNC_EXPECTED_VALKEY_HOST")
    _network = required("AMBUSYNC_DATABASE_NETWORK")
    _local_hosts = {"localhost", "127.0.0.1", "::1"}
    if (
        _origin.scheme != "https"
        or not _origin.hostname
        or _origin.username
        or _origin.password
        or _origin.path not in ("", "/")
        or _origin.query
        or _origin.fragment
    ):
        invalid()
    if _smoke:
        if _origin.hostname not in _local_hosts:
            invalid()
        if _db.hostname not in _local_hosts | {"ambusync-l-pg"}:
            invalid()
        if _kv.hostname not in _local_hosts | {"ambusync-l-kv"}:
            invalid()
        if _network != "smoke":
            invalid()
    else:
        if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.onrender\.com", _origin.hostname):
            invalid()
        if _origin.port not in (None, 443):
            invalid()
        if _network == "internal":
            if not re.fullmatch(r"dpg-[a-z0-9-]+", _db.hostname or ""):
                invalid()
        elif _network == "external":
            if not re.fullmatch(r"dpg-[a-z0-9-]+\.[a-z0-9-]+\.render\.com", _db.hostname or ""):
                invalid()
        else:
            invalid()
        if not re.fullmatch(r"red-[a-z0-9-]+", _kv.hostname or ""):
            invalid()
    if (
        _db.scheme not in ("postgres", "postgresql")
        or _db.hostname != _expected_host
        or _db.path != "/" + _expected_name
        or not re.fullmatch(r"[a-zA-Z0-9_-]+", _expected_name)
        or _db.fragment
        or _kv.scheme not in ("redis", "rediss")
        or _kv.hostname != _expected_kv
        or _kv.fragment
    ):
        invalid()
    _dist = Path(required("AMBUSYNC_FRONTEND_ROOT")).resolve(strict=True)
    if not _dist.is_dir() or not (_dist / "index.html").is_file():
        invalid()
except ValueError, OSError:
    invalid()

from config.settings import *

DEBUG = False
ALLOWED_HOSTS = [_origin.hostname]
CSRF_TRUSTED_ORIGINS = [f"https://{_origin.netloc}"]
FRONTEND_BASE_URL = f"https://{_origin.netloc}"
AMBUSYNC_SERVE_FRONTEND = True
AMBUSYNC_FRONTEND_ROOT = _dist
AMBUSYNC_EXPECTED_DATABASE_HOST = _expected_host
AMBUSYNC_EXPECTED_DATABASE_NAME = _expected_name
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True
SECURE_REDIRECT_EXEMPT = [r"^health/live/$", r"^health/ready/$"]
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = False
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "no-referrer"
X_FRAME_OPTIONS = "DENY"
MIDDLEWARE = list(MIDDLEWARE)
MIDDLEWARE.insert(1, "config.health.HealthProbeMiddleware")
DATABASES["default"]["OPTIONS"]["connect_timeout"] = 3
validate_connection_settings(DATABASES["default"])
_sslmode = DATABASES["default"]["OPTIONS"].get("sslmode")
if _network == "external" and _sslmode != "verify-full":
    invalid()
if _network == "internal" and _sslmode not in ("require", "verify-full"):
    invalid()
if _network == "smoke" and _sslmode not in ("disable", "require", "verify-full"):
    invalid()

EMAIL_BACKEND = "accounts.mail_backend.BrevoEmailBackend"
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "")
BREVO_ALLOWED_RECIPIENTS = [
    value.strip()
    for value in os.environ.get("BREVO_ALLOWED_RECIPIENTS", "").split(",")
    if value.strip()
]
try:
    BREVO_DAILY_LIMIT = int(os.environ.get("BREVO_DAILY_LIMIT", "100"))
    if not 1 <= BREVO_DAILY_LIMIT <= 100:
        invalid()
except ValueError:
    invalid()
DEFAULT_FROM_EMAIL = f"AmbuSync <{BREVO_SENDER_EMAIL}>" if BREVO_SENDER_EMAIL else ""
AMBUSYNC_MAIL_MODE = validate_mail_mode(os.environ)
if AMBUSYNC_MAIL_MODE == "mailpit":
    globals().update(mailpit_settings())

# No request object, query, exception string or stack enters deployment diagnostics.
# Domain audit events remain in the database, unaffected by this logging profile.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"private_request": {"()": "config.log_filters.RedactRequestLog"}},
    "handlers": {
        "safe_console": {
            "class": "logging.StreamHandler",
            "filters": ["private_request"],
        },
    },
    "loggers": {
        name: {"handlers": ["safe_console"], "level": "WARNING", "propagate": False}
        for name in ("django", "daphne", "django.request", "django.server")
    },
}
