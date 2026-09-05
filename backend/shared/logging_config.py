"""
Structured logging, shared by all four services.

Before this, no service defined LOGGING at all, so Django's own default
applied. Concretely, that meant two different kinds of silence:

- App code (shared/audit.py, identity-service/accounts/audit.py, every
  students/ocr/*.py module — 10 modules call logging.getLogger(__name__))
  has no handler anywhere in its logger chain, since Django's own
  DEFAULT_LOGGING never configures root. Calls fall through to Python's
  logging.lastResort: WARNING+ printed bare (no timestamp) to stderr,
  anything below WARNING dropped outright, nothing persisted anywhere. Read
  a log after the terminal that ran it has closed and there is nothing to
  read.
- Django's own request/error logging (django.request, the logger an
  unhandled view exception reaches) is routed by DEFAULT_LOGGING to a
  console handler gated on DEBUG=True and a mail_admins handler gated on
  DEBUG=False — and mail_admins silently does nothing when ADMINS is unset,
  which it is in all four services. So the one message most worth capturing
  — a 500 in what a real deployment would run — currently reaches neither.

build_logging() gives every service two real, always-on sinks: console, and
a size-rotated file under <BASE_DIR>/logs/. JSON in production (DEBUG=False)
so a future log shipper gets one parseable record per line; a short
human-readable line in local dev. Every record carries the ID that
shared.request_id.RequestIDMiddleware assigns per request, so one failing
request's lines — across however many of these four services it touched —
are grep-able by a single value.
"""
import json
import logging
import time
from pathlib import Path


class JsonFormatter(logging.Formatter):
    """One JSON object per line. Deliberately stdlib-only rather than a third
    -party dependency (python-json-logger, structlog, ...) — the shape needed
    here is small and fixed, consistent with this project's general practice
    of adding a dependency only when stdlib genuinely can't do the job (see
    apiClient's own hand-rolled interceptors, FileBasedCache for throttling).

    Timestamps are forced to UTC regardless of the host machine's clock or
    this service's TIME_ZONE setting — deliberately, since B3 (see README) is
    exactly the story of these four services disagreeing about what time it
    is. The persisted, cross-service-correlatable sink doesn't get to inherit
    that ambiguity; only the human-facing console formatter uses local time,
    because that's what a developer reading their own terminal wants.
    """

    converter = time.gmtime

    def __init__(self, service: str):
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S") + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "service": self.service,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


CONSOLE_FORMAT = "%(asctime)s %(levelname)-8s %(name)s [%(request_id)s] %(message)s"

# Loggers that are legitimately chatty at DEBUG and would otherwise drown
# everything else the moment a service runs with DEBUG=1 locally — Django's
# own per-query logging (only active while DEBUG=True; see
# CursorDebugWrapper) chief among them. Silenced regardless of this
# service's DEBUG value, since the noise problem is the same either way.
_NOISY_LOGGERS = {
    "django.db.backends": "INFO",
    "urllib3": "INFO",
    "PIL": "INFO",
}


def build_logging(base_dir: Path, service: str, debug: bool) -> dict:
    """Returns a Django LOGGING dict. Call once from each service's
    settings.py, after DEBUG and BASE_DIR are defined:

        LOGGING = build_logging(BASE_DIR, "identity-service", DEBUG)

    `service` becomes the "service" field on every JSON record and the log
    filename — useful the moment these are ever aggregated centrally, since
    all four otherwise run as indistinguishable Django processes.
    """
    log_dir = base_dir / "logs"
    # RotatingFileHandler does not create its own parent directory (unlike
    # FileBasedCache, which every service already relies on to create
    # cache/ lazily on first write) — without this, the first log write
    # after a fresh checkout raises FileNotFoundError and takes the whole
    # process down before it can serve a single request.
    log_dir.mkdir(parents=True, exist_ok=True)

    console_formatter = "console" if debug else "json"

    return {
        "version": 1,
        # Keeps Django's own DEFAULT_LOGGING loggers alive alongside this one
        # (django.server's runserver access log, axes' own logger, etc.) —
        # without it, dictConfig tears down every logger not named here.
        "disable_existing_loggers": False,
        "filters": {
            "request_id": {"()": "shared.request_id.RequestIDLogFilter"},
        },
        "formatters": {
            "console": {"format": CONSOLE_FORMAT},
            "json": {"()": "shared.logging_config.JsonFormatter", "service": service},
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "filters": ["request_id"],
                "formatter": console_formatter,
            },
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": str(log_dir / f"{service}.log"),
                "maxBytes": 5 * 1024 * 1024,
                "backupCount": 5,
                "filters": ["request_id"],
                # Always JSON on disk, even in local dev with a human-readable
                # console — the file is the sink that outlives the terminal.
                "formatter": "json",
            },
        },
        "root": {
            "handlers": ["console", "file"],
            "level": "DEBUG" if debug else "INFO",
        },
        "loggers": {
            # django.request / django.security.* are children of "django" and
            # stop here (propagate False) rather than also reaching root.
            # DEFAULT_LOGGING already scopes them this way, just pointed at a
            # DEBUG-gated console plus a silently-no-op mail_admins — this
            # redirects them at the same two real handlers everything else
            # uses, which is the specific gap described above: an unhandled
            # view exception under DEBUG=False was reaching neither.
            "django": {
                "handlers": ["console", "file"],
                "level": "INFO",
                "propagate": False,
            },
            **{name: {"level": level} for name, level in _NOISY_LOGGERS.items()},
        },
    }
