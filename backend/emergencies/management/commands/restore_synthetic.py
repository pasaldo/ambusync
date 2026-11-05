import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from emergencies.models import Emergency


class Command(BaseCommand):
    help = "Restaura un paquete JSON sintético exportado para las pruebas de retención."

    def add_arguments(self, parser):
        parser.add_argument("package", type=Path, help="Ruta al paquete JSON sintético.")
        parser.add_argument("--dry-run", action="store_true", help="Valida sin escribir cambios.")

    def handle(self, *args, **options):
        package = options["package"]
        try:
            payload = json.loads(package.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise CommandError("El paquete de restauración no es JSON válido.") from error
        emergencies = payload.get("emergencies")
        if not isinstance(emergencies, list):
            raise CommandError("El paquete debe contener una lista emergencies.")
        if options["dry_run"]:
            self.stdout.write(json.dumps({"mode": "dry-run", "emergencies": len(emergencies)}))
            return
        with transaction.atomic():
            for item in emergencies:
                Emergency.objects.update_or_create(id=item["id"], defaults=item["defaults"])
        self.stdout.write(json.dumps({"mode": "apply", "emergencies": len(emergencies)}))
