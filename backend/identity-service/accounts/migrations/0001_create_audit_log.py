from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="User",
            fields=[
                ("user_id", models.BigAutoField(primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=100)),
                ("email", models.EmailField(max_length=254, unique=True)),
                ("role", models.CharField(max_length=30)),
                ("password", models.CharField(max_length=255)),
            ],
            options={
                "db_table": "users",
                "managed": False,
            },
        ),
        migrations.CreateModel(
            name="AuditLog",
            fields=[
                ("log_id", models.BigAutoField(primary_key=True, serialize=False)),
                ("user_id", models.BigIntegerField(blank=True, db_index=True, null=True)),
                ("user_name", models.CharField(default="Unknown user", max_length=150)),
                ("user_role", models.CharField(db_index=True, default="unknown", max_length=50)),
                ("action", models.CharField(max_length=120)),
                ("module", models.CharField(db_index=True, max_length=80)),
                ("occurred_at", models.DateTimeField(db_index=True)),
                ("status", models.CharField(db_index=True, default="success", max_length=30)),
                ("details", models.TextField(blank=True, default="")),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
            ],
            options={
                "db_table": "audit_logs",
                "ordering": ["-occurred_at", "-log_id"],
            },
        ),
    ]