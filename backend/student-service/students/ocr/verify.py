"""
Confirming a document is the right paper for the right student.

This is now the job for all thirteen requirement types, not just the
attestations (see policy.py on why extraction was retired). What matters is
that the student actually submitted the document the slot asked for, and that
it names *them* — the identity fields on a birth certificate or a Form 137 are
already typed by the family at the kiosk, from these same papers.

That is a string-matching problem, not a model problem. Nothing in this module
makes a network call or loads a model: it reads the text PaddleOCR already
produced. Which is the point — it takes every document off the paid path, and
stops them competing to overwrite a name the form already has right.
"""

from .policy import FAMILY_BIRTH_CERTIFICATE, FAMILY_FORM_137, FAMILY_MARKERS
from .reconcile import normalize_text
from .types import ParsedDocument

# Printed phrases that identify each document. Deliberately generous: a missed
# match downgrades to "couldn't confirm", which is a soft warning, whereas a
# false match would tell a registrar a wrong document was correct.
DOCUMENT_MARKERS: dict[str, tuple[str, ...]] = {
    # Sourced from policy.py rather than retyped: these are the same phrases
    # that used to gate whether an extraction could be trusted, already tuned
    # against the samples in OCR_IMAGES/. Without an entry here a code falls
    # through to "no claim either way", which would have quietly reduced these
    # three to a name match when they stopped being extracted.
    "psa_birth_certificate": FAMILY_MARKERS[FAMILY_BIRTH_CERTIFICATE],
    "birth_certificate":     FAMILY_MARKERS[FAMILY_BIRTH_CERTIFICATE],
    # The slot takes either document, so either marker set confirms it.
    "form_137_or_138": FAMILY_MARKERS[FAMILY_FORM_137] + (
        "report card", "form 138", "form138", "school form 9", "sf9",
    ),

    "form_138": ("report card", "form 138", "form138", "progress report",
                 "school form 9", "sf9"),
    "ncae_result": ("ncae", "national career assessment"),
    "health_record": ("health record", "medical record", "immunization",
                      "immunisation", "health examination"),
    "certificate_good_moral": ("good moral", "moral character"),
    "recommendation_letter": ("recommendation", "recommend"),
    "clearance_previous_school": ("clearance",),
    "certificate_non_sf9": ("non-sf9", "non sf9", "certificate of non"),
    "esc_completers": ("esc", "educational service contracting"),
    "esc_transferee_qc": ("esc", "transferee"),
    "alien_certificate": ("alien certificate", "alien certificate of registration",
                          "acr", "bureau of immigration"),
}

# A surname this short is too common to be evidence of anything.
_MIN_NAME_TOKEN = 3


def _document_markers_found(requirement_code: str, text: str) -> list[str]:
    markers = DOCUMENT_MARKERS.get((requirement_code or "").strip().lower(), ())
    return [m for m in markers if m in text]


def _name_tokens(*parts: str | None) -> list[str]:
    """Meaningful name tokens to look for, longest first."""
    tokens: list[str] = []
    for part in parts:
        tokens.extend(t for t in normalize_text(part).split() if len(t) >= _MIN_NAME_TOKEN)
    # Longest first: matching "dela cruz" is stronger evidence than "cruz".
    return sorted(set(tokens), key=len, reverse=True)


def verify_document(parsed: ParsedDocument, requirement_code: str,
                    first_name: str | None = None,
                    last_name: str | None = None) -> dict:
    """
    Returns the check result for a submitted document.

    `is_expected_document` is False only when the code has known markers and
    none of them appear — an unrecognised requirement code produces no claim
    either way rather than a spurious warning.

    Name matching is done on the *surname* primarily. A document that names a
    different student is the signal worth catching: it means the wrong file was
    attached to this student's record, which no amount of field extraction
    would ever have revealed.
    """
    text = normalize_text(parsed.text)
    raw_lower = parsed.text.lower()

    markers = _document_markers_found(requirement_code, raw_lower)
    has_known_markers = bool(DOCUMENT_MARKERS.get((requirement_code or "").lower()))
    is_expected = bool(markers) if has_known_markers else True

    surname_tokens = _name_tokens(last_name)
    given_tokens = _name_tokens(first_name)
    surname_hit = next((t for t in surname_tokens if t in text), None)
    given_hit = next((t for t in given_tokens if t in text), None)

    if not surname_tokens and not given_tokens:
        names_student = None  # nothing to check against yet
    else:
        names_student = bool(surname_hit or given_hit)

    notes: list[str] = []
    if has_known_markers and not markers:
        notes.append("This does not look like the document type it was filed under.")
    if names_student is False:
        notes.append("The student's name was not found on this document.")
    if not parsed.blocks:
        notes.append("No readable text was found — the photo may be too blurred or dark.")

    return {
        "document_type_seen": markers[0] if markers else None,
        "is_expected_document": is_expected,
        "names_student": names_student,
        "matched_name": surname_hit or given_hit,
        "notes": notes,
        "mean_confidence": round(parsed.mean_confidence, 3),
    }
