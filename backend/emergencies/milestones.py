"""Explicit receiver actions; reading and preparation are not transport states."""

from django.utils import timezone

from emergencies.models import Emergency
from emergencies.views import EmergencyTransitionView, OperationConflict


def require_before_reception(emergency):
    if emergency.status not in (Emergency.Status.NOTIFIED, Emergency.Status.IN_TRANSIT):
        raise OperationConflict(
            "No se registran hitos retrospectivos después de llegada, cancelación o cierre."
        )


class EmergencyReadView(EmergencyTransitionView):
    actor_group = "urgencias"
    action = "emergency.read_confirmed"
    update_fields = ("read_at", "read_by", "version")

    def apply_transition(self, emergency, actor, values):
        require_before_reception(emergency)
        if emergency.read_at is not None:
            return False
        emergency.read_at = timezone.now()
        emergency.read_by = actor
        return None


class EmergencyPreparationView(EmergencyTransitionView):
    actor_group = "urgencias"
    action = "emergency.preparation_recorded"
    update_fields = ("prepared_at", "prepared_by", "version")

    def apply_transition(self, emergency, actor, values):
        require_before_reception(emergency)
        if emergency.read_at is None:
            raise OperationConflict("Confirma primero la lectura antes de registrar preparación.")
        if emergency.prepared_at is not None:
            return False
        emergency.prepared_at = timezone.now()
        emergency.prepared_by = actor
        return None
