"""
Holds every `school_year` column to a registered year.

The columns stay plain CharFields in Django -- every reader keeps getting a
string -- and the constraint lives only in the database, added here in SQL.
That also covers `enrollments`, which Django doesn't manage.

ON DELETE RESTRICT: a year that anything still points at can't be deleted.
ON UPDATE CASCADE: labels aren't editable through the API, but if one is ever
corrected by hand, the records follow it instead of blocking the fix.
"""
from django.db import migrations

TABLES = (
    "enrollments",
    "section_advisories",
    "academic_calendar_events",
    "risk_assessment_runs",
)


def _add(table):
    name = f"{table}_school_year_fk"
    return f"""
DO $$
BEGIN
    IF to_regclass('public.{table}') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{name}') THEN
        ALTER TABLE {table}
            ADD CONSTRAINT {name} FOREIGN KEY (school_year)
            REFERENCES school_years (label)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;
"""


def _drop(table):
    return f"ALTER TABLE IF EXISTS {table} DROP CONSTRAINT IF EXISTS {table}_school_year_fk;"


class Migration(migrations.Migration):

    dependencies = [
        ("enrollments", "0005_schoolyear"),
        ("academic_calendar", "0003_grading_period"),
        ("ai", "0003_risk_score_raw_metrics"),
    ]

    operations = [
        migrations.RunSQL(_add(table), reverse_sql=_drop(table)) for table in TABLES
    ]
