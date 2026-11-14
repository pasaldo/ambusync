from uuid import UUID

from django.core.management.base import BaseCommand, CommandError
from rest_framework.exceptions import ValidationError

from accounts.recovery_support import verify_case


class Command(BaseCommand):
    help = "Registra comprobación humana por el contacto previo; no introduce contraseñas ni imprime enlaces."

    def add_arguments(self, parser):
        parser.add_argument("case_id", type=UUID)
        parser.add_argument(
            "--verifier",
            required=True,
            help="Referencia del responsable que verificó, no la cuenta solicitante.",
        )
        parser.add_argument("--method", choices=("phone", "institutional_email"), required=True)
        parser.add_argument("--result", choices=("approved", "rejected"), required=True)

    def handle(self, *args, **options):
        try:
            case = verify_case(
                options["case_id"], options["verifier"], options["method"], options["result"]
            )
        except ValidationError as error:
            raise CommandError(str(error.detail)) from None
        except Exception:  # noqa: BLE001 -- never echo SMTP recipients or token-containing exceptions.
            raise CommandError(
                "No se confirmó la entrega. No se aplicó el cambio; revisa el servicio de correo local."
            ) from None
        self.stdout.write(
            f"Verificación registrada: {case.status}. La contraseña y el correo solo cambian al confirmar el enlace."
        )
