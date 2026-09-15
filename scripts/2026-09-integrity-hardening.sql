-- Integrity hardening — constraints and indexes the application assumed but
-- the database never enforced.
--
-- Why this exists
-- ---------------
-- A QA audit found several rules that live only in Python. Every one of them
-- is a rule the app already believes is true, so this script does not change
-- behaviour for correct data — it stops incorrect data from being written at
-- all, and turns a class of silent corruption into a loud error.
--
-- Verified against the live database before writing: no existing row violates
-- any constraint added here, and there are no duplicate non-void invoices, so
-- every statement below applies cleanly.
--
-- schema.sql is a pg_dump snapshot (see README), not the source of truth for
-- changes. Apply this file, then regenerate schema.sql from the live
-- database. This script is idempotent and safe to re-run.
--
--   psql -U postgres -d "SLIS THESIS FINAL" -f scripts/2026-09-integrity-hardening.sql

BEGIN;

-- ── 1. One live invoice per enrollment ───────────────────────────────────
-- generate_invoice_for_enrollment() is "idempotent" via a read-then-write
-- check with no lock. Two concurrent POSTs to /api/invoices/generate/ (a
-- double-clicked button, a retried request) both read "none exists" and both
-- insert, leaving the student owing twice, with two installment schedules.
--
-- billing/services.py now takes a per-enrollment advisory lock, which closes
-- the race for traffic going through the app. This index is the durable
-- backstop that also covers raw SQL, a second process, and any future caller
-- that forgets the lock. Voided invoices are excluded so an enrollment can be
-- re-invoiced after a void, which is a supported workflow.
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_invoices_live_per_enrollment
  ON public.student_invoices (enrollment_id)
  WHERE status <> 'void';

-- ── 2. Duplicate foreign key with contradictory delete semantics ─────────
-- student_invoices.enrollment_id carried TWO foreign keys to the same column:
--   student_invoices_enrollment_id_fkey  ON DELETE CASCADE
--   fk_invoice_enrollment                ON DELETE RESTRICT DEFERRABLE
-- Deleting an enrollment therefore behaved according to whichever Postgres
-- evaluated first. RESTRICT is the correct rule — financial records must not
-- disappear silently with an enrollment — so the CASCADE copy goes.
ALTER TABLE public.student_invoices
  DROP CONSTRAINT IF EXISTS student_invoices_enrollment_id_fkey;

-- ── 3. Enum-shaped columns the models constrain and the DB did not ───────
-- Each mirrors an existing `choices` list in the Django model. Without them
-- the model's validation is the only guard, and anything writing outside the
-- serializer (raw SQL, a mirror model in another service, the seed) can store
-- a value the app will later fail to interpret.
DO $$
BEGIN
  -- attendance_records.status — model choices P/A/L/E
  -- (enrollment-service/attendance/models.py). Column is varchar(1) with no
  -- CHECK, so any single character was accepted.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'attendance_records_status_check') THEN
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_records_status_check
      CHECK (status = ANY (ARRAY['P', 'A', 'L', 'E']));
  END IF;

  -- narrative_reports.rating — BOTH vocabularies the model declares.
  --
  -- AO/SO/RO/NO are the DepEd Order No. 8 marks the report card prints and the
  -- seed data writes; the three long-form values are the original prototype
  -- vocabulary, kept so existing rows still render (ai.services.NARRATIVE_SCORE
  -- maps both). Constraining this to the long-form three alone — which is what
  -- grades/serializers.py::validate_rating used to allow — would have rejected
  -- seed_data.sql outright and made the DepEd marks unwritable at the database
  -- level too. The serializer has been widened to the model's full
  -- RATING_CHOICES to match.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'narrative_reports_rating_check') THEN
    ALTER TABLE public.narrative_reports
      ADD CONSTRAINT narrative_reports_rating_check
      CHECK (rating = ANY (ARRAY['AO', 'SO', 'RO', 'NO',
                                 'outstanding', 'satisfactory', 'needs_improvement']));
  END IF;

  -- narrative_reports.grading_period — `grades` and `score_entries` both have
  -- this CHECK plus a validation trigger; narrative_reports had neither.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'narrative_reports_grading_period_check') THEN
    ALTER TABLE public.narrative_reports
      ADD CONSTRAINT narrative_reports_grading_period_check
      CHECK (grading_period = ANY (ARRAY['1st_quarter', '2nd_quarter',
                                         '3rd_quarter', '4th_quarter',
                                         '1st_semester', '2nd_semester']));
  END IF;
END $$;

-- ── 4. section_advisories: the unique constraint was porous ──────────────
-- The existing unique tuple ends in the NULLABLE `strand` column, and in
-- Postgres NULL <> NULL for uniqueness — so two identical non-SHS advisories
-- (strand NULL) for the same teacher, year, level, grade and section both
-- inserted. A partial unique index over the non-SHS case closes it without
-- disturbing the SHS rows, which the existing constraint already covers.
CREATE UNIQUE INDEX IF NOT EXISTS uq_section_advisories_no_strand
  ON public.section_advisories (teacher_user_id, school_year, school_level, grade_level, section)
  WHERE strand IS NULL;

-- ── 5. school_settings is a singleton in Python only ─────────────────────
-- billing-service/school_settings/models.py forces pk=1 in save(). Nothing
-- stopped a second row arriving by any other route, after which "current
-- settings" becomes whichever row is read first.
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_settings_singleton
  ON public.school_settings ((true));

-- ── 6. Indexes on hot foreign keys ───────────────────────────────────────
-- These columns are joined or filtered on essentially every page and had no
-- index at all. `enrollments` is the sharpest case: its only index is the
-- PARTIAL unique on (student_id, school_year) WHERE status IN
-- ('enrolled','pending'), which cannot serve a lookup for completed,
-- cancelled or transferred_out rows — that is, for all historical data, which
-- is exactly what the report card, SF10 and analytics read.
CREATE INDEX IF NOT EXISTS idx_enrollments_student           ON public.enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_school_year       ON public.enrollments (school_year);
CREATE INDEX IF NOT EXISTS idx_enrollments_status            ON public.enrollments (enrollment_status);
CREATE INDEX IF NOT EXISTS idx_grades_subject                ON public.grades (subject_id);
CREATE INDEX IF NOT EXISTS idx_student_invoices_enrollment   ON public.student_invoices (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_student_invoices_status       ON public.student_invoices (status);
CREATE INDEX IF NOT EXISTS idx_student_payments_invoice      ON public.student_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_student_payments_date         ON public.student_payments (payment_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice         ON public.student_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_discounts_invoice     ON public.student_invoice_discounts (invoice_id);
CREATE INDEX IF NOT EXISTS idx_guardians_student             ON public.guardians (student_id);
CREATE INDEX IF NOT EXISTS idx_siblings_student              ON public.siblings (student_id);
CREATE INDEX IF NOT EXISTS idx_previous_schools_student      ON public.previous_schools (student_id);
CREATE INDEX IF NOT EXISTS idx_students_household            ON public.students (household_id);
CREATE INDEX IF NOT EXISTS idx_subjects_placement            ON public.subjects (school_level, grade_level);

-- Exactly what `manage.py flag_overdue_installments` scans every run.
CREATE INDEX IF NOT EXISTS idx_invoice_installments_due
  ON public.invoice_installments (status, due_date);

COMMIT;

-- Verification (run separately):
--
--   SELECT enrollment_id, count(*) FROM student_invoices
--    WHERE status <> 'void' GROUP BY 1 HAVING count(*) > 1;        -- expect 0 rows
--
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'student_invoices'::regclass AND contype = 'f';  -- expect 1 row
