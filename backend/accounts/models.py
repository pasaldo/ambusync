from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Personal account; functional permissions are assigned through Django groups."""

    session_version = models.PositiveBigIntegerField(default=1)


class LoginThrottle(models.Model):
    key_digest = models.CharField(max_length=64, primary_key=True)
    failures = models.PositiveSmallIntegerField(default=0)
    window_started_at = models.DateTimeField(null=True, blank=True)
    lockouts = models.PositiveSmallIntegerField(default=0)
    blocked_until = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=("updated_at",), name="login_throttle_updated_idx")]
