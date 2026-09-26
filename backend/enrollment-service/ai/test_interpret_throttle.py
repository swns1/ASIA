"""
The AI interpretation endpoint has its own per-user rate limit: every call
spends third-party AI quota, and the general 300/minute user rate left one
session free to drain the key.
"""
from ai.views import GeminiInterpretView, InterpretRateThrottle


def test_interpret_view_uses_its_own_throttle():
    assert GeminiInterpretView.throttle_classes == [InterpretRateThrottle]


def test_interpret_rate_is_configured_and_tight():
    # Constructing it reads the scope's rate from settings, and raises
    # ImproperlyConfigured if the scope has none -- which would otherwise
    # only surface as a 500 on the first real request.
    throttle = InterpretRateThrottle()
    assert throttle.num_requests <= 10 and throttle.duration == 60
