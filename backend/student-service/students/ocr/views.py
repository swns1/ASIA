"""
Document scan endpoints.

POST /api/ocr/scan/
    image             (required, multipart)
    requirement_code  (optional) which requirement slot this was filed under
    student_id        (optional) absent while creating a student
    first_name / last_name (optional) what the form currently holds, for the
                      "does this document name this student?" check

GET  /api/ocr/reconciled/?student_id=123
    Every field this student's scanned documents have claimed, with conflicts
    marked.

Nothing here writes to the student record. A scan produces claims; applying
them is a separate, explicit act in the review UI.
"""

import logging

import requests
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasRole
from student_service.throttles import StatelessUserRateThrottle

from ..models import DocumentExtraction, Student
from . import groq_vision
from .anchors import extract_fields, required_fields
from .policy import EXTRACT, looks_like_family, resolve_policy
from .reader import PaddleReader
from .reconcile import claims_from_extractions, ledger_to_json, reconcile
from .verify import verify_document

logger = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 10 * 1024 * 1024

# Escalate to the cloud when the local pass is not good enough to trust.
MIN_FIELD_COVERAGE = 0.5   # share of a family's required fields resolved
MIN_MEAN_CONFIDENCE = 0.60  # recogniser's own average across the page


class OcrRateThrottle(StatelessUserRateThrottle):
    scope = "ocr"


def _should_fallback(fields: dict, family: str, parsed, expected: bool) -> str | None:
    """Why this document needs the cloud, or None if the local pass will do."""
    required = required_fields(family)
    if required:
        coverage = len(set(fields) & required) / len(required)
        if coverage < MIN_FIELD_COVERAGE:
            return f"only {len(set(fields) & required)}/{len(required)} fields resolved locally"
    if parsed.mean_confidence < MIN_MEAN_CONFIDENCE:
        return f"low text confidence ({parsed.mean_confidence:.2f})"
    if not expected:
        return "document did not match the expected type"
    return None


class OCRScanView(APIView):
    permission_classes = [HasRole]
    required_roles = {"super_admin", "admin", "registrar"}
    throttle_classes = [OcrRateThrottle]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        image_file = request.FILES.get("image")
        if not image_file:
            return Response(
                {"success": False, "error": "No image file provided. Use field name 'image'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if image_file.size > MAX_IMAGE_BYTES:
            return Response(
                {"success": False, "error": "Image too large. Maximum size is 10 MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        requirement_code = (request.data.get("requirement_code") or "").strip()
        student_id = request.data.get("student_id") or None
        first_name = request.data.get("first_name") or None
        last_name = request.data.get("last_name") or None

        raw = image_file.read()

        try:
            parsed = PaddleReader().read(raw)
        except Exception:
            # A reader failure must not take the feature down: fall through to
            # the cloud path, which is what the whole system used to do.
            logger.exception("Local OCR failed; falling back to the cloud path")
            parsed = None

        try:
            if parsed is None:
                return self._cloud_only(request, raw, requirement_code, student_id)

            policy, family = resolve_policy(requirement_code, parsed)
            expected = looks_like_family(family, parsed)
            engine = PaddleReader.engine
            warnings: list[str] = []
            check = None

            if policy == EXTRACT:
                fields, confidence = extract_fields(parsed, family)
                reason = _should_fallback(fields, family, parsed, expected)
                if reason:
                    logger.info("Escalating %s to the cloud: %s", requirement_code, reason)
                    try:
                        cloud_fields, cloud_conf = groq_vision.sanitize(
                            groq_vision.call(raw, family)
                        )
                        # Local values win where both engines found something:
                        # the recogniser cannot invent text, the model can.
                        for key, value in cloud_fields.items():
                            fields.setdefault(key, value)
                            confidence.setdefault(key, cloud_conf.get(key, "low"))
                        engine = groq_vision.ENGINE_NAME
                    except (ValueError, requests.RequestException) as exc:
                        logger.warning("Fallback unavailable: %s", exc)
                        warnings.append(
                            "Some fields could not be read and the backup reader was "
                            "unavailable — please fill them in by hand."
                        )
            else:
                fields, confidence = {}, {}
                check = verify_document(parsed, requirement_code, first_name, last_name)
                warnings.extend(check["notes"])

            if not expected and policy == EXTRACT:
                warnings.append("This may not be the document type it was filed under.")

            extraction = DocumentExtraction.objects.create(
                student_id=int(student_id) if student_id else None,
                requirement_code=requirement_code or "unknown",
                family=family or "",
                source_label=_label_for(requirement_code, family),
                extracted_json=fields,
                field_confidence_json=confidence,
                blocks_json=[
                    {"text": b.text, "box": list(b.box), "confidence": round(b.confidence, 3)}
                    for b in parsed.blocks
                ],
                document_type_seen=(check or {}).get("document_type_seen") or family or None,
                is_expected_document=expected,
                source_engine=engine,
                mean_confidence=round(parsed.mean_confidence, 4),
                scanned_by=getattr(request.user, "user_id", None),
            )

            logger.info(
                "OCR scan user=%s code=%s policy=%s engine=%s fields=%d conf=%.3f",
                getattr(request.user, "user_id", "?"), requirement_code, policy,
                engine, len(fields), parsed.mean_confidence,
            )

            return Response({
                "success": True,
                "policy": policy,
                "family": family,
                "source_engine": engine,
                "mean_confidence": round(parsed.mean_confidence, 3),
                "is_expected_document": expected,
                "extracted": fields,
                "field_confidence": confidence,
                "check": check,
                "warnings": warnings,
                "extraction_id": extraction.document_extraction_id,
                "ledger": _ledger_for(student_id),
            })

        except requests.exceptions.Timeout:
            return Response(
                {"success": False, "error": "The backup reader timed out. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except requests.exceptions.HTTPError as exc:
            code = exc.response.status_code if exc.response is not None else 0
            if code in (429, 413):
                return Response(
                    {"success": False,
                     "error": "The backup reader is rate-limited. Please wait a moment."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            logger.error("Fallback HTTP error: %s", exc)
            return Response(
                {"success": False, "error": "The backup reader is unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except ValueError as exc:
            return Response({"success": False, "error": str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Unexpected OCR error")
            return Response(
                {"success": False, "error": "Something went wrong reading this document."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _cloud_only(self, request, raw, requirement_code, student_id):
        """Local reader unavailable — the previous behaviour, unchanged."""
        fields, confidence = groq_vision.sanitize(groq_vision.call(raw, None))
        extraction = DocumentExtraction.objects.create(
            student_id=int(student_id) if student_id else None,
            requirement_code=requirement_code or "unknown",
            source_label=_label_for(requirement_code, None),
            extracted_json=fields,
            field_confidence_json=confidence,
            source_engine=groq_vision.ENGINE_NAME,
            scanned_by=getattr(request.user, "user_id", None),
        )
        return Response({
            "success": True,
            "policy": EXTRACT,
            "family": None,
            "source_engine": groq_vision.ENGINE_NAME,
            "extracted": fields,
            "field_confidence": confidence,
            "check": None,
            "warnings": ["The local reader was unavailable; used the backup reader."],
            "extraction_id": extraction.document_extraction_id,
            "ledger": _ledger_for(student_id),
        })


_LABELS = {
    "psa_birth_certificate": "PSA Birth Certificate",
    "birth_certificate": "Birth Certificate",
    "form_137_or_138": "Form 137/138",
    "form_138": "Form 138 (Report Card)",
}


def _label_for(requirement_code: str, family: str | None) -> str:
    if requirement_code in _LABELS:
        return _LABELS[requirement_code]
    return (requirement_code or family or "Document").replace("_", " ").title()


def _ledger_for(student_id) -> dict:
    """
    The reconciled view across everything scanned for this student so far.

    Empty while creating a student — there is no id to group by yet, so the
    first document has nothing to conflict with. Conflicts start mattering
    from the second document onward, which is exactly when they appear.
    """
    if not student_id:
        return {}
    extractions = DocumentExtraction.objects.filter(student_id=student_id)
    return ledger_to_json(reconcile(claims_from_extractions(extractions)))


class ReconciledLedgerView(APIView):
    """GET /api/ocr/reconciled/?student_id=123"""

    permission_classes = [HasRole]
    required_roles = {"super_admin", "admin", "registrar"}

    def get(self, request, *args, **kwargs):
        student_id = request.query_params.get("student_id")
        if not student_id:
            return Response({"detail": "student_id is required."},
                            status=status.HTTP_400_BAD_REQUEST)
        get_object_or_404(Student, pk=student_id)
        return Response({
            "student_id": int(student_id),
            "ledger": _ledger_for(student_id),
        })
