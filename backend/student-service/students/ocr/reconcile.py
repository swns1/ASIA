"""
Turning many documents' claims into one ledger, with disagreement preserved.

This is the fix for the defect that motivated the whole package: every
document a student submits carries their name, so scanning several produced
several opinions on it — and the previous code applied each one straight over
form state, so whichever was scanned last silently overwrote the rest.

Nothing here resolves a conflict on the user's behalf. Authority ranking
*proposes* a winner; the review UI still requires an explicit tick. The
disagreement itself is the point: two documents disagreeing on a birth date
means one of them is wrong, or they belong to two different people — which is
exactly the duplicate-student case worth catching before it reaches the
database.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from difflib import SequenceMatcher
from typing import Any

SINGLE = "single"      # only one document claimed this field
AGREED = "agreed"      # every claim matches after normalisation
CONFLICT = "conflict"  # claims genuinely differ

# How close two normalised strings must be to count as the same value. Set by
# the failure mode that matters: "Dela Cruz" vs "Dela Cruz." should agree,
# "Reyes" vs "Reyes-Santos" should not.
_SIMILARITY_THRESHOLD = 0.92

# Filipino given-name abbreviations that appear on civil documents. Expanding
# them is what stops "Ma. Cristina" and "Maria Cristina" being read as two
# different people.
_ABBREVIATIONS = {
    "ma": "maria",
    "jose": "jose",
    "sto": "santo",
    "sta": "santa",
}

# Name suffixes carry no identity and are written inconsistently (Jr, Jr.,
# JR), so they are dropped before comparison rather than normalised.
_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}

# Which document family wins when sources disagree. The ranking is the
# school's own: a civil registry document is authoritative for who someone is
# and who their parents are; a permanent record is authoritative for their
# learner reference number and academic history.
AUTHORITY: dict[str, tuple[str, ...]] = {
    "first_name":              ("birth_certificate", "form_137"),
    "middle_name":             ("birth_certificate", "form_137"),
    "last_name":               ("birth_certificate", "form_137"),
    "suffix":                  ("birth_certificate", "form_137"),
    "birth_date":              ("birth_certificate", "form_137"),
    "sex":                     ("birth_certificate", "form_137"),
    "guardians":               ("birth_certificate",),
    "lrn":                     ("form_137", "birth_certificate"),
    "previous_school_name":    ("form_137",),
    "previous_school_address": ("form_137",),
    "current_address":         ("birth_certificate", "form_137"),
    "permanent_address":       ("birth_certificate", "form_137"),
}

# Fields compared as exact values rather than fuzzy strings. A one-digit
# difference in an LRN is a different student, not a typo to forgive.
_EXACT_FIELDS = {"lrn", "sex", "birth_date"}


@dataclass(frozen=True)
class Claim:
    """One document's assertion about one field."""

    value: Any
    source_code: str          # requirement_code the document was filed under
    source_label: str         # human-readable, for the review UI
    family: str | None = None  # anchor family, for authority ranking
    confidence: str = "medium"
    engine: str = ""          # which reader produced it, for the local/fallback split


@dataclass
class FieldLedger:
    """Every claim about one field, and what to propose to the user."""

    name: str
    verdict: str
    claims: list[Claim] = field(default_factory=list)
    proposed: Any = None
    proposed_source: str = ""

    @property
    def is_conflict(self) -> bool:
        return self.verdict == CONFLICT


# ── Normalisation ────────────────────────────────────────────────────────────

def _strip_diacritics(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)
    )


def normalize_text(value: Any) -> str:
    """
    Case-folded, unpunctuated, de-accented, whitespace-collapsed, with
    Filipino given-name abbreviations expanded and name suffixes dropped.
    Comparison-only — the original value is what gets shown and applied.
    """
    if value is None:
        return ""
    text = _strip_diacritics(str(value)).lower()
    text = re.sub(r"[^\w\s]", " ", text)
    tokens = [t for t in text.split() if t]
    out = []
    for tok in tokens:
        if tok in _SUFFIXES:
            continue
        out.append(_ABBREVIATIONS.get(tok, tok))
    return " ".join(out)


def _as_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    match = re.match(r"^\s*(\d{4})-(\d{2})-(\d{2})", str(value or ""))
    if not match:
        return None
    try:
        return date(*(int(g) for g in match.groups()))
    except ValueError:
        return None


def _is_initial_of(short: str, long: str) -> bool:
    """
    "s" matches "santos". A middle name written out on a birth certificate and
    initialled on a permanent record is the single commonest false conflict,
    and treating it as a disagreement would train users to ignore the warning.
    """
    if not short or not long or len(short) > 1 or len(long) < 1:
        return False
    return long.startswith(short)


def values_agree(field_name: str, a: Any, b: Any) -> bool:
    """Whether two claims about the same field are the same claim."""
    if field_name == "birth_date":
        da, db = _as_date(a), _as_date(b)
        if da and db:
            return da == db

    if field_name == "lrn":
        digits_a = "".join(filter(str.isdigit, str(a or "")))
        digits_b = "".join(filter(str.isdigit, str(b or "")))
        return bool(digits_a) and digits_a == digits_b

    na, nb = normalize_text(a), normalize_text(b)
    if not na or not nb:
        return na == nb
    if na == nb:
        return True
    if field_name in _EXACT_FIELDS:
        return False

    # Initial-vs-spelled-out, token by token, for name-shaped fields.
    tokens_a, tokens_b = na.split(), nb.split()
    if len(tokens_a) == len(tokens_b) and all(
        ta == tb or _is_initial_of(ta, tb) or _is_initial_of(tb, ta)
        for ta, tb in zip(tokens_a, tokens_b)
    ):
        return True

    return SequenceMatcher(None, na, nb).ratio() >= _SIMILARITY_THRESHOLD


# ── The ledger ───────────────────────────────────────────────────────────────

def _rank(field_name: str, claim: Claim) -> int:
    """Lower sorts first. Unranked families fall to the back, stably."""
    order = AUTHORITY.get(field_name, ())
    family = claim.family or ""
    return order.index(family) if family in order else len(order)


def reconcile(claims_by_field: dict[str, list[Claim]]) -> dict[str, FieldLedger]:
    """
    Collapse every document's claims into one ledger entry per field.

    A field claimed once is SINGLE. Claimed several times and agreeing after
    normalisation, AGREED — which is a genuine confidence signal, since two
    independently-printed documents rarely agree by accident. Claimed several
    times and differing, CONFLICT: `proposed` names the authoritative source's
    value, but the caller must still ask before applying it.
    """
    ledger: dict[str, FieldLedger] = {}

    for field_name, claims in claims_by_field.items():
        usable = [c for c in claims if c.value not in (None, "", [])]
        if not usable:
            continue

        ranked = sorted(usable, key=lambda c: _rank(field_name, c))
        best = ranked[0]

        if len(usable) == 1:
            verdict = SINGLE
        elif all(values_agree(field_name, best.value, other.value) for other in ranked[1:]):
            verdict = AGREED
        else:
            verdict = CONFLICT

        ledger[field_name] = FieldLedger(
            name=field_name,
            verdict=verdict,
            claims=ranked,
            proposed=best.value,
            proposed_source=best.source_label,
        )

    return ledger


def claims_from_extractions(extractions) -> dict[str, list[Claim]]:
    """
    Flatten stored `DocumentExtraction` rows into per-field claims.

    Guardians are kept whole rather than split into fields: a mother and a
    father are two entries in one list, and comparing them field-by-field
    across documents would pair the wrong people together.
    """
    by_field: dict[str, list[Claim]] = {}
    for ex in extractions:
        extracted = ex.extracted_json or {}
        confidences = ex.field_confidence_json or {}
        for field_name, value in extracted.items():
            by_field.setdefault(field_name, []).append(
                Claim(
                    value=value,
                    source_code=ex.requirement_code,
                    source_label=ex.source_label,
                    family=ex.family or None,
                    confidence=confidences.get(field_name, "medium"),
                    engine=ex.source_engine or "",
                )
            )
    return by_field


def ledger_to_json(ledger: dict[str, FieldLedger]) -> dict:
    """Wire format for the review UI: every claim visible, nothing pre-applied."""
    return {
        name: {
            "verdict": entry.verdict,
            "proposed": entry.proposed,
            "proposed_source": entry.proposed_source,
            "claims": [
                {
                    "value": c.value,
                    "source_code": c.source_code,
                    "source_label": c.source_label,
                    "confidence": c.confidence,
                    "engine": c.engine,
                }
                for c in entry.claims
            ],
        }
        for name, entry in ledger.items()
    }
