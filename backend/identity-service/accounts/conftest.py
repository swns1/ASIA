"""
Every test gets its own empty in-memory cache.

The throttles (LoginRateThrottle, SessionRateThrottle, DRF's user/anon
rates) keep their counters in settings.CACHES, which is a file cache under
this service's directory. Tests used to share it with each other and with
the dev server: a run that ended with a burst of failed logins left the
login bucket full, and the next run's first login -- inside the same minute
-- came back 429.
"""
import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _isolated_cache(settings):
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "identity-service-tests",
        }
    }
    cache.clear()
    yield
    cache.clear()
