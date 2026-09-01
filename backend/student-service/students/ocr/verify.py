"""
Confirming a document is the right paper for the right student.

Nine of the thirteen requirement types are attestations — a good-moral
certificate, a clearance, a recommendation letter. Their content is not
something the enrollment form holds; what matters is that the student actually
submitted the right document, and that it names *them*.

That is a string-matching problem, not a model problem. Nothing in this module
makes a network call or loads a model: it reads the text PaddleOCR already
produced. Which is the point — it takes nine of thirteen documents off the
paid path entirely, and stops them competing to overwrite a name the form
already has right.
"""

from .reconcile import normalize_text
from .types import ParsedDocument

# Printed phrases that identify each document. Deliberately generous: a missed
# match downgrades to "couldn't confirm", which is a soft warning, whereas a
# false match would tell a registrar a wrong document was correct.
DOCUMENT_MARKERS: dict[str, tuple[str, ...]] = {
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
    Returns the check result for an attestation document.

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
