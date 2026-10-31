from getpass import getpass

from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from institutions.models import Ambulance, AmbulanceAssignment, Institution, InstitutionMembership


class Command(BaseCommand):
    help = "Crea cuentas de demostración para Hospital Operador Demo y Hospital Central Demo."

    @transaction.atomic
    def handle(self, *args, **options):
        operator_institution = self._institution(
            "Hospital Operador Demo",
            "Demo sintética operadora",
            Institution.Kind.OPERATOR,
        )
        receiver_institution = self._institution(
            "Hospital Central Demo",
            "Demo sintética receptora",
            Institution.Kind.RECEIVER,
        )
        if operator_institution.kind != Institution.Kind.OPERATOR:
            raise CommandError("Hospital Operador Demo tiene un tipo incompatible.")
        if receiver_institution.kind != Institution.Kind.RECEIVER:
            raise CommandError("Hospital Central Demo tiene un tipo incompatible.")

        ambulance, _ = Ambulance.objects.get_or_create(
            institution=operator_institution,
            code="DEMO-01",
        )
        ambulance_group, _ = Group.objects.get_or_create(name="ambulance")
        receiver_group, _ = Group.objects.get_or_create(name="urgencias")

        operator = self._user("demo_ambulancia", ambulance_group)
        receiver = self._user("demo_urgencias", receiver_group)
        InstitutionMembership.objects.update_or_create(
            user=operator,
            institution=operator_institution,
            defaults={"active": True},
        )
        InstitutionMembership.objects.update_or_create(
            user=receiver,
            institution=receiver_institution,
            defaults={"active": True},
        )

        active_assignment = AmbulanceAssignment.objects.filter(user=operator, active=True).first()
        if active_assignment and active_assignment.ambulance_id != ambulance.pk:
            raise CommandError("La cuenta demo ya tiene otra asignación activa; no se modificó.")
        AmbulanceAssignment.objects.get_or_create(
            user=operator,
            ambulance=ambulance,
            active=True,
        )

        self.stdout.write(
            self.style.SUCCESS("Hospitales de demostración y cuentas locales listos.")
        )
        self.stdout.write(
            "Cuentas: demo_ambulancia y demo_urgencias; contraseñas no se imprimen ni guardan en Git."
        )

    def _user(self, username, group):
        user, created = User.objects.get_or_create(username=username)
        if created:
            password = getpass(f"Contraseña local para {username} (mínimo 15 caracteres): ")
            confirmation = getpass("Repite la contraseña: ")
            if password != confirmation:
                raise CommandError("Las contraseñas no coinciden; no se conservaron los cambios.")
            try:
                validate_password(password, user)
            except ValidationError as error:
                raise CommandError(str(error)) from error
            user.set_password(password)
            user.save()
        user.groups.add(group)
        return user

    def _institution(self, name, legacy_name, kind):
        institution = Institution.objects.filter(name=name).first()
        if institution:
            return institution

        institution = Institution.objects.filter(name=legacy_name).first()
        if institution:
            institution.name = name
            institution.save(update_fields=["name"])
            return institution

        institution, _ = Institution.objects.get_or_create(
            name=name,
            defaults={"kind": kind},
        )
        return institution
