-- The SF10 in the school's own format
-- ===================================
-- The SF10 download (enrollment-service school_forms) is South Lakes' own
-- permanent record now, not DepEd's LIS template. Two things it prints had
-- nowhere to come from:
--
-- 1. school_settings: the letterhead's landline, and the names over each
--    certification signature line -- the records officer, the elementary,
--    junior high and senior high principals, and the senior high department
--    head. Edited on the Settings page (billing-service owns the table;
--    enrollment-service reads it through school_forms.models.SchoolIdentity).
--
-- 2. subjects.subject_group: the heading a senior high subject sits under on
--    the record -- Core, Contextualized (DepEd's "applied") or Specialization.
--    NULL means automatic: the export works it out from the name and strand
--    (school_forms.sf10.subject_group). Set it only to override that.
--
-- Everything is nullable: existing rows stay valid, and the record prints a
-- blank line until someone fills a name in.
--
-- The same changes are migrations -- billing-service school_settings/0003 and
-- enrollment-service subjects/0003 -- so `manage.py migrate` (and, on
-- Railway, the pre-deploy step) applies them without this file. Both are
-- safe to run after the other.
--
-- Rollback:
--   BEGIN;
--   ALTER TABLE public.school_settings
--     DROP COLUMN IF EXISTS contact_landline,
--     DROP COLUMN IF EXISTS records_officer_name,
--     DROP COLUMN IF EXISTS elementary_principal_name,
--     DROP COLUMN IF EXISTS jhs_principal_name,
--     DROP COLUMN IF EXISTS shs_principal_name,
--     DROP COLUMN IF EXISTS shs_department_head_name;
--   ALTER TABLE public.subjects
--     DROP CONSTRAINT IF EXISTS ck_subjects_subject_group,
--     DROP COLUMN IF EXISTS subject_group;
--   COMMIT;

BEGIN;

ALTER TABLE public.school_settings
    ADD COLUMN IF NOT EXISTS contact_landline          character varying(50),
    ADD COLUMN IF NOT EXISTS records_officer_name      character varying(150),
    ADD COLUMN IF NOT EXISTS elementary_principal_name character varying(150),
    ADD COLUMN IF NOT EXISTS jhs_principal_name        character varying(150),
    ADD COLUMN IF NOT EXISTS shs_principal_name        character varying(150),
    ADD COLUMN IF NOT EXISTS shs_department_head_name  character varying(150);

ALTER TABLE public.subjects
    ADD COLUMN IF NOT EXISTS subject_group character varying(20);
ALTER TABLE public.subjects
    DROP CONSTRAINT IF EXISTS ck_subjects_subject_group;
ALTER TABLE public.subjects
    ADD CONSTRAINT ck_subjects_subject_group
    CHECK (subject_group IS NULL OR subject_group IN ('core', 'applied', 'specialized'));

COMMIT;
