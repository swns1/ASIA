from django.db import migrations, models

# Deactivation instead of deletion. Deleting a user left every id that pointed
# at them dangling (users has no foreign keys): a departed teacher's section
# advisories named nobody, a parent's guardian link pointed at nothing.
#
# `users` is managed=False, so the DDL is guarded exactly like
# 0002_add_current_session_id: a no-op in the ephemeral pytest database,
# where the table doesn't exist. Existing accounts default to active.
#
# The name is deliberately unique across the four services' `accounts` apps
# (they share one django_migrations table -- see README, "Known in-progress
# work"): enrollment-service already has an accounts 0003.
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
