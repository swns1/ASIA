"""
Settings for enrollment_service.

Critical compat with identity-service:
- SECRET_KEY must match identity-service so SimpleJWT can verify tokens
  (SimpleJWT signs with settings.SECRET_KEY when SIGNING_KEY isn't set).
- USER_ID_FIELD = "user_id" matches the `users` table primary key.
- Database connection points at the same Postgres instance.
"""
import os
import sys
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# Makes backend/shared/ importable as `shared.*` — see backend/shared/.
sys.path.insert(0, str(BASE_DIR.parent))

from shared.logging_config import build_logging  # noqa: E402 — needs the sys.path insert above


# ─── tiny .env loader (no external dep) ─────────────────────────────────────
def _load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


_load_env(BASE_DIR / ".env")


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


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


# ─── Core ───────────────────────────────────────────────────────────────────
SECRET_KEY = _required_env("SECRET_KEY")

# Both used to be hardcoded (DEBUG = True, ALLOWED_HOSTS = ["*"]), which
# meant there was no way to ever turn either off — including in whatever
# production deployment eventually runs this. Set DEBUG=1 in .env for local
# development (see .env.example); leaving it unset defaults to the safe,
# production-appropriate value.
DEBUG = _env_bool("DEBUG", False)

ALLOWED_HOSTS = [h.strip() for h in env("ALLOWED_HOSTS", "").split(",") if h.strip()]

# Off by default: nothing in this stack terminates TLS yet (no reverse proxy,
# no Dockerfile — see README) and one documented use case is a phone on the
# same LAN reaching this service over plain HTTP during development/testing.
# Turning SECURE_SSL_REDIRECT or SECURE_HSTS_SECONDS on without HTTPS actually
# working in front of this process breaks *all* access, not just insecure
# access — only enable these once a real HTTPS-terminating deployment exists.
SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", False)
SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", False)
CSRF_COOKIE_SECURE = _env_bool("CSRF_COOKIE_SECURE", False)
SECURE_HSTS_SECONDS = int(env("SECURE_HSTS_SECONDS", "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = _env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = _env_bool("SECURE_HSTS_PRELOAD", False)


# ─── Apps ───────────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Required by RequirementType's ArrayField columns (requirement_types
    # .applies_to_levels / .applies_to_entry_statuses). Contributes no models
    # and no migrations — Django's postgres.E005 system check simply refuses
    # ArrayField unless the app is installed.
    "django.contrib.postgres",

    # 3rd-party
    "rest_framework",
    "rest_framework_simplejwt",
    "django_filters",
    "corsheaders",

    # local
    "accounts",
    "ai",
    "enrollments",
    "subjects",
    "grades",
    "scholarships",
    "grading",
    "requirements",
    "academic_calendar",
    "attendance",
    "dashboard",
]

MIDDLEWARE = [
    # First, so every line any later middleware/view/exception handler logs
    # for this request carries its request ID. See shared/request_id.py.
    "shared.request_id.RequestIDMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "enrollment_service.audit.AuditLogMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "enrollment_service.urls"
WSGI_APPLICATION = "enrollment_service.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# ─── Database (SAME as identity-service) ────────────────────────────────────
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


# ─── Custom user model ──────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"


# ─── DRF ────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "shared.authentication.SingleSessionJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "accounts.permissions.HasRole",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    # ── Rate Limiting ─────────────────────────────────────────────────────
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon":    "30/minute",   # unauthenticated (should be rare)
        "user":    "300/minute",  # authenticated — shared across 9 sub-apps, raised from 120 to stop false 429s on normal staff usage
        "cluster": "20/minute",   # clustering is CPU-heavy but needs room for iteration
        # Signed document downloads (requirements/views.py::file). These are
        # fetched by <img>/<iframe> and so arrive without an Authorization
        # header, which put them on the 30/min anon bucket — one student's
        # document panel could exhaust it, and a school behind a single NAT
        # address shared that budget building-wide. Access is controlled by
        # the short-lived signed token, not by this limit; the limit only
        # needs to stop a runaway loop.
        "document_download": "240/minute",
    },
    # ─────────────────────────────────────────────────────────────────────
    "DEFAULT_PAGINATION_CLASS": "enrollment_service.pagination.StandardPagination",
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


# ─── SimpleJWT (mirrors identity-service) ───────────────────────────────────
SIMPLE_JWT = {
    "USER_ID_FIELD": "user_id",
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    # Algorithm + signing key default to HS256 + settings.SECRET_KEY,
    # which is exactly what identity-service uses. Don't override.
}


# ─── CORS ───────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True


# ─── Misc ───────────────────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Django 5.1 removed STATICFILES_STORAGE in favour of STORAGES, and Django 6
# ignores the old name in silence -- so this service read as "configured for
# whitenoise's compressed manifest storage" while actually getting plain
# StaticFilesStorage: no compression, no cache-busting hashes. Declared here it
# takes effect, which makes `collectstatic` mandatory before serving, since
# manifest storage raises on any static file it holds no hash for.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

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

# Uploaded requirement documents land here. This was previously UNSET, which
# left Django's global MEDIA_ROOT default ('') in effect — FileSystemStorage
# resolved that relative to whatever directory `manage.py` was launched from
# (this app's own source folder), which is why dozens of uploaded files ended
# up committed inside requirements/. See requirements/serializers.py::_save_file.
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"


# ─── External APIs ───────────────────────────────────────────────────────────
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
GROQ_API_KEY   = os.environ.get("GROQ_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# See shared/logging_config.py. Console + a rotating file under logs/,
# structured as JSON outside local dev, every record tagged with the request
# ID shared.request_id.RequestIDMiddleware assigns.
LOGGING = build_logging(BASE_DIR, "enrollment-service", DEBUG)
