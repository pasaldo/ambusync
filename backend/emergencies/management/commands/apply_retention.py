import json
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from audit.models import AuditEvent, RetentionExecution, TechnicalLog
from emergencies.models import Emergency, ProcessedOperation, VitalMeasurement

RETENTION_DAYS = {
    "application": 90,
    "audit": 365,
    "operations": 90,
}
COMMAND_VERSION = "d010-d011-v1"
LOG_RETENTION_DAYS = 30


class Command(BaseCommand):
    help = "Simula o ejecuta la retención sintética aprobada en D-010/D-011."

    def add_arguments(self, parser):
        parser.add_argument("--as-of", help="Fecha/hora ISO 8601 para una ejecución reproducible.")
        parser.add_argument(
            "--apply", action="store_true", help="Ejecuta la purga; por defecto solo simula."
        )

    def handle(self, *args, **options):
        as_of = self._parse_as_of(options.get("as_of"))
        plan = self._build_plan(as_of)
        if not options["apply"]:
            RetentionExecution.objects.create(
                mode=RetentionExecution.Mode.DRY_RUN,
                command_version=COMMAND_VERSION,
                as_of=as_of,
                executor="manage.py apply_retention",
                result="planned",
                counts=plan["counts"],
            )
            TechnicalLog.objects.create(
                level=TechnicalLog.Level.INFO,
                event="retention.simulated",
                result="planned",
                details={"command_version": COMMAND_VERSION, "counts": plan["counts"]},
            )
            self.stdout.write(
                json.dumps(
                    {"mode": "dry-run", "as_of": as_of.isoformat(), **plan}, ensure_ascii=False
                )
            )
            return

        with transaction.atomic():
            deleted = {
                "operations": self._delete_operations(plan["operations_ids"]),
                "vital_measurements": self._delete_measurements(plan["measurement_ids"]),
                "emergencies": self._delete_emergencies(plan["emergency_ids"]),
                "audit": self._delete_audit(plan["audit_ids"]),
                "technical_logs": self._delete_technical_logs(plan["technical_log_ids"]),
            }
            RetentionExecution.objects.create(
                mode=RetentionExecution.Mode.APPLY,
                command_version=COMMAND_VERSION,
                as_of=as_of,
                executor="manage.py apply_retention",
                result="applied",
                counts=deleted,
            )
            TechnicalLog.objects.create(
                level=TechnicalLog.Level.INFO,
                event="retention.applied",
                result="success",
                details={"command_version": COMMAND_VERSION, "counts": deleted},
            )
        self.stdout.write(
            json.dumps(
                {"mode": "apply", "as_of": as_of.isoformat(), "deleted": deleted},
                ensure_ascii=False,
            )
        )

    def _parse_as_of(self, raw):
        if not raw:
            return timezone.now()
        value = raw.replace("Z", "+00:00")
        try:
            parsed = timezone.datetime.fromisoformat(value)
        except ValueError as error:
            raise CommandError("--as-of debe ser una fecha ISO 8601 válida.") from error
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.utc)
        return parsed

    def _build_plan(self, as_of):
        application_cutoff = as_of - timedelta(days=RETENTION_DAYS["application"])
        audit_cutoff = as_of - timedelta(days=RETENTION_DAYS["audit"])
        operation_cutoff = as_of - timedelta(days=RETENTION_DAYS["operations"])
        technical_log_cutoff = as_of - timedelta(days=LOG_RETENTION_DAYS)
        emergency_queryset = Emergency.objects.filter(
            status=Emergency.Status.CLOSED, closed_at__lt=application_cutoff
        ) | Emergency.objects.filter(
            status=Emergency.Status.CANCELLED, cancelled_at__lt=application_cutoff
        )
        emergency_ids = list(emergency_queryset.values_list("id", flat=True))
        emergency_ids = list(dict.fromkeys(emergency_ids))
        operation_ids = list(
            ProcessedOperation.objects.filter(created_at__lt=operation_cutoff)
            .filter(emergency_id__in=emergency_ids)
            .values_list("id", flat=True)
        )
        measurement_ids = list(
            VitalMeasurement.objects.filter(emergency_id__in=emergency_ids).values_list(
                "id", flat=True
            )
        )
        audit_ids = list(
            AuditEvent.objects.filter(occurred_at__lt=audit_cutoff, object_type="emergency")
            .filter(object_id__in=[str(item) for item in emergency_ids])
            .values_list("id", flat=True)
        )
        technical_log_ids = list(
            TechnicalLog.objects.filter(occurred_at__lt=technical_log_cutoff)
            .exclude(event__startswith="retention.")
            .values_list("id", flat=True)
        )
        return {
            "cutoffs": {
                "application": application_cutoff.isoformat(),
                "audit": audit_cutoff.isoformat(),
                "operations": operation_cutoff.isoformat(),
                "technical_logs": technical_log_cutoff.isoformat(),
            },
            "emergency_ids": [str(item) for item in emergency_ids],
            "operations_ids": [str(item) for item in operation_ids],
            "measurement_ids": [str(item) for item in measurement_ids],
            "audit_ids": [str(item) for item in audit_ids],
            "technical_log_ids": [str(item) for item in technical_log_ids],
            "counts": {
                "emergencies": len(emergency_ids),
                "operations": len(operation_ids),
                "measurements": len(measurement_ids),
                "audit": len(audit_ids),
                "technical_logs": len(technical_log_ids),
            },
        }

    def _delete_operations(self, ids):
        return ProcessedOperation.objects.filter(id__in=ids).delete()[0]

    def _delete_measurements(self, ids):
        return VitalMeasurement.objects.filter(id__in=ids).delete()[0]

    def _delete_emergencies(self, ids):
        ProcessedOperation.objects.filter(emergency_id__in=ids).delete()
        return Emergency.objects.filter(id__in=ids).delete()[0]

    def _delete_audit(self, ids):
        return AuditEvent.objects.filter(id__in=ids).delete()[0]

    def _delete_technical_logs(self, ids):
        return TechnicalLog.objects.filter(id__in=ids).delete()[0]
