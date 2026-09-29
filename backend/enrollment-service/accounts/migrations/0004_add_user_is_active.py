"""
State-only: the physical column is added by identity-service's migration
against the shared `users` table. AddField on a managed=False model emits
no DDL, so this just keeps this service's migration state (and
makemigrations) in sync with accounts/models.py.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_guardianmirror"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
    ]
