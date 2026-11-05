from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [("audit", "0004_auditevent_executor_alter_auditevent_actor_and_more")]
    operations = [
        migrations.CreateModel(
            name="RetentionExecution",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("mode", models.CharField(choices=[("dry_run", "Simulación"), ("apply", "Aplicación")], max_length=16)),
                ("command_version", models.CharField(max_length=32)),
                ("as_of", models.DateTimeField()),
                ("executed_at", models.DateTimeField(auto_now_add=True)),
                ("executor", models.CharField(max_length=255)),
                ("result", models.CharField(max_length=16)),
                ("counts", models.JSONField(default=dict)),
                ("errors", models.JSONField(default=list)),
            ],
        ),
    ]
