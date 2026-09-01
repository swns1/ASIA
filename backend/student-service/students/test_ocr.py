"""
Tests for document scanning.

Almost everything here runs without PaddleOCR installed and without a network
call: the pipeline is layered so that only `reader.py` touches the engine, and
every layer above it consumes a `ParsedDocument`. A hand-built ParsedDocument
is a better test input than a fixture image anyway — it is explicit about the
geometry each assertion depends on, where an image hides it.

The one test that needs paddle is marked with `importorskip`, so CI keeps
covering the anchor and reconciliation logic without a 1 GB install.
"""
from types import SimpleNamespace

import pytest
from rest_framework.test import APIRequestFactory

from accounts.permissions import HasRole
from students.ocr import groq_vision
from students.ocr.anchors import (
    BELOW,
    RIGHT,
    Anchor,
    extract_fields,
    find_label,
    resolve_anchor,
)
from students.ocr.policy import (
    EXTRACT,
    VERIFY,
    FAMILY_BIRTH_CERTIFICATE,
    FAMILY_FORM_137,
    looks_like_family,
    policy_for,
    resolve_policy,
)
from students.ocr.reconcile import (
    AGREED,
    CONFLICT,
    SINGLE,
    Claim,
    normalize_text,
    reconcile,
    values_agree,
)
from students.ocr.types import ParsedDocument, TextBlock
from students.ocr.verify import verify_document
from students.ocr.views import OCRScanView, ReconciledLedgerView, _should_fallback


def block(text, x0, y0, x1=None, y1=None, conf=0.95):
    """One text block; sizes default to something the geometry can work with."""
    return TextBlock(text=text, box=(x0, y0, x1 if x1 is not None else x0 + 80,
                                     y1 if y1 is not None else y0 + 16), confidence=conf)


def doc(*blocks, width=1000, height=1400):
    return ParsedDocument(blocks=list(blocks), width=width, height=height, engine="test")


def lines(*texts):
    """A simple stack of full-width lines, for text-only (keyword) assertions."""
    return doc(*[block(t, 0, i * 20) for i, t in enumerate(texts)])


# ─────────────────────────────────────────────────────────────────────────
# Policy — which documents earn a full extraction
# ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("code,expected", [
    ("psa_birth_certificate", EXTRACT),
    ("birth_certificate", EXTRACT),
    ("form_137_or_138", EXTRACT),
    # Form 138 is the report card: its payload is term grades, and the
    # enrollment form has no field for them.
    ("form_138", VERIFY),
    ("certificate_good_moral", VERIFY),
    ("ncae_result", VERIFY),
    ("health_record", VERIFY),
])
def test_policy_for_requirement_code(code, expected):
    assert policy_for(code)[0] == expected


def test_unknown_requirement_code_verifies_rather_than_extracts():
    # A wrong anchor set produces confidently wrong fields, which is worse
    # than no fields — so the default leans away from extraction.
    assert policy_for("something_new")[0] == VERIFY
    assert policy_for(None)[0] == VERIFY


def test_form_137_slot_routes_by_what_the_page_actually_says():
    """
    `form_137_or_138` is one requirement slot accepting either document, so
    the code alone cannot decide the policy.
    """
    f137 = lines("DepEd Form 137", "LEARNER PERMANENT RECORD", "LRN: 136789012345")
    assert resolve_policy("form_137_or_138", f137) == (EXTRACT, FAMILY_FORM_137)

    f138 = lines("DepEd Form 138", "REPORT CARD", "First Quarter 88")
    assert resolve_policy("form_137_or_138", f138) == (VERIFY, None)


def test_form_137_slot_demotes_when_neither_marker_is_present():
    assert resolve_policy("form_137_or_138", lines("a holiday photo")) == (VERIFY, None)


def test_looks_like_family_flags_a_mismatched_document():
    birth = lines("CERTIFICATE OF LIVE BIRTH", "OFFICE OF THE CIVIL REGISTRAR")
    assert looks_like_family(FAMILY_BIRTH_CERTIFICATE, birth) is True
    assert looks_like_family(FAMILY_BIRTH_CERTIFICATE, lines("GOOD MORAL")) is False
    # No markers registered for a family means no claim either way, rather
    # than a manufactured warning.
    assert looks_like_family(None, lines("anything")) is True


# ─────────────────────────────────────────────────────────────────────────
# Verify — the nine attestation documents, no model call
# ─────────────────────────────────────────────────────────────────────────

GOOD_MORAL = ("CERTIFICATE OF GOOD MORAL CHARACTER",
              "This is to certify that ANA MARIE DELA CRUZ",
              "is of good moral character.")


def test_verify_accepts_the_right_document_for_the_right_student():
    result = verify_document(lines(*GOOD_MORAL), "certificate_good_moral",
                             first_name="Ana", last_name="Dela Cruz")
    assert result["is_expected_document"] is True
    assert result["names_student"] is True
    assert result["notes"] == []


def test_verify_flags_a_document_naming_a_different_student():
    # The signal worth catching: the wrong file attached to a student's
    # record, which no amount of field extraction would ever reveal.
    result = verify_document(lines(*GOOD_MORAL), "certificate_good_moral",
                             first_name="Juan", last_name="Bautista")
    assert result["names_student"] is False
    assert any("name was not found" in n for n in result["notes"])


def test_verify_flags_the_wrong_document_type_for_the_slot():
    result = verify_document(lines(*GOOD_MORAL), "health_record",
                             first_name="Ana", last_name="Dela Cruz")
    assert result["is_expected_document"] is False
    assert any("does not look like" in n for n in result["notes"])


def test_verify_makes_no_claim_when_there_is_no_name_to_check_against():
    result = verify_document(lines(*GOOD_MORAL), "certificate_good_moral")
    assert result["names_student"] is None


def test_verify_reports_an_unreadable_page():
    result = verify_document(doc(), "certificate_good_moral", last_name="Reyes")
    assert any("No readable text" in n for n in result["notes"])


# ─────────────────────────────────────────────────────────────────────────
# Anchors — geometry, not a model
# ─────────────────────────────────────────────────────────────────────────

def test_anchor_reads_the_value_to_the_right_of_its_label():
    page = doc(block("RELIGION", 100, 500, 180, 516),
               block("CATHOLIC", 200, 500, 280, 516))
    value, confidence = resolve_anchor(page, Anchor("religion", ("RELIGION",), RIGHT))
    assert value == "CATHOLIC"
    assert confidence == pytest.approx(0.95)


def test_anchor_reads_only_the_first_line_below_its_label():
    """
    Municipal Form No. 102 prints "(First) (Middle) (Last)" as a row of
    captions with values on the line below. Without a one-line limit the
    search window spills into the next row of the form and a name comes back
    as "NIEL ASHLEY 3. DATE OF BIRTH" — the value plus the caption beneath it.
    """
    page = doc(
        block("(First)", 290, 226, 330, 242),
        block("NIEL ASHLEY", 288, 250, 380, 266),
        block("3. DATE OF BIRTH", 285, 290, 400, 306),
    )
    value, _ = resolve_anchor(page, Anchor("first_name", ("(First)",), BELOW, max_gap=4.0))
    assert value == "NIEL ASHLEY"


def test_anchor_yields_nothing_when_its_label_is_absent():
    page = doc(block("SOMETHING ELSE", 0, 0))
    assert resolve_anchor(page, Anchor("religion", ("RELIGION",), RIGHT)) == (None, 0.0)


def test_label_matching_survives_recogniser_noise_without_merging_opposites():
    # "(Firat)" is what actually comes back off security paper.
    page = doc(block("(Firat)", 290, 226), block("MARIA", 288, 250))
    assert find_label(page, ("(First)",)) is not None
    # But the pair that must never merge stays separate.
    father = doc(block("FATHER", 0, 0))
    assert find_label(father, ("MOTHER",)) is None


@pytest.mark.parametrize("noise", [
    "(First)", "1. NAME", "21. PREPARED BY", "(Middle)", "---", "12",
])
def test_form_furniture_is_not_mistaken_for_a_value(noise):
    page = doc(block("RELIGION", 100, 500, 180, 516),
               block(noise, 200, 500, 300, 516))
    assert resolve_anchor(page, Anchor("religion", ("RELIGION",), RIGHT))[0] is None


def test_anchor_pattern_rejects_a_value_of_the_wrong_shape():
    page = doc(block("SEX", 100, 500, 140, 516),
               block("Bisaya", 160, 500, 220, 516))
    anchor = Anchor("sex", ("SEX",), RIGHT, pattern=r"^(male|female|m|f)$")
    assert resolve_anchor(page, anchor)[0] is None


def test_partial_lrn_is_dropped_rather_than_guessed():
    """
    `lrn` is unique on Student, so a wrong one either collides with a real
    student or creates a phantom. Half an LRN is worse than none.
    """
    page = doc(block("LRN", 600, 40, 640, 60), block("13678901", 660, 40, 760, 60))
    fields, _ = extract_fields(page, FAMILY_FORM_137)
    assert "lrn" not in fields

    good = doc(block("LRN", 600, 40, 640, 60), block("136789012345", 660, 40, 780, 60))
    fields, _ = extract_fields(good, FAMILY_FORM_137)
    assert fields["lrn"] == "136789012345"


def test_mother_and_father_become_two_guardians():
    page = doc(
        block("MAIDEN NAME", 100, 600, 200, 616),
        block("CRISTINA REYES", 100, 630, 240, 646),
        block("NAME OF FATHER", 100, 700, 220, 716),
        block("JUAN DELA CRUZ", 100, 730, 240, 746),
    )
    fields, _ = extract_fields(page, FAMILY_BIRTH_CERTIFICATE)
    relationships = {g["relationship"] for g in fields["guardians"]}
    assert relationships == {"mother", "father"}


# ─────────────────────────────────────────────────────────────────────────
# Reconciliation — the defect this package exists to fix
# ─────────────────────────────────────────────────────────────────────────

BC = dict(source_label="PSA Birth Certificate", family=FAMILY_BIRTH_CERTIFICATE)
F137 = dict(source_label="Form 137", family=FAMILY_FORM_137)


@pytest.mark.parametrize("field,a,b", [
    ("first_name", "Maria", "Ma."),          # Filipino abbreviation
    ("first_name", "MARIA", "Maria"),        # case
    ("middle_name", "Santos", "S."),         # initial vs spelled out
    ("last_name", "Dela Cruz", "Dela Cruz."),  # trailing punctuation
    ("last_name", "Peña", "Pena"),           # diacritics
    ("last_name", "Dela Cruz Jr.", "Dela Cruz"),  # suffix
])
def test_the_same_person_written_differently_is_not_a_conflict(field, a, b):
    # False conflicts are worse than none: they train people to ignore the
    # warning, and then the real ones get waved through too.
    assert values_agree(field, a, b) is True


@pytest.mark.parametrize("field,a,b", [
    ("last_name", "Reyes", "Reyes-Santos"),
    ("first_name", "Maria", "Mario"),
    ("birth_date", "2010-05-14", "2011-05-14"),
    ("lrn", "136789012345", "136789012346"),  # one digit = a different student
    ("sex", "male", "female"),
])
def test_genuinely_different_values_conflict(field, a, b):
    assert values_agree(field, a, b) is False


def test_normalisation_expands_abbreviations_and_drops_suffixes():
    assert normalize_text("Ma. Cristina") == "maria cristina"
    assert normalize_text("Dela Cruz, Jr.") == "dela cruz"
    assert normalize_text("Peña") == "pena"


def test_ledger_marks_agreement_conflict_and_single_source():
    ledger = reconcile({
        "first_name": [Claim("Maria", "psa_birth_certificate", **BC),
                       Claim("Ma.", "form_137_or_138", **F137)],
        "birth_date": [Claim("2010-05-14", "psa_birth_certificate", **BC),
                       Claim("2011-05-14", "form_137_or_138", **F137)],
        "lrn": [Claim("136789012345", "form_137_or_138", **F137)],
    })
    assert ledger["first_name"].verdict == AGREED
    assert ledger["birth_date"].verdict == CONFLICT
    assert ledger["lrn"].verdict == SINGLE


def test_conflicts_propose_the_authoritative_source_but_keep_both_claims():
    ledger = reconcile({
        "birth_date": [Claim("2011-05-14", "form_137_or_138", **F137),
                       Claim("2010-05-14", "psa_birth_certificate", **BC)],
    })
    entry = ledger["birth_date"]
    # A civil registry document outranks a school record on date of birth,
    # regardless of which was scanned first.
    assert entry.proposed == "2010-05-14"
    assert entry.proposed_source == "PSA Birth Certificate"
    assert len(entry.claims) == 2  # nothing is discarded


def test_lrn_authority_is_the_permanent_record_not_the_birth_certificate():
    ledger = reconcile({
        "lrn": [Claim("136789012345", "psa_birth_certificate", **BC),
                Claim("136789012399", "form_137_or_138", **F137)],
    })
    assert ledger["lrn"].proposed == "136789012399"


def test_empty_claims_never_enter_the_ledger():
    assert reconcile({"first_name": [Claim("", "x", source_label="X")]}) == {}


# ─────────────────────────────────────────────────────────────────────────
# Fallback escalation
# ─────────────────────────────────────────────────────────────────────────

def test_a_good_local_pass_does_not_call_the_cloud():
    page = doc(block("x", 0, 0, 10, 10, conf=0.95))
    fields = {"first_name": "A", "middle_name": "B", "last_name": "C",
              "sex": "male", "birth_date": "2010-01-01", "religion": "R",
              "previous_school_name": "S", "previous_school_address": "T",
              "lrn": "136789012345"}
    assert _should_fallback(fields, FAMILY_BIRTH_CERTIFICATE, page, True) is None


def test_a_thin_local_pass_escalates():
    page = doc(block("x", 0, 0, 10, 10, conf=0.95))
    assert _should_fallback({}, FAMILY_BIRTH_CERTIFICATE, page, True) is not None


def test_low_recognition_confidence_escalates():
    page = doc(block("x", 0, 0, 10, 10, conf=0.20))
    full = {n: "v" for n in ("first_name", "middle_name", "last_name", "sex",
                             "birth_date", "religion")}
    assert "confidence" in _should_fallback(full, FAMILY_BIRTH_CERTIFICATE, page, True)


def test_the_wrong_document_escalates():
    page = doc(block("x", 0, 0, 10, 10, conf=0.95))
    full = {n: "v" for n in ("first_name", "middle_name", "last_name", "sex",
                             "birth_date", "religion")}
    assert _should_fallback(full, FAMILY_BIRTH_CERTIFICATE, page, False) is not None


# ─────────────────────────────────────────────────────────────────────────
# Cloud fallback — sanitising, without the network
# ─────────────────────────────────────────────────────────────────────────

def test_fallback_sanitiser_drops_blanks_and_whitelists_sex():
    fields, _ = groq_vision.sanitize({
        "first_name": "  Maria  ", "middle_name": "", "last_name": None,
        "sex": "unknown", "confidence": "high",
    })
    assert fields == {"first_name": "Maria"}


def test_fallback_sanitiser_keeps_an_lrn_only_at_twelve_digits():
    fields, _ = groq_vision.sanitize({"lrn": "1367-8901-2345"})
    assert fields["lrn"] == "136789012345"
    assert "lrn" not in groq_vision.sanitize({"lrn": "13678"})[0]


def test_fallback_sanitiser_coerces_unknown_guardian_relationships():
    fields, _ = groq_vision.sanitize({
        "guardians": [{"full_name": "A B", "relationship": "auntie"},
                      {"full_name": "", "relationship": "mother"}],
    })
    assert fields["guardians"] == [{"full_name": "A B", "relationship": "guardian"}]


def test_fallback_reserves_far_fewer_tokens_than_it_used_to():
    # The free tier bills prompt_tokens + max_tokens as *reserved*, so the old
    # 1500 ceiling threw away ~1200 tokens of an 8000/min budget per call for
    # completions that run ~250 tokens.
    assert groq_vision.MAX_TOKENS <= 700


def test_fallback_prompt_is_told_which_document_it_is_looking_at():
    assert "maiden" in groq_vision.prompt_for(FAMILY_BIRTH_CERTIFICATE).lower()
    assert "lrn" in groq_vision.prompt_for(FAMILY_FORM_137).lower()


# ─────────────────────────────────────────────────────────────────────────
# Permissions
# ─────────────────────────────────────────────────────────────────────────

factory = APIRequestFactory()
VIEWS = [OCRScanView, ReconciledLedgerView]


def _user(role):
    return SimpleNamespace(role=role, user_id=1, pk=1, is_authenticated=True)


class TestScanPermissions:
    perm = HasRole()

    @pytest.mark.parametrize("view_cls", VIEWS)
    @pytest.mark.parametrize("role", ["super_admin", "admin", "registrar"])
    def test_allowed_roles(self, view_cls, role):
        request = factory.post("/")
        request.user = _user(role)
        assert self.perm.has_permission(request, view_cls) is True

    @pytest.mark.parametrize("view_cls", VIEWS)
    @pytest.mark.parametrize("role", ["teacher", "accounting", "guardian"])
    def test_rejected_roles(self, view_cls, role):
        request = factory.post("/")
        request.user = _user(role)
        assert self.perm.has_permission(request, view_cls) is False

    @pytest.mark.parametrize("view_cls", VIEWS)
    def test_unauthenticated_denied(self, view_cls):
        request = factory.post("/")
        request.user = SimpleNamespace(is_authenticated=False)
        assert self.perm.has_permission(request, view_cls) is False


# ─────────────────────────────────────────────────────────────────────────
# The engine wrapper — the only part that needs paddle
# ─────────────────────────────────────────────────────────────────────────

def test_reader_normalises_both_box_shapes():
    """
    A regression guard with teeth. `rec_boxes` arrives as a numpy int16 array,
    and numpy scalars fail `isinstance(v, int)` — so an element *type* check
    silently routed every axis-aligned box down the polygon path and produced
    zero-area geometry, which made every anchor unresolvable while looking
    like a recognition problem.
    """
    pytest.importorskip("numpy")
    from students.ocr.reader import _to_box
    import numpy as np

    axis_aligned = np.array([13, 31, 93, 42], dtype=np.int16)
    assert _to_box(axis_aligned) == (13.0, 31.0, 93.0, 42.0)

    quad = np.array([[13, 31], [93, 31], [93, 42], [13, 42]], dtype=np.int16)
    assert _to_box(quad) == (13.0, 31.0, 93.0, 42.0)

    assert _to_box(np.array([1, 2, 3], dtype=np.int16)) == (0.0, 0.0, 0.0, 0.0)


def test_preprocessing_shrinks_rather_than_inflates():
    """
    At the previous 2000px/quality-90 this made files *bigger* — 436 KB in,
    605 KB out on the real sample — because the page already sat under the cap
    so nothing downscaled, and it was then re-saved at higher fidelity.
    """
    pytest.importorskip("PIL")
    from io import BytesIO

    from PIL import Image

    from students.image_preprocessing import MAX_DIMENSION, preprocess_for_ocr

    buf = BytesIO()
    Image.new("RGB", (2400, 3200), (200, 190, 180)).save(buf, "JPEG", quality=95)
    out = preprocess_for_ocr(buf.getvalue())
    assert max(Image.open(BytesIO(out)).size) <= MAX_DIMENSION


def test_paddle_reader_is_the_only_module_that_imports_the_engine():
    """
    The layering that keeps everything above the reader testable in CI without
    a 1 GB dependency. If another module starts importing paddle directly,
    this is the test that should fail.
    """
    import pathlib

    ocr_dir = pathlib.Path(__file__).parent / "ocr"
    offenders = [
        path.name
        for path in ocr_dir.glob("*.py")
        if path.name != "reader.py" and "paddleocr" in path.read_text(encoding="utf-8")
    ]
    assert offenders == []
