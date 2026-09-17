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

# Two workers keep one slow request (AI analytics, OCR) from blocking the
# service while staying inside a small memory budget; the timeout leaves room
# for those same calls, which retry an external API before giving up.
exec gunicorn "${SLIS_SERVICE}_service.wsgi:application" \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers "${WEB_CONCURRENCY:-2}" \
    --timeout "${GUNICORN_TIMEOUT:-120}" \
    --forwarded-allow-ips "*" \
    --access-logfile - \
    --error-logfile -
