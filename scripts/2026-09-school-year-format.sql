-- School year format constraint
-- ==============================
-- `school_year` is the partition key for the entire system: the sidebar picker
-- scopes every page by it, enrollments/grades/attendance/section_advisories all
-- carry it, and billing's recalculate_invoices_for_schedule() matches it in raw
-- SQL across the service boundary. Every one of those is a string comparison
-- against a varchar(20) that had no constraint behind it.
--
-- A single '2025-26', a trailing space, or an 'SY 2025-2026' pasted out of a
-- spreadsheet does not error anywhere. It silently splits one school year into
-- two that no query ever rejoins -- and the split is invisible, because every
-- screen filters to one year at a time and each half looks complete from
-- inside itself.
--
-- backend/shared/school_year.py validates this on the way in through the API.
-- This is the backstop for everything that isn't the API: psql, a seed script,
-- a CSV import, the Django admin.
--
-- Run AFTER normalising any existing rows -- the audit queries at the bottom
-- find them. Adding a CHECK to a table with violating rows fails outright.

BEGIN;

-- Canonical form: exactly YYYY-YYYY. The consecutive-year rule (2025-2027 is
-- not a school year) is enforced in the application layer rather than here,
-- because expressing it in a CHECK means casting both halves on every write.
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['enrollments', 'section_advisories']
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I
               ADD CONSTRAINT %I
               CHECK (school_year ~ ''^[0-9]{4}-[0-9]{4}$'')',
            t, 'ck_' || t || '_school_year_format'
        );
    END LOOP;
END $$;

ALTER TABLE public.school_settings
  ADD CONSTRAINT ck_school_settings_school_year_format
  CHECK (current_school_year ~ '^[0-9]{4}-[0-9]{4}$');

COMMIT;

-- ── Audit: run these FIRST, and fix what they return, or the BEGIN block above
--    will roll back on the first violating row. ────────────────────────────────
--
--   SELECT DISTINCT school_year FROM enrollments
--    WHERE school_year !~ '^[0-9]{4}-[0-9]{4}$';
--
--   SELECT DISTINCT school_year FROM section_advisories
--    WHERE school_year !~ '^[0-9]{4}-[0-9]{4}$';
--
--   SELECT current_school_year FROM school_settings
--    WHERE current_school_year !~ '^[0-9]{4}-[0-9]{4}$';
--
-- The commonest fix, for rows that differ only by surrounding whitespace:
--
--   UPDATE enrollments SET school_year = btrim(school_year)
--    WHERE school_year <> btrim(school_year);
