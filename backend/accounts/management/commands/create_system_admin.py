from getpass import getpass

from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction

from accounts.models import User


class Command(BaseCommand):
    help = "Crea localmente una cuenta exclusiva de administración global de AmbuSync."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("email")

    @transaction.atomic
    def handle(self, *args, **options):
        username = options["username"].strip()
        email = options["email"].strip()
        if not username or len(username) > 150:
            raise CommandError("El nombre de usuario debe tener entre 1 y 150 caracteres.")
        try:
            validate_email(email)
        except ValidationError as error:
            raise CommandError("Indica un correo válido.") from error
        if User.objects.filter(username__iexact=username).exists():
            raise CommandError("Ese nombre de usuario ya existe.")
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError("Ese correo ya está asociado a una cuenta.")

        user = User(username=username, email=User.objects.normalize_email(email))
        password = getpass("Contraseña (mínimo 15 caracteres): ")
        confirmation = getpass("Repite la contraseña: ")
        if password != confirmation:
            raise CommandError("Las contraseñas no coinciden; no se creó la cuenta.")
        try:
            validate_password(password, user)
        except ValidationError as error:
            raise CommandError(str(error)) from error

        user.set_password(password)
        user.save()
        group, _ = Group.objects.get_or_create(name="system_admin")
        user.groups.add(group)
        self.stdout.write(self.style.SUCCESS(f"Cuenta global {username} creada."))
