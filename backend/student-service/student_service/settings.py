from pathlib import Path
import os
import sys
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Makes backend/shared/ importable as `shared.*` — see backend/shared/.
sys.path.insert(0, str(BASE_DIR.parent))

from shared.logging_config import build_logging  # noqa: E402 — needs the sys.path insert above

load_dotenv(BASE_DIR / ".env")


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Required environment variable '{name}' is not set. "
            "Copy .env.example to .env in this service's directory and fill in real values."
        )
    return value


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

def _env_int(name: str, default: int) -> int:
    """Read a whole number from the environment, falling back on anything unparseable."""
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = _required_env("SECRET_KEY")

# Both used to be hardcoded (DEBUG = True, ALLOWED_HOSTS = ["*"]), which
# meant there was no way to ever turn either off — including in whatever
# production deployment eventually runs this. Set DEBUG=1 in .env for local
# development (see .env.example); leaving it unset defaults to the safe,
# production-appropriate value.
DEBUG = _env_bool("DEBUG", False)

ALLOWED_HOSTS = [
    h.strip() for h in os.environ.get("ALLOWED_HOSTS", "").split(",") if h.strip()
]

# Off by default: nothing in this stack terminates TLS yet (no reverse proxy,
# no Dockerfile — see README) and one documented use case is a phone on the
# same LAN reaching this service over plain HTTP during development/testing.
# Turning SECURE_SSL_REDIRECT or SECURE_HSTS_SECONDS on without HTTPS actually
# working in front of this process breaks *all* access, not just insecure
# access — only enable these once a real HTTPS-terminating deployment exists.
SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", False)
SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", False)
CSRF_COOKIE_SECURE = _env_bool("CSRF_COOKIE_SECURE", False)
SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS", "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = _env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = _env_bool("SECURE_HSTS_PRELOAD", False)

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "accounts",
    "students",
    "intake",
]

AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    # First, so every line any later middleware/view/exception handler logs
    # for this request carries its request ID. See shared/request_id.py.
    "shared.request_id.RequestIDMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "student_service.audit.AuditLogMiddleware",
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'student_service.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'student_service.wsgi.application'

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]

# django-cors-headers' own default allowlist (accept, authorization,
# content-type, user-agent, x-csrftoken, x-requested-with) doesn't include
# X-Applicant-Token, the header the public /api/apply/... endpoints use to
# carry the applicant's session token (see intake/invites.py). Without this,
# the browser's CORS preflight for that header is rejected client-side with
# no server-side log at all — the request never even reaches Django.
from corsheaders.defaults import default_headers  # noqa: E402 — grouped with the CORS block it extends

CORS_ALLOW_HEADERS = (*default_headers, "x-applicant-token")

# Used to build the /apply/<invite_id> link handed back when a staff member
# issues an invite (see intake/views.py::_build_apply_url). The kiosk device
# won't always be the host the SPA is served from, so this can't be assumed
# to be one of the admin-portal origins above.
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173")

# How long an issued invite (link + access code) stays usable before a
# registrar has to re-issue it. 3 days covers an applicant finishing during
# the same visit and one who has to come back to the school another day.
APPLICATION_INVITE_TTL_SECONDS = int(os.environ.get("APPLICATION_INVITE_TTL_SECONDS", 3 * 24 * 3600))

# How long the token minted at the code gate (X-Applicant-Token) stays valid
# without an autosave renewing it. Short enough that a token copied out of
# one browser's storage is useless soon after; long enough that filling in
# six steps of a form doesn't time a real applicant out mid-way.
APPLICANT_SESSION_TTL_SECONDS = int(os.environ.get("APPLICANT_SESSION_TTL_SECONDS", 2 * 3600))

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "shared.authentication.SingleSessionJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "accounts.permissions.HasRole",
    ),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "student_service.throttles.StatelessUserRateThrottle",  # ← custom
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/minute",
        "user": "120/minute",
        "ocr":  "10/minute",
        # Public applicant-facing endpoints (intake/throttles.py) — each is
        # keyed per-invite, not per-IP, so these rates bound one applicant's
        # own traffic rather than the whole building's. A real form takes
        # several minutes; a bad-code brute force or an autosave loop gone
        # wrong is what these are for.
        "applicant_verify": "10/minute",
        "applicant_draft":  "60/minute",
        "applicant_submit": "5/minute",
    },
    "DEFAULT_PAGINATION_CLASS": "student_service.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "shared.exception_handler.safe_exception_handler",
    # 1: exactly one reverse proxy sits in front of this service in every
    # deployed environment (Render's load balancer). Governs both DRF
    # throttling's client identification (SimpleRateThrottle.get_ident) and
    # the audit log's recorded IP (shared.audit.client_ip reads this same
    # setting) — at 0, every client resolves to the proxy's IP, collapsing
    # AnonRateThrottle into one shared bucket and making the audit trail
    # useless. Revisit if a second proxy (e.g. a CDN) is ever added in front.
    # How many reverse proxies sit in front of this service. Env-driven for
    # the same reason DEBUG and the SECURE_* flags are: the right value is a
    # property of the deployment, not of the code.
    #
    # Defaults to 0 -- the local/demo posture, where nothing proxies these
    # services. That matters because DRF trusts the client-supplied
    # X-Forwarded-For for exactly NUM_PROXIES hops: with a non-zero value and
    # no real proxy, an attacker rotating that header gets an unlimited number
    # of throttle buckets, and the audit log's recorded ip_address becomes
    # attacker-controlled. Set NUM_PROXIES=1 in the environment when deploying
    # behind a single load balancer.
    "NUM_PROXIES": _env_int("NUM_PROXIES", 0),
}

SIMPLE_JWT = {
    "USER_ID_FIELD": "user_id",
}

DATABASES = {
    "default": {
        "ENGINE":   "django.db.backends.postgresql",
        "NAME":     os.environ.get("DB_NAME",     "SLIS THESIS FINAL"),
        "USER":     os.environ.get("DB_USER",     "postgres"),
        "PASSWORD": _required_env("DB_PASSWORD"),
        "HOST":     os.environ.get("DB_HOST",     "localhost"),
        "PORT":     os.environ.get("DB_PORT",     "5432"),
        # Both required against Supabase's Supavisor pooler in transaction
        # mode (port 6543): it multiplexes many clients over few real
        # backend connections and doesn't hold one open per session, so a
        # server-side cursor opened on one logical connection can vanish
        # before a later query on the "same" connection tries to read it.
        # CONN_MAX_AGE also matters even without a pooler — this app makes a
        # fresh Postgres connection per request otherwise, ×4 services.
        "CONN_MAX_AGE": 600,
        "DISABLE_SERVER_SIDE_CURSORS": True,
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
# All four services share one database; this used to be the only one of the
# four still on UTC while enrollment-service used Asia/Manila, so a request
# landing 00:00-08:00 PHT was "yesterday" to this service and "today" to
# that one.
TIME_ZONE = 'Asia/Manila'
USE_I18N = True
USE_TZ = True
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# DRF throttling (see DEFAULT_THROTTLE_CLASSES above) reads/writes through
# this cache. Without an explicit CACHES setting Django falls back to
# LocMemCache, which is per-process — under more than one worker process
# each gets its own independent throttle counters, silently multiplying the
# configured rate limit by the worker count and resetting it on every
# restart. FileBasedCache is shared by every process on the same machine
# (the only deployment shape this project currently has — see README) with
# no extra infrastructure (no Redis, no DB migration). It is not suitable
# across multiple machines; revisit if this ever runs load-balanced.
#
# The backend is shared.cache.ResilientFileBasedCache, not Django's own
# FileBasedCache: Django's set() has no atomic overwrite on Windows, so it
# truncates and re-streams the live cache file in place. A worker reading
# that file mid-write gets a half-written pickle, and the exception escapes
# the cache layer and 500s the request from inside DRF's throttle check.
# See shared/cache.py.
CACHES = {
    "default": {
        "BACKEND": "shared.cache.ResilientFileBasedCache",
        "LOCATION": str(BASE_DIR / "cache"),
    }
}

# See shared/logging_config.py. Console + a rotating file under logs/,
# structured as JSON outside local dev, every record tagged with the request
# ID shared.request_id.RequestIDMiddleware assigns.
LOGGING = build_logging(BASE_DIR, "student-service", DEBUG)
