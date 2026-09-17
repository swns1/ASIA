# One image definition for all four backend services (and the scheduled jobs).
#
# Build context is the REPOSITORY ROOT, not backend/: every service imports
# backend/shared/, which a per-service build context would leave out.
#
# SLIS_SERVICE picks the service -- identity, student, billing or enrollment.
# On Railway, set it as a service variable; Railway passes service variables
# to the build for every ARG declared here. Locally:
#   docker build -f backend/Dockerfile --build-arg SLIS_SERVICE=identity .
#
# Runs gunicorn (Linux) -- see deploy/railway/start-backend.sh. The LAN
# deployment keeps using waitress on Windows and never builds this.
FROM python:3.12-slim

ARG SLIS_SERVICE
RUN case "$SLIS_SERVICE" in \
      identity|student|billing|enrollment) ;; \
      *) echo "Set SLIS_SERVICE to identity, student, billing or enrollment (got '$SLIS_SERVICE')." >&2; exit 1 ;; \
    esac

ENV SLIS_SERVICE=${SLIS_SERVICE} \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first, so a code-only change reuses this layer.
COPY backend/${SLIS_SERVICE}-service/requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt

COPY backend/shared /app/backend/shared
COPY backend/${SLIS_SERVICE}-service /app/backend/${SLIS_SERVICE}-service
COPY deploy/railway/start-backend.sh /app/start-backend.sh

WORKDIR /app/backend/${SLIS_SERVICE}-service

# whitenoise's manifest storage needs collected static files at runtime, and
# settings.py refuses to load without SECRET_KEY and DB_PASSWORD. Neither is
# used by collectstatic, so throwaway values keep real secrets out of the
# build; the running container gets the real ones from its variables.
RUN SECRET_KEY=collectstatic-only DB_PASSWORD=collectstatic-only \
    python manage.py collectstatic --noinput

CMD ["sh", "/app/start-backend.sh"]
