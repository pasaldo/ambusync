from getpass import getpass, getuser

from django.core.management.base import BaseCommand, CommandError
from rest_framework.exceptions import ValidationError

from accounts.recovery_support import register_contact


class Command(BaseCommand):
    help = "Registra un contacto institucional ya conocido; no usar para improvisar identidad en un caso abierto."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--channel", choices=("phone", "institutional_email"), required=True)
        parser.add_argument("--provenance", required=True)
        parser.add_argument("--confirmed-prior-contact", action="store_true")

    def handle(self, *args, **options):
        try:
            contact = register_contact(
                options["username"],
                options["channel"],
                getpass("Contacto institucional previo (no se mostrará): "),
                options["provenance"],
                getuser(),
                options["confirmed_prior_contact"],
            )
        except ValidationError as error:
            raise CommandError(str(error.detail)) from None
        self.stdout.write(
            f"Contacto registrado: {contact.pk}. No concede roles ni certifica automáticamente la identidad."
        )
