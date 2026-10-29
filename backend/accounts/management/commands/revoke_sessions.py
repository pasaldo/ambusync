from getpass import getuser

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from accounts.security import revoke_user_sessions


class Command(BaseCommand):
    help = "Revoca inmediatamente todas las sesiones de una cuenta en su siguiente solicitud."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--reason", required=True, help="Motivo operativo de la revocación.")

    def handle(self, *args, **options):
        user_model = get_user_model()
        try:
            user = user_model.objects.get(username=options["username"])
        except user_model.DoesNotExist as error:
            raise CommandError("La cuenta indicada no existe.") from error

        try:
            version = revoke_user_sessions(
                user,
                executor=getuser(),
                reason=options["reason"],
            )
        except ValueError as error:
            raise CommandError(str(error)) from error
        self.stdout.write(
            self.style.SUCCESS(
                f"Sesiones revocadas para {user.get_username()} (versión {version})."
            )
        )
