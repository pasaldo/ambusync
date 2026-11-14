from getpass import getpass

from django.core.management.base import BaseCommand, CommandError
from rest_framework.exceptions import ValidationError

from accounts.recovery_support import start_case


class Command(BaseCommand):
    help = "Abre un caso D-013 con contacto previo vigente; aún no cambia el correo."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--contact", type=str, required=True)

    def handle(self, *args, **options):
        from uuid import UUID

        try:
            contact_id = UUID(options["contact"])
            case = start_case(
                options["username"],
                contact_id,
                getpass("Correo nuevo propuesto (no se mostrará): "),
            )
        except ValidationError, ValueError:
            raise CommandError(
                "No se pudo abrir el caso; revisa cuenta, contacto previo y correo propuesto."
            ) from None
        self.stdout.write(
            f"Caso abierto: {case.pk}. Verificación humana pendiente; correo registrado sin cambios."
        )
