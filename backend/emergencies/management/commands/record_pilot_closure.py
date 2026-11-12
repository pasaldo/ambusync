import json

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from audit.models import PilotClosure
from emergencies.retention import parse_timestamp


class Command(BaseCommand):
    help = "Registra el cierre formal único del piloto sintético; no ejecuta purgas."

    def add_arguments(self, parser):
        parser.add_argument("--closed-at", required=True)
        parser.add_argument("--executor", required=True)

    def handle(self, *args, **options):
        closed_at = parse_timestamp(options["closed_at"], "--closed-at")
        executor = options["executor"].strip()
        if not executor or len(executor) > 255:
            raise CommandError("Indica un ejecutor de 1 a 255 caracteres, sin secretos.")
        if closed_at > timezone.now():
            raise CommandError("No se puede registrar un cierre formal futuro.")
        with transaction.atomic():
            closure, created = PilotClosure.objects.get_or_create(
                pk=1, defaults={"closed_at": closed_at, "executor": executor}
            )
            if closure.closed_at != closed_at:
                raise CommandError("El cierre ya está registrado con otra fecha; no se reemplazó.")
        self.stdout.write(
            json.dumps({"created": created, "closed_at": closure.closed_at.isoformat()})
        )
