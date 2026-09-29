"""Fee schedules belong to a school year.

One schedule per (school_year, school_level, grade_level), replacing one per
(school_level, grade_level) for every year at once -- so next year's rates
can be set up without rewriting this year's invoices.

fee_schedules is managed=False (schema.sql owns it), so Django only records
the field here and the table is changed in SQL:

1. Add `school_year`.
2. File every existing schedule under the current year: the registry's
   current year, else School Settings' (kept in step with it). A table with
   schedules and no current year anywhere stops the migration rather than
   guess.
3. Make it NOT NULL, and swap the unique key to include it.
4. A foreign key to school_years(label), like every other year column:
   ON DELETE RESTRICT, ON UPDATE CASCADE. school_years is enrollment-service's,
   so it's only added when that table is there; a fresh install gets it from
   schema.sql.

Reversing restores the one-schedule-per-grade key, which fails -- as it
should -- once any grade has fees in more than one year.
"""
from django.db import migrations, models

FORWARD = """
DO $$
DECLARE
    current_label varchar(20);
BEGIN
    ALTER TABLE fee_schedules ADD COLUMN IF NOT EXISTS school_year varchar(20);

    IF EXISTS (SELECT 1 FROM fee_schedules WHERE school_year IS NULL) THEN
        IF to_regclass('public.school_years') IS NOT NULL THEN
            EXECUTE 'SELECT label FROM school_years WHERE is_current LIMIT 1' INTO current_label;
        END IF;
        IF current_label IS NULL AND to_regclass('public.school_settings') IS NOT NULL THEN
            EXECUTE 'SELECT NULLIF(TRIM(current_school_year), '''') FROM school_settings LIMIT 1'
                INTO current_label;
        END IF;
        IF current_label IS NULL THEN
            RAISE EXCEPTION 'fee_schedules has rows but no current school year to file them under. '
                            'Make a school year current first.';
        END IF;
        UPDATE fee_schedules SET school_year = current_label WHERE school_year IS NULL;
    END IF;

    ALTER TABLE fee_schedules ALTER COLUMN school_year SET NOT NULL;

    ALTER TABLE fee_schedules DROP CONSTRAINT IF EXISTS fee_schedules_school_level_grade_level_key;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'fee_schedules_school_year_school_level_grade_level_key') THEN
        ALTER TABLE fee_schedules
            ADD CONSTRAINT fee_schedules_school_year_school_level_grade_level_key
            UNIQUE (school_year, school_level, grade_level);
    END IF;

    IF to_regclass('public.school_years') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_schedules_school_year_fk') THEN
        ALTER TABLE fee_schedules
            ADD CONSTRAINT fee_schedules_school_year_fk FOREIGN KEY (school_year)
            REFERENCES school_years (label)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;
"""

REVERSE = """
ALTER TABLE fee_schedules DROP CONSTRAINT IF EXISTS fee_schedules_school_year_fk;
ALTER TABLE fee_schedules DROP CONSTRAINT IF EXISTS fee_schedules_school_year_school_level_grade_level_key;
ALTER TABLE fee_schedules
    ADD CONSTRAINT fee_schedules_school_level_grade_level_key UNIQUE (school_level, grade_level);
ALTER TABLE fee_schedules DROP COLUMN school_year;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0002_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="feeschedule",
                    name="school_year",
                    field=models.CharField(max_length=20, default=""),
                    preserve_default=False,
                ),
                migrations.AlterUniqueTogether(
                    name="feeschedule",
                    unique_together={("school_year", "school_level", "grade_level")},
                ),
            ],
            database_operations=[
                migrations.RunSQL(FORWARD, reverse_sql=REVERSE),
            ],
        ),
    ]
