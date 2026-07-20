"""
OCR integration for student document scanning.
Uses Groq LLaMA Vision to extract structured student data
from uploaded images (birth certificates, school IDs, etc.)

Endpoint: POST /api/ocr/scan/
Auth: JWT required (same as rest of student-service)
"""

import base64
import json
import logging
import re

import requests
from django.conf import settings
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from student_service.throttles import StatelessUserRateThrottle

from accounts.permissions import HasRole
from .image_preprocessing import preprocess_for_ocr

logger = logging.getLogger(__name__)


class OcrRateThrottle(StatelessUserRateThrottle):
    """Tighter per-user limit for OCR — Groq has its own upstream rate limit."""
    scope = "ocr"


# ── Prompt ────────────────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """
You are an OCR assistant for a Philippine school enrollment system.
Analyze the document image and extract student information.

Return ONLY a valid JSON object with these exact keys (use null for fields you cannot find):

{
  "first_name": "string or null",
  "middle_name": "string or null",
  "last_name": "string or null",
  "suffix": "string or null — e.g. Jr., Sr., III",
  "lrn": "12-digit Learner Reference Number string or null",
  "birth_date": "YYYY-MM-DD format or null",
  "sex": "male or female (lowercase) or null",
  "religion": "string or null",
  "email": "string or null",
  "mobile_number": "string or null",
  "current_address": "string or null",
  "permanent_address": "string or null",
  "guardians": [
    {
      "full_name": "string",
      "relationship": "mother, father, or guardian — lowercase",
      "mobile_number": "string or null",
      "email": "string or null"
    }
  ],
  "previous_school_name": "string or null",
  "previous_school_address": "string or null",
  "confidence": "high, medium, or low — your overall confidence in the extraction"
}

Rules:
- Names should be in Title Case (e.g. "Juan", not "JUAN" or "juan")
- LRN is exactly 12 digits — strip spaces/dashes if present
- Dates must be YYYY-MM-DD; if only year is visible, use YYYY-01-01
- For sex: map "M", "Male", "Lalaki" -> "male"; "F", "Female", "Babae" -> "female"
- "guardians" is a list — include ONE ENTRY PER PARENT/GUARDIAN found. A birth
  certificate usually lists both a mother and a father: include both as
  separate entries, not merged into one. Skip anyone whose name you cannot
  find. Use an empty list if none are found.
- If the document is not a student-related document, still extract whatever is relevant
- Do NOT wrap the JSON in markdown code blocks — return raw JSON only
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _image_to_base64(image_file) -> tuple[str, str]:
    """Read uploaded file, run local preprocessing, and return (base64_data, mime_type)."""
    raw = image_file.read()
    try:
        processed = preprocess_for_ocr(raw)
        mime_type = "image/jpeg"
    except Exception:
        logger.warning("OCR preprocessing failed, using raw image", exc_info=True)
        processed = raw
        mime_type = getattr(image_file, "content_type", "image/jpeg")
        if mime_type not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
            mime_type = "image/jpeg"
    return base64.b64encode(processed).decode("utf-8"), mime_type


GROQ_MAX_ATTEMPTS = 3  # safety net for transient truncation/invalid-JSON responses


def _call_groq(base64_data: str, mime_type: str) -> dict:
    """Call Groq LLaMA Vision API and return parsed JSON result.

    reasoning_effort="none" disables this model's <think> chain-of-thought
    preamble entirely. Without it, dense documents (many fields to
    cross-reference, e.g. a birth certificate) can send the model into a
    long or even runaway reasoning loop that eats the whole completion
    budget before it ever reaches the JSON answer -- and this Groq account
    is on the free "on_demand" tier, which caps requests at 8000 tokens per
    minute (counted as prompt_tokens + max_tokens, not actual usage), so
    raising max_tokens to compensate isn't viable here. Skipping reasoning
    keeps completions around ~200-300 tokens instead of ~4000+, which both
    avoids the loop and stays comfortably under the TPM cap.
    """
    api_key = settings.GROQ_API_KEY
    if not api_key:
        raise ValueError("GROQ_API_KEY is not configured in settings.")

    payload = {
        "model": "qwen/qwen3.6-27b",
        "temperature": 0.1,
        "max_tokens": 1500,
        "reasoning_effort": "none",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{base64_data}",
                        },
                    },
                    {
                        "type": "text",
                        "text": EXTRACTION_PROMPT,
                    },
                ],
            }
        ],
    }
    headers = {"Authorization": f"Bearer {api_key}"}

    last_error = None
    for attempt in range(1, GROQ_MAX_ATTEMPTS + 1):
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            json=payload,
            headers=headers,
            timeout=45,
        )
        response.raise_for_status()

        result = response.json()

        try:
            choice = result["choices"][0]
            raw_text = choice["message"]["content"].strip()
        except (KeyError, IndexError) as e:
            logger.error("Unexpected Groq response structure: %s", result)
            raise ValueError("Could not parse Groq response.") from e

        if choice.get("finish_reason") == "length":
            last_error = ValueError("Groq response was truncated before it finished.")
            logger.warning(
                "Groq response truncated on attempt %d/%d, retrying", attempt, GROQ_MAX_ATTEMPTS
            )
            continue

        # Belt-and-suspenders: reasoning_effort="none" should mean no <think>
        # block, but strip one anyway in case the model ignores that setting.
        raw_text = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL).strip()

        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            last_error = ValueError(f"Groq returned invalid JSON: {raw_text[:200]}")
            logger.warning(
                "Groq returned non-JSON on attempt %d/%d: %s", attempt, GROQ_MAX_ATTEMPTS, raw_text[:200]
            )
            continue

    raise last_error


def _sanitize_result(data: dict) -> dict:
    cleaned = {}
    for key, value in data.items():
        if key == "guardians":
            continue  # list of dicts, not a scalar -- handled separately below
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        cleaned[key] = value

    if "sex" in cleaned and cleaned["sex"] not in ("male", "female"):
        del cleaned["sex"]

    if "lrn" in cleaned:
        lrn = "".join(filter(str.isdigit, str(cleaned["lrn"])))
        if len(lrn) == 12:
            cleaned["lrn"] = lrn
        else:
            del cleaned["lrn"]

    guardians = []
    for g in data.get("guardians") or []:
        if not isinstance(g, dict):
            continue
        full_name = str(g.get("full_name") or "").strip()
        if not full_name:
            continue
        relationship = str(g.get("relationship") or "").strip().lower()
        if relationship not in ("mother", "father", "guardian"):
            relationship = "guardian"
        guardian = {"full_name": full_name, "relationship": relationship}
        mobile_number = str(g.get("mobile_number") or "").strip()
        if mobile_number:
            guardian["mobile_number"] = mobile_number
        email = str(g.get("email") or "").strip()
        if email:
            guardian["email"] = email
        guardians.append(guardian)
    if guardians:
        cleaned["guardians"] = guardians

    return cleaned


# ── View ──────────────────────────────────────────────────────────────────────

class OCRScanView(APIView):
    permission_classes = [HasRole]
    required_roles     = {"super_admin", "admin", "registrar"}
    throttle_classes   = [OcrRateThrottle]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        image_file = request.FILES.get("image")

        if not image_file:
            return Response(
                {"success": False, "error": "No image file provided. Use field name 'image'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if image_file.size > 10 * 1024 * 1024:
            return Response(
                {"success": False, "error": "Image too large. Maximum size is 10 MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            base64_data, mime_type = _image_to_base64(image_file)
            raw_result = _call_groq(base64_data, mime_type)
            confidence = raw_result.pop("confidence", "medium")
            extracted  = _sanitize_result(raw_result)

            logger.info(
                "OCR scan by user=%s — confidence=%s — fields_found=%d",
                getattr(request.user, "user_id", "?"),
                confidence,
                len(extracted),
            )

            return Response({
                "success":    True,
                "confidence": confidence,
                "extracted":  extracted,
            })

        except ValueError as e:
            return Response(
                {"success": False, "error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except requests.exceptions.Timeout:
            return Response(
                {"success": False, "error": "Groq API timed out. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if e.response else 0
            if status_code in (429, 413):
                # Groq's free "on_demand" tier caps requests at 8000 tokens/min;
                # 413 "Request too large" is that same limit rejecting the call
                # up front rather than mid-generation, so it gets the same
                # user-facing message as 429.
                return Response(
                    {"success": False, "error": "Too many requests. Please wait a moment and try again."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            logger.error("Groq HTTP error: %s", e.response.text if e.response else str(e))
            return Response(
                {"success": False, "error": "OCR service error. Check your API key."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as e:
            logger.exception("Unexpected OCR error")
            return Response(
                {"success": False, "error": "An unexpected error occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )