"""
Sections per school year.

  1. The `sections` table (enrollments.Section).
  2. One Kindergarten. The grade ladder everywhere says "Kindergarten"; the
     fee setup alone said "Senior Kinder", so a Kindergarten enrollment found
     no fee schedule. Records under "Senior Kinder" are renamed -- the fee
     schedule only when that doesn't collide with an existing Kindergarten
     one. fee_schedules is billing-service's table; this is the one shared
     database, and the rename has to land before step 3 files sections under
     the right grade.
  3. Every section a record already uses is registered, so step 4 can hold
     the records to them. A name used under two strands in one grade keeps
     one strand -- names are unique per grade now.
  4. Composite foreign keys from enrollments and section_advisories:
     (school_year, grade_level, section) -> sections (school_year,
     grade_level, name). ON UPDATE CASCADE is what makes renaming a section
     safe; ON DELETE RESTRICT keeps a section with learners or an adviser.
"""
import django.db.models.deletion
from django.db import migrations, models

ONE_KINDERGARTEN = """
DO $$
BEGIN
    IF to_regclass('public.enrollments') IS NOT NULL THEN
        UPDATE enrollments SET grade_level = 'Kindergarten' WHERE grade_level = 'Senior Kinder';
    END IF;
    IF to_regclass('public.section_advisories') IS NOT NULL THEN
        UPDATE section_advisories SET grade_level = 'Kindergarten' WHERE grade_level = 'Senior Kinder';
    END IF;
    IF to_regclass('public.subjects') IS NOT NULL THEN
        UPDATE subjects SET grade_level = 'Kindergarten' WHERE grade_level = 'Senior Kinder';
    END IF;
    IF to_regclass('public.fee_schedules') IS NOT NULL THEN
        UPDATE fee_schedules SET grade_level = 'Kindergarten'
         WHERE grade_level = 'Senior Kinder'
           AND NOT EXISTS (
               SELECT 1 FROM fee_schedules k
                WHERE k.school_level = fee_schedules.school_level
                  AND k.grade_level = 'Kindergarten'
           );
    END IF;
END $$;
"""

REGISTER_SECTIONS_IN_USE = """
INSERT INTO sections (school_year, school_level, grade_level, name, strand, created_at, updated_at)
SELECT school_year, min(school_level), grade_level, section, min(strand), now(), now()
  FROM (
        SELECT school_year, school_level, grade_level, section, strand FROM enrollments
        UNION ALL
        SELECT school_year, school_level, grade_level, section, strand FROM section_advisories
       ) placed
 WHERE btrim(coalesce(section, '')) <> ''
 GROUP BY school_year, grade_level, section
ON CONFLICT (school_year, grade_level, name) DO NOTHING;
"""


def _fk(table):
    name = f"{table}_section_fk"
    return f"""
DO $$
BEGIN
    IF to_regclass('public.{table}') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{name}') THEN
        ALTER TABLE {table}
            ADD CONSTRAINT {name} FOREIGN KEY (school_year, grade_level, section)
            REFERENCES sections (school_year, grade_level, name)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;
"""


def _drop_fk(table):
    return f"ALTER TABLE IF EXISTS {table} DROP CONSTRAINT IF EXISTS {table}_section_fk;"


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0006_school_year_foreign_keys'),
    ]

    operations = [
        migrations.CreateModel(
            name='Section',
            fields=[
                ('section_id', models.BigAutoField(primary_key=True, serialize=False)),
                ('school_level', models.CharField(choices=[('nursery', 'Nursery'), ('kindergarten', 'Kindergarten'), ('elementary', 'Elementary'), ('junior_highschool', 'Junior High School'), ('senior_highschool', 'Senior High School')], max_length=20)),
                ('grade_level', models.CharField(max_length=20)),
                ('name', models.CharField(max_length=50)),
                ('strand', models.CharField(blank=True, max_length=50, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('school_year', models.ForeignKey(db_column='school_year', on_delete=django.db.models.deletion.PROTECT, related_name='sections', to='enrollments.schoolyear', to_field='label')),
            ],
            options={
                'db_table': 'sections',
                'ordering': ['school_year', 'grade_level', 'name'],
                'managed': True,
                'constraints': [models.UniqueConstraint(fields=('school_year', 'grade_level', 'name'), name='uniq_section_per_grade')],
            },
        ),
        migrations.RunSQL(ONE_KINDERGARTEN, reverse_sql=migrations.RunSQL.noop),
        migrations.RunSQL(REGISTER_SECTIONS_IN_USE, reverse_sql=migrations.RunSQL.noop),
        migrations.RunSQL(_fk("enrollments"), reverse_sql=_drop_fk("enrollments")),
        migrations.RunSQL(_fk("section_advisories"), reverse_sql=_drop_fk("section_advisories")),
    ]
