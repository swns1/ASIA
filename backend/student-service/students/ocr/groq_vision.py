"""
The cloud vision path — now the fallback, not the primary.

Anchoring handles a document whose printed labels the recogniser found. This
covers the rest: a phone photo too skewed for the geometry to hold, a
handwritten entry the recogniser could not read, or a form variant no anchor
set knows about. It costs tokens and it can hallucinate a plausible-looking
value, which is exactly why it runs second and why everything it returns
lands in the review gate unticked alongside whatever the local path found.
"""

import base64
import json
import logging
import re
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

ENGINE_NAME = "groq"
API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "qwen/qwen3.6-27b"

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


def call(image_bytes: bytes, family: str | None = None,
         mime_type: str = "image/jpeg") -> dict:
    """
    Ask the vision model for fields. Raises ValueError on anything the caller
    should turn into a 4xx; requests exceptions propagate for the 5xx paths.
    """
    api_key = getattr(settings, "GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not configured.")

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    payload = {
        "model": MODEL,
        "temperature": 0.1,
        "max_tokens": MAX_TOKENS,
        # Without this, a dense document sends the model into a long reasoning
        # preamble that eats the completion budget before it reaches the JSON.
        "reasoning_effort": "none",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
                {"type": "text", "text": prompt_for(family)},
            ],
        }],
    }
    headers = {"Authorization": f"Bearer {api_key}"}

    for attempt in range(1, MAX_ATTEMPTS + 1):
        if attempt > 1:
            # Retrying immediately against a per-minute token budget
            # self-inflicts the 429 the retry exists to survive.
            time.sleep(2 ** (attempt - 1))

        response = requests.post(API_URL, json=payload, headers=headers,
                                 timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        result = response.json()

        try:
            choice = result["choices"][0]
            raw_text = choice["message"]["content"].strip()
        except (KeyError, IndexError) as exc:
            logger.error("Unexpected Groq response structure: %s", result)
            raise ValueError("Could not read the OCR service response.") from exc

        if choice.get("finish_reason") == "length":
            logger.warning("Groq response truncated (attempt %d/%d)", attempt, MAX_ATTEMPTS)
            continue

        try:
            return json.loads(_strip_wrapper(raw_text))
        except json.JSONDecodeError:
            # Log the model output for debugging; never return it. It used to
            # be interpolated into the error message and sent to the browser.
            logger.warning("Groq returned non-JSON (attempt %d/%d): %s",
                           attempt, MAX_ATTEMPTS, raw_text[:200])

    raise ValueError("The OCR service did not return usable data. Please try again.")


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
