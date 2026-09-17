-- =============================================================
-- SLIS reference data — the lookup rows every install needs.
--
-- Loaded on its own for a real install (scripts/setup-db.ps1), and included
-- by seed_data.sql for the demo. No BEGIN/COMMIT here on purpose: included
-- from seed_data.sql it runs inside that file's transaction, and a COMMIT
-- here would commit half the demo early. setup-db.ps1 runs it with
-- psql --single-transaction instead.
--
-- Re-runnable. Requirement types use DO UPDATE (see below); everything else
-- is DO NOTHING, so rows edited in the portal are kept.
-- =============================================================

-- =====================================================
-- REQUIREMENT TYPES  (IDs 1–13)
-- The document catalogue, and the rule for who owes what.
--
-- This block did not exist before: on a database built from schema.sql +
-- seed_data.sql the table was EMPTY, which made the completeness gate in
-- enrollment-service a silent no-op and the whole requirements module
-- invisible. The thirteen rows only ever existed in a developer's live DB.
--
-- is_required     — does a missing copy block activating an enrollment
-- applies_to_*    — who is asked for it at all
--
-- Four gating documents, scoped, rather than thirteen for everyone:
--   continuing Grade 4 learner → 2 required (PSA, health record)
--   Grade 7 transferee         → 4 required (+ Form 137/138, good moral)
--   Kindergarten entrant       → 2 required
--
-- Optional rows stay in the catalogue: they are still tracked, uploaded and
-- OCR-checked, they simply do not block. See
-- scripts/2026-09-requirement-applicability.sql for the per-row reasoning.
--
-- DO UPDATE, not DO NOTHING: an existing database already holds these rows
-- from before the applicability columns existed, and DO NOTHING would leave
-- them at the "required for everyone" column defaults — i.e. change nothing.
-- The trade-off is that re-running this file resets hand-edited flags.
-- =====================================================
INSERT INTO requirement_types
  (requirement_type_id, requirement_code, requirement_name, description,
   is_active, is_required, applies_to_levels, applies_to_entry_statuses)
VALUES
  -- ── Required ────────────────────────────────────────────────────────────
  (9,  'psa_birth_certificate', 'PSA Birth Certificate',
       'PSA-issued birth certificate. The learner''s identity document.',
       TRUE, TRUE,
       ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
       ARRAY['new','transferee','continuing']),
  (10, 'health_record', 'Health Record',
       'Health, medical or immunization record. ECCD checklist for nursery and kindergarten.',
       TRUE, TRUE,
       ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
       ARRAY['new','transferee','continuing']),
  (12, 'form_137_or_138', 'Form 137/138',
       'Permanent record (SF10/Form 137) or report card (SF9/Form 138) from the previous school.',
       TRUE, TRUE,
       ARRAY['elementary','junior_highschool','senior_highschool'],
       ARRAY['transferee']),
  (3,  'certificate_good_moral', 'Certificate of Good Moral',
       'Certificate of Good Moral Character from the previous school.',
       TRUE, TRUE,
       ARRAY['elementary','junior_highschool','senior_highschool'],
       ARRAY['transferee']),

  -- ── Optional ────────────────────────────────────────────────────────────
  (1,  'birth_certificate', 'Birth Certificate',
       'Local civil registry copy. Accepted while the PSA copy is still being obtained.',
       TRUE, FALSE,
       ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
       ARRAY['new','transferee','continuing']),
  (2,  'form_138', 'Form 138',
       'Report card (SF9). Accepted in place of the permanent record.',
       TRUE, FALSE,
       ARRAY['elementary','junior_highschool','senior_highschool'],
       ARRAY['transferee']),
  (4,  'ncae_result', 'NCAE Result',
       'National Career Assessment Examination result, presented at senior high entry. Not required — the NCAE has not been administered consistently in recent years.',
       TRUE, FALSE,
       ARRAY['senior_highschool'],
       ARRAY['new','transferee']),
  (8,  'clearance_previous_school', 'Clearance from Previous School',
       'Clearance of accountabilities. Not required — routinely withheld over unpaid fees at the previous school.',
       TRUE, FALSE,
       ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
       ARRAY['transferee']),
  (6,  'certificate_non_sf9', 'Certificate of Non-SF9',
       'Issued by a previous school that cannot release the SF9.',
       TRUE, FALSE,
       ARRAY['elementary','junior_highschool','senior_highschool'],
       ARRAY['transferee']),
  (5,  'esc_completers', 'ESC Completers',
       'Educational Service Contracting certificate of junior high completion. Grantees only.',
       TRUE, FALSE,
       ARRAY['senior_highschool'],
       ARRAY['new','transferee']),
  (13, 'esc_transferee_qc', 'ESC Transferee QC',
       'ESC transferee qualification certification. Grantees only.',
       TRUE, FALSE,
       ARRAY['junior_highschool'],
       ARRAY['transferee']),
  (11, 'alien_certificate', 'Alien Certificate',
       'Alien Certificate of Registration. Foreign nationals only — nationality is not stored, so this cannot be scoped automatically.',
       TRUE, FALSE,
       ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
       ARRAY['new','transferee','continuing']),
  (7,  'recommendation_letter', 'Recommendation Letter',
       'Letter of recommendation. At the school''s discretion.',
       TRUE, FALSE,
       ARRAY['nursery','kindergarten','elementary','junior_highschool','senior_highschool'],
       ARRAY['new','transferee','continuing'])
ON CONFLICT (requirement_code) DO UPDATE SET
  requirement_name          = EXCLUDED.requirement_name,
  description               = EXCLUDED.description,
  is_active                 = EXCLUDED.is_active,
  is_required               = EXCLUDED.is_required,
  applies_to_levels         = EXCLUDED.applies_to_levels,
  applies_to_entry_statuses = EXCLUDED.applies_to_entry_statuses;

-- Keep the sequence ahead of the explicit IDs above, or the next
-- registrar-created requirement type collides on the primary key.
SELECT setval('requirement_types_requirement_type_id_seq',
              GREATEST((SELECT MAX(requirement_type_id) FROM requirement_types), 1));


-- =====================================================
-- GRADING TEMPLATES AND COMPONENTS
-- The score-entry block below looks up templates 2 and 3 by id, and every
-- subject points at one. Neither table was seeded, so the lookup returned
-- NULL and the NOT NULL on score_entries.grading_component_id aborted the
-- whole transaction.
--
-- Weights follow DepEd Order No. 8, s. 2015. Note this seed carries one
-- template per school level, not the full per-learning-area matrix the Order
-- defines (Languages/AP/EsP 30-50-20, Science and Math 40-40-20, MAPEH/TLE
-- 20-60-20, and the separate SHS Core/Academic/TVL splits) -- GradingTemplate
-- is keyed only on school_level, so that matrix cannot be expressed yet.
-- =====================================================
INSERT INTO grading_templates (grading_template_id, template_name, description, school_level, is_active)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'Standard Kindergarten',     'Checkpoint-based, no quarterly assessment.',   'kindergarten',      TRUE),
  (2, 'Standard Elementary',       'DepEd Order 8 s.2015 weighting, elementary.',  'elementary',        TRUE),
  (3, 'Standard Junior High',      'DepEd Order 8 s.2015 weighting, junior high.', 'junior_highschool', TRUE),
  (4, 'Standard Senior High Core', 'DepEd Order 8 s.2015 weighting, SHS core.',    'senior_highschool', TRUE)
ON CONFLICT DO NOTHING;

SELECT setval('grading_templates_grading_template_id_seq', GREATEST((SELECT MAX(grading_template_id) FROM grading_templates), 1));

INSERT INTO grading_components (grading_component_id, grading_template_id, component_name, weight, sort_order)
OVERRIDING SYSTEM VALUE VALUES
  -- Kindergarten: no quarterly assessment.
  (1,  1, 'Written Works',        50.00, 1),
  (2,  1, 'Performance Tasks',    50.00, 2),
  -- Elementary: 30 / 50 / 20.
  (3,  2, 'Written Works',        30.00, 1),
  (4,  2, 'Performance Tasks',    50.00, 2),
  (5,  2, 'Quarterly Assessment', 20.00, 3),
  -- Junior high: 30 / 50 / 20.
  (6,  3, 'Written Works',        30.00, 1),
  (7,  3, 'Performance Tasks',    50.00, 2),
  (8,  3, 'Quarterly Assessment', 20.00, 3),
  -- Senior high core: 25 / 50 / 25.
  (9,  4, 'Written Works',        25.00, 1),
  (10, 4, 'Performance Tasks',    50.00, 2),
  (11, 4, 'Quarterly Assessment', 25.00, 3)
ON CONFLICT DO NOTHING;

SELECT setval('grading_components_grading_component_id_seq', GREATEST((SELECT MAX(grading_component_id) FROM grading_components), 1));


-- =====================================================
-- NARRATIVE CATEGORIES  (IDs 900–903)
-- IDs 900+ so they never collide with categories created in the portal.
-- =====================================================
-- The four core values of the DepEd Order No. 8, s. 2015 Report on Learner's
-- Observed Values. These are mandated categories, not a starter set: the
-- previous seed invented 'Social Skills' / 'Work Habits' / 'Areas for Growth',
-- which a registrar would not recognise on a report card.
INSERT INTO narrative_categories (category_id, name, description, sort_order, is_active)
OVERRIDING SYSTEM VALUE VALUES
  (900, 'Maka-Diyos',      'Expresses spiritual beliefs while respecting the beliefs of others.',      1, TRUE),
  (901, 'Makatao',         'Is sensitive to individual, social and cultural differences.',             2, TRUE),
  (902, 'Makakalikasan',   'Cares for the environment and utilises resources wisely and responsibly.', 3, TRUE),
  (903, 'Makabansa',       'Demonstrates pride in being a Filipino; exercises the rights and responsibilities of a Filipino citizen.', 4, TRUE)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('narrative_categories', 'category_id'),
              GREATEST((SELECT MAX(category_id) FROM narrative_categories), 1));


-- =====================================================
-- SCHOOL SETTINGS  (singleton)
-- Without a row, /api/school-settings/current/ answers 404 and the forms
-- print a blank letterhead. This inserts a neutral one only when none
-- exists; fill in the address, contacts and school-year dates on the
-- Billing Settings page. The current school year follows the same July
-- cut-over as the frontend (utils/schoolYear.js).
-- =====================================================
INSERT INTO school_settings (setting_id, current_school_year, sy_start_date, sy_end_date, school_name)
OVERRIDING SYSTEM VALUE
SELECT 1,
       sy.start_year || '-' || (sy.start_year + 1),
       make_date(sy.start_year, 6, 1),
       make_date(sy.start_year + 1, 3, 31),
       'South Lakes Integrated School'
  FROM (SELECT CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 7
                    THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
                    ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
               END AS start_year) AS sy
 WHERE NOT EXISTS (SELECT 1 FROM school_settings);

SELECT setval('school_settings_setting_id_seq', GREATEST((SELECT MAX(setting_id) FROM school_settings), 1));
