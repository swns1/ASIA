from django.db import migrations, models

# Fee schedules belong to a school year.
#
# They used to be keyed on (school_level, grade_level) alone, so there was one
# price list for all time. Setting next year's fees meant editing the only
# schedule there was -- and every edit re-priced this year's invoices at that
# grade on the spot, fully paid ones included. With a year on each schedule,
# next year's fees are a separate schedule, and an invoice is built from the
# schedule for its own enrollment's year.
#
# Existing schedules are filed under the configured current school year (or,
# with no settings row, the year today falls in -- July start, as everywhere
# else). Invoices already issued are unaffected: they carry their own copied
# line items and never read the schedule again unless recalculated.
#
# `fee_schedules` is managed=False, so the DDL is guarded like identity-
# service's accounts 0003: a no-op where the table doesn't exist (the
# ephemeral pytest database). Fresh installs get the column from schema.sql.
FORWARD_SQL = """
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fee_schedules') THEN
        ALTER TABLE fee_schedules ADD COLUMN IF NOT EXISTS school_year varchar(20);

        UPDATE fee_schedules
           SET school_year = COALESCE(
                 (SELECT NULLIF(TRIM(current_school_year), '') FROM school_settings WHERE setting_id = 1),
                 CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 7
                      THEN EXTRACT(YEAR FROM CURRENT_DATE)::int || '-' || (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1)
                      ELSE (EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) || '-' || EXTRACT(YEAR FROM CURRENT_DATE)::int
                 END)
         WHERE school_year IS NULL;

        ALTER TABLE fee_schedules ALTER COLUMN school_year SET NOT NULL;
        ALTER TABLE fee_schedules DROP CONSTRAINT IF EXISTS fee_schedules_school_level_grade_level_key;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_schedules_level_grade_year_key') THEN
            ALTER TABLE fee_schedules
                ADD CONSTRAINT fee_schedules_level_grade_year_key UNIQUE (school_level, grade_level, school_year);
        END IF;
    END IF;
END $$;
"""

# Reversing fails if more than one year's schedule exists for a grade -- the
# old one-schedule-per-grade rule can't hold them. Delete the extra years first.
REVERSE_SQL = """
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fee_schedules') THEN
        ALTER TABLE fee_schedules DROP CONSTRAINT IF EXISTS fee_schedules_level_grade_year_key;
        ALTER TABLE fee_schedules
            ADD CONSTRAINT fee_schedules_school_level_grade_level_key UNIQUE (school_level, grade_level);
        ALTER TABLE fee_schedules DROP COLUMN IF EXISTS school_year;
    END IF;
END $$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0002_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql=FORWARD_SQL,
            reverse_sql=REVERSE_SQL,
            state_operations=[
                migrations.AddField(
                    model_name="feeschedule",
                    name="school_year",
                    field=models.CharField(default="", max_length=20),
                    preserve_default=False,
                ),
                migrations.AlterUniqueTogether(
                    name="feeschedule",
                    unique_together={("school_level", "grade_level", "school_year")},
                ),
            ],
        ),
    ]
