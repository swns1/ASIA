-- School identity for DepEd school forms
-- =====================================
-- Every DepEd school form opens with the same header: School ID, Region,
-- Division, District, School Name, and a line for the School Head to sign.
-- SLIS kept only the school's name and address, so the SF1/SF2/SF10 exports
-- (enrollment-service school_forms) had nothing to fill the rest with, and
-- the old print pages asked for them on every print.
--
-- These live on the single school_settings row, edited on the Settings page
-- (billing-service owns the table; enrollment-service reads it through
-- school_forms.models.SchoolIdentity).
--
-- All five are nullable: an existing row stays valid, and a form simply
-- prints the box blank until someone fills it in.
--
-- billing-service's migration school_settings/0002_school_identity makes the
-- same change, so `manage.py migrate` (and, on Railway, the pre-deploy step)
-- applies it without this file. Both are safe to run after the other.
--
-- DepEd School IDs are six digits (private schools' start with 4). The CHECK
-- is the backstop for anything that isn't the API; billing-service's
-- serializer gives the friendly message.
--
-- Rollback:
--   BEGIN;
--   ALTER TABLE public.school_settings
--     DROP CONSTRAINT IF EXISTS ck_school_settings_deped_school_id,
--     DROP COLUMN IF EXISTS deped_school_id,
--     DROP COLUMN IF EXISTS region,
--     DROP COLUMN IF EXISTS division,
--     DROP COLUMN IF EXISTS district,
--     DROP COLUMN IF EXISTS school_head_name;
--   COMMIT;

BEGIN;

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

COMMIT;
