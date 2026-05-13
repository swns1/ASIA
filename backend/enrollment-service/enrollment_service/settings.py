"""
Settings for enrollment_service.

Critical compat with identity-service:
- SECRET_KEY must match identity-service so SimpleJWT can verify tokens
  (SimpleJWT signs with settings.SECRET_KEY when SIGNING_KEY isn't set).
- USER_ID_FIELD = "user_id" matches the `users` table primary key.
- Database connection points at the same Postgres instance.
"""
import os
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent


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


# ─── Core ───────────────────────────────────────────────────────────────────
SECRET_KEY = "django-insecure-n77il4oulrzslvvx+rg$lh&_e&(%c10gx(uiprm&qs@dm$++3t"
DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]


# ─── Apps ───────────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

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
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "enrollment_service.audit.AuditLogMiddleware",
    "django.middleware.security.SecurityMiddleware",
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
        "ENGINE": "django.db.backends.postgresql",
        "NAME":     "SLIS THESIS FINAL",
        "USER":     "postgres",
        "PASSWORD": "admin123",
        "HOST":     "localhost",
        "PORT":     "5432",
    }
}


# ─── Custom user model ──────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"


# ─── DRF ────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
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
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True


# ─── Misc ───────────────────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Resend
RESEND_API_KEY = "re_BkvUAMSZ_QGb6Ju4F3VkPDW4smbSFEaC6" 