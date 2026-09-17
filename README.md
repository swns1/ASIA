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

- Python 3.12+ (Django 6 requires it; CI runs 3.12) and a virtualenv tool
- Node.js 20.19+ or 22.12+ (required by Vite 8)
- PostgreSQL (the scripts find `psql`/`pg_dump` under `C:\Program Files\PostgreSQL` even when they are not on `PATH`). The database is named `SLIS THESIS FINAL` unless `DB_NAME` in each service's `.env` says otherwise.

## Setup

### 1. Database

Fill in `backend/identity-service/.env` first (see Backend below) — the script
reads the database connection from it. Then, from the repository root:

```powershell
.\scripts\setup-db.ps1 -Demo     # development / demo: schema + reference data + demo data
.\scripts\setup-db.ps1           # real install: schema + reference data only
```

What it does, in order — the manual equivalent if you cannot run it:

1. `CREATE DATABASE` (it refuses to touch a database that already exists; pass `-DbName` to rehearse on a throwaway one).
2. Loads `schema.sql`.
3. Runs `manage.py migrate --fake` in every service. `schema.sql` already contains every table Django's migrations would create, but a schema-only dump leaves `django_migrations` empty, so a plain `migrate` stops with *relation already exists*. Because all four services have an app labelled `accounts` sharing that one table (see *Known in-progress work*), identity's `accounts 0001_create_audit_log` and student's `accounts 0001_initial` are faked **first**, then all four services in full — any other order fails with `InconsistentMigrationHistory`.
4. Loads `scripts/reference_data.sql` — the requirement catalogue, grading templates, the DepEd observed-value categories and a default school-settings row. A real install needs these; nothing else creates them.
5. With `-Demo` only: loads `seed_data.sql` (demo learners, grades, attendance and the six accounts below). It includes `reference_data.sql` itself, so `psql -f seed_data.sql` alone also still works on a database that already has the schema.

`scripts/2026-09-*.sql` are **not** part of a fresh install — `schema.sql` already contains both. They exist only to upgrade a database created before September 2026; run them there once, in date order.

For a real install, create the first account afterwards (there is no `createsuperuser`: accounts live in identity-service's own `users` table):

```powershell
cd backend\identity-service
..\..\.venv\Scripts\python.exe manage.py manage_accounts create-admin --email you@school.edu.ph --name "Your Name"
```

Then set the school address and school-year dates on **Billing Settings**, and add the curriculum on **Subjects** — the demo's twenty subjects are demo data, not a full curriculum.

#### Demo accounts

`seed_data.sql` creates six accounts, one per role, all with the password
**`SlisDemo2026!`**:

| Email | Role | Notes |
|---|---|---|
| `superadmin@slis.test` | super_admin | |
| `admin@slis.test` | admin | |
| `registrar@slis.test` | registrar | |
| `teacher@slis.test` | teacher | Adviser of Grade 4-A, Grade 6-A and Grade 7-Diamond (SY 2025-2026). A teacher with no `section_advisories` row sees empty class lists, grades and attendance — the scoping fails closed — so the seed creates those advisories too. |
| `accounting@slis.test` | accounting | |
| `maribel.reyes.seed@gmail.com` | guardian | Parent portal (`/guardian`). Linked to two children, one of whom has two school years, so the one-card-per-child grouping is visible. |

These accounts are matched **by email**, not by a fixed `user_id`: the seed
creates them if absent and resets the role and password if present. An earlier
version pinned them to ids 1-6, which meant that on any database that already
had users the ids collided, `ON CONFLICT DO NOTHING` skipped every row, and
these credentials silently did not exist.

> These are evaluation credentials committed to a public repo. On any database
> that holds real data, lock them (this replaces their passwords with an
> unusable hash and signs them out; re-running `seed_data.sql` unlocks them):
>
> ```powershell
> cd backend\identity-service
> ..\..\.venv\Scripts\python.exe manage.py manage_accounts lock-demo
> ```
>
> `manage_accounts set-password --email ...` changes any single account's password instead.

The seed also populates `subjects` and `users` (and, through
`scripts/reference_data.sql`, `grading_templates` and `grading_components`) —
without those, the `grades` rows violate their subject foreign key, the opening
`BEGIN;` rolls the whole file back, and there is no account to log in with.

**Demo data lives in SY 2025-2026, 1st Quarter.** Analytics and the class lists
default to the current school year, which has no seeded data; select
2025-2026 / 1st Quarter to see populated results.

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
python manage.py migrate      # after setup-db.ps1 this applies nothing; it picks up migrations added later
python manage.py runserver <port from the table above>
```

Each service still needs its own `.env` (see `.env.example` in each service directory for the full list of variables). **`SECRET_KEY` must be the exact same value in all four `.env` files** — generate one value and reuse it everywhere:

```sh
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

`enrollment-service` additionally needs `GEMINI_API_KEY` and `GROQ_API_KEY`; `student-service` needs `GROQ_API_KEY`. Ask a teammate for current values or provision your own at Google AI Studio / Groq.

The enrollment confirmation email goes out over plain SMTP (`django.core.mail`, i.e. Python's `smtplib`) using the `EMAIL_*` settings in `enrollment-service/.env` — by default a Gmail or Google Workspace mailbox with an **App Password** (turn on 2-Step Verification, then Google Account → Security → App passwords). That reaches any recipient, up to about 500 messages a day on Gmail or 2,000 on Workspace, and the machine needs internet access on port 587. Leave `EMAIL_HOST_USER` blank to switch email off: enrollment still saves, and staff are told the confirmation was not sent. For development, `EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend` prints messages to the terminal instead. (This replaced Resend, whose shared test sender only delivers to the Resend account owner — confirmations never reached real families.)

`DEBUG` and `ALLOWED_HOSTS` are also read from `.env` now rather than hardcoded — `.env.example` already sets `DEBUG=1` and `ALLOWED_HOSTS=*` for local development (the `*` is what lets a phone on the same LAN reach a service by IP address during testing). Leaving either unset defaults to the safe, production-appropriate value (`DEBUG=False`, no hosts allowed), so a real deployment needs to set both explicitly — along with `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, and `SECURE_HSTS_SECONDS`, all opt-in and off by default because nothing in this stack terminates TLS yet. Each service also exposes `GET /health/` (checks DB connectivity, no auth required) and caches DRF throttle counters to a local `cache/` directory (`django.core.cache.backends.filebased.FileBasedCache`) instead of the previous per-process in-memory default, so rate limits hold up across more than one worker process on the same machine.

**Logging is real now, not just present.** All four services previously ran with no `LOGGING` setting at all, which meant two different kinds of silence: app code (`shared/audit.py`, the OCR pipeline, etc. — 10 modules call `logger.*`) had no handler anywhere in its chain and fell through to Python's bare, unformatted `stderr` fallback with nothing below `WARNING` shown; and Django's own unhandled-request-exception logging (`django.request`) was routed by Django's default to `mail_admins`, which does nothing at all since `ADMINS` is unset everywhere — so a 500 under `DEBUG=False` reached neither. `shared/logging_config.py` gives every service two always-on sinks instead: console, and a size-rotated file under `<service>/logs/` (gitignored, per-machine, like `cache/`) — JSON outside local dev, a short human-readable line under `DEBUG=1`. Every record carries a request ID: `shared/request_id.py`'s `RequestIDMiddleware` runs first in `MIDDLEWARE` in all four services, assigns one per request, returns it as an `X-Request-ID` response header, and includes it in the generic 500 body (`shared/exception_handler.py`) — so a user's bug report can become "grep this ID" instead of guessing which line, in which of the four services, matches their timestamp.

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

## Deployment

What is documented here is a **LAN deployment**: the four services plus the
built frontend running on one Windows machine at the school, reachable from
staff computers and from phones on the school Wi-Fi. It is not a public
internet deployment — nothing in this stack terminates TLS, and nothing
outside the school network can reach it. For access from outside the school,
see [Deploying to Railway](#deploying-to-railway).

Every script below is in `scripts\` and run from the repository root in
PowerShell.

| Script | What it does |
|---|---|
| `setup-db.ps1` | Builds a new database (see Setup → Database). |
| `serve-lan.ps1` | Preflight checks, then starts the services (`-Frontend` adds the app, `-Background` runs hidden with output in `logs\`, `-Check` only checks). |
| `stop-lan.ps1` | Stops whatever `serve-lan.ps1` started. |
| `health-check.ps1` | Polls every service (and the app, if served) on the LAN address. |
| `backup.ps1` / `restore.ps1` | Database dump plus uploaded documents; restore into a new database or `-Replace`. |
| `install-startup-task.ps1` | Run as administrator once: start on boot, nightly jobs, firewall rule. |

### Before the first deploy

1. **Rotate the Gemini API key** — a live one is in git history (commit `5bcd352`).
2. **Lock the demo accounts** if the database was loaded with `-Demo` (`manage_accounts lock-demo`, see Setup), and create a real super admin.
3. Keep the repo private until the files noted under *Known in-progress work* are purged from history.

### 1. Environment

Find the machine's LAN address with `.\scripts\serve-lan.ps1 -Check` (it picks
the adapter with the default route, skipping Hyper-V/WSL/VPN adapters). Give the
machine a **fixed** address (a DHCP reservation on the router): the address is
baked into the frontend build and into every QR code the registrar prints.

In **each** `backend/*/.env` (example address `192.168.1.42`):

```ini
DEBUG=0
ALLOWED_HOSTS=192.168.1.42,localhost
CORS_ALLOWED_ORIGINS=http://192.168.1.42:4173
```

Additionally:

| File | Setting | Why |
|---|---|---|
| `student-service/.env` | `FRONTEND_BASE_URL=http://192.168.1.42:4173` | The applicant QR code and link are built from it. Left at the default (localhost), a parent's phone opens nothing — the invite window warns about this. |
| `enrollment-service/.env` | `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` (and optionally `DEFAULT_FROM_EMAIL`) | Enrollment confirmation email; see Backend setup. Blank = email off. |
| `student-service/.env` and `enrollment-service/.env` | `MEDIA_ROOT=C:\SLIS-Data\media` (same value in both) | Both services store requirement documents; one shared folder keeps every document readable by either. Optional — the default is each service's own `media\`. |

`SECRET_KEY` must still be identical across all four. Leave every `SECURE_*`
flag **off** for a plain-HTTP LAN run — `SECURE_SSL_REDIRECT=1` without HTTPS
makes every page unreachable. `NUM_PROXIES` stays `0` with no proxy in front.

`ALLOWED_HOSTS` is not optional once `DEBUG=0`: an empty list rejects every
request, which looks exactly like the service being down. `serve-lan.ps1`
warns about `DEBUG=1`, `ALLOWED_HOSTS=*`, a missing LAN address in
`ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS`, and a localhost `FRONTEND_BASE_URL`.

### 2. Collect static files

```powershell
foreach ($s in 'identity','student','billing','enrollment') {
  Push-Location "backend\$s-service"
  ..\..\.venv\Scripts\python.exe manage.py collectstatic --noinput
  Pop-Location
}
```

Required, not optional. Static files go through whitenoise's
`CompressedManifestStaticFilesStorage`, which raises on any file it has no hash
for — skip this and `/admin/` and the DRF browsable API break at request time.

### 3. Build the frontend

The production build **must** be given the API URLs — `vite build` aborts
without them rather than silently baking in `localhost`:

```powershell
cd frontend\admin-portal
$env:VITE_IDENTITY_API_URL   = "http://192.168.1.42:8001/api/auth"
$env:VITE_STUDENT_API_URL    = "http://192.168.1.42:8000/api"
$env:VITE_BILLING_API_URL    = "http://192.168.1.42:8002/api"
$env:VITE_ENROLLMENT_API_URL = "http://192.168.1.42:8003/api"
npm run build
cd ..\..
```

Rebuild whenever the code or the machine's address changes — `serve-lan.ps1
-Frontend` warns when `dist\` is older than `src\` or still calls localhost.

### 4. Start and verify

```powershell
.\scripts\serve-lan.ps1 -Frontend
.\scripts\health-check.ps1
```

waitress, not gunicorn: gunicorn stays pinned for a future Linux host but does
not run on Windows. Each service binds `0.0.0.0` so the LAN can reach it. The
app is served by `vite preview` on port 4173 (configured in `vite.config.js` to
listen on every interface, accept the machine's name as well as its IP, and
fall back to `index.html` so refreshing any page works). Each process opens in
its own window; close them, or run `.\scripts\stop-lan.ps1`, to stop.

`health-check.ps1` must report every service `{"status": "ok"}` and the
frontend `200`. A `503` means the service is up but the database is
unreachable; a `400` means the address is missing from `ALLOWED_HOSTS`. Then
open `http://192.168.1.42:4173` from another computer and from a phone on the
school Wi-Fi, and log in.

#### How many users it handles

Measured with a load test on a Ryzen 5 5600 (6 cores, 16 GB) running the
services and PostgreSQL 17 together. The test used school-sized data: 652
learners, a full year of attendance (186,000 rows), grades, invoices, 400
parent accounts and 50 staff. A parent's visit is the portal home page plus
one child's page (five requests). A staff visit is the dashboard (six or
seven).

| Scenario | Result |
|---|---|
| 400 parents open the portal over 2 minutes, while 50 staff reload the dashboard every 10 seconds | 0 errors; a parent's page loads in 0.07 s (95% within 0.10 s) |
| All 400 parents within 30 seconds, same staff | 0 errors; 0.08 s (95% within 0.11 s) |
| 100 parents sign in at the same moment | all 100 succeed within 8 s |
| Load until it gives | about 250 requests a second — roughly 50 parent page loads a second |

`serve-lan.ps1` starts waitress with 16 threads, 450 connections and a
20-second idle timeout (`-Threads`, `-ConnectionLimit`, `-ChannelTimeout`).
With waitress's defaults (4 threads, 100 connections), 44% of requests in the
first scenario failed: browsers keep connections open between clicks, and 50
staff alone nearly filled the enrollment service's 100. Each thread holds a
PostgreSQL connection — 4 services × 16 = 64 of PostgreSQL's default 100 — so
raise `max_connections` before raising `-Threads`. `-ConnectionLimit` must
stay under 500; Python on Windows cannot watch more sockets than that.

**Parents at home.** The numbers above assume everyone can reach this
machine, which on the LAN means being on the school network. For parents to
use the portal from home, use the hosted copy
([Deploying to Railway](#deploying-to-railway)); it runs the same code, with
gunicorn sized the same way.

### 5. Run it unattended

From an **elevated** PowerShell, once:

```powershell
.\scripts\install-startup-task.ps1
```

This registers, under Task Scheduler's `SLIS` folder, tasks that run as SYSTEM
(no one needs to be logged in):

| Task | When | Runs |
|---|---|---|
| `SLIS\Start` | at boot, after 1 minute | `serve-lan.ps1 -Frontend -Background` (output in `logs\`) |
| `SLIS\Overdue` | daily, 1:00 | billing `manage.py flag_overdue_installments` — without it, unpaid installments never turn `overdue` |
| `SLIS\Backup` | daily, 2:00 | `backup.ps1` |
| `SLIS\Cleanup` | Sundays, 3:00 | identity `manage.py clearsessions` and `axes_reset_logs --age 90` |

It also adds the inbound firewall rule **SLIS (LAN)** for TCP 8000-8003 and
4173 on **Private** networks only, and warns if the current network is
classified as Public (in which case the rule does not apply — set the school
network to Private). Start immediately with
`Start-ScheduledTask -TaskPath '\SLIS\' -TaskName Start`; remove everything
with `-Uninstall`.

### 6. Backups

`backup.ps1` writes `backups\<timestamp>\` containing `database.dump`
(`pg_dump` custom format) and a zip of the uploaded documents, and deletes
backup folders older than 14 days (`-KeepDays`). **Copy `backups\` to another
drive or machine regularly** — a backup on the same disk does not survive that
disk failing. `backups\` is gitignored; it holds every student's data.

Restoring:

```powershell
# Into a new database, leaving the live one untouched (check it first):
.\scripts\restore.ps1 -BackupFolder backups\2026-09-17_020000
# Over the live database and document folders (stop the services first):
.\scripts\stop-lan.ps1
.\scripts\restore.ps1 -BackupFolder backups\2026-09-17_020000 -Replace
```

### Applicant form: parent's phone or school device

Families fill in the student information form themselves. There is no app to
install and no email involved:

1. The registrar opens **Student Applications → issue invite**. The window shows
   a large **QR code**, the one-time **access code**, and the link as a backup.
2. The parent joins **the same network as the SLIS machine** — normally the
   school Wi-Fi — and scans the QR code with their camera; the form opens in
   the phone's browser.
3. The registrar reads out (or writes down) the access code; the parent enters
   it and fills in the form. The link alone opens nothing — the code is the
   second factor, and it locks after five wrong attempts.

If the camera can't scan, the registrar copies the link and sends it by
Messenger or SMS — never together with the code. **Print slip** prints the QR
code, code and expiry (invites last 3 days) for a family that will finish
another day; the code is shown only once, so the slip is how they keep it.

For a family without a phone, **Open form on this device** opens the form on
the school's own tablet or PC. After the code, the registrar confirms the
hand-over, which signs the staff account out on that device. A device handed
over this way behaves as a kiosk until the five-tap exit on the form header: the
form resets itself after 3 minutes idle and after each submission. On a
parent's own phone neither happens — the draft autosaves and stays.

To lock a school device to the form, run the browser in kiosk mode, e.g.
`msedge --kiosk http://192.168.1.42:4173/login --edge-kiosk-type=fullscreen`,
or use screen pinning on an Android tablet.

#### Trying the QR before there is a school network

The QR needs a shared network, not the school's specifically. Two ways to test
it anywhere, including from a laptop with no LAN:

- **Phone hotspot.** Turn on the phone's hotspot and connect the SLIS machine
  to it. Both are then on one network and the QR works as it will at the
  school. Re-check the address afterwards: it changes with the network.
- **Home Wi-Fi**, exactly as the school one is described above.

Either way, **open the portal by the machine's network address**, e.g.
`http://192.168.1.42:5173` (dev) or `:4173` (built) rather than `localhost`,
and the QR follows that address automatically — the invite window rewrites a
`localhost` link onto whatever address staff are using, so testing needs no
`.env` change. Serve the dev server on the network with
`npm run dev -- --host`, and add that origin to `CORS_ALLOWED_ORIGINS` in all
four `.env` files, or the app loads on the phone and every request fails.

Opening the portal on `localhost` leaves the QR pointing at `localhost`, which
only that computer can open; the invite window says so. Use **Open form on this
device** to try the form there instead.

A phone on **mobile data** cannot reach the system at all, wherever it is:
nothing here is on the internet. Publishing it would mean a public host or a
tunnel, and all four APIs with it — worth doing only if remote, at-home
applications become a requirement.

**If a phone can't open the link**, every one of these must hold — the phone
loads the page from port 4173 and then calls the APIs on 8000-8003 directly:

- the phone and the SLIS machine are on the same Wi-Fi / router (or hotspot);
- the router's *AP isolation* / *client isolation* (common on guest Wi-Fi) is off;
- the SLIS machine's network is set to **Private**, and the firewall rule exists (`install-startup-task.ps1`);
- `FRONTEND_BASE_URL`, `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` use the LAN address, and the frontend was built with it;
- a phone on mobile data cannot reach the system at all — by design.

## Deploying to Railway

For access from outside the school, which the guardian portal needs:
parents sign in from home. The LAN setup (above) costs nothing a month and
keeps student records on school property, but only devices on the school
network can reach it. On Railway's Hobby plan this setup costs roughly
$10–15 a month in usage.

Hosting changes who can *reach* the app, not who can use each part of it.
Staff pages still need a staff account, and a parent sees only their own
children. The applicant form still opens only with a link that staff issue,
plus the access code they give in person; the code expires in 3 days and
locks after 5 wrong tries.

Everything the platform needs is in the repository:

| File | Used by |
|---|---|
| `backend/Dockerfile` | the four API services and both scheduled jobs (`SLIS_SERVICE` picks which) |
| `frontend/admin-portal/Dockerfile` + `deploy/railway/Caddyfile` | the app, served by Caddy |
| `deploy/railway/backend.json`, `frontend.json` | build and health-check settings |
| `deploy/railway/overdue-cron.json`, `cleanup-cron.json` | the nightly and weekly jobs |

CI builds all of these images and starts each one the way Railway does, so a
broken image fails CI rather than a deploy.

### What behaves differently on Railway (already handled)

- **No SMTP.** Railway blocks outbound SMTP on the Free, Trial and Hobby plans, so the Gmail setup cannot connect. Use the HTTPS email backend, `shared.email_backends.BrevoEmailBackend`. Brevo's free plan needs no domain — verify a single sender address in its dashboard and use it as `DEFAULT_FROM_EMAIL`.
- **Everyone at the school shares one public address.** Once signed in, rate limits count per account, and the sign-in limit counts only *failed* attempts per address. So all the staff, or a room of parents at an orientation, can sign in at once, while a password-guessing sweep from one address is still stopped after ten misses a minute.
- **Each service runs 2 gunicorn processes × 8 threads** (`WEB_CONCURRENCY`, `GUNICORN_THREADS`). That is 64 database connections across the four services, within PostgreSQL's 100.
- **Everything arrives through a proxy.** With `NUM_PROXIES=1`, the services read the visitor's real address, which is used for rate limits, the audit log and login lockouts. They also treat the proxy's HTTPS as HTTPS. Without that setting, five wrong passwords from anyone would lock out everybody.
- **The app and the APIs are different sites** (separate `*.up.railway.app` names). The login cookie therefore needs `REFRESH_COOKIE_SAMESITE=None` on identity. The refresh endpoint then also refuses origins that aren't in `CORS_ALLOWED_ORIGINS`.
- **Health checks come over plain HTTP** from `healthcheck.railway.app`. That name must be in `ALLOWED_HOSTS`, and `/health/` is exempt from the HTTPS redirect.
- **Only enrollment-service stores uploaded documents**, so one volume is enough. Mount it at `/data` and set `MEDIA_ROOT=/data/media`. A service with a volume has a few seconds of downtime on each redeploy.
- **The local OCR scanner is not installed** in these images (it needs about 1 GB). Document checks use the Groq cloud path when `GROQ_API_KEY` is set.

### 1. Create the services

In one Railway project:

1. **Add PostgreSQL** and keep its name, `Postgres`.
2. **Add six services from this GitHub repository.** Leave *Root Directory* empty, so the build context is the repository root. Name them exactly as below, because the variable references in step 2 use these names:

   | Service | Settings → *Config file path* | Variables | Public domain |
   |---|---|---|---|
   | `identity` | `/deploy/railway/backend.json` | `SLIS_SERVICE=identity` | yes |
   | `student` | `/deploy/railway/backend.json` | `SLIS_SERVICE=student` | yes |
   | `billing` | `/deploy/railway/backend.json` | `SLIS_SERVICE=billing` | yes |
   | `enrollment` | `/deploy/railway/backend.json` | `SLIS_SERVICE=enrollment` | yes |
   | `frontend` | `/deploy/railway/frontend.json` | see step 2 | yes |
   | `overdue` | `/deploy/railway/overdue-cron.json` | `SLIS_SERVICE=billing` | no |

   Optionally add `cleanup` (`/deploy/railway/cleanup-cron.json`, `SLIS_SERVICE=identity`, no domain). It clears old sessions and login logs weekly.
3. **On `enrollment`, add a volume** mounted at `/data`.
4. **Generate a public domain** for the five services marked *yes*.

### 2. Set the variables

**Shared variables** — referenced by every API service and both jobs:

```ini
SECRET_KEY=<one long random value; python -c "import secrets; print(secrets.token_urlsafe(50))">
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_NAME=${{Postgres.PGDATABASE}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DEBUG=0
NUM_PROXIES=1
SECURE_SSL_REDIRECT=1
SESSION_COOKIE_SECURE=1
CSRF_COOKIE_SECURE=1
```

**Every API service** (`identity`, `student`, `billing`, `enrollment`), in addition:

```ini
ALLOWED_HOSTS=${{RAILWAY_PUBLIC_DOMAIN}},healthcheck.railway.app
CORS_ALLOWED_ORIGINS=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
```

**Per service:**

| Service | Variables |
|---|---|
| `identity` | `REFRESH_COOKIE_SAMESITE=None` |
| `student` | `FRONTEND_BASE_URL=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}`, `GROQ_API_KEY`, `GEMINI_API_KEY` |
| `enrollment` | `MEDIA_ROOT=/data/media`, `EMAIL_BACKEND=shared.email_backends.BrevoEmailBackend`, `BREVO_API_KEY`, `DEFAULT_FROM_EMAIL=South Lakes Integrated School <your-verified-sender@...>`, `GROQ_API_KEY`, `GEMINI_API_KEY` |
| `frontend` | the four API addresses, baked in when it builds (below) |

```ini
VITE_IDENTITY_API_URL=https://${{identity.RAILWAY_PUBLIC_DOMAIN}}/api/auth
VITE_STUDENT_API_URL=https://${{student.RAILWAY_PUBLIC_DOMAIN}}/api
VITE_BILLING_API_URL=https://${{billing.RAILWAY_PUBLIC_DOMAIN}}/api
VITE_ENROLLMENT_API_URL=https://${{enrollment.RAILWAY_PUBLIC_DOMAIN}}/api
```

The frontend's addresses are fixed at build time, so **redeploy `frontend`**
whenever an API service's domain changes.

### 3. Load the database (once)

Railway's database already exists and is empty. From this PC, copy the Postgres
service's `DATABASE_PUBLIC_URL` and run:

```powershell
.\scripts\setup-db.ps1 -DatabaseUrl "postgresql://postgres:...@....proxy.rlwy.net:12345/railway"          # real data
.\scripts\setup-db.ps1 -DatabaseUrl "postgresql://postgres:...@....proxy.rlwy.net:12345/railway" -Demo    # demo copy
```

It does the same five steps as a local install, and refuses a database that
already has tables. When it finishes, it prints the command that creates the
first admin against that database. For a demo copy, run
`manage_accounts lock-demo` the same way before sharing the link, since the demo
password is published here.

### 4. Deploy and check

Deploy the services. Each API service must pass its `/health/` check, and
`https://<frontend domain>` must show the login page. Log in, issue an
applicant invite, and scan the QR code from a phone **on mobile data**.
On Railway that works from any network.

**Backups:** Railway keeps the database, but a copy you hold yourself is
cheap:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -Fc -f slis-railway.dump "<DATABASE_PUBLIC_URL>"
```

Uploaded documents live on the `enrollment` volume.

**Your own domain (optional):** give the app `app.<domain>` and the APIs
`identity.<domain>` etc. The app and APIs then share one site, so identity can
keep `REFRESH_COOKIE_SAMESITE=Lax`. Update `ALLOWED_HOSTS`,
`CORS_ALLOWED_ORIGINS`, `FRONTEND_BASE_URL` and the four `VITE_*` URLs to match.

## Known in-progress work

- **RBAC**: backend endpoints (billing, grades, student records, etc.) and frontend routes are now role-gated per-page, with sensitive actions on shared pages (e.g. delete/promote) also hidden per-role at the button level. `HasRole` (both the shared copy used by billing/enrollment/student and identity-service's own) now fails closed if a view omits `required_roles` — it used to silently allow any authenticated user, guardians included; a view that genuinely wants that must set `ALLOW_ANY_AUTHENTICATED_ROLE = True` explicitly. `backend/shared/` now also holds `authentication.py` (`SingleSessionJWTAuthentication`, de-duplicated from three per-service copies) and `health.py`; `user_stub.py` remains unused dead code (see git history/audit notes for why).
- **Clustering analytics** (`enrollment-service/ai/`): K-means clustering of student performance is implemented and wired into the UI (`AnalyticsPage`). Runs are now persisted (`RiskAssessmentRun` / `StudentRiskScore`) and the at-risk score is anchored to DepEd decision thresholds rather than free hyperparameters, but the component weights in `ai/services.py` are still hardcoded rather than configurable per school.

- **Flipping the remaining `managed = False` models to `managed = True` needs the `accounts` app-label collision resolved first — not a decision to make in passing.** All four services independently define a local app named `accounts` (their own `User` stub, hand-copied per service — see `backend/shared/`'s notes above), but Django's migration bookkeeping (`django_migrations`) is keyed by `(app_label, migration_name)` in the **one shared database**, not per-service. Checked directly against the real DB: `accounts.0001_initial` is recorded **once**, even though all four services carry a file by that name with different `CreateModel` contents — whichever service happened to migrate first "claimed" that row, and the other three's `0001_initial.py` has never actually executed. Harmless today only because every current `accounts` migration is `managed = False` (a no-op either way). It stops being harmless the moment any service's `accounts` app gets a real, executed migration: a same-named migration in a *different* service would read as "already applied" and silently skip its own `CREATE TABLE`, even against a genuinely empty database. Fix first (e.g. a distinct `AppConfig.label` per service), independently of and before any `managed = True` conversion work.
- **`schema.sql`** (repo root) is a `pg_dump --schema-only` snapshot of the real schema — see the Database setup section above. Verified by loading it into a throwaway database from scratch (0 errors, exact table/view count match). It's a complete, working substitute for `manage.py migrate` today, but doesn't by itself fix `pytest-django`'s automatic test-database creation, which still drives Django's own migration executor and hits the `django.contrib.admin` → `AUTH_USER_MODEL` wall documented in `enrollment-service/ai/test_risk_assessment.py`'s module docstring (that FK requires `users` to exist, and no *migration* creates it in student-service, billing-service, or enrollment-service). Closing that gap for real integration testing — without re-triggering the collision above — most likely means point pytest-django's `django_db_setup` fixture at `schema.sql` directly instead of at `manage.py migrate`, rather than converting all 55 tables to `managed = True`.

- **Sensitive documents in git history** — *needs a decision, not more code.* Removal from the tree is not removal from history, and these are all still reachable:
  - `ff09988 "final fixes before demo"`: a real scanned PSA birth certificate of a named minor (`OCR_IMAGES/4a4e4ed6-….jpg`) and a test document.
  - Real-looking uploads committed back when `MEDIA_ROOT` was unset and files landed in the source folder: `backend/enrollment-service/requirements/Salapare, Sean Wesley.png`, `pic_20260515181008_0*.jpg` and `c0ebea5a-….jpg`.
  - `backend/student-service/_test_doc.jpg`.

  Under RA 10173 these are sensitive personal information. `OCR_IMAGES/`, `media/` and `students/fixtures/*.jpg` are gitignored now, so nothing new is being added. Purging them (together with the leaked key below) requires:

  ```sh
  git filter-repo --invert-paths     --path OCR_IMAGES     --path backend/student-service/_test_doc.jpg     --path backend/student-service/students/fixtures/_test_doc.jpg     --path "backend/enrollment-service/requirements/Salapare, Sean Wesley.png"     --path-glob "backend/enrollment-service/requirements/*.jpg"     --path backend/enrollment-service/.env
  ```

  followed by a force-push of every branch, after which **every holder of `matres` / `niru` / `niel` must re-clone** — merging an old clone silently reintroduces the blobs. That coordination cost is why this has not been done unilaterally. (History also carries a committed `frontend/node_modules/`; adding `--path frontend/node_modules` to the same run shrinks the repository considerably.)

- **A live Gemini API key is also in git history** — same category as the birth certificate above, found during a later audit and not yet acted on. Commit `5bcd352 "AI Integration"` added `backend/enrollment-service/.env` containing a real `GEMINI_API_KEY`; `d802b93 "Remove .env from tracking"` removed the file from the tree but not from history, and the commit is still reachable from `origin/main`, `wes`, and every other remote branch. **Rotate this key at Google AI Studio** — that step doesn't wait on the `git filter-repo` purge above, though the two should happen in the same coordinated window since both need the same force-push-and-re-clone step.

- **Uploaded requirement documents used to be served unauthenticated** — fixed. `student_service/urls.py` and `enrollment_service/urls.py` no longer mount Django's public `static(MEDIA_URL, ...)` route (it served every file under `MEDIA_ROOT` to anyone, no login required, whenever `DEBUG` was on — which was always, since `DEBUG` was hardcoded). Documents are now served through an authenticated action gated by a short-lived, submission-scoped signed token (`backend/shared/uploads.py`), and uploads are validated by extension *and* magic bytes rather than trusting the filename. `DEBUG`/`ALLOWED_HOSTS`/the `SECURE_*` settings are now read from `.env` instead of being hardcoded — see the Backend setup section above.

- **Overdue installments are flagged by a scheduled job, not on read.** Flagging past-due installments used to run as a side effect of every `GET /api/installments/` — including a guardian just viewing their own child's account — which meant an unscoped, table-wide `UPDATE` ran on every page load, racing with `StudentPaymentViewSet`'s row lock during payment processing. It's now `python manage.py flag_overdue_installments`, which `install-startup-task.ps1` schedules daily (see Deployment). On a machine where that script has not been run, nothing invokes it and installments stay "pending" past their due date.

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
