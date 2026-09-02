"""
Generic retry-with-backoff and multi-provider fallback for outbound calls
that can fail transiently — AI providers (Groq, Gemini) and email (Resend)
all share the same failure shape: a timeout, a rate limit, or an upstream
5xx that might succeed on retry, versus a bad key or bad request that will
fail identically no matter how many times it's retried.

Deliberately dependency-free (no tenacity/backoff) — this is the same
hand-rolled exponential backoff style students/ocr/groq_vision.py already
used, just centralized so every call site gets it consistently instead of
three separate, inconsistent half-implementations.
"""
import logging
import time
from typing import Callable, TypeVar

import requests

logger = logging.getLogger(__name__)

T = TypeVar("T")


def is_transient_error(exc: Exception) -> bool:
    """
    True if calling the same operation again has a real chance of
    succeeding: a timeout, a connection drop, a rate limit (429), or an
    upstream 5xx. False for anything that looks like a config or input
    problem (bad API key, bad request) that will fail identically on retry.

    Duck-types on a `.code` attribute for provider SDK errors (google-genai's
    ClientError/ServerError and resend's ResendError subclasses both carry
    one) rather than importing those packages here — this module is shared
    by services that each only use one of Groq/Gemini/Resend, never all
    three at once.
    """
    if isinstance(exc, (requests.exceptions.Timeout, requests.exceptions.ConnectionError)):
        return True
    if isinstance(exc, requests.exceptions.HTTPError):
        status = exc.response.status_code if exc.response is not None else 0
        return status == 429 or status >= 500

    code = getattr(exc, "code", None)
    if code is not None:
        try:
            code = int(code)
        except (TypeError, ValueError):
            return False
        return code == 429 or code >= 500

    return False


def retry_with_backoff(
    fn: Callable[[], T],
    *,
    attempts: int = 3,
    base_delay: float = 1.0,
    is_transient: Callable[[Exception], bool] = is_transient_error,
    label: str = "call",
) -> T:
    """
    Call fn(), retrying up to `attempts` times with exponential backoff
    (base_delay * 2**(n-1) between attempts) whenever `is_transient` says the
    failure might not repeat. Re-raises immediately on a non-transient error,
    or once attempts are exhausted.
    """
    last_exc: Exception
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if not is_transient(exc) or attempt == attempts:
                raise
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning(
                "%s failed (attempt %d/%d): %s — retrying in %.1fs",
                label, attempt, attempts, exc, delay,
            )
            time.sleep(delay)
    raise last_exc  # pragma: no cover — loop above always returns or raises


class AllProvidersFailedError(Exception):
    """Every provider in a call_with_provider_fallback chain failed."""

    def __init__(self, errors: list[tuple[str, Exception]]):
        self.errors = errors
        summary = "; ".join(f"{name}: {type(exc).__name__}: {exc}" for name, exc in errors)
        super().__init__(f"All providers failed — {summary}")


def call_with_provider_fallback(
    providers: list[tuple[str, Callable[[], T]]],
    *,
    attempts_per_provider: int = 2,
    is_transient: Callable[[Exception], bool] = is_transient_error,
) -> T:
    """
    Try each (name, fn) in order, retrying each with backoff via
    retry_with_backoff. Moves to the next provider as soon as one is
    exhausted — whether it ran out of retries or hit a non-transient error.
    Raises AllProvidersFailedError, carrying every provider's final
    exception, only if none of them succeed.
    """
    errors: list[tuple[str, Exception]] = []
    for name, fn in providers:
        try:
            return retry_with_backoff(
                fn, attempts=attempts_per_provider, is_transient=is_transient, label=name,
            )
        except Exception as exc:
            logger.warning("Provider %s exhausted: %s", name, exc)
            errors.append((name, exc))
    raise AllProvidersFailedError(errors)
