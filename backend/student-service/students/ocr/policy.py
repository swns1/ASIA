"""
Which documents deserve a full extraction, and which only need confirming.

Today the answer is "none" and "all thirteen" — every requirement type is
VERIFY. This table is still the switch, and both policies are still
implemented; what changed is the premise, not the machinery.

Extraction existed to spare *staff* from keying a student's identity, parents
and previous school off a birth certificate or a Form 137. The applicant kiosk
moved that typing to the family, who fill the form themselves while holding
the same documents — and a parent reading their child's LRN off a PSA copy
beats an OCR pass someone then has to correct, since a twelve-digit number is
exactly where a recogniser is weakest. Note also what the Form 137 anchor set
actually pulls (see anchors.py): identity fields, not term grades. There was
never anything in it the kiosk form does not already ask for.

What survives is the job the other eleven documents always had, and the one
the kiosk cannot do: confirming that the paper handed over is the right
document, for the right student. That was already cheaper — pure string work,
no model call — and it is now the whole of it.

To re-enable extraction for a document family (for example, to cross-check a
typed LRN against the birth certificate rather than to prefill anything),
change that code's entry back to EXTRACT here. anchors.py, groq_vision.py and
reconcile.py are retained and unchanged for exactly that reason.
"""

from .types import ParsedDocument

EXTRACT = "extract"  # anchors -> fields; fills the form
VERIFY = "verify"    # right document, right student? no model call at all

# Anchor sets, keyed by document family rather than by requirement_code —
# `birth_certificate` and `psa_birth_certificate` are two codes for one form.
FAMILY_BIRTH_CERTIFICATE = "birth_certificate"
FAMILY_FORM_137 = "form_137"

_POLICY: dict[str, tuple[str, str | None]] = {
    # ── the two families that used to be mined for fields ────────────────
    # Verified, not extracted: the family types these fields at the kiosk
    # from these very documents (see the module docstring). Their printed
    # markers live in FAMILY_MARKERS below and verify.py reads them from
    # there, so demoting them kept the document-type check rather than
    # silently reducing these three to a name match.
    "psa_birth_certificate": (VERIFY, None),
    "birth_certificate":     (VERIFY, None),
    "form_137_or_138":       (VERIFY, None),

    # ── verify: confirm the paper, don't mine it ─────────────────────────
    # Form 138 is the report card. Its payload is term grades and the
    # enrollment form has no field for them; the name and school it also
    # carries are already covered by better sources, so extracting it would
    # only add a competing opinion on the name.
    "form_138":                  (VERIFY, None),
    "ncae_result":               (VERIFY, None),
    "health_record":             (VERIFY, None),
    "certificate_good_moral":    (VERIFY, None),
    "recommendation_letter":     (VERIFY, None),
    "clearance_previous_school": (VERIFY, None),
    "certificate_non_sf9":       (VERIFY, None),
    "esc_completers":            (VERIFY, None),
    "esc_transferee_qc":         (VERIFY, None),
    "alien_certificate":         (VERIFY, None),
}

# An unknown or missing requirement_code verifies rather than extracts. A
# wrong anchor set produces confidently wrong fields, which is worse than no
# fields at all, so the default leans away from extraction.
_DEFAULT = (VERIFY, None)

# Printed markers that tell the two documents in the shared slot apart.
_FORM_137_MARKERS = ("permanent record", "form 137", "form137", "sf10", "school form 10")
_FORM_138_MARKERS = ("report card", "form 138", "form138", "sf9", "school form 9",
                     "progress report")

# Markers used to sanity-check that an extract document is what it claims to
# be, before its fields are trusted.
FAMILY_MARKERS: dict[str, tuple[str, ...]] = {
    FAMILY_BIRTH_CERTIFICATE: (
        "certificate of live birth", "live birth", "civil registrar",
        "birth certificate", "municipal form no. 102", "psa",
    ),
    FAMILY_FORM_137: _FORM_137_MARKERS,
}


def policy_for(requirement_code: str | None) -> tuple[str, str | None]:
    """(policy, family) from the requirement code alone, before the page is read."""
    return _POLICY.get((requirement_code or "").strip().lower(), _DEFAULT)


def _contains_any(haystack: str, needles) -> bool:
    return any(n in haystack for n in needles)


def resolve_policy(requirement_code: str | None,
                   parsed: ParsedDocument) -> tuple[str, str | None]:
    """
    The policy for this document, now that its text has been read.

    Currently a pass-through: no code in _POLICY resolves to EXTRACT, so the
    branch below is unreachable and every document returns (VERIFY, None).
    It is kept because it is what makes re-enabling extraction safe, and
    because it is only correct in one direction — it can demote, never
    promote.

    Only `form_137_or_138` can change here: it is a single requirement slot
    that accepts either a permanent record or a report card, so the code alone
    cannot decide. A Form 138 landing in that slot is demoted to VERIFY rather
    than run through the Form 137 anchor set, and a page carrying neither
    marker is demoted too — guessing an anchor set is how you get fields that
    are confidently wrong.
    """
    policy, family = policy_for(requirement_code)
    if family != FAMILY_FORM_137:
        return policy, family

    text = parsed.text.lower()
    if _contains_any(text, _FORM_137_MARKERS):
        return EXTRACT, FAMILY_FORM_137
    if _contains_any(text, _FORM_138_MARKERS):
        return VERIFY, None
    return VERIFY, None


def looks_like_family(family: str | None, parsed: ParsedDocument) -> bool:
    """
    Whether the page carries the printed markers of the family it was filed
    under. A false answer is one of the signals that escalates to the cloud
    fallback — and, for the user, the "this may not be the document you meant
    to upload" warning.
    """
    markers = FAMILY_MARKERS.get(family or "")
    if not markers:
        return True  # nothing to check against; don't manufacture a warning
    return _contains_any(parsed.text.lower(), markers)
