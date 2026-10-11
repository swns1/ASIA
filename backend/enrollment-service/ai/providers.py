"""
What counts as an answer from an AI provider.

Both AI views (views.py, analytics_views.py) run a provider chain through
shared.resilience.call_with_provider_fallback, which moves to the next
provider only when one raises. A provider that answers HTTP 200 with no text
-- a Gemini safety block, or a reasoning model that spent its whole token
budget thinking -- raised nothing, so the chain stopped there and the page got
a blank interpretation while the fallback sat unused.
"""


class EmptyModelResponse(Exception):
    """The provider answered but said nothing. Not transient: retrying the
    same provider gets the same nothing, so the chain moves on."""


def require_text(text, provider):
    text = (text or "").strip()
    if not text:
        raise EmptyModelResponse(f"{provider} returned no text")
    return text
