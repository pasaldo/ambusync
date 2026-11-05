from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("audit", "0005_retentionexecution")]
    operations = [
        migrations.CreateModel(
            name="TechnicalLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("occurred_at", models.DateTimeField(auto_now_add=True)),
                ("level", models.CharField(choices=[("info", "Información"), ("warning", "Advertencia"), ("error", "Error")], max_length=16)),
                ("event", models.CharField(max_length=96)),
                ("result", models.CharField(default="success", max_length=32)),
                ("correlation_id", models.UUIDField(blank=True, null=True)),
                ("details", models.JSONField(default=dict)),
            ],
        ),
    ]
