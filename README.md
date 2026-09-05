# SLIS Prototype — South Lakes Integrated School management system

A school management system built as four independent Django/DRF services plus a single React admin portal. All four backend services connect to the **same** PostgreSQL database (`SLIS THESIS FINAL`) and share one JWT signing key, so the service split is a process/deployment boundary, not a data boundary — any of the four can read tables owned by another.

## Architecture

| Service | Port | Responsibility |
|---|---|---|
| `backend/identity-service` | 8001 | Login/logout/refresh, user accounts, audit log |
| `backend/student-service` | 8000 | Student, household, guardian, sibling, previous-school records, OCR document scan |
| `backend/enrollment-service` | 8003 | Enrollments, subjects, grades, grading templates, scholarships, attendance, academic calendar, AI clustering analytics |
| `backend/billing-service` | 8002 | Fee schedules, invoices, payments, installments, school settings |
| `frontend/admin-portal` | 5173 (dev) | React/Vite SPA consuming all four APIs |

JWTs are issued by identity-service and verified by every other service using the same `SECRET_KEY` (SimpleJWT signs with `settings.SECRET_KEY` when no separate signing key is configured) — this is why every backend `.env` must carry an identical `SECRET_KEY` value.

## Prerequisites

- Python 3.11+ and a virtualenv tool
- Node.js 18+
- PostgreSQL, with a database named `SLIS THESIS FINAL` (or override `DB_NAME` in each service's `.env`)

## Setup

### 1. Database

Create the database, load the schema, then the seed data:

```sh
psql -U postgres -c 'CREATE DATABASE "SLIS THESIS FINAL"'
psql -U postgres -d "SLIS THESIS FINAL" -f schema.sql
psql -U postgres -d "SLIS THESIS FINAL" -f seed_data.sql
```

`schema.sql` is a `pg_dump --schema-only` snapshot of the schema, which was built up via pgAdmin over time with no other tracked source — it's the only artifact that captures the whole thing, including two validation triggers (`trg_billing_item_parent_category_match`, `trg_validate_grading_period`) and a view (`student_invoice_balances`) that Django's models/migrations layer can't see at all. Most Django models still declare `managed = False` and point at these tables rather than owning them via migrations (see "Known in-progress work" below), so `schema.sql`, not `manage.py migrate`, is the source of truth for table structure. Regenerate it after a real schema change made via pgAdmin:

```sh
pg_dump -h <host> -U postgres -d "SLIS THESIS FINAL" --schema-only --no-owner --no-privileges -f schema.sql
```

(strip any `\restrict`/`\unrestrict` lines pg_dump 17+ adds at the top/bottom — they make the file fail to load on older psql clients and add nothing for a tracked reference file.)

### 2. Backend

Each service has its own pinned `requirements.txt` (`backend/<service-name>/requirements.txt`) — that's the source of truth for what it needs. For local development it's still convenient to share one virtualenv at the repo root:

```sh
python -m venv .venv
.venv\Scripts\activate        # or `source .venv/bin/activate` on macOS/Linux
pip install -r backend/identity-service/requirements.txt -r backend/enrollment-service/requirements.txt -r backend/billing-service/requirements.txt -r backend/student-service/requirements.txt
```

Then, for each of the 4 services:

```sh
cd backend/<service-name>
copy .env.example .env        # then fill in real values — see below
python manage.py migrate
python manage.py runserver <port from the table above>
```

Each service still needs its own `.env` (see `.env.example` in each service directory for the full list of variables). **`SECRET_KEY` must be the exact same value in all four `.env` files** — generate one value and reuse it everywhere:

```sh
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

`enrollment-service` additionally needs `GEMINI_API_KEY`, `GROQ_API_KEY`, and `RESEND_API_KEY`; `student-service` needs `GROQ_API_KEY`. Ask a teammate for current values or provision your own at Google AI Studio / Groq / Resend.

`DEBUG` and `ALLOWED_HOSTS` are also read from `.env` now rather than hardcoded — `.env.example` already sets `DEBUG=1` and `ALLOWED_HOSTS=*` for local development (the `*` is what lets a phone on the same LAN reach a service by IP address during testing). Leaving either unset defaults to the safe, production-appropriate value (`DEBUG=False`, no hosts allowed), so a real deployment needs to set both explicitly — along with `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, and `SECURE_HSTS_SECONDS`, all opt-in and off by default because nothing in this stack terminates TLS yet. Each service also exposes `GET /health/` (checks DB connectivity, no auth required) and caches DRF throttle counters to a local `cache/` directory (`django.core.cache.backends.filebased.FileBasedCache`) instead of the previous per-process in-memory default, so rate limits hold up across more than one worker process on the same machine.

### 3. Frontend

```sh
cd frontend/admin-portal
npm install
npm run dev
```

No `.env` is required for local development — every API client already defaults to the ports above. See `.env.example` if you need to point at non-default URLs.

Two things about this build are deliberate and easy to undo by accident:

- **Routes are code-split.** `App.jsx` loads all 34 post-login pages through `lazyRoute()` (`src/utils/lazyRoute.js`), so each one is its own chunk fetched on the navigation that needs it. Before this, everything — all twelve thousand-line pages, all eight print documents, the analytics charts, the audit trail — sat in one 1.41 MB entry bundle that a guardian had to download in full to look at one child's grades. The entry chunk is now 372 kB (116 kB gzipped, down from 343 kB). `LoginPage` and `NotFoundPage` are deliberately **not** split: the first is the only route reachable without a token and must not cost an extra round trip, and a not-found fallback that has to be fetched is one that can itself fail to arrive. **Adding a page means adding a `lazyRoute()` line, not a static `import`** — a static one silently pulls that page back into the entry chunk for everybody.
- **Only the `woff2` icon font is emitted.** `@tabler/icons-webfont` ships one `@font-face` listing woff2/woff/ttf; browsers only ever fetch the first they support, so the other two were 3.6 MB of `dist/` that was built, deployed and stored but never served. A small `enforce: 'pre'` transform in `vite.config.js` rewrites that `src:` list to the woff2 alone. It's a transform rather than a vendored copy of the CSS so `npm update @tabler/icons-webfont` still picks up new glyphs.

`src/api/apiClient.js` now shares **one** in-flight refresh across every API client (each backend gets its own axios instance, so this has to live at module scope, not per client). An expired token on the dashboard used to fire ~11 simultaneous `POST /refresh/` calls; they now await the same one. That is also what makes `ROTATE_REFRESH_TOKENS` safe to turn on later — with rotation on and no mutex, the first refresh wins and each of the other ten logs the user out mid-edit.

### 4. Document OCR (optional)

`student-service` scans uploaded enrollment documents. Two things read them: a **local**
engine (PaddleOCR) and a **cloud fallback** (Groq vision, via `GROQ_API_KEY`). The fallback
alone is enough to run the app — install the local engine to keep scanning free, offline and
non-hallucinating:

```sh
pip install -r backend/student-service/requirements-ocr.txt
```

Three things worth knowing before you debug it:

- **`enable_mkldnn=False` in `students/ocr/reader.py` is mandatory, not a tuning choice.**
  paddlepaddle 3.3.1's oneDNN path raises `NotImplementedError:
  ConvertPirAttribute2RuntimeAttribute not support [pir::ArrayAttribute<pir::DoubleAttribute>]`
  on these graphs. Disabling it costs the CPU acceleration — roughly 30 s per document instead
  of ~5 s. Re-test the flag after a paddle upgrade; the speed comes back for free.
- **paddle constrains numpy to the 2.3.x line.** Installing it into the repo-root shared
  virtualenv will downgrade numpy; if anything else there needs 2.4+, the paddle import fails
  at runtime, not at install time.
- **Not installed is a supported state.** `reader.py` imports paddle lazily and everything
  above it consumes a `ParsedDocument`, so the policy / anchor / verify / reconcile logic runs
  and is tested regardless. The engine tests are guarded with
  `pytest.importorskip("paddleocr")` and simply skip. This is also why `requirements-ocr.txt`
  is separate: CI installs only `requirements.txt`.

Which documents get read locally is decided per requirement type in `students/ocr/policy.py`:
the PSA birth certificate is extracted by anchors with **zero** model calls; nine attestation
types are only *verified* (right document, right student) by local string matching, also with
zero model calls; Form 137 currently falls through to the cloud fallback because no filled,
current-format sample was available to tune anchors against. Every scan records which engine
produced it (`DocumentExtraction.source_engine`).

Scanned values never reach the form on their own — they land in a review panel as *claims*,
and anything that would overwrite saved data or contradict another document arrives unticked.
See `students/ocr/reconcile.py` and `frontend/admin-portal/src/pages/ocr/`.

> Sample documents are real civil-registry records and are **gitignored** (`OCR_IMAGES/`,
> `students/fixtures/*.jpg`). Do not commit them — see the note in `.gitignore`.

## Known in-progress work

- **RBAC**: backend endpoints (billing, grades, student records, etc.) and frontend routes are now role-gated per-page, with sensitive actions on shared pages (e.g. delete/promote) also hidden per-role at the button level. `HasRole` (both the shared copy used by billing/enrollment/student and identity-service's own) now fails closed if a view omits `required_roles` — it used to silently allow any authenticated user, guardians included; a view that genuinely wants that must set `ALLOW_ANY_AUTHENTICATED_ROLE = True` explicitly. `backend/shared/` now also holds `authentication.py` (`SingleSessionJWTAuthentication`, de-duplicated from three per-service copies) and `health.py`; `user_stub.py` remains unused dead code (see git history/audit notes for why).
- **Clustering analytics** (`enrollment-service/ai/`): K-means/PCA clustering of student performance is implemented and wired into the UI (`AnalyticsPage`). Runs are now persisted (`RiskAssessmentRun` / `StudentRiskScore`) and the at-risk score is anchored to DepEd decision thresholds rather than free hyperparameters, but the component weights in `ai/services.py` are still hardcoded rather than configurable per school.

- **Flipping the remaining `managed = False` models to `managed = True` needs the `accounts` app-label collision resolved first — not a decision to make in passing.** All four services independently define a local app named `accounts` (their own `User` stub, hand-copied per service — see `backend/shared/`'s notes above), but Django's migration bookkeeping (`django_migrations`) is keyed by `(app_label, migration_name)` in the **one shared database**, not per-service. Checked directly against the real DB: `accounts.0001_initial` is recorded **once**, even though all four services carry a file by that name with different `CreateModel` contents — whichever service happened to migrate first "claimed" that row, and the other three's `0001_initial.py` has never actually executed. Harmless today only because every current `accounts` migration is `managed = False` (a no-op either way). It stops being harmless the moment any service's `accounts` app gets a real, executed migration: a same-named migration in a *different* service would read as "already applied" and silently skip its own `CREATE TABLE`, even against a genuinely empty database. Fix first (e.g. a distinct `AppConfig.label` per service), independently of and before any `managed = True` conversion work.
- **`schema.sql`** (repo root) is a `pg_dump --schema-only` snapshot of the real schema — see the Database setup section above. Verified by loading it into a throwaway database from scratch (0 errors, exact table/view count match). It's a complete, working substitute for `manage.py migrate` today, but doesn't by itself fix `pytest-django`'s automatic test-database creation, which still drives Django's own migration executor and hits the `django.contrib.admin` → `AUTH_USER_MODEL` wall documented in `enrollment-service/ai/test_risk_assessment.py`'s module docstring (that FK requires `users` to exist, and no *migration* creates it in student-service, billing-service, or enrollment-service). Closing that gap for real integration testing — without re-triggering the collision above — most likely means point pytest-django's `django_db_setup` fixture at `schema.sql` directly instead of at `manage.py migrate`, rather than converting all 55 tables to `managed = True`.

- **Sensitive documents in git history** — *needs a decision, not more code.* `ff09988 "final fixes before demo"` committed a real scanned PSA birth certificate of a named minor (`OCR_IMAGES/4a4e4ed6-….jpg`) plus `students/fixtures/_test_doc.jpg`, and both are reachable from `origin/main`. Under RA 10173 that is sensitive personal information. Nothing new is being added — `OCR_IMAGES/` and `students/fixtures/*.jpg` are gitignored and later commits removed the files from the tree — but **removal from the tree is not removal from history**. Purging them requires:

  ```sh
  git filter-repo --path OCR_IMAGES                   --path backend/student-service/students/fixtures/_test_doc.jpg                   --invert-paths
  ```

  followed by a force-push to `main`, after which **every holder of `matres` / `niru` / `niel` must re-clone** — merging an old clone silently reintroduces the blobs. That coordination cost is why this has not been done unilaterally.

- **A live Gemini API key is also in git history** — same category as the birth certificate above, found during a later audit and not yet acted on. Commit `5bcd352 "AI Integration"` added `backend/enrollment-service/.env` containing a real `GEMINI_API_KEY`; `d802b93 "Remove .env from tracking"` removed the file from the tree but not from history, and the commit is still reachable from `origin/main`, `wes`, and every other remote branch. **Rotate this key at Google AI Studio** — that step doesn't wait on the `git filter-repo` purge above, though the two should happen in the same coordinated window since both need the same force-push-and-re-clone step.

- **Uploaded requirement documents used to be served unauthenticated** — fixed. `student_service/urls.py` and `enrollment_service/urls.py` no longer mount Django's public `static(MEDIA_URL, ...)` route (it served every file under `MEDIA_ROOT` to anyone, no login required, whenever `DEBUG` was on — which was always, since `DEBUG` was hardcoded). Documents are now served through an authenticated action gated by a short-lived, submission-scoped signed token (`backend/shared/uploads.py`), and uploads are validated by extension *and* magic bytes rather than trusting the filename. `DEBUG`/`ALLOWED_HOSTS`/the `SECURE_*` settings are now read from `.env` instead of being hardcoded — see the Backend setup section above.

- **`billing-service` needs a scheduled task, or overdue installments stop updating.** Flagging past-due installments used to run as a side effect of every `GET /api/installments/` — including a guardian just viewing their own child's account — which meant an unscoped, table-wide `UPDATE` ran on every page load, racing with `StudentPaymentViewSet`'s row lock during payment processing. It's now `python manage.py flag_overdue_installments`, a standalone management command with no side effects on read. **Nothing currently invokes it** — there is no cron/Celery/scheduler anywhere in this project yet — so whoever deploys this needs to run it periodically (daily is enough) via cron, Windows Task Scheduler, or equivalent, or installments will stay "pending" past their due date until it's run by hand.

## Testing

With the shared `.venv` activated, each backend service still has its own `pytest.ini` (for its own `DJANGO_SETTINGS_MODULE`), so run it from inside the service directory:

```sh
cd backend/<service-name>
pytest
```

Frontend:

```sh
cd frontend/admin-portal
npm run test
```

Current coverage is intentionally thin (a stable-logic starting point, not full coverage) — see the CI workflow at `.github/workflows/ci.yml` for what runs on every push.
