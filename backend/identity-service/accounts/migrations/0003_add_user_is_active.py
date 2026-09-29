from django.db import migrations, models

# Staff who leave are deactivated, not deleted: their past advisories, grades
# and audit entries still need a name to point at. Same guard as 0002 --
# `users` is managed=False and doesn't exist in the test DB pytest-django
# builds from migrations alone. Every existing account starts out active.
ADD_COLUMN_SQL = """
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
    END IF;
END $$;
"""

DROP_COLUMN_SQL = """
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users DROP COLUMN IF EXISTS is_active;
    END IF;
END $$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_add_current_session_id"),
    ]

    operations = [
        migrations.RunSQL(
            sql=ADD_COLUMN_SQL,
            reverse_sql=DROP_COLUMN_SQL,
            state_operations=[
                migrations.AddField(
                    model_name="user",
                    name="is_active",
                    field=models.BooleanField(default=True),
                ),
            ],
        ),
    ]
