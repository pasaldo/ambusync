"""Institutional configuration. Never creates entries from episode text."""

import hashlib
import unicodedata

from django.db.models.signals import post_save
from django.dispatch import receiver
from rest_framework.exceptions import ValidationError

from institutions.models import Institution, Symptom

BASE_SYMPTOMS = (
    "Disnea",
    "Dolor torácico",
    "Sudoración",
    "Náuseas",
    "Mareo",
    "Pérdida de conciencia",
    "Hemorragia",
    "Convulsión",
)


def symptom_key(value):
    normalized = unicodedata.normalize("NFKC", " ".join(value.split())).casefold()
    # A valid 120-character Unicode label can expand greatly under NFKC. Keep
    # its uniqueness key bounded without narrowing the approved label length.
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


@receiver(post_save, sender=Institution, dispatch_uid="institution_initial_symptoms")
def initialize_symptoms(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        Symptom.objects.bulk_create(
            [
                Symptom(institution=instance, description=label, normalized=symptom_key(label))
                for label in BASE_SYMPTOMS
            ]
        )


def validate_episode_symptoms(institution_id, labels, previous=()):
    # All writers acquire institution before symptoms, including episode updates.
    # Otherwise an audit FK at commit can cycle with another unit's creation.
    if (
        not Institution.objects.select_for_update(no_key=True)
        .filter(pk=institution_id, enabled=True)
        .first()
    ):
        raise ValidationError({"symptoms": "La institución operadora ya no está habilitada."})
    previous = set(previous)
    selected = list(
        Symptom.objects.select_for_update(no_key=True)
        .filter(
            institution_id=institution_id, normalized__in=[symptom_key(label) for label in labels]
        )
        .order_by("id")
    )
    active = {symptom_key(item.description): item.description for item in selected if item.enabled}
    result = []
    for label in labels:
        if label in previous:
            result.append(label)
        elif symptom_key(label) in active:
            result.append(active[symptom_key(label)])
        else:
            raise ValidationError(
                {
                    "symptoms": "Selecciona síntomas activos del catálogo de tu institución; el texto libre no crea elementos."
                }
            )
    if len({symptom_key(label) for label in result}) != len(result):
        raise ValidationError({"symptoms": "No repitas síntomas en el episodio."})
    return result
