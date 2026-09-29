"""Subjects belong to a school year.

The curriculum changes from year to year (DepEd rolls new ones out a few
grades at a time), and one list shared by every year meant a rename or a new
subject rewrote last year's report cards and grade sheets too. Each year now
has its own subjects, copied forward from an earlier year (the School Year
page's carry-over) and then adjusted.

subjects is managed=False (schema.sql owns it), so Django only records the
field here and the table is changed in SQL:

1. Add `school_year`.
2. File every existing subject under the current year: the registry's
   current year, else School Settings'. A table with subjects and no current
   year stops the migration rather than guess -- and so does one whose
   subjects already carry grades or score entries from another year, since
   filing those under this year would tie old grades to this year's
   curriculum. (Copy such subjects per year by hand first.)
3. Make it NOT NULL, the format check every year column has, and the code
   unique per year instead of overall.
4. A foreign key to school_years(label), like every other year column:
   ON DELETE RESTRICT, ON UPDATE CASCADE.

Reversing restores one code for all years, which fails -- as it should --
once a code is used in more than one year.
"""
from django.db import migrations, models

FORWARD = """
DO $$
DECLARE
    current_label varchar(20);
    other_year    varchar(20);
BEGIN
    ALTER TABLE subjects ADD COLUMN IF NOT EXISTS school_year varchar(20);

    IF EXISTS (SELECT 1 FROM subjects WHERE school_year IS NULL) THEN
        IF to_regclass('public.school_years') IS NOT NULL THEN
            EXECUTE 'SELECT label FROM school_years WHERE is_current LIMIT 1' INTO current_label;
        END IF;
        IF current_label IS NULL AND to_regclass('public.school_settings') IS NOT NULL THEN
            EXECUTE 'SELECT NULLIF(TRIM(current_school_year), '''') FROM school_settings LIMIT 1'
                INTO current_label;
        END IF;
        IF current_label IS NULL THEN
            RAISE EXCEPTION 'subjects has rows but no current school year to file them under. '
                            'Make a school year current first.';
        END IF;

        SELECT e.school_year INTO other_year
          FROM (SELECT enrollment_id, subject_id FROM grades
                UNION ALL
                SELECT enrollment_id, subject_id FROM score_entries) used
          JOIN enrollments e ON e.enrollment_id = used.enrollment_id
          JOIN subjects s    ON s.subject_id = used.subject_id
         WHERE s.school_year IS NULL AND e.school_year <> current_label
         LIMIT 1;
        IF other_year IS NOT NULL THEN
            RAISE EXCEPTION 'Subjects carry grades from S.Y. %, not only the current S.Y. %. '
                            'Give each year its own copy of its subjects before filing them by year.',
                            other_year, current_label;
        END IF;

        UPDATE subjects SET school_year = current_label WHERE school_year IS NULL;
    END IF;

    ALTER TABLE subjects ALTER COLUMN school_year SET NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_subjects_school_year_format') THEN
        ALTER TABLE subjects
            ADD CONSTRAINT ck_subjects_school_year_format CHECK (school_year ~ '^[0-9]{4}-[0-9]{4}$');
    END IF;

    ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_subject_code_key;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'subjects_school_year_subject_code_key') THEN
        ALTER TABLE subjects
            ADD CONSTRAINT subjects_school_year_subject_code_key UNIQUE (school_year, subject_code);
    END IF;

    -- Every subject lookup now starts from the year.
    DROP INDEX IF EXISTS idx_subjects_placement;
    CREATE INDEX IF NOT EXISTS idx_subjects_year_placement
        ON subjects (school_year, school_level, grade_level);

    IF to_regclass('public.school_years') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subjects_school_year_fk') THEN
        ALTER TABLE subjects
            ADD CONSTRAINT subjects_school_year_fk FOREIGN KEY (school_year)
            REFERENCES school_years (label)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;
"""

REVERSE = """
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_school_year_fk;
DROP INDEX IF EXISTS idx_subjects_year_placement;
CREATE INDEX IF NOT EXISTS idx_subjects_placement ON subjects (school_level, grade_level);
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_school_year_subject_code_key;
ALTER TABLE subjects ADD CONSTRAINT subjects_subject_code_key UNIQUE (subject_code);
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS ck_subjects_school_year_format;
ALTER TABLE subjects DROP COLUMN school_year;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("subjects", "0001_initial"),
        # school_years, for the foreign key.
        ("enrollments", "0005_schoolyear"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="subject",
                    name="school_year",
                    field=models.CharField(max_length=20, default=""),
                    preserve_default=False,
                ),
                migrations.AlterField(
                    model_name="subject",
                    name="subject_code",
                    field=models.CharField(max_length=30),
                ),
                migrations.AlterUniqueTogether(
                    name="subject",
                    unique_together={("school_year", "subject_code")},
                ),
            ],
            database_operations=[
                migrations.RunSQL(FORWARD, reverse_sql=REVERSE),
            ],
        ),
    ]
