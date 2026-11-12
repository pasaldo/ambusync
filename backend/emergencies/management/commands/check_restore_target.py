import os

import dj_database_url
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from audit.models import PilotClosure
from emergencies.management.commands.restore_synthetic import require_isolated_database


class Command(BaseCommand):
    help = "Rechaza destinos de restauración no aislados antes de importar un dump."

    def add_arguments(self, parser):
        parser.add_argument("--compare-active", action="store_true")
        parser.add_argument("--expect-pilot-open", action="store_true")

    def handle(self, *args, **options):
        if options["compare_active"]:
            try:
                target = dj_database_url.parse(os.environ["AMBUSYNC_RESTORE_TARGET_URL"])
            except KeyError, ValueError:
                raise CommandError(
                    "Falta un destino válido para contrastar con la configuración efectiva."
                ) from None
            if self.identity(target) == self.identity(connection.settings_dict):
                raise CommandError(
                    "El destino coincide con la base activa efectiva de Django; no restaurar."
                )
            self.stdout.write(
                "Destino distinto de la configuración activa efectiva; sin revelar credenciales."
            )
            return
        require_isolated_database()
        if options["expect_pilot_open"] and PilotClosure.objects.exists():
            raise CommandError(
                "Se confirmó piloto abierto pero el snapshot registra cierre; reconciliar antes de continuar."
            )
        self.stdout.write(
            "Destino de ensayo sintético local habilitado; no autoriza exponer servicios."
        )

    @staticmethod
    def identity(config):
        host = config.get("HOST", "").lower()
        if host in ("localhost", "127.0.0.1", "::1", "[::1]"):
            host = "loopback"
        return host, str(config.get("PORT") or 5432), str(config.get("NAME"))
