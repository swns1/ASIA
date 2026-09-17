#!/bin/sh
# Entry point for the backend image (backend/Dockerfile).
#
#   no arguments  -> serve the API with gunicorn on $PORT (Railway sets PORT)
#   arguments     -> run that command in the service folder and exit, e.g.
#                    sh /app/start-backend.sh python manage.py flag_overdue_installments
#                    (used by the scheduled-job services)
set -e

cd "/app/backend/${SLIS_SERVICE}-service"

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

# Two processes, each with a pool of threads. Plain sync workers answer one
# request at a time, so two of them meant two requests per service at once;
# a parent's page makes four calls to enrollment-service together. Threads
# suit this app: most of a request is spent waiting on PostgreSQL, and
# password hashing releases the GIL. Each thread can hold a database
# connection, so 4 services x 2 workers x 8 threads = 64, inside
# PostgreSQL's default 100. The timeout leaves room for the slow calls
# (AI analytics, OCR), which retry an external API before giving up.
exec gunicorn "${SLIS_SERVICE}_service.wsgi:application" \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers "${WEB_CONCURRENCY:-2}" \
    --worker-class gthread \
    --threads "${GUNICORN_THREADS:-8}" \
    --timeout "${GUNICORN_TIMEOUT:-120}" \
    --forwarded-allow-ips "*" \
    --access-logfile - \
    --error-logfile -
