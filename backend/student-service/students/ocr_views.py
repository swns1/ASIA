"""
OCR integration for student document scanning.
Uses Google Gemini 2.0 Flash (free tier) to extract structured
student data from uploaded images (birth certificates, school IDs, etc.)

Endpoint: POST /api/ocr/scan/
Auth: JWT required (same as rest of student-service)
"""

import base64
import json
import logging
import os

import requests
from django.conf import settings
from rest_framework import permissions, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

# ── Gemini prompt ─────────────────────────────────────────────────────────────

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
  "guardian_full_name": "string or null",
  "guardian_relationship": "mother, father, or guardian — lowercase, or null",
  "guardian_mobile_number": "string or null",
  "guardian_email": "string or null",
  "previous_school_name": "string or null",
  "previous_school_address": "string or null",
  "confidence": "high, medium, or low — your overall confidence in the extraction"
}

Rules:
- Names should be in Title Case (e.g. "Juan", not "JUAN" or "juan")
- LRN is exactly 12 digits — strip spaces/dashes if present
- Dates must be YYYY-MM-DD; if only year is visible, use YYYY-01-01
- For sex: map "M", "Male", "Lalaki" → "male"; "F", "Female", "Babae" → "female"
- If the document is not a student-related document, still extract whatever is relevant
- Do NOT wrap the JSON in markdown code blocks — return raw JSON only
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _image_to_base64(image_file) -> tuple[str, str]:
    """Read uploaded file and return (base64_data, mime_type)."""
    content_type = getattr(image_file, "content_type", "image/jpeg")
    # Normalize mime type
    if content_type not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        content_type = "image/jpeg"
    data = base64.b64encode(image_file.read()).decode("utf-8")
    return data, content_type


def _call_groq(base64_data: str, mime_type: str) -> dict:
    """Call Groq LLaMA Vision API and return parsed JSON result."""
    api_key = settings.GROQ_API_KEY
    if not api_key:
        raise ValueError("GROQ_API_KEY is not configured in settings.")

    url = "https://api.groq.com/openai/v1/chat/completions"

    payload = {
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "temperature": 0.1,
        "max_tokens": 1024,
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

    response = requests.post(
        url,
        json=payload,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=30,
    )
    response.raise_for_status()

    result = response.json()

    try:
        raw_text = result["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as e:
        logger.error("Unexpected Groq response structure: %s", result)
        raise ValueError("Could not parse Groq response.") from e

    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()

    try:
        return json.loads(raw_text)
    except json.JSONDecodeError as e:
        logger.error("Groq returned non-JSON: %s", raw_text)
        raise ValueError(f"Groq returned invalid JSON: {raw_text[:200]}") from e


def _sanitize_result(data: dict) -> dict:
    """
    Clean up extracted data to match the student form field expectations.
    Removes null values and normalizes strings.
    """
    cleaned = {}
    for key, value in data.items():
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        cleaned[key] = value

    # Ensure sex is valid
    if "sex" in cleaned and cleaned["sex"] not in ("male", "female"):
        del cleaned["sex"]

    # Ensure LRN is exactly 12 digits
    if "lrn" in cleaned:
        lrn = "".join(filter(str.isdigit, str(cleaned["lrn"])))
        if len(lrn) == 12:
            cleaned["lrn"] = lrn
        else:
            del cleaned["lrn"]

    return cleaned


# ── View ──────────────────────────────────────────────────────────────────────

class OCRScanView(APIView):
    """
    POST /api/ocr/scan/

    Accepts a multipart image upload and returns extracted student fields.

    Request body (multipart/form-data):
        image: <file>   — JPEG, PNG, or WEBP document scan

    Response 200:
        {
            "success": true,
            "confidence": "high" | "medium" | "low",
            "extracted": {
                "first_name": "...",
                "last_name": "...",
                ...                    ← only fields that were found
            }
        }

    Response 400: { "success": false, "error": "..." }
    Response 503: { "success": false, "error": "Gemini API error" }
    """

    permission_classes = [permissions.IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        image_file = request.FILES.get("image")

        if not image_file:
            return Response(
                {"success": False, "error": "No image file provided. Use field name 'image'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Basic size guard — 10 MB
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
                {"success": False, "error": "Gemini API timed out. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except requests.exceptions.HTTPError as e:
            logger.error("Gemini HTTP error: %s", e.response.text if e.response else str(e))
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