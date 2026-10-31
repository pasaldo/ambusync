import getpass
import uuid

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from audit.models import AuditEvent
from institutions.models import Institution, InstitutionMembership


class Command(BaseCommand):
    help = "Provisiona de forma controlada a un administrador institucional existente."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("institution_name")

    def handle(self, *args, **options):
        user = User.objects.filter(username=options["username"], is_active=True).first()
        institution = Institution.objects.filter(
            name=options["institution_name"], enabled=True
        ).first()
        if user is None or institution is None:
            raise CommandError("Debe existir una cuenta activa y un establecimiento habilitado.")
        if user.is_staff or user.is_superuser:
            raise CommandError("Las cuentas técnicas no se usan como administradores funcionales.")
        if not InstitutionMembership.objects.filter(
            user=user, institution=institution, active=True
        ).exists():
            raise CommandError("La cuenta debe pertenecer activamente al establecimiento.")

        group, _ = Group.objects.get_or_create(name="institution_admin")
        if user.groups.filter(pk=group.pk).exists():
            self.stdout.write("La cuenta ya tiene administración institucional.")
            return
        with transaction.atomic():
            user.groups.add(group)
            AuditEvent.objects.create(
                actor=None,
                executor=getpass.getuser(),
                institution=institution,
                ambulance=None,
                action="institution_admin.provisioned",
                object_type="account",
                object_id=str(user.pk),
                result=AuditEvent.Result.SUCCESS,
                correlation_id=uuid.uuid4(),
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"Administración institucional provisionada para {user.username} en {institution.name}."
            )
        )
