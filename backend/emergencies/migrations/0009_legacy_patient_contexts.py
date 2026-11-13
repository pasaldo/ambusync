from django.db import migrations

FIELDS = ("patient_identity_unknown", "patient_alias", "age_value", "age_unit", "recorded_sex")


def link_legacy(apps, schema_editor):
    Emergency = apps.get_model("emergencies", "Emergency")
    Patient = apps.get_model("emergencies", "Patient")
    alias = schema_editor.connection.alias
    for root in Emergency.objects.using(alias).filter(replaces__isnull=True, patient_record__isnull=True).iterator():
        # One independent record per root; never infer identity from equal aliases.
        # created_at is the time of incorporation, not a fabricated historical date.
        patient = Patient.objects.using(alias).create(operating_institution_id=root.operating_institution_id, **{field: getattr(root, field) for field in FIELDS})
        episode = root
        seen = set()
        while episode is not None:
            if episode.pk in seen:
                raise RuntimeError("Cyclic replacement chain; no patient identity inferred.")
            seen.add(episode.pk)
            Emergency.objects.using(alias).filter(pk=episode.pk).update(patient_record_id=patient.pk)
            episode = Emergency.objects.using(alias).filter(replaces_id=episode.pk).first()
    if Emergency.objects.using(alias).filter(patient_record__isnull=True).exists():
        raise RuntimeError("Unrooted replacement chain; resolve before linking legacy patients.")


class Migration(migrations.Migration):
    dependencies = [("emergencies", "0008_processedoperation_symptom_and_more"), ("institutions", "0005_initial_symptoms")]
    operations = [migrations.RunPython(link_legacy, migrations.RunPython.noop)]
