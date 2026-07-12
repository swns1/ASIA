from django.db import migrations, models

# `users` is managed=False (created outside Django's migration system on the
# real dev DB) and so doesn't exist at all in the ephemeral DB pytest-django
# builds from migrations alone — guard the DDL so this migration is a no-op
# there instead of failing test-DB setup for the whole app.
ADD_COLUMN_SQL = """
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS current_session_id uuid NULL;
    END IF;
END $$;
"""

DROP_COLUMN_SQL = """
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users DROP COLUMN IF EXISTS current_session_id;
    END IF;
END $$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_create_audit_log"),
    ]

    operations = [
        migrations.RunSQL(
            sql=ADD_COLUMN_SQL,
            reverse_sql=DROP_COLUMN_SQL,
            state_operations=[
                migrations.AddField(
                    model_name="user",
                    name="current_session_id",
                    field=models.UUIDField(blank=True, null=True),
                ),
            ],
        ),
    ]
