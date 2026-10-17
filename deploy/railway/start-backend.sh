#!/bin/sh
# Entry point for the backend image (backend/Dockerfile).
#
#   no arguments  -> serve the API with gunicorn on $PORT (Railway sets PORT)
#   predeploy     -> apply this service's database upgrades, then exit
#                    (Railway's pre-deploy command, deploy/railway/backend.json)
#   arguments     -> run that command in the service folder and exit, e.g.
#                    sh /app/start-backend.sh python manage.py flag_overdue_installments
#                    (used by the scheduled-job services)
set -e

cd "/app/backend/${SLIS_SERVICE}-service"

# Runs in its own container before each deploy; if it fails, Railway keeps
# the running version and abandons the deploy. Only the apps listed here are
# migrated, never a plain `migrate`: Railway's database was loaded by
# setup-db.ps1, which fakes every migration that existed that day, and which
# of the ones added since have really run there can't be told from here.
# List an app only when its new migrations are safe on any copy of the
# database (IF NOT EXISTS, guarded UPDATEs), with a table they need.
if [ "$1" = "predeploy" ]; then
    case "$SLIS_SERVICE" in
        enrollment) apps="grades subjects"; table=narrative_categories ;;
        billing)    apps=school_settings;   table=school_settings ;;
        *)          echo "predeploy: no database upgrades for ${SLIS_SERVICE}"; exit 0 ;;
    esac
    # A new Railway database stays empty until setup-db.ps1 loads it, and the
    # services deploy before that. Migrating it would create tables, and
    # setup-db.ps1 refuses a database that has any -- so until the table is
    # there, there is nothing to upgrade. Exit 3 means "missing"; anything
    # else (the database unreachable, say) fails the deploy as it should.
    set +e
    python manage.py shell -c "import sys; from django.db import connection; sys.exit(0 if '${table}' in connection.introspection.table_names() else 3)"
    status=$?
    set -e
    if [ "$status" -eq 3 ]; then
        echo "predeploy: no ${table} table yet -- load the database with setup-db.ps1. Nothing to upgrade."
        exit 0
    fi
    [ "$status" -eq 0 ] || exit "$status"
    for app in $apps; do
        python manage.py migrate "$app" --noinput
    done
    exit 0
fi

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
