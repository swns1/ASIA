"""
School identity for the DepEd school forms: School ID, Region, Division,
District and the School Head's name on the single school_settings row.

The same change as scripts/2026-10-school-identity.sql (see it for why), as
a migration so an existing database picks it up without anyone running SQL
by hand -- on Railway, deploy/railway/start-backend.sh predeploy runs it
before each deploy. Safe on a database that already has the columns (IF NOT
EXISTS, and the check constraint is dropped and re-added). A fresh install
fakes it: schema.sql already has them.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("school_settings", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE public.school_settings
                    ADD COLUMN IF NOT EXISTS deped_school_id  character varying(6),
                    ADD COLUMN IF NOT EXISTS region           character varying(100),
                    ADD COLUMN IF NOT EXISTS division         character varying(100),
                    ADD COLUMN IF NOT EXISTS district         character varying(100),
                    ADD COLUMN IF NOT EXISTS school_head_name character varying(150);

                ALTER TABLE public.school_settings
                    DROP CONSTRAINT IF EXISTS ck_school_settings_deped_school_id;
                ALTER TABLE public.school_settings
                    ADD CONSTRAINT ck_school_settings_deped_school_id
                    CHECK (deped_school_id IS NULL OR deped_school_id ~ '^[0-9]{6}$');
            """,
            reverse_sql="""
                ALTER TABLE public.school_settings
                    DROP CONSTRAINT IF EXISTS ck_school_settings_deped_school_id,
                    DROP COLUMN IF EXISTS deped_school_id,
                    DROP COLUMN IF EXISTS region,
                    DROP COLUMN IF EXISTS division,
                    DROP COLUMN IF EXISTS district,
                    DROP COLUMN IF EXISTS school_head_name;
            """,
        ),
    ]
