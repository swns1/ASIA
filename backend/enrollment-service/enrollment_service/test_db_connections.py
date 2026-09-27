"""
No persistent database connections under manage.py runserver.

runserver starts a thread per request, so a persistent connection is never
reused and stays open until CONN_MAX_AGE runs out; four services exhausted
PostgreSQL's 100 connections that way and every later request answered 500.
waitress and gunicorn run fixed thread pools and keep reusing theirs.
"""
import runpy
import sys
from pathlib import Path
from unittest.mock import patch

SETTINGS = Path(__file__).with_name("settings.py")


def _conn_max_age(argv):
    with patch.object(sys, "argv", argv):
        return runpy.run_path(str(SETTINGS))["DATABASES"]["default"]["CONN_MAX_AGE"]


def test_runserver_opens_a_fresh_connection_per_request():
    assert _conn_max_age(["manage.py", "runserver", "8000"]) == 0


def test_a_pooled_server_keeps_persistent_connections():
    assert _conn_max_age(["waitress-serve", "--threads=16", "app.wsgi:application"]) == 600
