import unicodedata
import hashlib

from django.db import migrations

LABELS = ("Disnea", "Dolor torácico", "Sudoración", "Náuseas", "Mareo", "Pérdida de conciencia", "Hemorragia", "Convulsión")


def seed(apps, schema_editor):
    Institution = apps.get_model("institutions", "Institution")
    Symptom = apps.get_model("institutions", "Symptom")
    alias = schema_editor.connection.alias
    for institution in Institution.objects.using(alias).all().iterator():
        for label in LABELS:
            normalized = unicodedata.normalize("NFKC", " ".join(label.split())).casefold()
            key = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
            Symptom.objects.using(alias).get_or_create(institution_id=institution.pk, normalized=key, defaults={"description": label})


class Migration(migrations.Migration):
    dependencies = [("institutions", "0004_symptom")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
