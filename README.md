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

All four services share **one** virtualenv at the repo root and **one** requirements file — set it up once:

```sh
python -m venv .venv
.venv\Scripts\activate        # or `source .venv/bin/activate` on macOS/Linux
pip install -r backend/requirments.txt
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

## Known in-progress work

- **RBAC**: role is captured at login and stored, but enforcement is incomplete on both sides. Several backend endpoints (billing, grades, student records) currently only require *any* authenticated user, not a specific role, and the frontend has no per-route role guard beyond the Audit Trail page.
- **Clustering analytics** (`enrollment-service/ai/`): K-means/PCA clustering of student performance is implemented and wired into the UI (`AnalyticsPage`), but results aren't persisted and hyperparameters are hardcoded.

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
