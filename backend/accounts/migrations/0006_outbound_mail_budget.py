from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0005_identityrecoverycase_passwordrecovery_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="OutboundMailBudget",
            fields=[
                ("id", models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ("day", models.DateField()),
                ("used", models.PositiveSmallIntegerField(default=0)),
            ],
            options={
                "constraints": [
                    models.CheckConstraint(condition=models.Q(("id", 1)), name="outbound_mail_singleton"),
                    models.CheckConstraint(condition=models.Q(("used__lte", 100)), name="outbound_mail_maximum"),
                ],
            },
        ),
    ]
