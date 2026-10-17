"""Where a senior high subject sits on the SF10: Core, Contextualized or Specialization.

The school's permanent record lists each semester's subjects under three
headings. A strand-less subject is not always Core (Empowerment Technologies
and Practical Research are DepEd's "applied" subjects, shared by every strand
but not core), and the school names some subjects its own way ("Research in
Daily Life 1"), so the heading can't be read off the name or strand alone.

NULL means automatic: school_forms.sf10.subject_group works it out from the
name and strand. A registrar sets it on the Subjects page only to override
that. Nothing is backfilled -- a fresh install loads schema.sql and fakes
this migration, so the rule has to cover NULL anyway.

subjects is managed=False (schema.sql owns it), so Django only records the
field here and the table is changed in SQL. Safe on any copy of the database
(IF NOT EXISTS, guarded constraint), so Railway's predeploy can run it.
"""
from django.db import migrations, models

FORWARD = """
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS subject_group varchar(20);
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS ck_subjects_subject_group;
ALTER TABLE subjects
    ADD CONSTRAINT ck_subjects_subject_group
    CHECK (subject_group IS NULL OR subject_group IN ('core', 'applied', 'specialized'));
"""

REVERSE = """
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS ck_subjects_subject_group;
ALTER TABLE subjects DROP COLUMN IF EXISTS subject_group;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("subjects", "0002_subject_school_year"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="subject",
                    name="subject_group",
                    field=models.CharField(
                        blank=True, null=True, max_length=20,
                        choices=[("core", "Core"), ("applied", "Contextualized"),
                                 ("specialized", "Specialization")],
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(FORWARD, reverse_sql=REVERSE),
            ],
        ),
    ]
