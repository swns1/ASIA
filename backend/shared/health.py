"""
Shared liveness/readiness check, reused by all four services' urls.py.

There was previously no /health/ endpoint anywhere in the repo -- nothing
an orchestrator, uptime monitor, or load balancer could poll to know a
service (and its one shared database) is actually up. Deliberately a plain
Django view, not a DRF one: a health check needs to work even when
authentication/permission/throttle machinery is misconfigured or the
database itself is the thing that's down, so it should have as few moving
parts as possible.
"""
from django.db import connection
from django.http import JsonResponse


def health_check(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:
        return JsonResponse({"status": "error", "detail": "database unreachable"}, status=503)
    return JsonResponse({"status": "ok"})
