import json
from io import StringIO
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from emergencies.models import Emergency
from emergencies.retention import parse_timestamp


def require_isolated_database():
    database = connection.settings_dict
    name = str(database["NAME"])
    if (
        not settings.SYNTHETIC_RESTORE_ENABLED
        or database["HOST"] not in ("127.0.0.1", "localhost", "::1")
        or not (name.startswith(("test_", "ambusync_restore_")) or name == "ambusync_restore")
    ):
        raise CommandError(
            "La restauración requiere habilitación explícita y una base local aislada test_* o ambusync_restore[_*]."
        )


class Command(BaseCommand):
    help = "Valida un paquete sintético de episodios; --apply solo en base aislada, con retención antes de finalizar. No es un backup completo."

    def add_arguments(self, parser):
        parser.add_argument("package", type=Path)
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument(
            "--dry-run", action="store_true", help="Valida sin escribir (predeterminado)."
        )
        mode.add_argument("--apply", action="store_true")
        parser.add_argument(
            "--as-of", help="Referencia ISO 8601 con zona para reaplicar retención."
        )

    def handle(self, *args, **options):
        as_of = parse_timestamp(options.get("as_of"))
        if options["apply"]:
            require_isolated_database()
        try:
            payload = json.loads(options["package"].read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, UnicodeError) as error:
            raise CommandError("El paquete de restauración no es JSON válido.") from error
        records = self.validate_package(payload)
        if not options["apply"]:
            self.stdout.write(json.dumps({"mode": "dry-run", "emergencies": len(records)}))
            return
        with transaction.atomic():
            # Entire package is validated before the first write. Existing IDs
            # never update: a replay cannot silently replace authoritative data.
            for record in records:
                if Emergency.objects.filter(pk=record.pk).exists():
                    raise CommandError(
                        "El paquete contiene un episodio existente; no se sobrescribió."
                    )
                record.save(force_insert=True)
            output = StringIO()
            call_command("apply_retention", apply=True, as_of=as_of.isoformat(), stdout=output)
            retention = json.loads(output.getvalue())
        self.stdout.write(
            json.dumps({"mode": "apply", "emergencies": len(records), "retention": retention})
        )

    def validate_package(self, payload):
        if (
            not isinstance(payload, dict)
            or set(payload) != {"emergencies"}
            or not isinstance(payload["emergencies"], list)
        ):
            raise CommandError("El paquete debe contener únicamente la lista emergencies.")
        allowed = {
            field.attname
            for field in Emergency._meta.concrete_fields
            if not field.primary_key and not getattr(field, "auto_now_add", False)
        }
        records = []
        ids = set()
        for item in payload["emergencies"]:
            if (
                not isinstance(item, dict)
                or set(item) != {"id", "defaults"}
                or not isinstance(item["defaults"], dict)
                or set(item["defaults"]) - allowed
            ):
                raise CommandError("Registro sintético inválido o con campos no admitidos.")
            try:
                record = Emergency(id=item["id"], **item["defaults"])
                record.full_clean()
            except ValidationError, ValueError, TypeError, OverflowError:
                raise CommandError(
                    "Registro sintético inválido; revisa tipos, campos y referencias."
                ) from None
            if record.pk in ids:
                raise CommandError("El paquete contiene identificadores duplicados.")
            ids.add(record.pk)
            records.append(record)
        return records
