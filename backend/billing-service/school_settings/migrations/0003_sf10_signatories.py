"""
The SF10 permanent record's letterhead and certification: a landline beside
the contact phone, and the names printed over each signature line (records
officer, the three principals, the senior high department head).

The same change as scripts/2026-10-sf10-school-format.sql, as a migration so
an existing database picks it up without anyone running SQL by hand -- on
Railway, deploy/railway/start-backend.sh predeploy runs it before each
deploy. Safe on a database that already has the columns (IF NOT EXISTS). A
fresh install fakes it: schema.sql already has them.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("school_settings", "0002_school_identity"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE public.school_settings
                    ADD COLUMN IF NOT EXISTS contact_landline          character varying(50),
                    ADD COLUMN IF NOT EXISTS records_officer_name      character varying(150),
                    ADD COLUMN IF NOT EXISTS elementary_principal_name character varying(150),
                    ADD COLUMN IF NOT EXISTS jhs_principal_name        character varying(150),
                    ADD COLUMN IF NOT EXISTS shs_principal_name        character varying(150),
                    ADD COLUMN IF NOT EXISTS shs_department_head_name  character varying(150);
            """,
            reverse_sql="""
                ALTER TABLE public.school_settings
                    DROP COLUMN IF EXISTS contact_landline,
                    DROP COLUMN IF EXISTS records_officer_name,
                    DROP COLUMN IF EXISTS elementary_principal_name,
                    DROP COLUMN IF EXISTS jhs_principal_name,
                    DROP COLUMN IF EXISTS shs_principal_name,
                    DROP COLUMN IF EXISTS shs_department_head_name;
            """,
        ),
    ]
