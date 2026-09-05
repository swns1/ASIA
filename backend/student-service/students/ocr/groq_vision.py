"""
The cloud vision path — now the fallback, not the primary.

Anchoring handles a document whose printed labels the recogniser found. This
covers the rest: a phone photo too skewed for the geometry to hold, a
handwritten entry the recogniser could not read, or a form variant no anchor
set knows about. It costs tokens and it can hallucinate a plausible-looking
value, which is exactly why it runs second and why everything it returns
lands in the review gate unticked alongside whatever the local path found.

Tries Groq first, then Gemini if Groq is unavailable or exhausted (both keys
are optional independently) — a 429/5xx/timeout from one no longer takes the
whole cloud path down while the other is still up.
"""

import base64
import json
import logging
import re

import requests
from django.conf import settings
from google import genai
from google.genai import types as genai_types

from shared.resilience import AllProvidersFailedError, call_with_provider_fallback, is_transient_error

logger = logging.getLogger(__name__)

ENGINE_GROQ = "groq"
ENGINE_GEMINI = "gemini"
# Kept for callers that only care "was this cloud-sourced at all" — the
# actual engine used is now returned alongside the data by call().
ENGINE_NAME = ENGINE_GROQ

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "qwen/qwen3.6-27b"
GEMINI_MODEL = "gemini-2.5-flash-lite"

MAX_ATTEMPTS = 3
REQUEST_TIMEOUT = 45

# Was 1500. The free `on_demand` tier bills prompt_tokens + max_tokens *as
# reserved*, not as used, and with reasoning disabled a completion runs
# ~200-300 tokens — so the old ceiling was throwing away ~1200 tokens of a
# 8000/min budget on every single call.
MAX_TOKENS = 700

BASE_PROMPT = """
You are reading a scanned Philippine school document for an enrollment system.
Extract only what is actually printed or written on the page.

Return ONLY a valid JSON object with these keys (null for anything not present):

{
  "first_name": "string or null",
  "middle_name": "string or null",
  "last_name": "string or null",
  "suffix": "string or null - e.g. Jr., Sr., III",
  "lrn": "12-digit Learner Reference Number string or null",
  "birth_date": "YYYY-MM-DD or null",
  "sex": "male or female (lowercase) or null",
  "religion": "string or null",
  "current_address": "string or null",
  "permanent_address": "string or null",
  "guardians": [
    {"full_name": "string", "relationship": "mother, father, or guardian"}
  ],
  "previous_school_name": "string or null",
  "previous_school_address": "string or null",
  "document_type_seen": "what document this appears to be",
  "confidence": "high, medium, or low"
}

Rules:
- Names in Title Case
- LRN is exactly 12 digits; strip spaces and dashes
- Dates as YYYY-MM-DD
- Map "M"/"Lalaki" to "male", "F"/"Babae" to "female"
- One guardians entry per parent found; a birth certificate lists both a
  mother and a father, so return both rather than merging them
- If a value is not legible, use null. Do NOT guess a plausible value -- a
  wrong name on a permanent student record is worse than a blank one.
- Return raw JSON, no markdown fences
"""

FOCUS = {
    "birth_certificate": (
        "This is a PSA/civil-registry Certificate of Live Birth. Pay particular "
        "attention to the child's name, sex, date and place of birth, the "
        "mother's MAIDEN name and the father's name."
    ),
    "form_137": (
        "This is a DepEd Form 137 permanent record. Pay particular attention to "
        "the LRN, the learner's full name, date of birth, and the school name "
        "and address. Ignore the per-subject grade tables."
    ),
}


def prompt_for(family: str | None) -> str:
    focus = FOCUS.get(family or "")
    return f"{BASE_PROMPT}\n{focus}\n" if focus else BASE_PROMPT


def _strip_wrapper(raw_text: str) -> str:
    raw_text = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL).strip()
    if raw_text.startswith("```"):
        parts = raw_text.split("```")
        if len(parts) > 1:
            raw_text = parts[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    return raw_text.strip()


class _RetryableContentError(Exception):
    """Truncated or non-JSON model output on an otherwise-OK HTTP response
    — a content-shape problem, not a network one, but still worth one more
    attempt (the model output is fairly noisy for this task)."""


def _is_transient(exc: Exception) -> bool:
    return isinstance(exc, _RetryableContentError) or is_transient_error(exc)


def _call_groq(image_b64: str, mime_type: str, family: str | None, api_key: str) -> dict:
    payload = {
        "model": GROQ_MODEL,
        "temperature": 0.1,
        "max_tokens": MAX_TOKENS,
        # Without this, a dense document sends the model into a long reasoning
        # preamble that eats the completion budget before it reaches the JSON.
        "reasoning_effort": "none",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}},
                {"type": "text", "text": prompt_for(family)},
            ],
        }],
    }
    response = requests.post(
        GROQ_API_URL, json=payload,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    result = response.json()

    try:
        choice = result["choices"][0]
        raw_text = choice["message"]["content"].strip()
    except (KeyError, IndexError) as exc:
        # Log the response's shape (which keys are present), not its
        # content -- result is the model's transcription of whatever
        # document was scanned (a birth certificate, a good-moral
        # certificate, ...), so logging it verbatim on a partial-success
        # shape would put a minor's name/birth date/parents' names in the
        # log. family (the document type, e.g. "psa_birth_certificate") is
        # not PII and is what's actually useful for debugging this.
        logger.error(
            "Unexpected Groq response structure for family=%s: keys=%s",
            family, sorted(result) if isinstance(result, dict) else type(result).__name__,
        )
        raise ValueError("Could not read the OCR service response.") from exc

    if choice.get("finish_reason") == "length":
        raise _RetryableContentError("Groq response truncated")

    try:
        return json.loads(_strip_wrapper(raw_text))
    except json.JSONDecodeError as exc:
        # Length only, never the model output itself -- raw_text is the
        # transcribed document content (see above). This used to be
        # interpolated into the error message and sent to the browser; the
        # fix moved it into the log instead of removing it, which just
        # relocated the same PII exposure.
        logger.warning("Groq returned non-JSON for family=%s: length=%d", family, len(raw_text))
        raise _RetryableContentError("Groq returned non-JSON") from exc


def _call_gemini(image_bytes: bytes, mime_type: str, family: str | None, api_key: str) -> dict:
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt_for(family),
        ],
    )
    raw_text = (response.text or "").strip()
    try:
        return json.loads(_strip_wrapper(raw_text))
    except json.JSONDecodeError as exc:
        # Length only, never the model output itself -- see _call_groq's
        # equivalent log line for why.
        logger.warning("Gemini returned non-JSON for family=%s: length=%d", family, len(raw_text))
        raise _RetryableContentError("Gemini returned non-JSON") from exc


def call(image_bytes: bytes, family: str | None = None,
         mime_type: str = "image/jpeg") -> tuple[dict, str]:
    """
    Ask a vision model for fields — Groq first, Gemini second if Groq is
    unavailable or exhausted. Returns (fields, engine_name_used). Raises
    ValueError on anything the caller should turn into a 4xx; requests
    exceptions propagate for the 5xx paths.
    """
    groq_key = getattr(settings, "GROQ_API_KEY", "")
    gemini_key = getattr(settings, "GEMINI_API_KEY", "")
    if not groq_key and not gemini_key:
        raise ValueError("Neither GROQ_API_KEY nor GEMINI_API_KEY is configured.")

    b64 = base64.b64encode(image_bytes).decode("utf-8")

    providers: list[tuple[str, "callable"]] = []
    if groq_key:
        providers.append((
            ENGINE_GROQ,
            lambda: (_call_groq(b64, mime_type, family, groq_key), ENGINE_GROQ),
        ))
    if gemini_key:
        providers.append((
            ENGINE_GEMINI,
            lambda: (_call_gemini(image_bytes, mime_type, family, gemini_key), ENGINE_GEMINI),
        ))

    try:
        return call_with_provider_fallback(
            providers, attempts_per_provider=MAX_ATTEMPTS, is_transient=_is_transient,
        )
    except AllProvidersFailedError as exc:
        raise ValueError(
            "The OCR service did not return usable data. Please try again."
        ) from exc


def sanitize(data: dict) -> tuple[dict, dict]:
    """
    (fields, per-field confidence) — drops blanks, whitelists `sex`, and keeps
    an LRN only at exactly 12 digits. A partial LRN is worse than none: the
    column is unique on Student, so a wrong one either collides with a real
    student or creates a phantom.
    """
    cleaned: dict = {}
    for key, value in (data or {}).items():
        if key in ("guardians", "confidence", "document_type_seen"):
            continue
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        cleaned[key] = value

    if cleaned.get("sex") not in ("male", "female"):
        cleaned.pop("sex", None)

    if "lrn" in cleaned:
        digits = "".join(filter(str.isdigit, str(cleaned["lrn"])))
        if len(digits) == 12:
            cleaned["lrn"] = digits
        else:
            cleaned.pop("lrn")

    guardians = []
    for g in (data or {}).get("guardians") or []:
        if not isinstance(g, dict):
            continue
        full_name = str(g.get("full_name") or "").strip()
        if not full_name:
            continue
        relationship = str(g.get("relationship") or "").strip().lower()
        if relationship not in ("mother", "father", "guardian"):
            relationship = "guardian"
        guardians.append({"full_name": full_name, "relationship": relationship})
    if guardians:
        cleaned["guardians"] = guardians

    overall = str((data or {}).get("confidence") or "medium").lower()
    if overall not in ("high", "medium", "low"):
        overall = "medium"
    confidence = {k: overall for k in cleaned}

    return cleaned, confidence
