import json
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from audit.models import (
    AuditEvent,
    PilotClosure,
    RetentionExecution,
    SessionRevocationEvent,
    TechnicalLog,
)
from emergencies.models import Emergency, ProcessedOperation, VitalMeasurement
from emergencies.retention import deadlines, parse_timestamp

COMMAND_VERSION = "d010-d011-v2"
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
        with transaction.atomic():
            closure = PilotClosure.objects.select_for_update().filter(pk=1).first()
            self.closed_at = closure.closed_at if closure else None
            if options["apply"]:
                try:
                    # Savepoint: failed deletes roll back before minimal failure metadata.
                    with transaction.atomic():
                        return self._execute(as_of, options)
                except Exception as error:  # noqa: BLE001 -- command boundary: rollback, log type, then fail closed
                    RetentionExecution.objects.create(
                        mode=RetentionExecution.Mode.APPLY,
                        command_version=COMMAND_VERSION,
                        as_of=as_of,
                        pilot_closed_at=self.closed_at,
                        executor="manage.py apply_retention",
                        result="failed",
                        counts={},
                        errors=[{"type": type(error).__name__}],
                    )
            else:
                return self._execute(as_of, options)
        raise CommandError(
            "La retención falló; los borrados se revirtieron. Consulta el registro mínimo."
        )

    def _execute(self, as_of, options):
        plan = self._build_plan(as_of, lock=options["apply"])
        if not options["apply"]:
            RetentionExecution.objects.create(
                mode=RetentionExecution.Mode.DRY_RUN,
                command_version=COMMAND_VERSION,
                as_of=as_of,
                pilot_closed_at=self.closed_at,
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
                "session_revocations": SessionRevocationEvent.objects.filter(
                    id__in=plan["session_revocation_ids"]
                ).delete()[0],
                "technical_logs": self._delete_technical_logs(plan["technical_log_ids"]),
            }
            deleted["audit"] += deleted["session_revocations"]
            RetentionExecution.objects.create(
                mode=RetentionExecution.Mode.APPLY,
                command_version=COMMAND_VERSION,
                as_of=as_of,
                pilot_closed_at=self.closed_at,
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
                {
                    "mode": "apply",
                    "as_of": as_of.isoformat(),
                    "pilot_closed_at": self.closed_at.isoformat() if self.closed_at else None,
                    "deleted": deleted,
                },
                ensure_ascii=False,
            )
        )

    def _parse_as_of(self, raw):
        return parse_timestamp(raw)

    def _build_plan(self, as_of, lock=False):
        application_deadline, audit_deadline = deadlines(self.closed_at)
        technical_log_cutoff = as_of - timedelta(days=LOG_RETENTION_DAYS)
        emergency_queryset = (
            Emergency.objects.all()
            if application_deadline and as_of > application_deadline
            else Emergency.objects.none()
        )
        if lock:
            emergency_queryset = emergency_queryset.select_for_update()
        emergency_ids = list(emergency_queryset.values_list("id", flat=True))
        emergency_ids = list(dict.fromkeys(emergency_ids))
        operation_ids = list(
            ProcessedOperation.objects.filter(emergency_id__in=emergency_ids).values_list(
                "id", flat=True
            )
        )
        measurement_ids = list(
            VitalMeasurement.objects.filter(emergency_id__in=emergency_ids).values_list(
                "id", flat=True
            )
        )
        audit_ids = (
            list(AuditEvent.objects.values_list("id", flat=True))
            if audit_deadline and as_of > audit_deadline
            else []
        )
        session_revocation_ids = (
            list(SessionRevocationEvent.objects.values_list("id", flat=True))
            if audit_deadline and as_of > audit_deadline
            else []
        )
        technical_log_ids = list(
            TechnicalLog.objects.filter(occurred_at__lt=technical_log_cutoff).values_list(
                "id", flat=True
            )
        )
        return {
            "pilot_closed_at": self.closed_at.isoformat() if self.closed_at else None,
            "cutoffs": {
                "application": application_deadline.isoformat() if application_deadline else None,
                "audit": audit_deadline.isoformat() if audit_deadline else None,
                "operations": "while_related_application_exists",
                "technical_logs": technical_log_cutoff.isoformat(),
            },
            "emergency_ids": [str(item) for item in emergency_ids],
            "operations_ids": [str(item) for item in operation_ids],
            "measurement_ids": [str(item) for item in measurement_ids],
            "audit_ids": [str(item) for item in audit_ids],
            "session_revocation_ids": [str(item) for item in session_revocation_ids],
            "technical_log_ids": [str(item) for item in technical_log_ids],
            "counts": {
                "emergencies": len(emergency_ids),
                "operations": len(operation_ids),
                "measurements": len(measurement_ids),
                "audit": len(audit_ids) + len(session_revocation_ids),
                "session_revocations": len(session_revocation_ids),
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
