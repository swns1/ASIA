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

Create the database and load the seed data:

```sh
psql -U postgres -c 'CREATE DATABASE "SLIS THESIS FINAL"'
psql -U postgres -d "SLIS THESIS FINAL" -f seed_data.sql
```

`seed_data.sql` only inserts rows into tables that already exist — the schema itself isn't tracked here (built up via pgAdmin over time). One schema addition made outside a migration, needed for the guardian self-service portal: `guardians.user_id`, linking a guardian contact record to a `role=guardian` login account. If you're setting up a fresh database, run this once against it:

```sql
ALTER TABLE guardians ADD COLUMN IF NOT EXISTS user_id BIGINT NULL;
CREATE INDEX IF NOT EXISTS guardians_user_id_idx ON guardians (user_id);
```

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

### 3. Frontend

```sh
cd frontend/admin-portal
npm install
npm run dev
```

No `.env` is required for local development — every API client already defaults to the ports above. See `.env.example` if you need to point at non-default URLs.

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

- **RBAC**: backend endpoints (billing, grades, student records, etc.) and frontend routes are now role-gated per-page, with sensitive actions on shared pages (e.g. delete/promote) also hidden per-role at the button level. Remaining hardening work: the 3 non-identity services still fall back to plain `IsAuthenticated` (not role-aware) if a future endpoint omits explicit `permission_classes`, and `backend/shared/` is an empty placeholder — the permission/authentication classes are hand-copied across services rather than truly shared.
- **Clustering analytics** (`enrollment-service/ai/`): K-means/PCA clustering of student performance is implemented and wired into the UI (`AnalyticsPage`). Runs are now persisted (`RiskAssessmentRun` / `StudentRiskScore`) and the at-risk score is anchored to DepEd decision thresholds rather than free hyperparameters, but the component weights in `ai/services.py` are still hardcoded rather than configurable per school.

- **Sensitive documents in git history** — *needs a decision, not more code.* `ff09988 "final fixes before demo"` committed a real scanned PSA birth certificate of a named minor (`OCR_IMAGES/4a4e4ed6-….jpg`) plus `students/fixtures/_test_doc.jpg`, and both are reachable from `origin/main`. Under RA 10173 that is sensitive personal information. Nothing new is being added — `OCR_IMAGES/` and `students/fixtures/*.jpg` are gitignored and later commits removed the files from the tree — but **removal from the tree is not removal from history**. Purging them requires:

  ```sh
  git filter-repo --path OCR_IMAGES                   --path backend/student-service/students/fixtures/_test_doc.jpg                   --invert-paths
  ```

  followed by a force-push to `main`, after which **every holder of `matres` / `niru` / `niel` must re-clone** — merging an old clone silently reintroduces the blobs. That coordination cost is why this has not been done unilaterally.

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
