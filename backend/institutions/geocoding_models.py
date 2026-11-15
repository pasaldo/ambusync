from django.db import models


class GeocodingLookup(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    address = models.CharField(max_length=255)
    candidates = models.JSONField(default=list)
    status = models.CharField(max_length=24, default="pending")
    updated_at = models.DateTimeField(auto_now=True)


class GeocodingQuota(models.Model):
    # One global row serializes quota and frequency for all application workers.
    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    day = models.DateField()
    used = models.PositiveIntegerField(default=0)
    last_request_at = models.DateTimeField(null=True)
