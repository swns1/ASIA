from django.db import migrations


class Migration(migrations.Migration):
    """
    Add a DB-level FK from student_invoices.enrollment_id → enrollments.enrollment_id.
    Both tables live in the same PostgreSQL instance so the constraint is valid.
    Uses IF NOT EXISTS so the migration is safe to re-run.
    """

    dependencies = []

    operations = [
        migrations.RunSQL(
            sql="""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.table_constraints
                         WHERE constraint_name = 'fk_invoice_enrollment'
                           AND table_name = 'student_invoices'
                    ) THEN
                        ALTER TABLE student_invoices
                            ADD CONSTRAINT fk_invoice_enrollment
                            FOREIGN KEY (enrollment_id)
                            REFERENCES enrollments(enrollment_id)
                            ON DELETE RESTRICT
                            DEFERRABLE INITIALLY DEFERRED;
                    END IF;
                END
                $$;
            """,
            reverse_sql="""
                ALTER TABLE student_invoices
                    DROP CONSTRAINT IF EXISTS fk_invoice_enrollment;
            """,
        ),
    ]
