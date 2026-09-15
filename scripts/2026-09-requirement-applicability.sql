-- Requirement applicability — forward migration for `requirement_types`.
--
-- Why this exists
-- ---------------
-- Before this, the table had no way to say "this document is required" as
-- distinct from "this document is in our catalogue": `is_active` doubled as
-- the mandatory flag, so the completeness gate in
-- enrollment-service/enrollments/serializers.py demanded every active type
-- from every learner. A Grade 1 new entrant was asked for a Form 137, an
-- NCAE result, an ESC transferee certificate and an Alien Certificate of
-- Registration.
--
-- Three columns split that apart: `is_required` (does this gate an
-- enrollment), and two applicability lists (who is it asked of at all).
--
-- The DEFAULTS deliberately reproduce the old behaviour exactly — required,
-- every level, every entry status. Running the ALTER without the seed block
-- below is therefore a no-op you can verify by observation, which is the
-- property that makes this safe to apply before a defence.
--
-- schema.sql is a pg_dump snapshot (see README), not the source of truth for
-- changes. Apply this file, then regenerate schema.sql from the live
-- database. This script is idempotent and safe to re-run.
--
--   psql -U postgres -d "SLIS THESIS FINAL" -f scripts/2026-09-requirement-applicability.sql

BEGIN;

-- ── Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.requirement_types
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT true;

ALTER TABLE public.requirement_types
  ADD COLUMN IF NOT EXISTS applies_to_levels text[] NOT NULL
    DEFAULT ARRAY['nursery','kindergarten','elementary',
                  'junior_highschool','senior_highschool']::text[];

ALTER TABLE public.requirement_types
  ADD COLUMN IF NOT EXISTS applies_to_entry_statuses text[] NOT NULL
    DEFAULT ARRAY['new','transferee','continuing']::text[];

-- ── Constraints ──────────────────────────────────────────────────────────
-- `<@` is the set-valued form of the CHECK (x = ANY (ARRAY[...])) idiom this
-- schema already uses for every other enum-shaped column. cardinality > 0
-- keeps a row from becoming unsatisfiable-by-nobody through a typo; the
-- application separately treats an empty list as "applies to no one" and
-- fails open, so the two agree.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'requirement_types_applies_to_levels_check') THEN
    ALTER TABLE public.requirement_types
      ADD CONSTRAINT requirement_types_applies_to_levels_check
      CHECK (applies_to_levels <@ ARRAY['nursery','kindergarten','elementary',
                                        'junior_highschool','senior_highschool']::text[]
             AND cardinality(applies_to_levels) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'requirement_types_applies_to_entry_statuses_check') THEN
    ALTER TABLE public.requirement_types
      ADD CONSTRAINT requirement_types_applies_to_entry_statuses_check
      CHECK (applies_to_entry_statuses <@ ARRAY['new','transferee','continuing']::text[]
             AND cardinality(applies_to_entry_statuses) > 0);
  END IF;
END $$;

-- ── Converge the catalogue onto DepEd practice ───────────────────────────
-- UPDATE, not INSERT ... ON CONFLICT DO NOTHING: the live database already
-- holds all thirteen rows, so DO NOTHING would leave them at the
-- "required for everyone" defaults and this script would change nothing.
--
-- Four gating documents, scoped, replacing a blanket thirteen:
--   continuing Grade 4 learner  → 2 required (PSA, health record)
--   Grade 7 transferee          → 4 required (+ Form 137/138, good moral)
--   Kindergarten entrant        → 2 required
--
-- Optional entries stay in the catalogue and are still tracked and uploaded;
-- they simply do not block an activation.

UPDATE public.requirement_types SET
  is_required = v.is_required,
  applies_to_levels = v.levels,
  applies_to_entry_statuses = v.entry_statuses
FROM (VALUES
  -- code, is_required, levels, entry statuses
  ('psa_birth_certificate',     true,
     ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
     ARRAY['new','transferee','continuing']),
  ('health_record',             true,
     ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
     ARRAY['new','transferee','continuing']),
  -- Permanent record travels with an incoming learner. A continuing learner's
  -- copy is already on file; an entry-grade learner has no prior school.
  ('form_137_or_138',           true,
     ARRAY['elementary','junior_highschool','senior_highschool'],
     ARRAY['transferee']),
  -- Covers "transferees and Grade 7/11 entrants" in one rule: both derive to
  -- transferee. Every continuing learner is exempt.
  ('certificate_good_moral',    true,
     ARRAY['elementary','junior_highschool','senior_highschool'],
     ARRAY['transferee']),

  -- ── Optional below ─────────────────────────────────────────────────────
  -- ocr/policy.py calls these "two codes for one form". Requiring both makes
  -- every learner hand over the same paper twice.
  ('birth_certificate',         false,
     ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
     ARRAY['new','transferee','continuing']),
  -- Alias family of form_137_or_138 — its name literally says "or".
  ('form_138',                  false,
     ARRAY['elementary','junior_highschool','senior_highschool'],
     ARRAY['transferee']),
  -- DepEd has not consistently administered the NCAE in recent years.
  -- Requiring it would block real Grade 11 enrollees over an exam they were
  -- never given. Tracked, scoped to SHS entry, not gating.
  ('ncae_result',               false,
     ARRAY['senior_highschool'],
     ARRAY['new','transferee']),
  -- Routinely withheld over unpaid fees at the previous school — exactly the
  -- "registrar is stuck with no override" case. Tracked, not gating.
  ('clearance_previous_school', false,
     ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
     ARRAY['transferee']),
  -- The alternate a previous school issues BECAUSE it cannot release the SF9.
  ('certificate_non_sf9',       false,
     ARRAY['elementary','junior_highschool','senior_highschool'],
     ARRAY['transferee']),
  -- ESC grantees only — not derivable from anything we store.
  ('esc_completers',            false,
     ARRAY['senior_highschool'],
     ARRAY['new','transferee']),
  ('esc_transferee_qc',         false,
     ARRAY['junior_highschool'],
     ARRAY['transferee']),
  -- Foreign nationals only. Nationality is not in the schema, so this cannot
  -- be scoped automatically and must stay optional.
  ('alien_certificate',         false,
     ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
     ARRAY['new','transferee','continuing']),
  ('recommendation_letter',     false,
     ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
     ARRAY['new','transferee','continuing'])
) AS v(code, is_required, levels, entry_statuses)
WHERE public.requirement_types.requirement_code = v.code;

COMMIT;

-- ── Verify ───────────────────────────────────────────────────────────────
--   SELECT requirement_code, is_required, applies_to_levels, applies_to_entry_statuses
--     FROM requirement_types ORDER BY is_required DESC, requirement_code;
