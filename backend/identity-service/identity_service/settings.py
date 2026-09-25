import os
import sys
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_DIR = Path(__file__).resolve().parent.parent

# Makes backend/shared/ importable as `shared.*` — see backend/shared/.
sys.path.insert(0, str(BASE_DIR.parent))

from shared.logging_config import build_logging  # noqa: E402 — needs the sys.path insert above


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
# Health checks arrive over plain HTTP from inside the platform (Railway
# calls /health/ without X-Forwarded-Proto); redirecting them to HTTPS
# answers 301, which the platform reads as a failed deploy.
SECURE_REDIRECT_EXEMPT = [r"^health/$"]
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
    "axes",
    "accounts",
]

MIDDLEWARE = [
    # First, so every line any later middleware/view/exception handler logs
    # for this request — including axes' own lockout logging — carries its
    # request ID. See shared/request_id.py.
    "shared.request_id.RequestIDMiddleware",
    "axes.middleware.AxesMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'identity_service.urls'

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

WSGI_APPLICATION = 'identity_service.wsgi.application'

# Profile pictures travel as base64 data URIs inside JSON, which is a third
# larger than the image. Django's default request cap (2.5 MB) therefore
# refused any photo over ~1.87 MB, while the page and the view both promise
# 2 MB -- and the refusal surfaced as a 500. 3 MB fits a full 2 MB image
# plus the rest of the form. The view still enforces the 2 MB image limit.
DATA_UPLOAD_MAX_MEMORY_SIZE = 3 * 1024 * 1024

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "accounts.permissions.HasRole",
    ),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/minute",
        "user": "200/minute",
        "login": "10/minute",
        # Refresh and logout, per signed-in browser -- see
        # accounts.throttles.SessionRateThrottle.
        "session": "30/minute",
    },
    "EXCEPTION_HANDLER": "shared.exception_handler.safe_exception_handler",
    # NUM_PROXIES governs both DRF throttling's client identification
    # (SimpleRateThrottle.get_ident) and the audit log's recorded IP
    # (shared.audit.client_ip reads this same setting).
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

# Behind a hosting proxy (NUM_PROXIES >= 1, e.g. Railway) TLS ends at the
# proxy, which reports the original scheme in X-Forwarded-Proto. Trusting it is
# what lets request.is_secure() -- and with it SECURE_SSL_REDIRECT and the
# admin's CSRF origin check -- see HTTPS instead of looping or rejecting. Only
# safe when such a proxy really is in front, which a non-zero NUM_PROXIES is
# the assertion of; the LAN deployment leaves it at 0 and this stays unset.
if REST_FRAMEWORK["NUM_PROXIES"]:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# ✅ Token signed with this config
SIMPLE_JWT = {
    "USER_ID_FIELD": "user_id",
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=2),   # ✅ was 5 minutes
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True

# The refresh-token cookie (accounts/views.py). "Lax" suits every deployment
# where the app and this service share a *site*: the LAN setup (same host,
# different port) or app.<domain> + api.<domain>. When they sit on different
# sites -- two *.up.railway.app names are two sites -- browsers withhold a Lax
# cookie from the app's requests and every silent refresh fails, so set
# REFRESH_COOKIE_SAMESITE=None there. None is only accepted over HTTPS, so it
# always carries the Secure flag.
REFRESH_COOKIE_SAMESITE = os.environ.get("REFRESH_COOKIE_SAMESITE", "Lax").strip().capitalize()
if REFRESH_COOKIE_SAMESITE not in {"Lax", "Strict", "None"}:
    raise RuntimeError("REFRESH_COOKIE_SAMESITE must be Lax, Strict or None.")
REFRESH_COOKIE_SECURE = SESSION_COOKIE_SECURE or REFRESH_COOKIE_SAMESITE == "None"

# Lock out on the (ip, username) pair, not the IP alone: one person mistyping
# on the school's shared connection -- or behind a hosting proxy, where every
# request arrives from the proxy -- must not lock out everyone else in the
# building. The nested list is what makes it a pair: a flat
# ["ip_address", "username"] means "IP *or* username", which is exactly the
# shared-address lockout this is meant to avoid (axes logged "blocking by
# ip_address or username"). Spraying from many addresses is still slowed by
# LoginRateThrottle, and the login view resets exactly this pair on success.
AXES_LOCKOUT_PARAMETERS = [["ip_address", "username"]]
AXES_FAILURE_LIMIT = 5
AXES_LOCK_OUT_AT_FAILURE = True
AXES_COOLOFF_TIME = 1
AXES_RESET_ON_SUCCESS = True
# The client address the same proxy-aware way throttling and the audit log
# resolve it. Without this, axes reads REMOTE_ADDR, which behind a hosting
# proxy is the proxy itself for every visitor.
AXES_CLIENT_IP_CALLABLE = "shared.audit.client_ip"

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

# ModelBackend was here before but is dead weight in this service: it
# queries settings.AUTH_USER_MODEL, which is deliberately unset (see
# accounts/permissions.py), so it would only ever query Django's unrelated
# built-in auth_user table and return None. IdentityUserBackend is the real
# check, against this service's own accounts.User; AxesStandaloneBackend
# must stay first so a locked-out identifier/IP is rejected before
# IdentityUserBackend ever runs a password check.
AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "accounts.auth_backends.IdentityUserBackend",
]

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
        # One entry per signed-in user (and per address for anonymous
        # calls). Django's default of 300 is below this school's head count:
        # past it, every write deletes a random third of the entries, so
        # rate-limit counters were being wiped and the limits stopped
        # holding once more than ~300 people had used the system recently.
        "OPTIONS": {"MAX_ENTRIES": 10000},
    }
}

# See shared/logging_config.py. Console + a rotating file under logs/,
# structured as JSON outside local dev, every record tagged with the request
# ID shared.request_id.RequestIDMiddleware assigns.
LOGGING = build_logging(BASE_DIR, "identity-service", DEBUG)
