"""
QA audit - student-service document AI (students/ocr/*).

Run from backend/student-service:
    python -m pytest -c pytest.ini <this file> -p no:cacheprovider

No database, no network, no real OCR engine and no real document: every page
is a hand-built ParsedDocument of synthetic text, and the view's collaborators
are patched. Tests assert the CORRECT behaviour; a failure is a confirmed defect.
"""
import io
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from accounts.permissions import HasRole
from students.ocr import views as ocr_views
from students.ocr.policy import EXTRACT, VERIFY, policy_for, resolve_policy
from students.ocr.types import ParsedDocument, TextBlock
from students.ocr.verify import DOCUMENT_MARKERS, verify_document

STAFF3 = {"super_admin", "admin", "registrar"}
ALL_ROLES = ["super_admin", "admin", "registrar", "teacher", "accounting", "guardian"]


def page(*lines, conf=0.95):
    return ParsedDocument(
        blocks=[TextBlock(text=t, box=(0.0, i * 20.0, 400.0, i * 20.0 + 18.0), confidence=conf)
                for i, t in enumerate(lines)],
        width=400, height=20 * max(1, len(lines)), engine="paddle",
    )


# ═════════════════ F1. access control ═════════════════

@pytest.mark.parametrize("view_cls,method", [(ocr_views.OCRScanView, "POST"),
                                             (ocr_views.ReconciledLedgerView, "GET")])
@pytest.mark.parametrize("role", ALL_ROLES)
def test_F1_role_matrix(view_cls, method, role):
    request = SimpleNamespace(user=SimpleNamespace(is_authenticated=True, role=role), method=method)
    assert HasRole().has_permission(request, view_cls()) is (role in STAFF3)


@pytest.mark.parametrize("view_cls,method", [(ocr_views.OCRScanView, "POST"),
                                             (ocr_views.ReconciledLedgerView, "GET")])
def test_F2_unauthenticated_is_denied(view_cls, method):
    request = SimpleNamespace(user=SimpleNamespace(is_authenticated=False, role="admin"), method=method)
    assert HasRole().has_permission(request, view_cls()) is False


def test_F3_scan_is_rate_limited():
    assert ocr_views.OCRScanView.throttle_classes == [ocr_views.OcrRateThrottle]


# ═════════════════ F4. policy: no document is sent to a cloud model ═════════════════

def test_F4_every_requirement_code_verifies_locally():
    for code in list(DOCUMENT_MARKERS) + ["", None, "unknown_code", "FORM_137_OR_138"]:
        assert policy_for(code)[0] == VERIFY, code


@pytest.mark.parametrize("text", ["PERMANENT RECORD Form 137", "report card", "nothing"])
def test_F5_form_137_slot_never_resolves_to_extract_today(text):
    assert resolve_policy("form_137_or_138", page(text))[0] == VERIFY


def test_F6_scan_never_calls_the_cloud_reader():
    with patch.object(ocr_views.groq_vision, "call", side_effect=AssertionError("cloud called")) as cloud, \
         patch.object(ocr_views, "PaddleReader") as reader, \
         patch.object(ocr_views, "DocumentExtraction") as model, \
         patch.object(ocr_views, "_ledger_for", return_value={}):
        reader.return_value.read.return_value = page("PSA", "CERTIFICATE OF LIVE BIRTH", "SYNTHETIC CHILD")
        reader.engine = "paddle"
        model.objects.create.return_value = SimpleNamespace(document_extraction_id=1)
        response = _scan(code="psa_birth_certificate")
    assert response.status_code == 200
    cloud.assert_not_called()


# ═════════════════ G. verification accuracy (synthetic pages) ═════════════════

def test_G1_right_student_right_document():
    r = verify_document(page("REPUBLIC OF THE PHILIPPINES", "CERTIFICATE OF LIVE BIRTH",
                             "Name: JUAN SANTOS DELA CRUZ"),
                        "psa_birth_certificate", first_name="Juan", last_name="Dela Cruz")
    assert r["is_expected_document"] is True and r["names_student"] is True


def test_G2_wrong_person_entirely_is_flagged():
    r = verify_document(page("CERTIFICATE OF LIVE BIRTH", "Name: MARIA LOURDES REYES"),
                        "psa_birth_certificate", first_name="Juan", last_name="Dela Cruz")
    assert r["names_student"] is False
    assert any("not found" in n for n in r["notes"])


def test_G3_a_siblings_document_is_not_accepted_as_this_students():
    """Same surname, different child - the exact 'wrong file on the wrong
    record' case the module docstring says it exists to catch."""
    r = verify_document(page("CERTIFICATE OF LIVE BIRTH", "Name: PEDRO SANTOS DELA CRUZ"),
                        "psa_birth_certificate", first_name="Juan", last_name="Dela Cruz")
    assert r["names_student"] is False, f"matched on {r['matched_name']!r}"


def test_G4_a_different_person_with_the_same_given_name_is_not_accepted():
    r = verify_document(page("CERTIFICATE OF LIVE BIRTH", "Name: JUAN PABLO GARCIA"),
                        "psa_birth_certificate", first_name="Juan", last_name="Dela Cruz")
    assert r["names_student"] is False, f"matched on {r['matched_name']!r}"


def test_G5_name_match_is_whole_word_not_substring():
    """Given name 'Ana' is inside 'Mariana', 'Diana', 'Santana'."""
    r = verify_document(page("CERTIFICATE OF LIVE BIRTH", "Name: MARIANA SANTANA ROXAS"),
                        "psa_birth_certificate", first_name="Ana", last_name="Lim")
    assert r["names_student"] is False, f"matched on {r['matched_name']!r}"


def test_G6_short_surnames_are_not_silently_ignored():
    """'Uy', 'Co', 'Go', 'Yu', 'Ng' are real, common surnames. They are shorter
    than the 3-character token floor, so the surname check never runs."""
    r = verify_document(page("CERTIFICATE OF LIVE BIRTH", "Name: JUAN MIGUEL SANTOS"),
                        "psa_birth_certificate", first_name="Juan", last_name="Uy")
    assert r["names_student"] is False  # given name matches, surname 'Uy' is absent


def test_G7_accents_and_case_are_tolerated():
    r = verify_document(page("CERTIFICATE OF LIVE BIRTH", "NAME: JOSE PEÑA"),
                        "psa_birth_certificate", first_name="Jose", last_name="Pena")
    assert r["names_student"] is True


def test_G8_wrong_document_type_is_flagged():
    r = verify_document(page("MERALCO", "Statement of Account", "Name: JUAN DELA CRUZ"),
                        "psa_birth_certificate", first_name="Juan", last_name="Dela Cruz")
    assert r["is_expected_document"] is False
    assert any("does not look like" in n for n in r["notes"])


@pytest.mark.parametrize("code,bill", [
    ("esc_completers", "Statement of Account | Description of charges | Generation charge"),
    ("alien_certificate", "Sacramento Barangay Hall | Residency Certificate"),
    ("esc_transferee_qc", "Grocery receipt | Item description | Qty | Amount"),
])
def test_G9_marker_check_is_not_satisfied_by_unrelated_text(code, bill):
    """Markers are matched as substrings: 'esc' sits inside 'description',
    'acr' inside 'Sacramento'. An unrelated page then 'looks like' the document."""
    r = verify_document(page(*bill.split(" | ")), code, first_name="Juan", last_name="Dela Cruz")
    assert r["is_expected_document"] is False, f"accepted via marker {r['document_type_seen']!r}"


def test_G10_blank_page_says_so():
    r = verify_document(page(), "health_record", first_name="Juan", last_name="Dela Cruz")
    assert any("No readable text" in n for n in r["notes"])


def test_G11_no_name_supplied_makes_no_claim():
    r = verify_document(page("HEALTH RECORD", "Name: X"), "health_record")
    assert r["names_student"] is None


# ═════════════════ H. the scan view ═════════════════

def _scan(code="health_record", student_id=None, size=None, image=b"\xff\xd8\xff synthetic"):
    data = {"image": SimpleUploadedFile("scan.jpg", image, "image/jpeg"), "requirement_code": code,
            "first_name": "Juan", "last_name": "Dela Cruz"}
    if student_id is not None:
        data["student_id"] = student_id
    dj = APIRequestFactory().post("/api/ocr/scan/", data, format="multipart")
    request = Request(dj, parsers=[MultiPartParser(), FormParser()])
    if size is not None:
        class Big:  # an upload that merely *reports* a large size
            def __init__(self, f): self._f = f; self.size = size
            def read(self): return self._f.read()
        files = request.FILES
        files["image"] = Big(files["image"])
        request._files = files
    return ocr_views.OCRScanView().post(request)


def _ctx(reader_page=None, reader_exc=None):
    reader = MagicMock()
    reader.engine = "paddle"
    if reader_exc is not None:
        reader.return_value.read.side_effect = reader_exc
    else:
        reader.return_value.read.return_value = reader_page
    model = MagicMock()
    model.objects.create.return_value = SimpleNamespace(document_extraction_id=7)
    return reader, model


def test_H1_reader_unavailable_degrades_without_a_cloud_call_or_a_false_claim():
    reader, model = _ctx(reader_exc=ImportError("No module named 'paddleocr'"))
    with patch.object(ocr_views, "PaddleReader", reader), patch.object(ocr_views, "DocumentExtraction", model), \
         patch.object(ocr_views, "_ledger_for", return_value={}), \
         patch.object(ocr_views.groq_vision, "call", side_effect=AssertionError("cloud called")):
        r = _scan()
    assert r.status_code == 200 and r.data["success"] is True
    assert r.data["check"]["is_expected_document"] is None       # no claim, not a failure
    assert r.data["check"]["names_student"] is None
    assert any("not checked" in w for w in r.data["warnings"])


def test_H2_corrupt_upload_is_not_reported_as_a_successful_scan():
    """A file that is not an image should be a client error, not success=True."""
    reader, model = _ctx(reader_exc=OSError("cannot identify image file"))
    with patch.object(ocr_views, "PaddleReader", reader), patch.object(ocr_views, "DocumentExtraction", model), \
         patch.object(ocr_views, "_ledger_for", return_value={}):
        r = _scan(image=b"this is not an image at all")
    assert not (r.status_code == 200 and r.data.get("success") is True and not r.data["extracted"]
                and r.data["check"]["notes"] == ["This document could not be read, so it was not checked."]), \
        "corrupt/non-image upload answered 200 success=True"


def test_H3_non_numeric_student_id_is_a_400_without_python_error_text():
    reader, model = _ctx(reader_page=page("HEALTH RECORD", "JUAN DELA CRUZ"))
    with patch.object(ocr_views, "PaddleReader", reader), patch.object(ocr_views, "DocumentExtraction", model), \
         patch.object(ocr_views, "_ledger_for", return_value={}):
        r = _scan(student_id="abc")
    assert r.status_code == 400
    assert "invalid literal" not in str(r.data) and "int()" not in str(r.data), r.data


def test_H4_oversize_upload_is_rejected_before_reading():
    reader, model = _ctx(reader_page=page("x"))
    with patch.object(ocr_views, "PaddleReader", reader), patch.object(ocr_views, "DocumentExtraction", model):
        r = _scan(size=ocr_views.MAX_IMAGE_BYTES + 1)
    assert r.status_code == 400
    reader.return_value.read.assert_not_called()


def test_H5_missing_image_is_400():
    dj = APIRequestFactory().post("/api/ocr/scan/", {"requirement_code": "health_record"}, format="multipart")
    request = Request(dj, parsers=[MultiPartParser(), FormParser()])
    assert ocr_views.OCRScanView().post(request).status_code == 400


def test_H6_stored_text_is_limited_to_what_the_check_needs():
    """Data minimisation: a VERIFY-only scan keeps the page's full transcription
    (every recognised line, with boxes) in document_extractions.blocks_json.
    For a health record that is medical information the check never reads."""
    lines = ["HEALTH RECORD", "Name: JUAN DELA CRUZ", "Diagnosis: SYNTHETIC-CONDITION-X",
             "Allergies: SYNTHETIC-ALLERGY-Y", "Immunization: complete"]
    reader, model = _ctx(reader_page=page(*lines))
    with patch.object(ocr_views, "PaddleReader", reader), patch.object(ocr_views, "DocumentExtraction", model), \
         patch.object(ocr_views, "_ledger_for", return_value={}):
        _scan(code="health_record", student_id="5")
    stored = model.objects.create.call_args.kwargs["blocks_json"]
    stored_text = " ".join(b["text"] for b in stored)
    assert "SYNTHETIC-CONDITION-X" not in stored_text and "SYNTHETIC-ALLERGY-Y" not in stored_text, \
        f"{len(stored)} blocks of page text persisted"


def test_H7_response_does_not_echo_page_text():
    reader, model = _ctx(reader_page=page("HEALTH RECORD", "Diagnosis: SYNTHETIC-CONDITION-X"))
    with patch.object(ocr_views, "PaddleReader", reader), patch.object(ocr_views, "DocumentExtraction", model), \
         patch.object(ocr_views, "_ledger_for", return_value={}):
        r = _scan(code="health_record", student_id="5")
    assert "SYNTHETIC-CONDITION-X" not in str(r.data)


def test_H8_unexpected_exception_is_generic_to_the_client():
    reader, model = _ctx(reader_page=page("HEALTH RECORD"))
    model.objects.create.side_effect = RuntimeError("psycopg2 secret-connection-detail")
    with patch.object(ocr_views, "PaddleReader", reader), patch.object(ocr_views, "DocumentExtraction", model), \
         patch.object(ocr_views, "_ledger_for", return_value={}):
        r = _scan(student_id="5")
    assert r.status_code == 500 and "secret-connection-detail" not in str(r.data)


def test_H9_ledger_requires_integer_student_id():
    dj = APIRequestFactory().get("/api/ocr/reconciled/", {"student_id": "1; DROP TABLE students"})
    r = ocr_views.ReconciledLedgerView().get(Request(dj))
    assert r.status_code == 400


def test_G3b_a_different_family_sharing_one_word_of_a_compound_surname_is_not_accepted():
    """'Dela Cruz' is split into 'dela' + 'cruz'; 'dela' alone is enough."""
    r = verify_document(page("CERTIFICATE OF LIVE BIRTH", "Name: PEDRO GARCIA DELA ROSA"),
                        "psa_birth_certificate", first_name="Miguel", last_name="Dela Cruz")
    assert r["names_student"] is False, f"matched on {r['matched_name']!r}"
