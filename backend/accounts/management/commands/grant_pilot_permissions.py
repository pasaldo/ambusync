from uuid import uuid4

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User


class Command(BaseCommand):
    help = "Concede permisos adicionales explícitos a una cuenta local del piloto sintético."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--manage-symptoms", action="store_true")
        parser.add_argument("--deactivate-patients", action="store_true")
        parser.add_argument("--view-reports", action="store_true")

    def handle(self, *args, **options):
        from audit.models import AuditEvent

        with transaction.atomic():
            user = (
                User.objects.select_for_update(no_key=True)
                .filter(username=options["username"], is_active=True)
                .first()
            )
            if user is None or user.groups.filter(name="system_admin").exists():
                raise CommandError("La cuenta no es una cuenta institucional activa del piloto.")
            membership = user.institution_memberships.filter(
                active=True, institution__enabled=True
            ).first()
            if membership is None:
                raise CommandError("La cuenta no tiene institución habilitada.")
            granted = []
            for name, allowed in (
                (
                    "manage_symptoms",
                    user.groups.filter(
                        name__in=("ambulance", "urgencias", "institution_admin")
                    ).exists(),
                ),
                ("deactivate_patients", user.groups.filter(name="urgencias").exists()),
                ("view_reports", user.groups.filter(name="urgencias").exists()),
            ):
                if options.get(name):
                    if not allowed:
                        raise CommandError(
                            "El permiso adicional requiere su perfil funcional previo."
                        )
                    group = Group.objects.get_or_create(name=name)[0]
                    if not user.groups.filter(pk=group.pk).exists():
                        user.groups.add(group)
                        granted.append(name)
            if not any(
                options.get(name)
                for name in ("manage_symptoms", "deactivate_patients", "view_reports")
            ):
                raise CommandError("Selecciona al menos un permiso adicional.")
            for name in granted:
                AuditEvent.objects.create(
                    institution=membership.institution,
                    action=f"permission.{name}_granted",
                    object_type="account",
                    object_id=str(user.pk),
                    result="success",
                    correlation_id=uuid4(),
                    executor="manage.py grant_pilot_permissions",
                )
        self.stdout.write(
            self.style.SUCCESS(
                "Permisos adicionales registrados; no concede otros roles ni acceso fuera de ámbito."
            )
        )
