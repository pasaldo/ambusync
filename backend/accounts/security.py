import hashlib
import hmac
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import LoginThrottle, User
from audit.models import SessionRevocationEvent

LOGIN_WINDOW = timedelta(minutes=15)
LOGIN_THRESHOLD = 5
LOGIN_BACKOFF_SECONDS = (30, 60, 120, 300, 900)


def _digest(value):
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        value.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def login_throttle_keys(username, remote_addr):
    normalized_username = username.strip().casefold()
    return (
        _digest(f"account:{normalized_username}"),
        _digest(f"origin:{remote_addr or 'unknown'}"),
    )


def _locked_rows(keys):
    rows = []
    for key in sorted(keys):
        row, _ = LoginThrottle.objects.get_or_create(key_digest=key)
        rows.append(LoginThrottle.objects.select_for_update().get(pk=row.pk))
    return rows


def login_is_throttled(username, remote_addr):
    now = timezone.now()
    keys = login_throttle_keys(username, remote_addr)
    with transaction.atomic():
        rows = _locked_rows(keys)
        retry_after = 0
        for row in rows:
            if row.window_started_at and now - row.window_started_at >= LOGIN_WINDOW:
                row.failures = 0
                row.lockouts = 0
                row.window_started_at = None
                row.blocked_until = None
                row.save(
                    update_fields=(
                        "failures",
                        "lockouts",
                        "window_started_at",
                        "blocked_until",
                        "updated_at",
                    )
                )
            if row.blocked_until and row.blocked_until > now:
                retry_after = max(retry_after, int((row.blocked_until - now).total_seconds()) + 1)
        return retry_after


def record_login_failure(username, remote_addr):
    now = timezone.now()
    keys = login_throttle_keys(username, remote_addr)
    with transaction.atomic():
        for row in _locked_rows(keys):
            if row.window_started_at is None or now - row.window_started_at >= LOGIN_WINDOW:
                row.window_started_at = now
                row.failures = 0
                row.lockouts = 0
                row.blocked_until = None
            row.failures += 1
            if row.failures >= LOGIN_THRESHOLD:
                row.lockouts = min(row.lockouts + 1, len(LOGIN_BACKOFF_SECONDS))
                backoff_index = min(row.lockouts - 1, len(LOGIN_BACKOFF_SECONDS) - 1)
                row.blocked_until = now + timedelta(seconds=LOGIN_BACKOFF_SECONDS[backoff_index])
                row.failures = 0
                row.window_started_at = now
            row.save()


def clear_login_failures(username, remote_addr):
    LoginThrottle.objects.filter(key_digest__in=login_throttle_keys(username, remote_addr)).delete()


@transaction.atomic
def revoke_user_sessions(user, *, executor, reason):
    """Invalidate every authenticated session at its next request."""
    executor = executor.strip()
    reason = reason.strip()
    if not executor or len(executor) > 255:
        raise ValueError("El ejecutor debe tener entre 1 y 255 caracteres.")
    if not reason or len(reason) > 500:
        raise ValueError("El motivo debe tener entre 1 y 500 caracteres.")

    locked_user = User.objects.select_for_update().get(pk=user.pk)
    locked_user.session_version += 1
    locked_user.save(update_fields=("session_version",))
    SessionRevocationEvent.objects.create(
        target_user=locked_user,
        executor=executor,
        reason=reason,
        resulting_session_version=locked_user.session_version,
    )
    return locked_user.session_version
