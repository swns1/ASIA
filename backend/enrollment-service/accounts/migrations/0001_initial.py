"""
Registers the unmanaged accounts.User with Django's migration graph so
AUTH_USER_MODEL works, but creates no SQL because managed=False.

Django's CreateModel operation respects model Meta.managed — it skips
schema operations when managed=False. This satisfies the auth app's
dependency on AUTH_USER_MODEL without altering the DB.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name="User",
            fields=[
                ("password",   models.CharField(max_length=255)),
                ("last_login", models.DateTimeField(blank=True, null=True, verbose_name="last login")),
                ("user_id",    models.BigAutoField(primary_key=True, serialize=False)),
                ("name",       models.CharField(max_length=100)),
                ("email",      models.EmailField(max_length=150, unique=True)),
                ("role",       models.CharField(
                    max_length=30,
                    choices=[
                        ("super_admin", "Super Admin"),
                        ("admin",       "Admin"),
                        ("registrar",   "Registrar"),
                        ("teacher",     "Teacher"),
                        ("accounting",  "Accounting"),
                    ],
                )),
            ],
            options={
                "db_table": "users",
                "managed": False,
            },
        ),
    ]
