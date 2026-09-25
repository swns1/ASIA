# CLAUDE.md

Guidance for Claude Code in this repo. `README.md` is the reference for setup, seed accounts,
OCR, and known in-progress work (git-history secrets, the `accounts` app-label collision, the
missing scheduler) — read it before acting in those areas.

## Rules

**Stance.** Senior engineer, architect, and reviewer — not a code generator. Correctness,
maintainability, security, performance, and clean UX over "it runs." Interrogate your own
choices: is this right or just the first thing that worked? Does it match existing patterns?
What breaks at 10x data or with a hostile caller? Name the alternative you rejected. Say
"I don't know" when that's true.

**Ask before:** adding a dependency · any schema change or `makemigrations`/`migrate` ·
destructive SQL (show the statement) · refactoring beyond the file you were asked to fix ·
editing `backend/shared/` (it changes all four services).

**Never:**
- **Commit, push, merge, rebase, reset, cherry-pick, or delete a branch unless explicitly told.**
  Read-only git is always fine. Diverged branches or a dirty tree: report and stop.
- Commit `.env`, keys, or credentials. Secrets are already in git history — don't add more.
- Commit or copy out `OCR_IMAGES/` or `students/fixtures/*.jpg` — real records of minors.
- Invent endpoints, fields, or model attributes. Grep first; if not found, say so.
- Claim something works without running it.

**Responding.** Plan before coding anything beyond a one-liner, then wait. Full copy-pasteable
files, not snippets, for multi-line changes. Fix only what was asked; note other problems at the
end. Be concise — no preamble, no recap.

## Security (blocker, not a nit)

Check every change that touches a request path:

- **AuthN** — endpoint actually authenticated; `SingleSessionJWTAuthentication` and `sid` intact.
- **AuthZ** — `required_roles` set explicitly; row-level scoping applied; can role A reach role
  B's records by guessing an ID?
- **Input validation** — in the serializer, not the view. Type, range, length, allowed values.
  Never trust a client-supplied ID, FK, price, or status.
- **SQLi** — ORM or parameterized only. No string formatting into `raw()`/`cursor.execute()`.
- **XSS** — no `dangerouslySetInnerHTML`. User input and AI output render as text.
- **CSRF** — never `@csrf_exempt` to make an error go away.
- **Sessions** — second login invalidates the first, by design. Tokens never in `localStorage`
  or a URL.
- **Secrets** — `.env` via `_required_env`. Never hardcoded, logged, or returned in an error.
- **Uploads** — validate type and size, distrust the filename, never serve unauthenticated.
  Documents use the `.file` action with a signed token from `shared/uploads.py`.
- **API authz** — every new route and detail action gets explicit permissions.
- **Data exposure** — no student PII, grades, or financials in logs, error payloads, or AI
  prompts beyond need. Check what the serializer actually returns.
- **Rate limiting** — login, password reset, OCR, and any AI-backed or expensive endpoint.
- **Errors** — generic to the client, detail to the log. No stack traces, SQL, or internal paths.
  Don't leak whether an account exists.

Never widen a role set to silence a 403. Find which side of the matrix is wrong.

## Self-review before handing back

Review adversarially, as if someone else wrote it:

1. Does it do what was asked, and only that?
2. Unhappy paths: empty, null, duplicate, expired token, wrong role, concurrent request,
   external API down.
3. **Run it** — `manage.py check`, relevant `pytest`, `npm run lint`, `npm run test`. CI gates on
   all four; a change that fails them isn't done.
4. Re-read the security list against the diff.
5. What else did this break — a mirror model, a role constant in `src/utils/auth.js`, another
   service on the same table?
6. State what you verified, what you assumed, what still needs manual testing.

## Commands

Backend commands run from a service directory with the repo-root `.venv` active
(`.venv\Scripts\activate`). Each service pins its own `DJANGO_SETTINGS_MODULE` in `pytest.ini`,
so `pytest` from the repo root will not work.

```sh
cd backend/<service>            # identity-service | student-service | enrollment-service | billing-service
python manage.py runserver 8001 # identity 8001 · student 8000 · billing 8002 · enrollment 8003
python manage.py check
pytest                                    # service · add path::test or -k "guardian" to narrow

cd frontend/admin-portal
npm run dev   # 5173
npm run lint  # eslint          npm run test  # vitest run          npm run build
npx vitest run src/api/apiClient.test.jsx

# Overdue installments — nothing schedules this; see README.
cd backend/billing-service && python manage.py flag_overdue_installments

# Regenerate the schema snapshot after a pgAdmin change (strip pg_dump 17+'s restrict lines)
pg_dump -h localhost -U postgres -d "SLIS THESIS FINAL" --schema-only --no-owner --no-privileges -f schema.sql
```

`SECRET_KEY` is `_required_env` — a service won't start or test without it. Each service reads
its own `backend/<service>/.env`; any value works for a throwaway command
(`SECRET_KEY=dev-only-check pytest`), but a running stack needs the **same** value in all four.

CI (`.github/workflows/ci.yml`), all hard gates — per service: `pip-audit`, `manage.py check`,
`check --deploy`, `pytest`; frontend: `npm audit --audit-level=high`, `lint`, `test`, `build`.

## Architecture

Four Django/DRF services plus one React/Vite SPA. **The service split is a process boundary, not
a data boundary** — all four share one PostgreSQL database (`SLIS THESIS FINAL`) and one JWT
signing key, so any service can read any table. Two consequences:

**Mirror models.** A service needing another's table declares a local `managed = False` model by
`db_table`: `billing/enrollment_mirror.py` (`students`, `enrollments`, `scholarship_types`),
`billing/guardian_mirror.py` and `accounts/guardian_mirror.py` (`guardians`),
`student-service/accounts/enrollment_mirror.py` (`enrollments`, `section_advisories`). These are
read models of someone else's table — adding a column to a mirror without adding it to the owner
is how they drift. Grep `db_table = "<table>"` across `backend/`; the service with the full field
set owns it.

**`schema.sql` is the source of truth for table structure, not migrations.** It's a
`pg_dump --schema-only` snapshot of a schema built in pgAdmin, carrying two validation triggers
and the `student_invoice_balances` view that Django cannot see at all — a write can be silently
rejected at the DB level, so check the trigger before blaming the ORM. 33 models are
`managed = False`; the real migrations are all in enrollment-service (`ai` risk tables,
`attendance`, `academic_calendar`, and `enrollments`' `section_advisories` /
`enrollment_transfers` / `email_delivery_failures` / `guardian_responses`). Schema changes go through pgAdmin or a
reviewed script in `scripts/`, then `schema.sql` is regenerated. Every change needs a stated
rollback; money and grade tables (`invoices`, `installments`, `payments`, `grades`) get extra
scrutiny. Index what you filter and join on; flag any new per-row query in a loop.

### backend/shared/

On `sys.path` only because each `settings.py` does `sys.path.insert(0, str(BASE_DIR.parent))`
before importing `shared.*`.

- `permissions.py` — `HasRole`, `IsAdminRegistrarOrReadOnly`
- `authentication.py` — `SingleSessionJWTAuthentication` (enforces `sid` against
  `users.current_session_id`; a second login anywhere kills the first session's tokens)
- `audit.py`, `request_id.py`, `logging_config.py`, `cache.py`, `exception_handler.py`,
  `health.py`, `uploads.py`, `resilience.py` · `user_stub.py` is dead code

identity-service is the exception to several: no `AUTH_USER_MODEL`, its own
`accounts.permissions.HasRole`, and manual caller resolution in
`accounts.audit.resolve_user_from_request()`.

### Authorization

Six roles (`shared/roles.py`): `super_admin`, `admin`, `registrar`, `teacher`, `accounting`,
`guardian`. `HasRole` is `DEFAULT_PERMISSION_CLASSES` everywhere and **fails closed** — a view
with no `required_roles` denies everyone. Any-authenticated views set
`ALLOW_ANY_AUTHENTICATED_ROLE = True`; wider-read views set `read_roles` alongside
`required_roles`.

Row scoping lives in each service's `accounts/permissions.py`: `teacher_student_ids()` scopes
teachers through `section_advisories` (no advisory row means the teacher sees *nothing* — which
is why the seed creates advisories), `guardian_student_ids()` scopes guardians through
`guardians.user_id`.

The frontend mirrors this in `src/utils/auth.js` (`STAFF_ADMIN`, `ACADEMIC_STAFF`, `GRADE_ROLES`,
`BILLING_ROLES`, `STAFF_ALL`) via `<PrivateRoute allowedRoles>` in `App.jsx`. **Changing a
backend role set means changing the matching constant here** — otherwise the route renders and
every request inside it 403s.

### Frontend

- **New pages use `lazyRoute()` in `App.jsx`, never a static `import`** — a static import pulls
  the page into the entry chunk for every user, guardians included. `LoginPage` and
  `NotFoundPage` are deliberately eager.
- `src/api/apiClient.js` is the only place token attach + 401-refresh lives; don't add token
  handling or a second axios instance outside `src/api/`. Its refresh mutex is **module-level on
  purpose** — each backend has its own instance, so a per-client mutex would allow one refresh
  per service. Public clients (`applyApi.js`) pass `redirectOnAuthFailure: false`.
- One API module per backend. Layouts (`AppLayout`, `GuardianLayout`) mount once as shell routes,
  with `Suspense` *inside* the shell so navigation never blanks the sidebar.

## Traps

- **Every service has an app named `accounts`**, but `django_migrations` is keyed by
  `(app_label, migration_name)` in the one shared DB. `accounts.0001_initial` is recorded once;
  three copies have never run. Harmless only while all are `managed = False`. **Do not add a real
  migration to any `accounts` app** before resolving this (README).
- **No working pytest-django test database** — `managed = False` models carry real FKs that
  `create_test_db()` can't build. Tests work around it: pure functions
  (`billing/test_services.py`, `ai/test_risk_assessment.py`), `APIRequestFactory` +
  `SimpleNamespace` users for permissions, `Model._meta` assertions for structure. Follow that
  instead of `@pytest.mark.django_db` on a `managed = False` model.
- enrollment-service has a Django app `requirements/` next to `requirements.txt` and a
  `requirements/` directory. Check which a path means.
- **Never re-add `static(MEDIA_URL, ...)`** to `student_service/urls.py` or
  `enrollment_service/urls.py` — it served every uploaded student document unauthenticated.
- Demo data is **SY 2025-2026, 1st Quarter**; analytics and class lists default to the current
  school year, which is empty. "It returns nothing" is usually this.
