# ASIA Mock Data Guide

The complete reference for ASIA's mock (seed) data: what exists today, how it is built, every rule the data has to satisfy, how to check it, and how to ask for more.

- **Last verified:** 2026-10-04. Tiers 3 and 4 are **loaded in the live database**; both passed a copy-load, an idempotent second load and the SQL invariants. The full app-level checks and test suites have **not** been re-run since Tier 2.5 (2026-10-02, 1344 tests).
- **Current tier:** Tier 7, loaded. **315 learners in S.Y. 2025-2026** (finished) + **442 in S.Y. 2026-2027** (current, filled up to 2026-09-30); 551 distinct, 819 enrollments, 33 sections per year holding 7-18 learners each. The narrative in §9.1-9.4 is Tier 1 and historical — **§9.5, §9.7-§9.12 are what is loaded.** The LRN suffix is now 4 digits (§9.12). Use `--report` for exact per-learner detail.
- **Database:** `SLIS THESIS FINAL` (local PostgreSQL, user `postgres`).

---

## Contents

0. [**Adding more learners — start here**](#0-adding-more-learners--start-here)
1. [Quick facts](#1-quick-facts)
2. [Ground rules](#2-ground-rules)
3. [Files and where they live](#3-files-and-where-they-live)
4. [How to build, load, test, clear](#4-how-to-build-load-test-clear)
5. [System map](#5-system-map)
6. [Insert order (dependency graph)](#6-insert-order-dependency-graph)
7. [Table-by-table rules](#7-table-by-table-rules)
8. [Cross-cutting behaviour](#8-cross-cutting-behaviour)
9. [What the current seed contains](#9-what-the-current-seed-contains-991-94--tier-1-history-995--tier-2-997--tier-25-current) — Tier 1 history §9.1-9.4; Tier 2 §9.5; Tier 2.5 §9.7 (loaded); **Tier 3 §9.8 is current**
10. [Generator internals](#10-generator-internals)
11. [Verification checklist](#11-verification-checklist)
12. [Bugs the seed has found](#12-bugs-the-seed-has-found)
13. [Expected behaviour that looks like a bug](#13-expected-behaviour-that-looks-like-a-bug)
14. [Coverage: what the data exercises and what it doesn't](#14-coverage-what-the-data-exercises-and-what-it-doesnt)
15. [Recipes for common additions](#15-recipes-for-common-additions)
16. [Roadmap (proposed tiers)](#16-roadmap-proposed-tiers)
17. [How to request more data](#17-how-to-request-more-data)
18. [Enum reference](#18-enum-reference)

---

## 0. Adding more learners — start here

**Growing the learner population is ongoing work** (the user, 2026-10-02: "from this point forwards we'll most likely be creating more and more students"). If that is the request, this section is the fast path; read §9.7 for the current state and §11 before loading anything.

**Everything lives in the repo** — nothing to hunt for:

| | |
|---|---|
| All data | `scripts/seed_spec.py` — `PROFILES`, `HOUSEHOLDS`, `ENROLLMENTS`, `INVITES`, `APPLICATIONS`, `SECTIONS`, `STAFF`, `PINNED_NUMBERS` |
| Logic | `scripts/generate_seed_data.py` — touch only for new mechanics |
| Output | `seed_data.sql` at the repo root — **generated, never hand-edited** |
| Regenerate | `cd scripts && ../venv/bin/python generate_seed_data.py --out ../seed_data.sql --report /tmp/r.json` |

**Next free identifiers** (as of Tier 4; re-check the live DB before using them):

| What | Used | Next free |
|---|---|---|
| student_id / household_id | 100-676 (**cap 9999** since §9.12 widened the LRN suffix) | **677+** (~9,300 left) |
| enrollment_id | …1600-1652, 2000-2069 (2025-2026); …1700-1784, 2600-2672 (2026-2027) | **2100+ / 2700+** |
| invoice_id | …1800-1851, 3000-3069 (2025-2026); …1900-1984, 3600-3672 (2026-2027) | **3100+ / 3700+** |

**The original 200-399 / 400-599 enrollment blocks (and 300-499 / 500-699 for
invoices) are FULL.** Tier 5 moved to 1200+/1400+; continue in that high space
rather than hunting for gaps. Check both the max id *and* the next block's
floor before picking a range (§9.10).
| application_id | 700-712 | **713+** |
| LRN, student_number | derived / auto-assigned | nothing to pick |

Note: the LRN is `136700000` + the **three-digit** student_id, so student_id
must stay below 1000. Past 999 the LRN scheme needs widening.

**The rule that bites: `PINNED_NUMBERS`.** Student numbers are handed out in *enrollment-date order*, so a learner added with a May 2025 date would renumber every existing learner after them. `PINNED_NUMBERS` freezes the 31 Tier 1/2 learners on the numbers they hold in the live database.

- Never edit an existing pin. A learner with no entry takes the next free number for their year, and the generator raises on a duplicate.
- **After a tier is loaded into the real database, pin its new learners too** — otherwise the next tier renumbers them. **All 551 learners through Tier 7 are pinned.** Pin the next tier's learners once it is loaded.

**The procedure:**

1. Confirm scope with the user first (which years, continuations or not, which grades/sections, test-only or load). §17 has the template.
2. Check the live database for the real starting point — counts, section occupancy, max IDs. A written-down number ages; the database does not.
3. Edit `seed_spec.py` only: `HOUSEHOLDS` → `PROFILES` → `ENROLLMENTS` (→ intake if asked). Copy a neighbouring entry's shape; `P(...)` and `E(...)` fill the defaults.
4. Validate the spec before generating: every enrollment key in `PROFILES`; every `(sy, grade, section)` in `SECTIONS`; `strand` matching the section; level matching the grade; eids and invoice ids unique; **grade progression step 0 or 1** per learner per year (a jump needs an override); ages within ±1 of `4 + ladder index`.
5. Generate, then test on a throwaway copy of the live database — load, load **again** for idempotency, §11's SQL, the app-level checks, the test suites.
6. Back up, load, re-verify read-only, then update this guide (a new §9.x, quick facts, roadmap, checklist counts, the `--report` printout) and report counts, logins and any app bug found. **Report bugs, don't fix them** — §2.

**Two traps that have cost real time.** Both are flaws in *check scripts*, not in the data:

1. The invoice reconciliation query must **exclude `voided` installments**. Transfer-out close-outs void the remainder, so summing all of them falsely flags every closed-out invoice.
2. A grade check must **`quantize` the renormalised initial grade to 2 dp before transmuting**, exactly as `grading/views.compute_grade` does. Skipping it makes grades look off by one point at a band boundary (80.797 → 80.80 → 88, not 87). A partial period legitimately has encoded weight below 100.

**Do not add subjects or fee schedules unless asked.** Both seeded years are complete, and the 2026-2027 Grade 1 (no items) and Grade 9 (no schedule) gaps are deliberate billing edge cases.

---

## 1. Quick facts

| | |
|---|---|
| Seeded year 1 | **S.Y. 2025-2026** (2025-06-01 to 2026-03-31). Finished; 315 learners. Not archived. |
| Seeded year 2 | **S.Y. 2026-2027** (current). 442 learners, filled up to **2026-09-30** (`TODAY` in the generator). MATATAG subject changes applied (no Mother Tongue G1-3, EsP replaced by GMRC/Values Ed). |
| Learners | 551 distinct (315 + 442, 206 carried over both years), 819 enrollments total (Senior High learners have one enrollment per semester) |
| Sections | **33 per year since Tier 3** — two per grade (three in G7), four in G11-12 across STEM/ABM. **Headcount per section is 7-11 (2025-2026) and 10-18 (2026-2027) since Tier 7.** 2026-2027 has renamed/reshuffled sections (see §9.5) and G9 Sapphire has no adviser. |
| Subjects | 121 for 2025-2026; 118 for 2026-2027 (MATATAG-adjusted). |
| Accounts | 43 staff (2 inactive/resigned teachers) + 727 guardian accounts, plus 4 usable guardian logins. Password **`SlisDemo2026!`** for all active staff. |
| Volumes | 87,054 score entries · 9,727 grades · 5,332 narratives · 80,946 attendance records · 2,704 documents (2,682 files) · 741 invoices · 2,303 payments · 4,692 installments · 19 invites · 13 applications |
| Identifier block | LRNs `136700000xxx` · student numbers `2025-0001..0245`, `2026-0001..0209` · enrollment IDs 200-438 + 1200-1259 + 1600-1652, 400-600 + 1400-1483 + 1700-1784 · invoice IDs 300-505 + 1300-1351 + 1800-1851, 500-698 + 1500-1583 + 1900-1984 · application IDs 700-712 · staff emails `@slis.test` · guardian emails `*.seed@gmail.com` |
| Generator | `scripts/generate_seed_data.py` + `scripts/seed_spec.py`, **now in the repo** (moved 2026-09-30; see §3) |

---

## 2. Ground rules

These are standing instructions for anyone (human or Claude) working on the seed.

1. **Only create data; report bugs, don't fix them.** The data exists to surface broken features and unseen bugs. When the data exposes an app bug, write it down and report it. Fix it only when explicitly asked.
2. **Ask before any code change**, including fixes to app code. Changes to the generator or `seed_data.sql` also need a go-ahead before they are loaded into the real database.
3. **Small first, then scale.** Tiers grow step by step (10 learners, then more). Each tier is studied and planned before it is generated, and it has to be right the first time.
4. **Edit the generator, never `seed_data.sql` by hand.** The SQL file is generated output.
5. **Test on a throwaway database before touching the real one.** Also test a fresh `schema.sql` load. Back up the real database before every load.
6. **The user verifies UI changes.** Don't drive a browser to check pages; report what to look at.
7. **Match the app's own logic exactly.** Grades, billing math, the document gate and scoping are computed with the same rules as the services, then checked against the services' own code.
8. **Never touch rows outside the seed's namespace.** Anything a person typed in (other LRNs, other emails) is left alone.

---

## 3. Files and where they live

| File | Location | Tracked? | Purpose |
|---|---|---|---|
| `generate_seed_data.py` | `scripts/` | **Yes (moved into the repo 2026-09-30)** | The generator entry point. Deterministic Python that writes `seed_data.sql` plus placeholder PDFs. Imports `seed_spec` as a sibling module — keep both files in `scripts/`. |
| `seed_spec.py` | `scripts/` | Yes | All the Tier 2 data: constants, calendars, subject catalogues, fee items, staff, sections, households, profiles, enrollments, invites, applications. Edit this for data changes; edit `generate_seed_data.py` for logic changes. |
| `seed_data.sql` | repo root | Yes | Generated output. One transaction (`BEGIN`…`COMMIT`), ~10,080 lines (Tier 2). Includes `scripts/reference_data.sql` with `\ir`. |
| `scripts/reference_data.sql` | repo | Yes | Requirement types (13), grading templates 1-4 and their components, observed-value categories 900-903, and a default `school_settings` row (only if none exists). |
| `scripts/resync-sequences.sql` | repo | Yes | Moves every sequence to its table's max. The seed already resyncs the tables it writes with explicit IDs (including `student_applications`). |
| `scripts/setup-db.ps1 -Demo` | repo | Yes | Windows fresh install: creates the database, loads `schema.sql`, fakes the migrations, loads reference data, then `seed_data.sql`. **Not re-tested against Tier 2** — see §11 note. |
| `scripts/seed-demo.ps1` + Django `seed_demo*.py` | repo | Yes | **Legacy and broken since the school-year rework. Don't use.** See below. |
| Placeholder PDFs | `backend/enrollment-service/media/requirements/` and `backend/student-service/media/requirements/` | No (`media/` is gitignored) | 143 files named `seed_<lrn>_<code>.pdf`, each stamped "SAMPLE DOCUMENT - DEMO DATA ONLY" (WinAnsiEncoding so `ñ` renders). Without them the rows still load, but the preview links return 404. Regenerate with the `--media` flags shown in §4. |
| Backups | `~/Documents/ASIA-db-backups/` | No | `pg_dump -Fc` files, including `SLIS_THESIS_FINAL_2026-09-30_before-tier2-seed.dump` (taken immediately before the Tier 2 load) and the earlier Tier 1 dumps from 2026-09-29. |

### The legacy seeders (don't use)

`scripts/seed-demo.ps1` drives three Django commands: `students/seed_demo_students.py`, `enrollments/seed_demo.py` and `billing/seed_demo_billing.py`. They use the reserved LRN block `9900…`. They were **not** updated for the school-year rework:

- They never register school years (the FK now requires it).
- They never create sections (the composite FK now requires it). Their section names (Mabini/Rizal, SHS Bonifacio/Luna) don't exist.
- They create Senior High as one enrollment per year instead of one per semester.
- `seed_demo_billing.py` only gained per-year fee schedules, and it stamps `invoice_date = today`.

### README is stale

The README's "Demo accounts" section still describes the old six-account seed (for example, "Adviser of Grade 4-A, Grade 6-A and Grade 7-Diamond", "Demo data lives in SY 2025-2026, 1st Quarter"). It needs updating to match §9.

---

## 4. How to build, load, test, clear

All commands run from the repo root on macOS (zsh). The venv is the repo's `venv/` (Python 3.14, Django 6.0.5).

### psql habits (these avoid hangs and silent failures)

- Always pass `-X -P pager=off` and redirect stdin from `/dev/null`, so psql never waits on a pager or prompt.
- Put multi-statement SQL in a file and run it with `psql -f file.sql`, not a long `-c` string.
- Use `-v ON_ERROR_STOP=1` when loading, so the first error aborts. The seed is a single transaction anyway.
- In zsh, quote globs (`--include='*.py'`).

### Regenerate `seed_data.sql`

```bash
venv/bin/python scripts/generate_seed_data.py --out seed_data.sql \
  --media backend/enrollment-service/media \
  --media backend/student-service/media
# prints: {'enrollments': 233, 'events_2025-2026': 39, 'events_2026-2027': 40,
#          'guardian_accounts': 203, 'docs': 720, 'doc_files': 715, 'transfers': 18,
#          'scholarships': 99, 'invoices': 212, 'payments': 760, 'installments': 1426,
#          'invites': 19, 'applications': 13, 'scores': 25557, 'grades': 2901,
#          'narratives': 1608, 'attendance': 24001, 'exceptions': 2032, 'learners': 151,
#          'subjects': {'2025-2026': 121, '2026-2027': 118},
#          'learners_per_year': {'2025-2026': 95, '2026-2027': 119}}
```

Add `--report path/to/report.json` for a machine-readable dump of every learner, invoice and enrollment the run produced (useful for regenerating this guide's tables, or for scripted verification).

Django must be importable, because the generator hashes passwords with Django's `make_password`. The output is byte-for-byte reproducible as long as the generator is unchanged.

### Back up the real database (before every load)

```bash
pg_dump -Fc -d "SLIS THESIS FINAL" \
  -f ~/Documents/ASIA-db-backups/SLIS_THESIS_FINAL_$(date +%F)_<label>.dump </dev/null
```

### Test on a throwaway copy first

```bash
dropdb --if-exists slis_seed_test </dev/null
createdb slis_seed_test </dev/null
pg_dump -Fc -d "SLIS THESIS FINAL" </dev/null | pg_restore -d slis_seed_test --no-owner
psql -X -q -v ON_ERROR_STOP=1 -d slis_seed_test -f seed_data.sql </dev/null
# run it a second time: the result must be identical (idempotency)
```

### Test a fresh install

The local Postgres server is older than the `pg_dump` that wrote `schema.sql`, so it rejects `SET transaction_timeout`. Strip that line first. This is only a version mismatch, not a problem with the schema.

```bash
grep -v transaction_timeout schema.sql > /tmp/schema_clean.sql     # use the scratchpad, not /tmp, in Claude sessions
createdb slis_seed_fresh </dev/null
psql -X -q -v ON_ERROR_STOP=1 -d slis_seed_fresh -f /tmp/schema_clean.sql </dev/null
psql -X -q -v ON_ERROR_STOP=1 -d slis_seed_fresh -f seed_data.sql </dev/null
```

On a fresh database: 2026-2027 becomes the current year (because no year is current yet), 28 users are created (your 5 original local accounts aren't in `schema.sql`), and user IDs differ from the live database.

### Run the app's own code against a test database

The environment variable overrides `.env`:

```bash
cd backend/enrollment-service
DB_NAME=slis_seed_test ../../venv/bin/python manage.py shell -c "…"
```

### Load into the real database

Do this only after the throwaway tests pass and a backup exists:

```bash
psql -X -q -v ON_ERROR_STOP=1 -d "SLIS THESIS FINAL" -f seed_data.sql </dev/null
```

### Re-running

The seed is re-runnable:

- Section 0 deletes every learner in the LRN block `136700000…` and everything downstream of them.
- Shared setup (years, subjects, fees, sections, calendar, accounts) is insert-if-missing.
- Accounts are matched by email. `name`, `role` and `password` are reset on every run. **`is_active` is not reset**, so a seeded account deactivated during testing stays deactivated after re-seeding.

### Clearing

To remove the seed, delete in child → parent order:

1. invoices
2. attendance
3. transfers
4. risk scores
5. document extractions
6. enrollments
7. students
8. households

Invoices and attendance don't cascade from enrollments (RESTRICT / NO ACTION, on purpose). After that, remove the 2025-2026 advisories, sections, calendar events and fee schedules, the 2025-2026 subjects, and the seed accounts.

Restoring a backup is often simpler:

```bash
pg_restore --clean --if-exists -d "SLIS THESIS FINAL" ~/Documents/ASIA-db-backups/<file>.dump
```

Get a go-ahead before any destructive command on the real database.

### Migrations on a fresh database

Four services share an `accounts` app label. Migrate **identity-service first**. Otherwise student/billing `accounts 0003` gets recorded as applied, and identity's `ALTER TABLE users ADD COLUMN is_active` DDL can be skipped. `setup-db.ps1` handles the fake-migration order for the initial schema.

---

## 5. System map

Four Django services share one Postgres database. Each service owns some tables and reads others through `managed = False` mirror models. The React admin portal talks to all four.

| Service | Port | Owns (writes) |
|---|---|---|
| identity-service | 8001 (`/api/auth/`) | `users`, `audit_logs` |
| student-service | 8000 | `households`, `students`, `guardians`, `siblings`, `previous_schools`, `student_requirement_submissions`, `application_invites`, `student_applications`, `document_extractions`, `student_siblings` (unused) |
| enrollment-service | 8003 | `school_years`, `sections`, `section_advisories`, `enrollments`, `enrollment_transfers`, `enrollment_overrides`, `enrollment_scholarships`, `scholarship_types`, `subjects`, `grading_templates`, `grading_components`, `score_entries`, `grades`, `narrative_categories`, `narrative_reports`, `attendance_records`, `academic_calendar_events`, `requirement_types`, `risk_assessment_runs`, `student_risk_scores`, `email_delivery_failures` |
| billing-service | 8002 | `fee_schedules`, `fee_schedule_items`, `billing_items`, `discount_types`, `student_invoices`, `student_invoice_items`, `student_invoice_discounts`, `invoice_installments`, `student_payments`, `school_settings` |

- **Login:** `POST /api/auth/login/`. The identifier is the `users.email` column. Passwords are Django `pbkdf2_sha256`. Your original local accounts use short identifiers (`registrar`, `teacher`, …) in that column.
- **Source of truth for structure:** `schema.sql`. Most models are `managed = False`. `schema.sql` also contains two triggers (`trg_validate_grading_period`, `trg_billing_item_parent_category_match`) and a view (`student_invoice_balances`) that Django can't see.

---

## 6. Insert order (dependency graph)

```
school_years ─┬─> school_settings (mirrors the current year)
              ├─> subjects (per year) <── grading_templates ──> grading_components
              ├─> fee_schedules (per year) ──> fee_schedule_items
              ├─> academic_calendar_events (per year)
              ├─> sections (per year) ──> section_advisories <── users (teachers, no FK)
              └─> application_invites ──> student_applications

lookups: requirement_types, narrative_categories, discount_types, scholarship_types, billing_items

households ──> students ─┬─> guardians (user_id → users, guardian login)
                         ├─> siblings (free text, not-enrolled siblings)
                         ├─> previous_schools
                         ├─> student_requirement_submissions ──> requirement_types
                         └─> enrollments ──> sections (composite FK), school_years
                               ├─> enrollment_transfers / enrollment_overrides / enrollment_scholarships
                               ├─> score_entries ──> subjects, grading_components
                               ├─> grades ──> subjects
                               ├─> narrative_reports ──> narrative_categories
                               ├─> attendance_records (recorded_by = adviser user_id)
                               └─> student_invoices ──> items / discounts / installments / payments

after seeding: flag overdue installments → risk runs (non-archived years only)
               → archive past years (SQL) → resync sequences
```

The numbered order the generator follows:

1. `school_years`, then sync `school_settings` to the current year.
2. Lookups: grading templates and components, subjects (template FK), fee schedules and items, discount/scholarship/requirement types, narrative categories.
3. `users`: staff, teachers, guardian logins.
4. `academic_calendar_events` per year.
5. `sections` per year, then `section_advisories`.
6. `households` → `students` → `guardians` / `siblings` / `previous_schools` / `student_requirement_submissions`. Link `guardians.user_id`.
7. `enrollments` → transfers, overrides, scholarships.
8. Per enrollment: `score_entries` → `grades`, `narrative_reports`, `attendance_records`.
9. `student_invoices` → items, discounts, installments; `student_payments`.
10. (Future) `application_invites` → `student_applications`.
11. After seeding: `flag_overdue_installments`, risk runs, archive past years, resync sequences.

---

## 7. Table-by-table rules

Each subsection lists the DB constraints (hard failures) and the app rules (what the API or UI assumes). Seed data must satisfy both, or the pages built on it misbehave.

### 7.1 `school_years` and `school_settings`

- `label` is `YYYY-YYYY` with consecutive years (e.g. `2025-2026`), unique. `start_date` < `end_date` (CHECK). The start falls in the first year, the end in the second. Ranges must not overlap (serializer).
- **Exactly one `is_current`** (partial unique index `uniq_current_school_year`).
- `created_at` and `updated_at` are NOT NULL with no default, so supply them.
- `archived_at` / `archived_by` mark a year as archived.
- **Derived state**, in priority order: archived > current > upcoming (label later than the current one) > open.
- An **archived year is read-only through the API**: enrollments, sections, advisories, grades, scores, narratives, attendance, scholarships, calendar and risk runs are all refused with 409. Billing and student records are *not* guarded. **Seed an archived year's data first, then set `archived_at`.**
- `school_settings` is a singleton that mirrors the current year's label and dates (the API keeps those fields read-only). It also holds `early_bird_days` (default 7) and the letterhead (name, address, contact email, phone).
- Many tables reference the registry by label: `enrollments`, `section_advisories`, `sections`, `academic_calendar_events`, `risk_assessment_runs`, `fee_schedules`, `subjects`, `application_invites`, `student_applications`. All use `ON UPDATE CASCADE ON DELETE RESTRICT`, except `sections`, which is DEFERRABLE.

### 7.2 Curriculum: grading templates, subjects, observed values

- **`grading_templates`**: unique `template_name`, one per `school_level`.
- **`grading_components`**: `weight` > 0 and ≤ 100, unique per template + `component_name`.
- The templates come from `reference_data.sql`:

| ID | Template | Components (weight) |
|---|---|---|
| 1 | Standard Kindergarten | Written Works 50 · Performance Tasks 50 (also used for Nursery) |
| 2 | Standard Elementary | WW 30 · PT 50 · Quarterly Assessment 20 |
| 3 | Standard Junior High | WW 30 · PT 50 · QA 20 |
| 4 | Standard Senior High Core | WW 25 · PT 50 · QA 25 |

- **`subjects` are per school year** (since `ac88a0d3`):
  - `school_year` is NOT NULL, FK to `school_years`, and `UNIQUE (school_year, subject_code)`.
  - Senior High needs `semester` `1st`/`2nd`. Everything else has `semester` NULL (CHECK).
  - SHS `strand` is NULL for core subjects (taken by every strand) or a strand code (STEM, ABM).
  - A grade or score's subject must belong to the **same year as the enrollment** (serializer). In SQL, always join subjects on `subject_code` **and** `school_year = enrollment.school_year`.
  - Carry-over has a `subjects` part, and the setup checklist counts subjects per grade.
- **`narrative_categories`**: the DepEd core values, IDs 900-903: Maka-Diyos, Makatao, Makakalikasan, Makabansa.

### 7.3 `requirement_types` (document catalogue)

13 rows, from `reference_data.sql`. Only **required** rows gate enrollment.

| ID | Code | Required | Levels | Entry statuses |
|---|---|---|---|---|
| 9 | `psa_birth_certificate` | **yes** | all | new, transferee, continuing |
| 10 | `health_record` | **yes** | all | new, transferee, continuing |
| 12 | `form_137_or_138` | **yes** | elementary, JHS, SHS | transferee |
| 3 | `certificate_good_moral` | **yes** | elementary, JHS, SHS | transferee |
| 1 | `birth_certificate` | no | all | all |
| 2 | `form_138` | no | elementary, JHS, SHS | transferee |
| 4 | `ncae_result` | no | SHS | new, transferee |
| 5 | `esc_completers` | no | SHS | new, transferee |
| 6 | `certificate_non_sf9` | no | elementary, JHS, SHS | transferee |
| 7 | `recommendation_letter` | no | all | all |
| 8 | `clearance_previous_school` | no | all | transferee |
| 11 | `alien_certificate` | no | all | all |
| 13 | `esc_transferee_qc` | no | JHS | transferee |

### 7.4 Billing lookups

- **`fee_schedules` are per year**: `UNIQUE (school_year, school_level, grade_level)`, FK to `school_years`. Items have `item_category` in `tuition` / `misc` / `other` and `amount` ≥ 0. Invoice generation looks up the schedule by the **enrollment's** year + level + grade. With no schedule it errors; with a schedule but no items the invoice totals 0.
- **2025-2026 fees** (seeded; every grade has tuition + Miscellaneous Fee + Books & Materials, plus an `other` item where listed):

| Grades | Tuition | Misc | Books | Other |
|---|---|---|---|---|
| Nursery, Kindergarten | 17,000 | 2,000 | 1,500 | none |
| Grades 1-5 | 19,000 | 2,500 | 1,800 | none |
| Grade 6 | 19,000 | 2,500 | 2,000 | none |
| Grades 7-10 | 23,000 | 3,000 | 2,500 | Student Activities 500 |
| Grade 11 | 27,000 | 3,500 | 3,000 | Lab Fee 1,000 |
| Grade 12 | 27,000 | 3,500 | 3,000 | Research Fee 1,500 |

- **2026-2027 fees** (these predate the seed and were left untouched):
  - 11 schedules exist. **G3, G5 and G9 have none**, and the **G1 schedule has no items**.
  - Rates: N/K 18,000+2,000+1,500; G2/G4 20,000+2,500+1,800; G6 20,000+2,500+2,000; G7-G10 24,000+3,000+2,500+500; G11 28,000+3,500+3,000+1,000; G12 28,000+3,500+3,000+1,500.
- **`discount_types`** (unique code):

| Code | Mode | Value |
|---|---|---|
| EARLY_BIRD | percentage | 5 |
| SEMI_ANNUAL_PLAN | percentage | 3 |
| ANNUAL_PLAN | percentage | 5 |
| MONTHLY_PLAN | percentage | 0 |
| QUARTERLY_PLAN | percentage | 0 |
| ESC_BILLING | fixed_amount | 14,000 |
| 4PS_BILLING | percentage | 20 |
| HONOR_BILLING | percentage | 10 |
| SIBLING_BILLING | percentage | 5 |

- **`scholarship_types`** (unique code; percentage ≤ 100):

| Code | Name | Mode | Value |
|---|---|---|---|
| ESC | Education Service Contracting | fixed_amount | 14,000 |
| 4PS | 4Ps Beneficiary Discount | percentage | 20 |
| HONOR | Academic Excellence Award | percentage | 10 |
| SIBLING | Sibling Discount | percentage | 5 |
| EMPLOYEE | Staff / Employee Child Discount | percentage | 15 |

  **A scholarship code that starts with `VOUCHER`, `ESC` or `QVR` is treated as a voucher** and applied first.
- **`billing_items`**: 10 catalogue rows (TF-NURSERY, TF-KINDER, TF-ELEM, TF-JHS, TF-SHS, MISC-FEE, BOOKS, ACTIVITIES, LAB-FEE, RESEARCH-FEE). Invoices copy items from the fee schedule with `billing_item_id` NULL.

### 7.5 `users` (staff, teachers, guardians)

- `role` is one of `super_admin`, `admin`, `registrar`, `teacher`, `accounting`, `guardian`. **`email` is unique across all roles and is the login identifier.**
- `password` is a Django `pbkdf2_sha256` hash. The generator uses fixed salts (`"slisseed"` + the first 14 alphanumerics of the email) so the file is reproducible.
- **`is_active`** (boolean, default true, added in `43c50821`) is one global flag, not per school year. An inactive account:
  - is refused at login (it fails exactly like a wrong password), at token refresh, and in request authentication;
  - can't be newly assigned as an adviser ("This teacher's account is inactive."), though an existing advisory keeping the same teacher can still be edited;
  - is skipped by adviser carry-over with reason `inactive`;
  - is hidden from the adviser pickers;
  - (uncommitted, in progress) makes its section show as having no adviser on the dashboard's Teachers Today.
- Roles in practice: `super_admin` = school owner, `admin` = IT staff.
- **Guardian logins:** a guardian user sees exactly the students whose `guardians` rows carry their `user_id`. For siblings, give the parent's guardian row on each child the same `user_id`, name and email.
- `manage_accounts lock-demo` (identity-service) locks only the **original six** demo emails (superadmin, admin, registrar, teacher, accounting @slis.test, maribel.reyes.seed@gmail.com). See §12.

### 7.6 `academic_calendar_events`

- Per year (FK). Supply `event_type`, `created_at` and `updated_at`: the live table has no defaults for them, even though `schema.sql` does.
- `event_type` values used: `holiday`, `school_day_off`, `quarter_break`, `grading_period`, `exam`, `enrollment`, `event`, `other`.
- **Exactly 3 `quarter_break` events**: the at-risk model reads its quarter windows from them.
- **4 `grading_period` events** with `grading_period` = `1st_quarter` … `4th_quarter`, unique per year (partial index). The admin home reads the current quarter from them, and the due date is the event's end date. The setup checklist counts them.
- Attendance must not fall on a `holiday`, `school_day_off` or `quarter_break` day.

### 7.7 `sections` and `section_advisories`

- **`sections`:**
  - `UNIQUE (school_year, grade_level, name)`. The API also enforces this case-insensitively; the DB doesn't.
  - Names are single-spaced. `school_level` matches the grade.
  - **Senior High sections must have a strand; all others have strand NULL.** The strand belongs to the section. Keep SHS names unique across strands (STEM-A, ABM-A).
  - `created_at` / `updated_at` are required.
- **`section_advisories`:**
  - Composite FK (`school_year`, `grade_level`, `section`) → `sections`. `strand` = the section's strand; `school_level` = the grade's.
  - Unique per teacher + placement, plus a partial index for no-strand rows.
  - **No FK to `users`**, but the serializer requires an active `teacher` account, and carry-over skips non-teachers and inactive teachers.
  - Co-advisers (several per section) are allowed. A section with no adviser is allowed; the setup checklist flags it.

### 7.8 Learner profile: `households`, `students`, `guardians`, `siblings`, `previous_schools`

- **`households`:**
  - `parent_marital_status`: married, separated, annulled, single_parent, widowed.
  - `living_arrangement`: both_parents, mother_only, father_only, guardian, relative, independent, others.
  - **4Ps:** `is_4ps_beneficiary = true` requires a non-blank `four_ps_id`; `false` requires NULL (CHECK).
- **Siblings are derived from a shared household.** `GET /api/students/{id}/siblings/` returns the other students with the same `household_id`, and `link-sibling` merges households. The `student_siblings` table is unused on purpose. The `siblings` table is free text for brothers and sisters who aren't enrolled.
- **`students`:**
  - `lrn` is exactly 12 digits, unique. `student_number` is `YYYY-NNNN`, unique. `email` is unique or NULL.
  - `sex`: male/female. `age` 3-100 (a snapshot). `birth_date` should fit the grade ladder: Nursery ≈ 4, K 5, G1 6 … G12 17 during the year.
  - `status`: active / inactive / transferred / graduated / dropped. It is set by hand. Transfer-out sets `transferred`; a completed G12 → `graduated`.
  - `current_address` and `permanent_address` are both NOT NULL.
- **`guardians`:**
  - `relationship`: mother / father / guardian. **At most one `is_primary_contact` per student** (partial unique).
  - `user_id` links a guardian login.
  - Include occupation, email and mobile for density. Leaving some NULL is realistic.
- **`previous_schools`:** name + address. Transferees should have at least one.

### 7.9 `student_requirement_submissions` and the document gate

- `UNIQUE (student_id, requirement_type_id)`. `image_url` is relative to the service's `MEDIA_ROOT` (e.g. `requirements/seed_136700000152_psa_birth_certificate.pdf`). Also set `is_submitted`, `submitted_at`, `verified_at` and `remarks`.
- **Entry status** (`requirements/rules.py derive_entry_status`):
  - a prior enrollment → `continuing`;
  - otherwise a transfer-in, or a grade not in {Nursery, Kindergarten, Grade 1} → `transferee`;
  - otherwise `new`.
- **Gate:** an enrollment can be `enrolled` only if every *applicable required* document is `is_submitted`:
  - PSA + health record for everyone;
  - plus Form 137/138 and Good Moral for elementary, JHS and SHS transferees.
- Missing documents (a deliberate edge case) should go on `pending` enrollments, since the gate blocks `enrolled`.

### 7.10 `enrollments` and their satellites

- **Constraints:**
  - `school_level` ∈ nursery, kindergarten, elementary, junior_highschool, senior_highschool, consistent with the grade.
  - **SHS needs `semester` `1st`/`2nd`; all others need NULL** (CHECK). The strand equals the section's strand (NULL outside SHS).
  - `enrollment_status`: enrolled, pending, cancelled, completed, transferred_out. **At most one `enrolled|pending` per student per year** (partial unique `uq_enrollments_student_sy`).
  - Composite FK to `sections`; FK to `school_years`.
- **Senior High = one enrollment per semester.** A G11 year is sem 1 (completed) + sem 2 (enrolled/completed) in the same section. Each semester row holds only its own semester's grades (`1st_semester`/`2nd_semester`) for subjects with the matching semester and strand.
- **Past years:** rows are `completed`, `transferred_out` or `cancelled`. The current year: `enrolled` (or `pending`). An upcoming year: `pending`.
- **Progression**, from the last completed enrollment:
  - Retaining (same grade) or moving to the next grade is allowed.
  - Anything else needs an `enrollment_overrides` row: `override_reason`, `overridden_by`, `overridden_at`; unique per enrollment.
  - **The promotion gate** (enrollment form, after the fix) blocks promotion when any subject's *year outcome* is failed, incomplete or dropped (`grading.deped.blocking_subjects`). Promote and eligibility use the same `BLOCKING_REMARKS`.
  - SHS G11 → G12 requires both G11 semesters completed, and the strand stays the same (else an override).
  - No level crossings.
- **`enrollment_transfers`:**
  - `transfer_type`: `transfer_in` / `transfer_out` / `internal_move`. Supply `effective_date`, `reason` and `initiated_by` (a user_id).
  - In: `to_*` fields + `origin_school_name`. Out: `from_*` fields + `destination_school_name`.
  - `created_at` is required.
- **`enrollment_scholarships`:** unique per enrollment + type. Supply `approved_at` and `notes`. Put them on the billed enrollment (for SHS, the 1st-semester row).

### 7.11 `score_entries`, `grades`, `narrative_reports`

- **`score_entries`:**
  - 0 ≤ `score` ≤ `max_score`, and `max_score` > 0.
  - The component must belong to the **subject's** template.
  - `grading_period` is a quarter for non-SHS and a semester for SHS (enforced by trigger `trg_validate_grading_period`).
- **Grade math** (DepEd Order 8 s.2015, `grading/deped.py`):
  - Per component, PS = Σscore / Σmax × 100.
  - Initial grade = Σ(PS × weight / 100), normalised by the total weight, rounded half-up to 0.01.
  - **Transmuted grade** = `deped.transmute(initial)`: 60 initial → 75; 1.6-point bands above 60 (e.g. 61.60 → 76 … 98.40 → 99, 100 → 100); 4-point bands below 60 (56 → 74 … 0 → 60).
- **`grades`:**
  - `numeric_grade` is the **transmuted** value (60-100 in practice; the CHECK allows 0-100).
  - `remarks`: passed (≥ 75) / failed / incomplete / dropped.
  - `UNIQUE (enrollment_id, subject_id, grading_period)`. The subject's level, grade and year must match the enrollment's.
  - **Every grade should equal the transmutation of its own score entries.** The seed guarantees this.
- **Year outcome:** `summarize_subjects` averages each subject's period grades. `general_average` is the mean of the subject finals. Promote uses these.
- **`narrative_reports`:** one per enrollment × category × period. `rating` AO / SO / RO / NO (the CHECK also allows outstanding / satisfactory / needs_improvement).

### 7.12 `attendance_records`

- `status` P / A / L / E. `UNIQUE (enrollment_id, date)`. `created_at` / `updated_at` are required. `recorded_by` = the adviser's user_id.
- Dates: weekdays inside the year, never on holiday / school_day_off / quarter_break days, and inside the enrollment's span (from the enrollment date or transfer-in; up to the year end, graduation or transfer-out).
- **Current year:** records run only up to *today*. The dashboard shows the last 12 weeks, and Teachers Today reads today's records.
- The rate used in compare and risk is (P + L) / all.

### 7.13 Billing: invoices, discounts, installments, payments

This mirrors `billing-service/billing/services.py`. The seed reproduces it exactly and was checked against the real functions.

- **Waterfall on tuition only** (misc and other are never discounted):
  1. **Voucher** (codes VOUCHER* / ESC* / QVR*). Fixed amount, capped at tuition.
  2. **Other scholarships.** Their percentages are all applied to the *post-voucher* base and summed, capped at that base.
  3. **Payment plan %**: semi_annual 3%, annual 5% (monthly and quarterly 0%).
  4. **Early Bird 5%** if `invoice_date` ≤ the **enrollment year's** registry `start_date` + `early_bird_days` − 1. For 2025-2026 that is 2025-06-07 or earlier, with no lower bound. Uses `earns_early_bird(invoice_date, school_year)`.
- Percentages are quantized to 0.01 at each step.
- **Discount rows** (`student_invoice_discounts`):

| Row | `discount_type_id` | Description |
|---|---|---|
| Voucher | NULL | `Voucher — <scholarship names>` |
| Other scholarships | NULL | `Scholarship discount (N item(s))` |
| Payment plan | SEMI_ANNUAL_PLAN / ANNUAL_PLAN | the plan name |
| Early Bird | EARLY_BIRD | `Early Bird (invoiced on or before <cutoff>)` |

- **Items** are copied from the fee schedule as `[Tuition] Tuition Fee`, `[Miscellaneous] Books & Materials`, `[Other] Lab Fee`, and so on.
- **Installments** are counted from the enrollment year's start month (June) and fall on **the last day of each month**:

| Plan | Installments |
|---|---|
| monthly | 10 (Jun-Mar) |
| quarterly | 4 (Jun, Sep, Dec, Mar) |
| semi_annual | 2 (Jun, Nov) |
| annual | 1 (Jun) |

  The total is split evenly, with **the remainder on the last installment**. `invoice.due_date` = the first installment's due date.
- **Transfer-in (prorated):** only installments due on or after the effective date remain, and they carry the **full** total (`generate_installment_schedule_prorated`).
- **Invariants:**
  - Σ items − Σ discounts = Σ installment amounts.
  - Σ payments = Σ installment `amount_paid`.
  - Balance = net − payments.
  - **One non-void invoice per enrollment** (partial unique `uq_student_invoices_live_per_enrollment`).
- **`invoice_no`** is `INV-<generation year>-<invoice_id, 6 digits>` and unique. `invoice_date` defaults to today in the app, so **backdate it for past years** in SQL.
- **Payments:**
  - `amount_paid` > 0. `payment_method`: cash / bank_transfer / gcash / card / check / others.
  - Applied to installments in due-date order (`apply_payment`).
  - Installment status: pending / partially_paid / paid / overdue / voided. Invoice status: unpaid / partially_paid / paid / void.
  - `flag_overdue_installments` (a billing management command) marks pending/partially_paid installments past due as `overdue`, except on void invoices.
- **Transfer-out close-out:**
  - Future unpaid installments → `voided`, and partly paid ones are capped.
  - Add a discount row: `Transfer-out adjustment (effective D) — remaining installments waived`.
  - The student becomes `transferred`, the enrollment `transferred_out`, and a transfer row records the `from_*` fields and destination.
- **Senior High is billed once per year,** on the 1st-semester enrollment (a seed convention; the app would allow a second invoice on the sem-2 row).

### 7.14 `application_invites` and `student_applications` (online intake; not seeded yet)

- **`application_invites`:**
  - `invite_id` is a UUID. `access_code_hash` = `make_password(code)`. `code_attempts` ≥ 0.
  - Also: `applicant_first/last_name`, contact fields, `issued_by_user_id`, `issued_at`, `expires_at`, optional `revoked_at` / `consumed_at` / `locked_at`, and `school_year` (FK, nullable).
- **`student_applications`:**
  - `invite_id` (FK) and a unique `submission_uuid`.
  - `payload_json` = `{student, household, guardians[], siblings[], previous_schools[], applying_for{school_level, grade_level, strand}}`.
  - `status`: draft / submitted / in_review / approved / rejected. **approved requires `created_student_id`; rejected requires a non-empty `decision_note`** (CHECK).
  - `school_year` is copied from the invite; it must be registered and not archived.
  - `revision` ≥ 0. `duplicate_matches_json` is required (use `[]`).

### 7.15 Risk model (`risk_assessment_runs`, `student_risk_scores`; not seeded yet)

- `POST /api/ai/risk-assessment/run/` with `school_year` and `grading_period` (optionally `school_level`, `grade_level`, `weights`).
- It refuses archived years, and it **scores only `enrolled` learners with grade data**. A finished year (all `completed`) returns "No enrolled students with grade data found."
- Inputs: the period's grades, the previous period for the trend, attendance inside the quarter window from `quarter_break` events (≥ 10 days), and observed values.
- Writes one run plus one `student_risk_scores` row per learner (unique run + student). Easiest to trigger through the API after seeding rather than write by hand.

### 7.16 Other tables

- `audit_logs`: written by the app (1,319 rows kept from real use). The seed doesn't write any.
- `document_extractions`: OCR scan results. Not seeded.
- `email_delivery_failures`: not seeded.
- `student_siblings`: unused by design (see 7.8).

---

## 8. Cross-cutting behaviour

- **Carry-over** (School Year page) copies from any earlier year into a later one and **never overwrites**:
  - enrollment-service parts: `sections`, `advisers`, `calendar`, `subjects`;
  - billing-service part: fees.
  - Adviser skip reasons: `already`, `has_adviser`, `not_a_teacher`, `inactive`, `no_section`.
  - To test it, leave the target year partly empty (that's why 2026-2027 is empty).
- **Promote** (`promote/preview`, `promote/confirm`):
  - The target year must be registered and not archived; the source may be archived.
  - `to_section` must exist in the next grade in the target year.
  - Pending rows take the section's strand.
  - SHS G11 → G12 runs only from each learner's completed 2nd-semester row and creates a G12 `1st` semester row.
- **Setup checklist** per year:
  - sections covering all 14 grades;
  - an adviser per section;
  - fee schedules for all 14 grades;
  - subjects per grade;
  - 4 grading-period events;
  - holidays.
- **Year compare** (up to 5 years; the neighbouring years must be registered):
  - learners = distinct students with enrolled/completed/transferred_out;
  - new vs returning, compared with the previous label;
  - came back = stayed learners with a row the next year;
  - pending applicants;
  - grades (`summarize_subjects` / `general_average`), attendance (P+L)/all, sections, advised sections, advisers, scholarship count.
- **Teacher scoping** (`advisory_roster`):
  - A teacher sees learners whose enrollment matches an advisory exactly (year, level, grade, section, and strand if the advisory has one) **and** whose status is `enrolled`.
  - Past/completed learners are invisible in My Sections. The scoping fails closed: no advisory → empty lists.
- **Guardian scoping:** through `guardians.user_id` only.
- **Year filter (frontend):** pages keep their own year picker (`hooks/useYearFilter`) and default to the current year. **To see the seed, pick 2025-2026.**
- **Grades visibility (user rule):** grades are viewable whatever the enrollment status; only an archived year makes them read-only.

---

## 9. What the current seed contains (§9.1-9.4 = Tier 1 history; §9.5 = Tier 2; §9.7 = Tier 2.5, loaded; §9.8 = Tier 3, current)

### 9.1 S.Y. 2025-2026 setup

- **Registry:** 2025-06-01 to 2026-03-31, not current, not archived (state "open"). 2026-2027 (2026-06-01 to 2027-03-31) is current.
- **School settings:** synced to the current year, `early_bird_days` 7, letterhead:
  - South Lakes Integrated School
  - 12 Lakeview Road, Brgy. San Isidro, Marikina City, Metro Manila 1800
  - registrar@slis.test
  - (02) 8123-4567
- **Calendar (39 events):**

| Kind | Dates |
|---|---|
| Quarters (grading_period) | Q1 Jun 2 - Aug 22 · Q2 Sep 1 - Nov 21 · Q3 Dec 1 - Jan 23 · Q4 Feb 2 - Mar 31 |
| SHS semesters (grading periods, not calendar events) | 1st Jun 2 - Nov 21 · 2nd Dec 1 - Mar 31 |
| Quarter breaks (3) | Aug 25-29 · Nov 24-28 (Semestral Break) · Jan 26-30 |
| Days off | Teachers' In-Service Oct 17 · Christmas Break Dec 20 - Jan 4 |
| Holidays (16) | Jun 6 Eid'l Adha · Jun 12 · Aug 21 · Aug 25 · Oct 31 · Nov 1 · Nov 30 · Dec 8 · Dec 24 · Dec 25 · Dec 30 · Dec 31 · Jan 1 · Feb 17 · Feb 25 · Mar 20 |
| Exams | Aug 20-22 · Nov 19-21 · Jan 21-23 · Mar 25-27 |
| Enrollment period | May 5-30, 2025 |
| Events | Opening Jun 2 · Nutrition Month Jul 31 · Buwan ng Wika Aug 15 · PTC Sep 5 · UN Day Oct 24 · Christmas Program Dec 19 · Foundation Day Feb 13 · Graduation Mar 28 · Moving-Up Mar 30 |

- **Subjects (121):**

| Grades | Subjects |
|---|---|
| Nursery, Kindergarten | 5 each: LLC, MATH, UPNE, PHMD, SED (codes `N-…`, `K-…`) |
| Grades 1-2 | 7: MT, FIL, ENG, MATH, AP, MAPEH, ESP |
| Grade 3 | 8: adds SCI |
| Grades 4-6 | 8: FIL, ENG, MATH, SCI, AP, MAPEH, EPP, ESP |
| Grades 7-10 | 8: EPP replaced by TLE |
| Grade 11 | 16: per semester, 6 core + 1 STEM + 1 ABM |
| Grade 12 | 17: sem 1 has 5 core + 2 STEM + 2 ABM; sem 2 has 4 core + 2 STEM + 2 ABM |

  Codes look like `G5-MATH` and `G11-STEM-PRECAL`.

### 9.2 Sections and advisers (2025-2026)

| Grade | Section | Strand | Adviser |
|---|---|---|---|
| Nursery | Rose | none | Cristina Bautista `cristina.bautista@slis.test` |
| Kindergarten | Sunflower | none | Rowena De Leon `rowena.deleon@slis.test` |
| Grade 1 | Rizal | none | Josefina Tolentino `josefina.tolentino@slis.test` |
| Grade 2 | Bonifacio | none | Ramon Estrada `ramon.estrada@slis.test` |
| Grade 3 | Mabini | none | Aileen Manalo `aileen.manalo@slis.test` |
| Grade 4 | Luna | none | Arnel Pascual `arnel.pascual@slis.test` |
| Grade 5 | Silang | none | **Teresa Aquino `teacher@slis.test`** |
| Grade 6 | Aguinaldo | none | Emmanuel Robles `emmanuel.robles@slis.test` |
| Grade 7 | Diamond | none | Grace Villanueva `grace.villanueva@slis.test` |
| Grade 8 | Emerald | none | Dennis Ocampo `dennis.ocampo@slis.test` |
| Grade 9 | Sapphire | none | Maricar Santiago `maricar.santiago@slis.test` |
| Grade 10 | Ruby | none | Jonathan Dimaculangan `jonathan.dimaculangan@slis.test` |
| Grade 11 | STEM-A | STEM | Kristine Mendoza `kristine.mendoza@slis.test` |
| Grade 11 | ABM-A | ABM | Rafael Guevarra `rafael.guevarra@slis.test` |
| Grade 12 | STEM-A | STEM | Angelica Ferrer `angelica.ferrer@slis.test` |
| Grade 12 | ABM-A | ABM | Noel Sarmiento `noel.sarmiento@slis.test` |

Sections with learners: Rose, Sunflower, Silang, Aguinaldo, Emerald, Ruby, G11 STEM-A, G12 STEM-A. The other 8 are empty sections (with advisers).

### 9.3 Accounts (password `SlisDemo2026!`)

User IDs are from the live database; a fresh install assigns different ones. All are `is_active = true`.

| ID | Email | Role | Name / note |
|---|---|---|---|
| 19 | superadmin@slis.test | super_admin | Amelia Concepcion |
| 20 | admin@slis.test | admin | Rodel Manalastas (IT) |
| 21 | registrar@slis.test | registrar | Lorna Villareal (records the transfer-in) |
| 22 | jocelyn.ramos@slis.test | registrar | Jocelyn Ramos |
| 23 | accounting@slis.test | accounting | Edwin Salcedo |
| 24 | arvin.lacson@slis.test | accounting | Arvin Lacson |
| 25 | teacher@slis.test | teacher | Teresa Aquino, G5 Silang (Bianca, Patrick) |
| 26-40 | (the 15 advisers in §9.2) | teacher | one section each |
| 41 | carla.bernardo@slis.test | teacher | **no section** (free to assign) |
| 42 | victor.ilagan@slis.test | teacher | **no section** |
| 43 | hazel.castro@slis.test | teacher | **no section** |
| 44 | joel.panganiban@slis.test | teacher | **no section** |
| 45 | maribel.reyes.seed@gmail.com | guardian | Maribel Santos Reyes, mother of Maria (100) and Paolo (152) |
| 46 | maria.dizon.seed@gmail.com | guardian | Maria Chua Dizon, mother of Jasmine (114) |

Your original local accounts are untouched: IDs 7 `registrar`, 8 `teacher`, 9 `accounting`, 16 `admin` (super_admin) and 18 `guardian` (unlinked). Their password is the identifier + `123`.

### 9.4 The ten learners

| ID | No. | Learner | Grade · Section | Entry | Enrollment(s) | Invoice | Plan | Scholarship | Net ₱ | Paid ₱ | State |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 111 | 2025-0001 | Marco Dela Cruz Valdez | G6 · Aguinaldo | transferee | 205 | 305 | annual | none | 21,647.50 | 21,647.50 | paid up front |
| 100 | 2025-0002 | Maria Santos Reyes | K · Sunflower | new | 201 | 301 | quarterly | none | 19,650.00 | 19,650.00 | paid |
| 152 | 2025-0003 | Paolo Santos Reyes | Nursery · Rose | new | 200 | 300 | monthly | SIBLING | 18,842.50 | 18,842.50 | paid |
| 110 | 2025-0004 | Bianca Reyes Soriano | G5 · Silang | transferee | 202 | 302 | semi_annual | none | 21,808.50 | 21,808.50 | paid |
| 128 | 2025-0005 | Natasha Guerrero Flores | G10 · Ruby | transferee | 207 | 307 | quarterly | ESC (voucher) | 14,550.00 | 14,550.00 | paid |
| 114 | 2025-0006 | Jasmine Chua Dizon | G6 · Aguinaldo | transferee | 204 | 304 | monthly | 4PS + HONOR | 17,135.00 | 17,135.00 | paid (2 late) |
| 147 | 2025-0007 | Gabriel Cayabyab Maceda | G11 · STEM-A | transferee | 208 (1st), 209 (2nd) | 308 | semi_annual | none | 32,380.50 | 32,380.50 | paid |
| 115 | 2025-0008 | Patrick Salazar Jimenez | G5 · Silang | transferee | 203 | 303 | monthly | none | 23,300.00 | 14,980.00 | **4 overdue** |
| 140 | 2025-0009 | Andrea Padua Lagman | G12 · STEM-A | transferee | 210 (1st), 211 (2nd) | 309 | monthly | none | 35,000.00 | 35,000.00 | paid; **graduated** |
| 125 | 2025-0010 | Joshua Buenaventura Medina | G8 · Emerald | transferee (mid-year) | 206 | 306 | monthly | none | 29,000.00 | 26,857.16 | **1 overdue** |

Invoice numbers are `INV-2025-000300` to `INV-2025-000309`. The invoice date is each learner's enrollment date.

**What each profile is there to exercise:**

- **Paolo (152), Nursery.**
  - New student (added in Tier 1). Second child in household 100 with Maria, so the siblings tab shows her and one parent login covers both.
  - SIBLING scholarship (5%). Early Bird.
  - Documents: PSA, health, birth certificate.
  - Previous school: Little Seeds Learning Center.
- **Maria (100), Kindergarten.** New student. Quarterly plan, Early Bird. Strong grades (ability 92).
- **Bianca (110), G5.** Transferee with all four required documents plus Form 138 and clearance. Semi-annual plan (3%) + Early Bird. Two previous schools.
- **Patrick (115), G5.**
  - **Failed Q1 Math (73)**, then recovered: 76, 78, 79, which averages 76.5 and passes the year. This exercises the promotion gate: blocked on the year outcome, not on a single failed quarter.
  - Other subjects floor at 75.
  - Worst attendance: 12 absent, 9 late, 3 excused.
  - Household: separated parents, lives with father.
  - Enrolled 2025-06-09, so no Early Bird. Paid through November (some installments up to 20 days late), partly paid December (₱1,000), then nothing: **4 overdue installments**.
  - No optional documents.
- **Jasmine (114), G6.**
  - Top student (ability 96).
  - **4Ps household** (`4PS-SEED-004`) with **4PS + HONOR** scholarships: 20% + 10% on the same base, then Early Bird.
  - Has her own email and mobile. Guardian login maria.dizon.
  - Installments 5 and 8 were paid after their due dates.
- **Marco (111), G6.** Annual plan (5%) + Early Bird, **paid in full on enrollment day** by bank transfer. Student number 2025-0001.
- **Joshua (125), G8.**
  - **Transfer-in effective 2025-09-01** from Tuguegarao City National High School. There is a `transfer_in` row initiated by the registrar.
  - Grades only for Q2-Q4; attendance from September 1.
  - **Prorated invoice:** 7 monthly installments (Sep-Mar) carrying the full ₱29,000. The last one is partly paid (₱2,000), so 1 is overdue.
  - Permanent address in Cagayan differs from the current one. Mother-only household (father is an OFW).
- **Natasha (128), G10.** **ESC voucher** (₱14,000 fixed, applied first), then Early Bird. Optional ESC Transferee QC document.
- **Gabriel (147), G11 STEM-A.**
  - **Two semester enrollments**, billed once on the 1st.
  - The primary contact is an **aunt** (`relationship = guardian`), and the household `living_arrangement = relative`. Three guardians.
  - Paid by check.
- **Andrea (140), G12 STEM-A.**
  - Two semester enrollments. Student status **graduated**. Attendance ends 2026-03-27 (graduation is March 28).
  - Enrolled 06-09, so no Early Bird.
  - Paid by card until July, then GCash.
  - 7 documents.

**Scores and grades:**

- Every enrollment has score entries for every subject and period, spread across the period's school days (the Quarterly Assessment falls on the period's last school day).
- Items per period:

| Template | Written Works | Performance Tasks | Quarterly Assessment |
|---|---|---|---|
| Kinder | 3 activity sheets /20 | 2 PTs /30 | none |
| Elementary/JHS | WW /20, /25, /30, /20 | PT /50, /50, /40 | QA /50 |
| SHS (per semester) | 5 quizzes | 3 PTs | Midterm /50 + Final /60 |

- **Observed values:** 4 core values per period (AO / SO / RO, driven by ability).

**Attendance:** present on every school day in each enrollment's span, except a set number of absences / excused days / late days per learner. Remarks include "Fever", "Traffic", "Excused: medical appointment", and so on. Recorded by the section's adviser.

**Documents:** every required document for the entry status, plus 0-3 optional ones. `submitted_at` is 1-5 days before enrolling; `verified_at` is 0-2 days after submission. The required ones carry the remark "Original presented; photocopy on file."

**Payment references:**

| Method | Reference format |
|---|---|
| cash | `OR-2025-NNNN` |
| GCash | `GC-##########` |
| bank transfer | `BT-yymmdd-NNNN` |
| check | `CHK-###### (BPI)` |
| card | `CARD-XXXX4821-######` |

### 9.5 Tier 2 (loaded 2026-09-30): what's new and where to find the detail

Tier 2 **replaced** the "2026-2027 deliberately empty" setup that §9.1-9.4 describe. That narrative (§9.1-9.4) is kept as-is for historical reference — it accurately describes what Tier 1 alone looked like — but it is no longer what's in `seed_data.sql` or the real database. Rather than hand-transcribing 31 learners' worth of detail into markdown (high risk of drifting out of sync with the generator), use `--report` (§4) to get the exact current data as JSON: every learner's student number, every invoice's installment statuses, every enrollment's scenario fields.

**S.Y. 2026-2027 is no longer empty.** It's the current year, seeded up to **2026-09-30**, with:

- 25 learners (19 carried over from 2025-2026, 6 new: 5 transferees/new enrollees numbered `2026-0001..0005`, plus 2 more from intake).
- MATATAG subject changes: no Mother Tongue in G1-3; EsP replaced by GMRC (G1-6) and Values Education (G7-10); G10 MAPEH renamed. 118 subjects total.
- Reshuffled sections: G3 renamed to Del Pilar, G4 Luna's adviser (Arnel Pascual) resigned mid-year with Carla Bernardo taking over 2026-09-21, G9 Sapphire has no adviser, a new G7 Pearl section, new adviser assignments across G11-12 strands.
- Two resigned/inactive teachers (Arnel Pascual, Maricar Santiago) — `is_active = false`, login refused, still shown on past-year records.
- One new teacher (Rhea Dimalanta).
- Grade 9 has no fee schedule at all (no invoice possible); Grade 1's schedule has zero items (produces a ₱0 invoice).
- A cancel-then-re-enroll case, a September transfer-out, a pending enrollment blocked on missing documents, and today's attendance intentionally left unmarked for one section.
- 11 invites and 7 online applications spanning every intake status (draft, submitted, in_review, approved, rejected), including one that matches an existing student via `find_matches`.
- 4 guardian accounts with usable passwords (`maribel.reyes.seed@gmail.com`, `maria.dizon.seed@gmail.com`, `perla.ibarra.seed@gmail.com`, `danilo.jimenez.seed@gmail.com`), all password `SlisDemo2026!`.

**S.Y. 2025-2026** grew from 10 to 25 learners, adding (among others) a mid-year transfer-in whose first installment absorbs the whole year's fees, a section move, a voided-and-reissued invoice, a pre-enrollment withdrawal (voided invoice, never attended), a January dropout with overdue fees, a failed-then-retained year, and an incomplete-grade promotion override.

The generator uses a per-learner RNG (`random.Random("slis-seed-tier2|<key>|<sy>|<purpose>")`), so adding another learner later does not reshuffle any existing learner's scores, attendance or payment dates — unlike Tier 1's single shared stream (§10's determinism caveat no longer applies to Tier 2 or later).

### 9.7 Tier 2.5 (loaded 2026-10-02): twenty more learners in 2025-2026

Tier 2.5 is a **volume-and-cross-reference pass on S.Y. 2025-2026 only**. It
adds no curriculum and no fees: subjects (121 / 118) and fee schedules (14 for
2025-2026, 13 for 2026-2027) are exactly as Tier 2 left them, including the two
deliberate billing gaps (Grade 1's itemless schedule, Grade 9's missing one).

**What it fixes.** 2025-2026 had 25 learners spread over 17 sections, so six
sections held a single learner and **Grade 7 Diamond had none at all** — class
lists, SF2 printing and year compare all read as unrealistic. Every section now
holds 2-4 learners.

- **+20 learners in 2025-2026** (25 → 45), student_id/household_id 157-176,
  student numbers `2025-0025..0044`, enrollment IDs 231-258, invoice IDs 326-349.
- **14 of them continue into 2026-2027** (25 → 40 learners), enrollment IDs
  426-440, invoice IDs 524-538. Six do not: Dexter transfers out mid-year,
  Vincent graduates, and four finish 2025-2026 without returning, so year
  compare sees real movement (34 returning, 5 new, 9 leavers).
- **+8 invites and +6 applications** (19 invites, 13 applications in all),
  still covering every intake status: 4 submitted, 3 approved, 2 in_review,
  2 rejected, 2 draft. Application IDs 700-712.
- **+25 guardian accounts** (65 in all), provisioned the usual way — linked,
  with unusable passwords. The four usable guardian logins are unchanged.

**New edge cases.** A pair of twins sharing one household (both on the sibling
discount, one guardian login for two children); a learner who fails
Mathematics on the year and **repeats Grade 10**; a February transfer-out with
an invoice close-out; a late-June enrollment whose downpayment is the only
payment, so July onward is overdue; an ESC grantee and a QVR-free honour
student on an annual plan paid up front; three more 4Ps households
(`4PS-SEED-009/010/011`).

**Student-number pinning (important).** Student numbers are assigned in
enrollment-date order, so a learner added with a May 2025 date would renumber
everyone after them. `PINNED_NUMBERS` in `seed_spec.py` freezes the 31 Tier 1/2
learners on the numbers they already have in the live database; learners
without an entry are numbered after the highest pinned number for their year.
**Do not edit those pins.** Add a new learner with no entry and they get the
next free number. The generator raises on a duplicate.

**Verification (all on a throwaway copy, then read-only on the real DB).** This
tier closed the two items Tier 2 skipped:

- Loads clean with `ON_ERROR_STOP=1` on a copy of the live DB **and on a fresh
  `schema.sql` database** (identical counts), and a second run is idempotent.
- **1321/1321 grades** equal `grading/views.compute_grade`'s own math —
  renormalise over the encoded weight, `quantize` to 2 dp, *then* `transmute`.
  Skipping that quantize step makes ~10 grades look wrong by one point; it is
  the check that is wrong, not the data.
- **85/85 invoices** reconcile against billing-service's own functions
  (`earns_early_bird`, live-installment reconciliation, payment bounds).
- Document gate: **0** enrolled rows missing a required document; the only two
  gaps are Tier 2's intentional pending/cancelled rows.
- **94/94 enrollments** re-validate through `EnrollmentSerializer` with no
  override needed (Tier 2 was 55/57).
- Logins: 25 active staff accounts authenticate; the 2 resigned teachers are
  correctly refused.
- **Full test suites pass: 1344 tests** (billing 150, enrollment 704, identity
  106, student 384) and `makemigrations --check` is clean in all three services.
- `flag_overdue_installments` after the load flagged 10 more installments
  (49 overdue in all).

Backup before the load:
`~/Documents/ASIA-db-backups/SLIS_THESIS_FINAL_2026-10-02_before-tier25-seed.dump`.

### 9.8 Tier 3 (spec committed in 24c02105; made generatable 2026-10-04): a hundred more learners, two sections per grade

Tier 3 is the **volume tier** from the roadmap. It triples the learner body and
gives every grade a second section, so list pages, section filters, class
lists, dashboards and year compare all work at a realistic school's scale.
It adds no curriculum and no fees — subjects (121 / 118) and fee schedules
(14 for 2025-2026, 13 for 2026-2027) are untouched, including both deliberate
billing gaps.

**What it adds.**

| | |
|---|---|
| Learners | **+100** (51 → 151). student_id / household_id **177-276** |
| S.Y. 2025-2026 | 45 → **95** learners. 50 new enrollments, IDs **259-318**; invoices **350-401** |
| S.Y. 2026-2027 | 40 → **119** learners. 79 new enrollments, IDs **441-519**; invoices **539-617** |
| Of the 50 new 2025-2026 learners | **29 continue** into 2026-2027; 21 do not (3 transfer out, 2 drop out, 4 cancel, 4 graduate, the rest simply do not return) |
| Brand-new 2026-2027 entrants | **50** |
| Sections | **+16 per year** (17 → 33 each), a second section for every grade |
| Teachers | **+16**, one adviser per new section (password `SlisDemo2026!`) |
| Student numbers | `2025-0045..0093`, `2026-0008..0058` |
| 4Ps households | **+22** (`4PS-SEED-012` … `4PS-SEED-033`) |
| Guardian accounts | 65 → **203** |
| Intake | unchanged (19 invites, 13 applications) — this tier is learners only |

**The new sections.** Named to match each grade's existing theme (flowers,
heroes, gems, strand letters), added to **both** years with one adviser each:

| Grade | New section | Adviser |
|---|---|---|
| Nursery | Camia | Lorena Abad |
| Kindergarten | Daisy | Editha Jimenez |
| Grade 1 | Bonifacio | Marilou Saavedra |
| Grade 2 | Mabini | Ferdinand Acosta |
| Grade 3 | Jacinto | Beatriz Navarrete |
| Grade 4 | Silang | Nicanor Quijano |
| Grade 5 | Dagohoy | Cecilia Espinosa |
| Grade 6 | Malvar | Augusto Magbanua |
| Grade 7 | Garnet | Rosalinda Tapales |
| Grade 8 | Topaz | Wilfredo Canlas |
| Grade 9 | Opal | Milagros Fontanilla |
| Grade 10 | Jade | Eduardo Palomares |
| Grade 11 | STEM-B / ABM-B | Herminia Lacsamana / Teodoro Villamor |
| Grade 12 | STEM-B / ABM-B | Gregoria Maglalang / Salvador Bituin |

A section name is unique per `(school_year, grade_level, name)`, so reusing
"Bonifacio" in Grade 1 and "Mabini" in Grade 2 (both already used in *other*
grades) is legal and deliberate — it is also a good test that the section
lookups really are scoped by grade. **All 33 sections in both years now hold
2-6 learners; none is empty.**

**Per-learner depth.** Every one of the 100 is a full record, not a stub:
1 or 2 guardians with relationship, occupation, contact email and mobile
(71 have two, 29 one — single-parent, widowed and guardian households);
84 have siblings; 91 have a previous school (the 9 without are Nursery
entrants, who correctly have none); all have documents per entry status;
15 carry a separate permanent address; 29 Grade 7+ learners have their own
email and mobile. 62 distinct occupations, 11 religions, 36 barangays.

**Spread, not uniformity.**

- **Grades:** 2,901 grade rows from 72 to 98 on a bell curve — 20 failing
  marks, 993 in 75-84, 844 in 85-89, 1,044 at 90+. Plus 3 incomplete and
  8 dropped.
- **Attendance:** 24,001 records; absence profiles range from near-perfect
  (0A/0E/1L) to chronic (17A/5E/12L).
- **Billing:** 166 new invoices across all four plans (94 monthly, 36
  quarterly, 22 semi-annual, 14 annual) and every status (51 paid, 93 partly
  paid, 15 unpaid, 7 void). 472 paid installments, 107 overdue, 21 voided.
  Payment behaviour mixes early payers, late-on-some-months, arrears with and
  without a partial, downpayment-only, pay-the-last-one-partly, and a few who
  never paid at all.

**Edge cases in this tier.** 3 transfer-outs with invoice close-outs · 2
drop-outs (cancelled enrollment, quarter marked dropped) · 4 enrollments
cancelled before classes with the invoice voided · 4 pending 2026-2027
enrollments · 3 learners **retained** in the same grade after failing
Mathematics on the year (one of them a Senior High learner failing
Pre-Calculus in the semester it is actually taught) · 2 learners with an
**incomplete** Science quarter · 6 mid-year transfer-ins with prorated
invoices · 2 internal section moves in Grade 7 · 2 invoices voided and
reissued on a different plan · 3 learners missing a required document (so the
gate holds them at pending) · 9 with a document submitted but unverified or
without a scan · 4 learners promoted into 2026-2027 Grade 9, **which has no
fee schedule**, so they carry no invoice at all · learners in 2026-2027
Grade 1, whose schedule has no items, so their invoices total ₱0.00.

**History worth knowing.** The Tier 3 *spec* was written and committed in
`24c02105` ("Seed Data"), but that commit's `seed_data.sql` was still the Tier
2.5 output: the spec had never generated successfully, because 11 of its
`style="custom"` payment entries used `(None, None, "Downpayment …")` and
`payment_plan_for` compares the payment date against `TODAY`, so generation
died with `TypeError: '<=' not supported between instances of 'NoneType' and
'datetime.date'`. **The date in a `custom` list must be a real date string**;
only the *amount* may be `None` (meaning "the first installment's amount").
Fixing those 11 entries is what produced the current `seed_data.sql`. If a
committed spec and `seed_data.sql` ever disagree in size again, regenerate and
check for exactly this class of error.

**Two generator constraints this tier ran into** (both are real rules, worth
knowing before adding more learners):

1. **A section with no adviser cannot record attendance.** 2026-2027 Grade 9
   Sapphire is deliberately adviser-less, so any enrollment placed there needs
   an explicit `recorder=` (as `joshua` already had). Without it the generator
   fails with an `IndexError` on the adviser lookup.
2. **`style="last_partial"` must stay below the final installment.** The
   amount is paid against the last installment only, so on a small or heavily
   discounted invoice a flat ₱2,500 overpays and the generator asserts. Size
   the amount against the plan and the learner's discounts.

**Not verified.** At the user's request this tier was **not loaded or tested** —
no throwaway-copy load, no §11 SQL, no app-level checks, no test suites. What
*was* checked, statically: the spec validator (keys, sections, strands, levels,
unique ids/LRNs/student numbers/emails/mobiles, grade progression 0 or 1, ages
within ±1 of the ladder, enum values, subject codes and their semesters, dates
inside the year, one live enrollment per learner per year); the generator runs
clean and is **byte-identical on a re-run**; the 51 learners already in the
live database keep every student number; no invoice is overpaid; every one of
the 33 sections in both years holds learners. **Run §11 before trusting it.**

Three findings the validator raised are **pre-existing live data, not Tier 3**,
and were left alone per §2: `carlos` has no household row and no primary
guardian (documented and deliberate); `bea`'s father is staff
(`arvin.lacson@slis.test`) for the employee discount; and `dexter` has a
`transferred_out` enrollment while his student status is still `active` — that
last one is a genuine inconsistency already loaded in the live database.

**Pinning is now done for Tier 2.5.** `PINNED_NUMBERS` holds **51** entries
(Tier 1, Tier 2 and Tier 2.5, the latter read out of the live database). The
100 Tier 3 learners are **not pinned** — pin them from the live database after
this tier is loaded, before adding a Tier 4.

### 9.9 Tier 4 (loaded 2026-10-04): a hundred more learners, filling the existing sections

Tier 4 adds **no sections and no staff**. Tier 3 had created 33 sections per
year but left them holding only 2-6 learners each — far below a real class — so
this tier fills what already exists. Classes now run **4-8 (2025-2026)** and
**3-9 (2026-2027)** per section.

| | |
|---|---|
| Learners | **+100** (151 → 251). student_id / household_id **277-376** |
| S.Y. 2025-2026 | 95 → **145** learners. Enrollments **319-378**, invoices **402-453** |
| S.Y. 2026-2027 | 119 → **200** learners. Enrollments **520-600**, invoices **618-698** |
| Continuations | 31 of the 50 new 2025-2026 learners return; 50 are brand-new 2026-2027 entrants |
| Student numbers | `2025-0094..`, `..2026-0109` |
| 4Ps households | **+17** (`4PS-SEED-034` … `4PS-SEED-050`) |
| Sections / staff | **unchanged** (66 sections, 43 staff) |
| Intake | unchanged (19 invites, 13 applications) |

Totals now: **251 learners · 374 enrollments · 342 invoices · 1,105 payments ·
4,464 grades · 39,695 scores · 37,225 attendance records · 383 users.**

**Mobile block:** Tier 4 uses `09188700000+` (primary guardian),
`09188800000+` (secondary) and `09188900000+` (the learner's own). Tier 3 used
`091777/8/9`; Tiers 1-2.5 use `09xx11xxxxx` / `09xx12xxxxx`.

**Two more generator constraints learned here:**

1. **Absences must fit the attendance window.** A learner who transfers in
   mid-September has only a handful of school days before `TODAY`, so a heavy
   absence profile trips `assert len(statuses) <= len(pool)` ("more absences
   than school days"). The builder now scales A/E/L down to at most half the
   school days the enrollment actually spans.
2. **Not every grade teaches Science.** Grades 1-2 have no `SCI` subject, so an
   "incomplete Science" edge case cannot be placed there; pick the subject from
   the year's catalogue for that grade rather than assuming a code.

**Verification.** Backed up, loaded on a throwaway copy of the live database
with `ON_ERROR_STOP=1`, loaded a **second** time for idempotency (identical
counts), then loaded into the real database. All checks clean: invoice
reconciliation (items − discounts = live installments), no zero/negative
payments, no out-of-range grades, no duplicate student numbers or LRNs, every
enrollment's section exists, one live enrollment per learner per year, document
gate 0, and no attendance on weekends, holidays or future dates. The 151
learners already loaded **kept every student number**.
`flag_overdue_installments` flagged 68 more.

Backup: `~/Documents/ASIA-db-backups/SLIS_THESIS_FINAL_2026-10-04_before-tier4-seed.dump`.

**Pinning is current.** `PINNED_NUMBERS` now holds **251** entries — Tiers 1
through 4, all read out of the live database. A Tier 5 can be added without
renumbering anything.

### 9.10 Tier 5 (loaded 2026-10-04): the last hundred, and the ID blocks ran out

Tier 5 is the final volume pass, built like Tier 4: **no new sections or
staff**, just more learners in the 66 sections that exist. Classes now run
**5-10 (2025-2026)** and **5-13 (2026-2027)**.

| | |
|---|---|
| Learners | **+100** (251 → 351). student_id / household_id **377-476** |
| S.Y. 2025-2026 | 145 → **195** learners. Enrollments **1200-1259**, invoices **1300-1351** |
| S.Y. 2026-2027 | 200 → **284** learners. Enrollments **1400-1483**, invoices **1500-1583** |
| Continuations | 34 of the 50 new 2025-2026 learners return; 50 are brand-new 2026-2027 entrants |
| Student numbers | `2025-0143..`, `..2026-0159` |
| 4Ps households | **+17** (`4PS-SEED-051` … `4PS-SEED-067`) |
| Mobiles | `091997/8/9 00000+` |

Totals now: **351 learners · 518 enrollments · 473 invoices · 1,471 payments ·
6,087 grades · 54,304 scores · 50,852 attendance records · 518 users.**

**The original ID blocks are full — this is the important part.** The historical
layout reserved **200-399 for 2025-2026 enrollments and 400-599 for 2026-2027**
(invoices **300-499** and **500-699**). After Tier 4 those were nearly
exhausted: 2025-2026 had only 21 enrollment ids and 46 invoice ids left, far
short of what fifty learners need, and the first Tier 5 attempt silently ran
2025-2026's enrollments into 2026-2027's block before the validator caught the
duplicates.

**Tier 5 therefore moved to a fresh, clearly separated range:**

| | 2025-2026 | 2026-2027 |
|---|---|---|
| enrollment_id | **1200-1259** | **1400-1483** |
| invoice_id | **1300-1351** | **1500-1583** |

A Tier 6 should continue in this high space (1600+ / 1700+), not try to squeeze
into the old blocks. Always check **both** the max id *and* the next block's
floor before picking a range.

**One more generator constraint learned:** a **re-issued invoice may only move
to a plan with fewer or equally many installments.** The original invoice's
first installment is paid as a downpayment and then carried onto the
replacement, so re-issuing quarterly → monthly makes the moved amount larger
than the new first installment and `apply_payments` asserts an overpayment.
Quarterly → annual is fine; quarterly → monthly is not.

**Verification.** Backed up, loaded on a throwaway copy with
`ON_ERROR_STOP=1`, loaded a **second** time for idempotency (identical counts),
then loaded live. All clean: invoice reconciliation, no zero/negative payments,
no out-of-range grades, no duplicate student numbers or LRNs, every
enrollment's section exists, one live enrollment per learner per year, document
gate 0, no weekend/holiday/future attendance. The 251 already-loaded learners
**kept every student number**. `flag_overdue_installments` flagged 91 more.

Backup: `~/Documents/ASIA-db-backups/SLIS_THESIS_FINAL_2026-10-04_before-tier5-seed.dump`.

**All 351 learners are pinned.**

### 9.11 Tier 6 (loaded 2026-10-04): a hundred more, weighted toward the thin sections

Tier 6 is the first tier that does **not** spread evenly. Tiers 4 and 5 filled
by round-robin into the least-loaded section, which kept the starting gaps
intact: by the end of Tier 5, Grade 7 averaged **5.3** learners per section and
Grade 11 **6.0**, while Kindergarten, Grade 8 and Grade 10 were already at 12+.
This tier weights the intake per grade to close that gap.

| | |
|---|---|
| Learners | **+100** (351 → 451). student_id / household_id **477-576** |
| S.Y. 2025-2026 | 195 → **245** learners. Enrollments **1600-1652**, invoices **1800-1851** |
| S.Y. 2026-2027 | 284 → **369** learners. Enrollments **1700-1784**, invoices **1900-1984** |
| Continuations | 35 of the 50 new 2025-2026 learners return; 50 are brand-new 2026-2027 entrants |
| Student numbers | `2025-0193..`, `..2026-0209` |
| 4Ps households | **+20** (`4PS-SEED-068` … `4PS-SEED-087`) |
| Mobiles | `091667/8/9 00000+` |
| Sections / staff | **unchanged** (66 sections, 43 staff) |

Totals now: **451 learners · 656 enrollments · 601 invoices · 1,880 payments ·
7,788 grades · 69,587 scores · 64,596 attendance records · 641 users.**

**The weighting.** 2026-2027's intake went 9 into Grade 7, 8 into Grade 11,
7 into Grade 9 and 5 into Grade 12, against 1 each for Kindergarten, Grade 8
and Grade 10. The result closes the spread rather than widening it:

| | before Tier 6 | after |
|---|---|---|
| 2025-2026 per section | 5-10 (avg 7.1) | **7-12 (avg 8.7)** |
| 2026-2027 per section | 5-13 (avg 8.6) | **8-15 (avg 11.2)** |
| 2026-2027 Grade 7 | 5.3 | **9.3** |
| 2026-2027 Grade 11 | 6.0 | **8.5** |

The thinnest section in either year is now **7** (2025-2026) and **8**
(2026-2027), against 5 before.

**How to weight a tier.** Read per-grade occupancy first —
`select school_year, grade_level, sum(n), count(*) from (… group by year, grade,
section) group by 1,2` — and set `SY1_PLAN` / `SY2_PLAN` in the builder from the
*average per section*, not the grade total. A grade with four sections (G11/G12
across STEM/ABM) needs roughly twice the intake of a two-section grade to move
its average by the same amount.

**Verification.** Backed up, loaded on a throwaway copy with
`ON_ERROR_STOP=1`, loaded a **second** time for idempotency (identical counts),
then loaded live. All clean: invoice reconciliation, no zero/negative payments,
no out-of-range grades, no duplicate student numbers or LRNs, every
enrollment's section exists, one live enrollment per learner per year, document
gate 0, no weekend/holiday/future attendance. The 351 already-loaded learners
**kept every student number**. `flag_overdue_installments` flagged 117 more.

Backup: `~/Documents/ASIA-db-backups/SLIS_THESIS_FINAL_2026-10-04_before-tier6-seed.dump`.

**All 451 learners are pinned.**

### 9.12 Tier 7 (loaded 2026-10-05): the LRN cap lifted, and a hundred more

Two things happened in this tier: the **LRN scheme was widened** so the seed can
keep growing, and another hundred learners went in, weighted by each grade's
shortfall against a 20-per-section target.

**The LRN change (do not skip this).** An LRN is **exactly 12 digits** —
enforced by `students.validators.validate_lrn_format` and applied on every
write path (counter form, bulk bundle, public intake). The seed built its LRNs
as `LRN_BLOCK` + a **3-digit** student_id, so `student_id` could never exceed
**999**, which capped the whole dataset at ~900 learners. Tier 7 rebased:

| | block | suffix | total | cap |
|---|---|---|---|---|
| before | `136700000` (9) | 3 digits | 12 ✓ | student_id ≤ 999 |
| after | `13670000` (8) | **4 digits** | 12 ✓ | **student_id ≤ 9999** |

This is a **no-op for every existing learner**: `"13670000" + "0576"` is the
same string as `"136700000" + "576"`. Verified — zero LRN values changed across
all 451 learners loaded at the time, and every LRN is still 12 digits.

`seed_spec.py` now carries `LRN_WIDTH = 4` and `LRN_LIKE`. **`LRN_LIKE` matters:**
the seed's cleanup used `LIKE '136700000%'` to find its own rows, and the bare
8-digit prefix would be one digit broader, so a real learner numbered
`136700001234` could be swept up by a re-run. `LRN_LIKE` is
`LRN_BLOCK + "_" * LRN_WIDTH` (`13670000____`), which matches the seed's rows
and nothing else — stricter than the old pattern, not looser. All four cleanup
and verification sites use it.

**The learners.**

| | |
|---|---|
| Learners | **+100** (451 → 551). student_id / household_id **577-676** |
| S.Y. 2025-2026 | 245 → **315** learners. Enrollments **2000-2069**, invoices **3000-3069** |
| S.Y. 2026-2027 | 369 → **442** learners. Enrollments **2600-2672**, invoices **3600-3672** |
| Split | **70 into the finished year, 30 brand-new in the current one** |
| Student numbers | `2025-0246..`, `..2026-0239` |
| 4Ps households | **+20** (`4PS-SEED-088` … `4PS-SEED-107`) |
| Mobiles | `091550/5/8 00000+` |
| Sections / staff | **unchanged** (66 sections, 43 staff) |

Totals now: **551 learners · 819 enrollments · 741 invoices · 2,303 payments ·
9,727 grades · 87,054 scores · 80,946 attendance records · 775 users.**

**Why 70/30 rather than 50/50.** Headcount per section was 7.4 in the finished
year against 11.2 in the current one, so the finished year was the binding
constraint. A learner entering 2025-2026 also continues into 2026-2027 about
68% of the time, so weighting the intake into the finished year lifts *both*.
Per-grade intake was then split in proportion to each grade's shortfall, so
Senior High (four sections, furthest behind) took 20 of the 70.

| | before | after |
|---|---|---|
| 2025-2026 headcount/section | 7.4 (5-10) | **9.5 (7-11)** |
| 2026-2027 headcount/section | 11.2 (8-15) | **13.4 (10-18)** |

**Reaching a 20 average.** From here it needs roughly **493 more learners**
(not 830 — continuations do much of the work if the intake is weighted into the
finished year). The solved split is 415 new in 2025-2026 and 78 brand-new in
2026-2027, which lands both years at exactly 20.0. The LRN cap is no longer in
the way; `student_id` has ~9,300 of headroom.

**Verification.** Backed up, loaded on a throwaway copy with
`ON_ERROR_STOP=1`, loaded a **second** time for idempotency (identical counts),
then loaded live. All clean: invoice reconciliation, no zero/negative payments,
no out-of-range grades, no duplicate student numbers or LRNs, **every LRN
matches `^[0-9]{12}$`**, every enrollment's section exists, one live enrollment
per learner per year, document gate 0, no weekend/holiday/future attendance.
The 451 already-loaded learners kept every student number **and every LRN**.
`flag_overdue_installments` flagged 136 more.

Backup: `~/Documents/ASIA-db-backups/SLIS_THESIS_FINAL_2026-10-05_before-tier7-seed.dump`.

**All 551 learners are pinned.**

### 9.6 Reserved identifiers (don't reuse for other data)

| What | Reserved |
|---|---|
| LRN | `13670000` + **4-digit** student_id (`13670000xxxx`), always 12 digits. Match the seed's own rows with `LRN_LIKE` (`13670000____`), never a bare prefix — see §9.12. |
| student_id / household_id | 100-676 |
| application_id | 700-712 |
| enrollment_id | 200-438 + 1200-1259 + 1600-1652 (2025-2026), 400-600 + 1400-1483 + 1700-1784 (2026-2027) |
| invoice_id | 300-505 + 1300-1351 + 1800-1851 (2025-2026), 500-698 + 1500-1583 + 1900-1984 (2026-2027) |
| student_number | `2025-0001..2025-0315`, `2026-0001..2026-0239` (**all 551 are pinned**, see §9.7-9.12) |
| Emails | `*@slis.test`, `*.seed@gmail.com` |
| Guardian / learner mobiles | Tiers 1-2.5 `09xx11xxxxx` / `09xx12xxxxx`; **T3 `091777/8/9`, T4 `091887/8/9`, T5 `091997/8/9`, T6 `091667/8/9`, T7 `091550/5/8`** — keep new tiers out of all of these |
| Legacy block (old seeders) | LRN `9900…` |

Tier 1's original ID ranges (student_id 100/110/111/114/115/125/128/140/147/152; household_id same minus 152; enrollment_id 200-211; invoice_id 300-309) are a subset still in use — those ten learners are the core of Tier 2's history, unchanged.

---

## 10. Generator internals

`generate_seed.py`, about 1,330 lines, is pure Python except for Django's password hasher.

**Constants:**

- `SY`, `NEXT_SY`, `SY_START`, `SY_END`, `EARLY_BIRD_DAYS = 7`, `EB_CUTOFF`
- `TODAY = 2026-09-29` (hard-coded, used for installment overdue status and ages)
- `LRN_BLOCK = "136700000"`, `PASSWORD`
- `RNG = random.Random(20250601)`

**Data tables** (edit these to change the data):

| Name | Holds |
|---|---|
| `TRANSMUTATION_TABLE`, `transmute`, `initial_grade` | A copy of `grading/deped.py` and `ScoreEntryViewSet.compute_grade` |
| `TEMPLATES`, `LEVEL_TEMPLATE`, `ITEMS` | Component weights per template, and assessment items per period |
| `HOLIDAYS`, `DAYS_OFF`, `BREAKS`, `QUARTERS`, `SEMESTERS`, `EXAMS`, `OTHER_EVENTS` | The calendar |
| `subject_catalogue()` | The 121 subjects |
| `fee_items(grade)` | 2025-2026 fees |
| `LADDER` | The 14 grades in order |
| `DISCOUNT_TYPES`, `SCHOLARSHIP_TYPES`, `PLAN_PCT`, `PLAN_TYPE`, `PLAN_SHAPE` | Billing |
| `SECTIONS` | (level, grade, name, strand, adviser email) |
| `STAFF` | (name, email, role) |
| `LEARNERS` | One dict per learner (fields below) |
| `HOUSEHOLDS` | household_id → (marital status, living arrangement, 4Ps, 4Ps ID) |
| `REQUIRED_ALL`, `REQUIRED_TRANSFEREE`, `DOC_NAMES` | Documents |
| `PAYMENTS` | Per-learner payment behaviour: method, style, first payment date |

**`LEARNERS` fields:**

- Identity: `key`, `student_id`, `household_id`, `number`, `lrn`, `first`/`middle`/`last`/`suffix`, `sex`, `religion`, `birth`, `email`, `mobile`, `status`, `current`/`permanent` address.
- Placement: `level`, `grade`, `section`, `strand`, `enrolled_on`, `entry`.
- Grades: `ability` (base transmuted grade).
- Billing: `plan`, `scholarships` [(code, approved date, notes)].
- Profile: `siblings` [(name, age)], `previous` [(school, address)], `optional_docs`, `guardians` [(relationship, name, occupation, email, mobile, is_primary)].
- Attendance: `absences` (A, E, L counts).
- Optional: `transfer_in` (effective date, reason, origin school).

**How values are produced:**

- **Grade targets:**
  - `round(ability + subject affinity (gauss σ 2.2) + noise (gauss σ 1.3) + 0.4 × period index)`, clamped to 80-98 (75-98 for Patrick).
  - `scores_for(target)` then samples raw scores until the DO 8 computation transmutes to exactly that target.
  - Overrides are hard-coded, e.g. Patrick's G5-MATH = 73, 76, 78, 79.
- **Payment styles:**

| Style | Behaviour |
|---|---|
| `upfront` | One payment of the full total on enrollment |
| `early` | Each installment paid 1-7 days before it is due |
| `late_some` | Installments 5 and 8 paid 6-11 days late |
| `arrears` | Paid through November, ₱1,000 on the December installment, then nothing |
| `last_partial` | ₱2,000 on the last installment |

  In every style, the first installment is paid on enrollment day as a downpayment.

**Determinism caveat (Tier 1 only, fixed in Tier 2):** Tier 1 consumed one shared RNG stream in build order, so any change shifted every random value generated after it. **Tier 2 switched to a per-learner RNG** (`random.Random("slis-seed-tier2|<key>|<sy>|<purpose>")`, seeded in `seed_spec.py`), so adding or editing one learner no longer changes another learner's scores, attendance or payments. This is now how the generator works; keep using this scheme for any further tier.

**Output sections** (in `seed_data.sql`):

| # | Section |
|---|---|
| 0 | Clear the seed's own learners |
| 1 | `\ir scripts/reference_data.sql` |
| 2 | School years + school settings |
| 3 | Subjects |
| 4 | Discount/scholarship types |
| 5 | Fee schedules |
| 6 | Accounts |
| 7 | Calendar |
| 8 | Sections + advisers |
| 9 | Households, learners, guardians, siblings, previous schools, guardian login links |
| 10 | Requirement submissions |
| 11 | Enrollments, transfer-in, scholarships |
| 12 | Scores (via a temp table + DO check), grades, observed values |
| 13 | Attendance (`generate_series` over school days minus calendar blocks, with exceptions + DO check) |
| 14 | Invoices, items, discounts, installments, payments + a DO reconcile check |
| 15 | Sequence resync |

The embedded `DO $$ … RAISE EXCEPTION` checks make the whole file roll back if scores don't resolve to a subject and component, an absence falls outside the school days, or an invoice doesn't reconcile.

---

## 11. Verification checklist

Run these on a throwaway database first, then read-only on the real one. Tier 1 passed all of them on 2026-09-29, including after the staff-active change.

**Tier 3 status (2026-10-04): NOT RUN — Tier 3 was generated without loading or testing, at the user's request. Every box below is open for Tier 3; the figures quoted are Tier 2.5's and the Tier 3 equivalents are 2901 grades, 212 invoices and 233 enrollments. See §9.8 for what *was* checked statically.**

**Tier 2.5 status (2026-10-02): the whole list passed, including the two items Tier 2 skipped.** Load + idempotent re-run on a copy of the live DB, a fresh `schema.sql` load, the SQL invariants, 1321/1321 grades, 85/85 invoices, the document gate, 94/94 serializer re-validations, logins (25 active in / 2 inactive refused), `makemigrations --check` clean in all three services, and the full suites: billing 150, enrollment 704, identity 106, student 384 = **1344 passed**. Two cautions for whoever re-runs this: the invoice reconciliation query below must exclude `voided` installments (transfer-out close-outs void the remainder, so the version printed below reports three false positives), and a grade check must `quantize` the renormalised initial grade to 2 dp **before** transmuting, exactly as `grading/views.compute_grade` does.

**Tier 2 status (2026-09-30):** most of this list was run on a throwaway copy before loading — deterministic output, idempotent load, the zero-row SQL checks, 689/689 grades matching the calculator, 50/50 invoices matching billing's own builder, 29/31 logins (the 2 inactive teachers correctly refused), the document gate, and EnrollmentSerializer re-validation on 55/57 enrollments (the 2 failures have overrides, as expected). **Skipped on the user's go-ahead** ("skip the testing, just create the required data"): the fresh-`schema.sql`-load test, and the remaining service-level smoke/regression suites (`makemigrations --check`, full billing/enrollment test suites). Re-run those before relying on this tier for anything beyond manual UI checks.

**Load-level:**

- [ ] `seed_data.sql` loads with `ON_ERROR_STOP=1` on a copy of the live database and on a fresh `schema.sql` database.
- [ ] Running it twice gives identical content (compare fingerprints on natural keys, not surrogate IDs, because grade and score IDs are regenerated on each run).
- [ ] Counts match the generator's printout; §1 lists the volumes.

**Data-level (SQL):**

```sql
-- every grade's subject is from the enrollment's year
SELECT count(*) FROM grades g JOIN enrollments e USING (enrollment_id)
  JOIN subjects s USING (subject_id) WHERE s.school_year <> e.school_year;           -- 0

-- invoices reconcile. NOTE: only LIVE installments count -- a transfer-out
-- close-out voids the remaining ones, so summing all of them reports a false
-- mismatch on every closed-out invoice (§7.13 states the invariant).
SELECT i.invoice_no FROM student_invoices i
 WHERE (SELECT sum(amount) FROM student_invoice_items x WHERE x.invoice_id=i.invoice_id)
     - (SELECT coalesce(sum(amount),0) FROM student_invoice_discounts x WHERE x.invoice_id=i.invoice_id)
    <> (SELECT coalesce(sum(amount),0) FROM invoice_installments x
          WHERE x.invoice_id=i.invoice_id AND x.status <> 'voided');   -- none

-- no attendance on blocked days
SELECT count(*) FROM attendance_records a JOIN enrollments e USING (enrollment_id)
  JOIN academic_calendar_events ev ON ev.school_year=e.school_year
   AND ev.event_type IN ('holiday','school_day_off','quarter_break')
   AND a.date BETWEEN ev.start_date AND ev.end_date;                                     -- 0

-- advisers are active teachers
SELECT a.* FROM section_advisories a LEFT JOIN users u ON u.user_id=a.teacher_user_id
 WHERE u.user_id IS NULL OR u.role<>'teacher' OR NOT u.is_active;                         -- none
```

**App-level** (Django shell against the test database, using the services' own functions):

- [ ] All grades equal the app's own computation — renormalise over the encoded weight, `quantize` to 2 dp, then `grading.deped.transmute`: 1321/1321 at Tier 2.5; **expect 2901 at Tier 3**.
- [ ] Document gate: `requirements.rules.missing_required` is empty for every enrollment.
- [ ] Every invoice equals billing-service's computation: `compute_discount_waterfall`, `generate_installment_schedule` / `_prorated`, `earns_early_bird`, with the real scholarship lookup: 85/85 at Tier 2.5; **expect 212 at Tier 3**.
- [ ] Every seeded account logs in through `IdentityUserBackend.authenticate` with `SlisDemo2026!`, and every seeded teacher passes `SectionAdvisorySerializer.validate_teacher_user_id`.
- [ ] A carry-over dry run into 2026-2027 reports what it would copy (subjects 121, sections 16, advisers 16).
- [ ] After loading the real database: `makemigrations --check` is clean and the service test suites still pass (billing 150, enrollment 704, identity 106, student 384 = 1344 at last run, 2026-10-02 — **not yet re-run for Tier 3**).

**UI (the user checks):** pick S.Y. 2025-2026 on each page. Look at a learner profile (every tab), Grades, Attendance, Invoices / ledger, Scholarships, School Year detail (setup checklist, advisers, carry-over into 2026-2027), and the guardian portal (maribel.reyes.seed@gmail.com).

---

## 12. Bugs the seed has found

| # | Found | Bug | Status |
|---|---|---|---|
| 1 | Tier 1 | Billing read `scholarship_type.scholarship_code`, but `ScholarshipTypeMirror` had no such field, so any invoice for an enrollment with a scholarship crashed (500). | **Fixed** (`f7b9c072`): field added to the mirror. |
| 2 | Tier 1 | Invoice recalculation measured Early Bird from School Settings (the current year), not the invoice's own year, so editing a past year's fees granted Early Bird to every older invoice. | **Fixed** (`f7b9c072`): `earns_early_bird(invoice_date, school_year)` used by both generation and recalc. |
| 3 | Tier 1 | The enrollment form's promotion gate blocked on *any* failed quarter, while Promote used the year average (Patrick exposed it). | **Fixed** (`f7b9c072`): `BLOCKING_REMARKS` + `blocking_subjects()` shared by the form, promote and eligibility. |
| 4 | Tier 1 | GradesPage hard-coded `enrollment_status: "enrolled"`, so a finished year showed no learners. | **Fixed** (`ac88a0d3`): attended statuses via the `enrollment_status__in` filter. Similar hard-codes exist in SF2PrintPage, ScholarshipsPage, DashboardPage and InvoicesPage; unverified whether each is a bug. |
| 5 | 2026-09-29 | `manage_accounts lock-demo` locks only the original 6 demo emails. The seed now creates 28 accounts, so 22 seeded staff accounts and one guardian would stay usable on a database with real data. | **Open** (reported, not fixed). |
| 6 | 2026-09-29 | `schema.sql` starts with `SET transaction_timeout` (from a newer `pg_dump`), so it doesn't load on the local server as-is. | Environment mismatch; the workaround is in §4. |
| 7 | 2026-09-29 | Re-running the seed doesn't reset `users.is_active`, so a deactivated seeded account stays deactivated. | Seed behaviour; decide whether the seed should force `is_active`. |
| 8 | 2026-09-29 | The README's Demo accounts section describes the old seed. | **Open.** |
| 9 | Tier 2, 2026-09-30 | Carry-over into a new year copies obsolete subjects from the prior year verbatim (2025-26's Mother Tongue for G1-3 and EsP for G1-10, 13 subjects), even though the target year's own catalogue (2026-2027, MATATAG) has already dropped them. | **Open** (reported, not fixed). |
| 10 | Tier 2, 2026-09-30 | Carry-over also recreates a section under its *old* name/adviser (G3 "Mabini" with Aileen Manalo) even though that section was renamed ("Del Pilar") and re-staffed in the new year. | **Open.** |
| 11 | Tier 2, 2026-09-30 | Calendar carry-over shifts every moveable holiday by exactly +1 year, which is wrong for lunar/moveable dates (Eid'l Adha, Chinese New Year, Eid'l Fitr, All Saints' Eve landed on the wrong dates for 2026-27). | **Open.** |
| 12 | Tier 2, 2026-09-30 | The carry-over preview shows a blank `teacher_name` for an adviser who is a non-teacher role (e.g. a registrar still assigned as adviser). | **Open.** |
| 13 | Tier 2, 2026-09-30 | "Teachers Today" marks a section's attendance as fully taken when only *some* of its learners have an attendance record for the day, not all. | **Open.** |
| 14 | Tier 2, 2026-09-30 | The promotion-block message renders an incomplete subject's grade as if it were final (e.g. "Science 3 (92.00)") instead of flagging it as incomplete. | **Open.** |
| 15 | Tier 2, 2026-09-30 | Year-over-year compare excludes a learner who was cancelled mid-year from that year's learner count, and separately counts graduates in the "came back next year" denominator, understating the retention rate. | **Open.** |
| 16 | Tier 2, 2026-09-30 | The year setup checklist counts a grade's fee schedule as "configured" even when that schedule has zero fee items (Grade 1, 2026-2027). | **Open.** |
| 17 | Tier 2, 2026-09-30 | A ₱0 invoice (from a fee schedule with no items) still gets flagged and listed as overdue once its due date passes, even though there's nothing owed. | **Open.** |
| 18 | Tier 2, 2026-09-30 | The dashboard for a finished school year shows an empty/zero level-distribution chart and an empty attendance series, even though the year has full data — looks like a live-year-only filter leaking into the historical view. | **Open.** |

---

## 13. Expected behaviour that looks like a bug

- **Teachers' My Sections is empty for 2025-2026.** The roster counts only `enrolled` learners, and every 2025-2026 enrollment is `completed`.
- **Pages show nothing by default.** They default to the current year (2026-2027), which has no learners. Pick 2025-2026.
- **The at-risk dashboard can't run for 2025-2026.** The risk model only scores `enrolled` learners.
- **Nothing is overdue in 2026-2027.** No invoices exist there.
- **An SHS 2nd-semester enrollment has no invoice.** SHS is billed once, on the 1st semester. The app would still allow generating a second invoice on the sem-2 row.
- **Joshua has no Q1 grades or attendance.** He transferred in on 2025-09-01.
- **Andrea's attendance stops on March 27.** She graduated on March 28.

---

## 14. Coverage: what the data exercises and what it doesn't

| Area | Covered by Tier 1 | Not covered yet |
|---|---|---|
| Registry | an open finished year, an empty current year | archived year, upcoming year, 3+ consecutive years (year compare) |
| Sections / advisers | 16 sections, 1 adviser each, 4 free teachers | co-advisers, a section with no adviser, multiple sections per grade, **inactive (resigned) teacher** |
| Learner profiles | dense profiles, shared household, 4Ps, guardian as aunt, own email/mobile | learner with no household, no primary guardian, alien certificate, siblings across grades both enrolled |
| Documents | all required + optional | **missing required documents** (pending enrollment) |
| Enrollment | completed, SHS per semester, transfer-in | **enrolled (live year)**, pending, cancelled, transferred_out, retention, override, internal move, promotion history |
| Grades | full year, DO 8 exact, a failed quarter | failed on the year, incomplete, dropped, in-progress quarter (scores without grades) |
| Attendance | full year with exceptions | current year up to today (dashboards, Teachers Today) |
| Billing | 4 plans, voucher, stacked scholarships, EB / no EB, prorated, overdue | void / reissued invoice, transfer-out close-out, overpayment attempts, current-year collections |
| Intake | none | invites (active / expired / revoked / locked) and applications in every status |
| Risk / analytics | none | risk runs per period, clustering, trends |
| Staff status | all active | deactivated staff with past advisories |

---

## 15. Recipes for common additions

For each: the tables touched and the rules that bite.

- **Add learners to an existing year.**
  - Pick unused IDs and LRNs inside the block. Add the household, student, guardians, previous schools and documents (per entry status), then the enrollment in an existing section, then scores/grades (subjects of *that year*), observed values, attendance (school days only), and the invoice (fee schedule of that year, waterfall, installments, payments).
  - Add them to `PROFILES`, `HOUSEHOLDS` and `ENROLLMENTS` in `scripts/seed_spec.py` (payment behaviour is the `pay=dict(...)` field on the enrollment; there is no separate `PAYMENTS` table in the spec any more). The per-learner RNG means existing learners are not reshuffled, so §10's determinism caveat does not apply.
  - **Leave `PINNED_NUMBERS` alone** and let the new learners take the next free numbers — see §0.
- **Seed the current year (2026-2027) up to today.**
  - Needs calendar events, sections, advisers and subjects for 2026-2027. That conflicts with keeping it empty for carry-over, so decide first (run carry-over, then seed on top; or seed a different current year).
  - Enrollments `enrolled`. Grades only for finished periods (Q1 ended in August). Scores for the running period without a grade row. Attendance up to today. Invoices with installments due before today paid or overdue.
  - This unlocks My Sections, Teachers Today, the risk model and live dashboards.
- **Add a history year (promotion).**
  - Register the earlier year, then its sections, subjects, fees and calendar. Learners get `completed` rows there and `continuing` entry status in the next year (so the transferee documents stop applying).
  - The grade must be the same or next; otherwise add an override. SHS G11 → G12 goes from the completed sem-2 row.
- **Add an archived year.** Seed everything first, then `UPDATE school_years SET archived_at = now(), archived_by = <super_admin id>`. The API then refuses writes to it (409).
- **Add an upcoming year.** Register it with a label after the current one. Partial setup, `pending` enrollments, applications/invites for it.
- **Transfer-out.** Enrollment `transferred_out`, a transfer row (`from_*`, destination, effective date, initiated_by), student `transferred`, attendance stops at the effective date, invoice close-out per §7.13.
- **Retention.** Same grade next year, allowed without an override. Promoting a learner with a failed/incomplete/dropped subject year outcome needs an `enrollment_overrides` row.
- **Missing documents.** Leave out a required submission (or `is_submitted = false`) and keep the enrollment `pending`.
- **Voided and reissued invoice.** Old invoice `void` (installments `voided`), a new live one; only one non-void invoice per enrollment.
- **Inactive (resigned) teacher.** Add a teacher with `is_active = false` who advised a past-year section. Carry-over should then skip them with reason `inactive`, login is refused, and the name still shows on past records. Make the seed set `is_active` explicitly.
- **Co-advisers / a section without an adviser.** Two advisory rows for one section; a section with no row. The setup checklist should flag the latter.
- **Applications and invites.** An invite per applicant (hashed code, expiry), then applications in every status. Approved ones need `created_student_id` (a real student); rejected ones need a `decision_note`.
- **Risk runs.** Needs a non-archived year with `enrolled` learners and grades. Trigger `POST /api/ai/risk-assessment/run/` per period after loading, rather than writing rows by hand.

---

## 16. Roadmap (proposed tiers)

These are proposals, not decisions; confirm them at each go-ahead.

- ~~**Tier 1.5 (small, optional)**~~ — folded into Tier 2 below (resigned teachers, generator moved into the repo). `lock-demo` gap and README refresh are still open, tracked in §12.
- **✅ Tier 2 — done, loaded 2026-09-30.** 25 learners in S.Y. 2025-2026 (finished), 25 in S.Y. 2026-2027 (current, up to 2026-09-30), 31 distinct. Per-learner RNG shipped. Edge cases delivered: failed year + override, transfer-out with close-out, cancel-then-re-enroll, missing documents, a section with no adviser, void/reissue, a ₱0 fee schedule, a grade with no fee schedule at all, MATATAG subject changes, full intake spread (11 invites, 7 applications across every status). See §9.5 for the summary and `--report` for full detail. **Not done from the original proposal:** 2023-2024 archived year and 2027-2028 upcoming year were not added — only two years were requested and built.
- **✅ Tier 2.5 — done, loaded 2026-10-02.** +20 learners in S.Y. 2025-2026 (25 → 45), 14 of them continuing into 2026-2027 (25 → 40); 51 distinct, 94 enrollments. Every 2025-2026 section is now populated, Grade 7 Diamond included. +8 invites / +6 applications. No subjects or fees were added — those were already complete. Student-number pinning added so later tiers never renumber existing learners (§9.7). Closed Tier 2's skipped checks: fresh-`schema.sql` load and the full test suites (1344 tests).
- **🟡 Tier 3 — generated 2026-10-04, NOT loaded or tested.** +100 learners (51 → 151; 95 in 2025-2026, 119 in 2026-2027), a second section for every grade in both years (17 → 33 each) and 16 new teachers to advise them. A realistic spread of abilities, attendance and payment behaviour; every section populated. See §9.8. **Still to do:** run §11 against it, load it, then pin Tier 3's student numbers.
- **✅ Tier 4 — done, loaded 2026-10-04.** +100 learners (151 → 251; 145 in 2025-2026, 200 in 2026-2027), filling the sections Tier 3 created rather than adding more. No new sections or staff. See §9.9. All 251 learners are pinned.
- **✅ Tier 5 — done, loaded 2026-10-04.** +100 learners (251 → 351; 195 in 2025-2026, 284 in 2026-2027), filling the existing sections again. No new sections or staff. The original enrollment/invoice ID blocks ran out and Tier 5 moved to a fresh 1200+/1400+ range — see §9.10. All 351 learners are pinned.
- **✅ Tier 6 — done, loaded 2026-10-04.** +100 learners (351 → 451; 245 in 2025-2026, 369 in 2026-2027), **weighted toward the thin Grade 7 and Senior High sections** instead of spreading evenly. No new sections or staff. See §9.11. All 451 learners are pinned.
- **✅ Tier 7 — done, loaded 2026-10-05.** +100 learners (451 → 551), weighted 70/30 into the finished year so continuations lift both years. **Widened the LRN suffix to 4 digits, lifting the student_id cap from 999 to 9999** (§9.12). All 551 learners are pinned.
- **Tier 8 — reaching a 20-per-section average.** Needs ~**493 more learners** (415 new in 2025-2026 + 78 brand-new in 2026-2027), which lands both years at exactly 20.0. A third section per grade is the alternative if classes should stay smaller. IDs continue at 2100+/2700+ (enrollments) and 3100+/3700+ (invoices); `student_id` has ~9,300 of headroom.

---

## 17. How to request more data

Copy this template, fill in what matters, and leave the rest as "default". Anything not specified follows the defaults in this guide.

```text
SEED REQUEST
Goal / what I want to test:        e.g. "carry-over and promotion into 2026-2027", "the at-risk dashboard"
Tier / size:                       e.g. +20 learners, or Tier 2
School years and their states:     e.g. 2024-25 open, 2025-26 open, 2026-27 current up to today
Which year stays empty (if any):   e.g. keep 2027-28 empty for carry-over
Learners per grade / sections:     e.g. 2 per grade, 2 sections for G7-G10
Staff:                             e.g. +3 teachers without sections, 1 resigned teacher
Edge cases wanted:                 e.g. transfer-out, retention with override, missing docs, void invoice
Billing mix:                       e.g. more overdue accounts, ESC for all JHS
Intake / applications:             e.g. 8 applications across all statuses for 2027-28
Keep or replace existing data:     keep Tier 1 as-is / regenerate everything
Load into the real DB?             test only / load after tests
```

**Example requests:**

- "Add a resigned teacher who advised G9 Sapphire in 2025-26 and make the seed force `is_active`. Test on a copy, then load."
- "Tier 2 per the roadmap, 40 learners, keep Tier 1's ten as the core of the history."
- "Seed 2026-27 up to today with 15 enrolled learners so My Sections, Teachers Today and the risk model have data. Run carry-over first so sections and subjects come from 2025-26."
- "Give me 6 applications for 2027-28: one in each status, plus an expired and a revoked invite."

**What happens after a request:**

1. Study any schema or code changes since the last verification (check `git log` and new migrations).
2. Propose a plan and the open decisions. Wait for the go-ahead.
3. Update the generator, regenerate, and test on a copy and on a fresh database.
4. Run the §11 checks.
5. Back up the real database, load it, and report the counts, the logins and any app bugs found (reported, not fixed).

---

## 18. Enum reference

| Field | Values |
|---|---|
| `users.role` | super_admin, admin, registrar, teacher, accounting, guardian |
| school level | nursery, kindergarten, elementary, junior_highschool, senior_highschool |
| grade | Nursery, Kindergarten, Grade 1 … Grade 12 |
| SHS semester | 1st, 2nd (NULL outside SHS) |
| strand (in use) | STEM, ABM (NULL = core / outside SHS) |
| `enrollments.enrollment_status` | enrolled, pending, cancelled, completed, transferred_out |
| `students.status` | active, inactive, transferred, graduated, dropped |
| `students.sex` | male, female |
| `guardians.relationship` | mother, father, guardian |
| `households.parent_marital_status` | married, separated, annulled, single_parent, widowed |
| `households.living_arrangement` | both_parents, mother_only, father_only, guardian, relative, independent, others |
| grading period | 1st_quarter, 2nd_quarter, 3rd_quarter, 4th_quarter, 1st_semester, 2nd_semester |
| `grades.remarks` | passed, failed, incomplete, dropped |
| `narrative_reports.rating` | AO, SO, RO, NO (also outstanding, satisfactory, needs_improvement) |
| `attendance_records.status` | P, A, L, E |
| calendar `event_type` | holiday, school_day_off, quarter_break, grading_period, exam, enrollment, event, other |
| `enrollment_transfers.transfer_type` | transfer_in, transfer_out, internal_move |
| requirement entry status | new, transferee, continuing |
| `student_invoices.status` | unpaid, partially_paid, paid, void |
| `student_invoices.payment_plan` | monthly, quarterly, semi_annual, annual |
| `invoice_installments.status` | pending, partially_paid, paid, overdue, voided |
| `student_payments.payment_method` | cash, bank_transfer, gcash, card, check, others |
| fee item category | tuition, misc, other |
| discount mode | percentage, fixed_amount |
| `student_applications.status` | draft, submitted, in_review, approved, rejected |
