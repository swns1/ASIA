"""Applications carry the school year they're for.

The staff member issuing an invite picks the year; the draft copies it from
the invite. Both columns stay plain strings in Django and are held to a
registered year by a foreign key added here in SQL -- the same shape as
enrollment-service's enrollments/0006, and with the same rules:

ON DELETE RESTRICT: a year that an invite or application points at can't
be deleted.
ON UPDATE CASCADE: if a label is ever corrected by hand, these follow it.

school_years belongs to enrollment-service, and a migration can't depend on
another service's app, so each foreign key is only added when the table is
there. A fresh install gets them from schema.sql instead.

Existing rows are left null: they predate the column, and nothing in them
says which year they were for.
"""
from django.db import migrations, models

TABLES = ("application_invites", "student_applications")


def _add_fk(table):
    name = f"{table}_school_year_fk"
    return f"""
DO $$
BEGIN
    IF to_regclass('public.school_years') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{name}') THEN
        ALTER TABLE {table}
            ADD CONSTRAINT {name} FOREIGN KEY (school_year)
            REFERENCES school_years (label)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;
"""


def _drop_fk(table):
    return f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {table}_school_year_fk;"


class Migration(migrations.Migration):

    dependencies = [
        ("intake", "0002_remove_applicationinvite_mode"),
    ]

    operations = [
        migrations.AddField(
            model_name="applicationinvite",
            name="school_year",
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name="studentapplication",
            name="school_year",
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True),
        ),
        *[migrations.RunSQL(_add_fk(table), reverse_sql=_drop_fk(table)) for table in TABLES],
    ]
