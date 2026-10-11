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

NAME_MATCH = "match"
NAME_SURNAME_ONLY = "surname_only"
NAME_GIVEN_ONLY = "given_only"
NAME_NONE = "none"

_NAME_NOTES = {
    NAME_SURNAME_ONLY: "Only the surname matches — this may be a sibling's or a relative's document.",
    NAME_GIVEN_ONLY: "Only the first name matches — the surname on this document is different.",
    NAME_NONE: "The student's name was not found on this document.",
}


def _document_markers_found(requirement_code: str, text: str) -> list[str]:
    markers = DOCUMENT_MARKERS.get((requirement_code or "").strip().lower(), ())
    return [m for m in markers if m in text]


def _surname_found(surname: list[str], words: list[str]) -> bool:
    """
    The whole surname, as consecutive whole words, spacing-insensitive:
    "Dela Cruz", "De La Cruz" and "DELACRUZ" are one surname on paper.

    Matching any one word of it, anywhere in the text, was the old rule. It
    passed a sibling's certificate (same surname), a "Dela Rosa" family for a
    "Dela Cruz" student ("dela" alone), and found "ana" inside "Mariana".
    """
    target = "".join(surname)
    for start in range(len(words)):
        joined = ""
        for word in words[start:]:
            joined += word
            if joined == target:
                return True
            if len(joined) >= len(target):
                break
    return False


def _given_names_found(given: list[str], words: list[str]) -> bool:
    """
    Every given name, as whole words. One shared given name is not evidence of
    identity: "Mary Grace" and her sister "Mary Ann" share "Mary". A missed
    match costs a soft "worth a second look"; a false match vouches for the
    wrong child's document, so this errs strict.
    """
    present = set(words)
    return all(name in present for name in given)


def verify_document(parsed: ParsedDocument, requirement_code: str,
                    first_name: str | None = None,
                    last_name: str | None = None) -> dict:
    """
    Returns the check result for a submitted document.

    `is_expected_document` is False only when the code has known markers and
    none of them appear — an unrecognised requirement code produces no claim
    either way rather than a spurious warning.

    A document names the student only when every part of the name supplied is
    on it: the whole surname and every given name, each as whole words. A
    document that names a different student is the signal worth catching: it
    means the wrong file was attached to this student's record, which no
    amount of field extraction would ever have revealed. The likeliest such
    file is a sibling's, enrolled the same day with the same surname -- which
    is why a surname alone is reported as `surname_only`, not as a match.

    Known limit: the check reads the whole page, not the name field, so a
    sibling's birth certificate whose *father* shares this student's given
    name still matches.
    """
    words = normalize_text(parsed.text).split()
    raw_lower = parsed.text.lower()

    markers = _document_markers_found(requirement_code, raw_lower)
    has_known_markers = bool(DOCUMENT_MARKERS.get((requirement_code or "").lower()))
    is_expected = bool(markers) if has_known_markers else True

    surname = normalize_text(last_name).split()
    # A lone initial ("Juan M.") proves nothing about who is named.
    given = [name for name in normalize_text(first_name).split() if len(name) > 1]

    if not surname and not given:
        names_student, name_match, matched_name = None, None, None  # nothing to check against yet
    else:
        surname_ok = _surname_found(surname, words) if surname else None
        given_ok = _given_names_found(given, words) if given else None
        names_student = surname_ok is not False and given_ok is not False
        if names_student:
            name_match = NAME_MATCH
        elif surname_ok:
            name_match = NAME_SURNAME_ONLY
        elif given_ok:
            name_match = NAME_GIVEN_ONLY
        else:
            name_match = NAME_NONE
        found = (given if given_ok else []) + (surname if surname_ok else [])
        matched_name = " ".join(found) or None

    notes: list[str] = []
    if has_known_markers and not markers:
        notes.append("This does not look like the document type it was filed under.")
    if names_student is False:
        notes.append(_NAME_NOTES[name_match])
    if not parsed.blocks:
        notes.append("No readable text was found — the photo may be too blurred or dark.")

    return {
        "document_type_seen": markers[0] if markers else None,
        "is_expected_document": is_expected,
        "names_student": names_student,
        "name_match": name_match,
        "matched_name": matched_name,
        "notes": notes,
        "mean_confidence": round(parsed.mean_confidence, 3),
    }
