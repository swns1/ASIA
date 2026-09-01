"""
Turning a page of text blocks into fields, by keying off the form's own labels.

This is the step PaddleOCR does not do. It reads the *words* fine; it has no
idea that `REYES` is the mother's name rather than the father's. The usual
answer — LayoutLMv3, Donut — needs fine-tuning on labelled examples of your
exact schema, which is the data problem this project ruled out. Anchoring
sidesteps it entirely: PSA Municipal Form No. 102 and DepEd Form 137 are
*fixed layouts*, so the structure to key off is already printed on the page.

Task 1 confirmed this is viable on real documents: 16/17 anchor labels
recovered from the PSA certificate despite SECPA security paper, and 15/18
from a Form 137. Crucially the *labels* came back clean while the *values*
were noisy ("MARCH 25,8002" for 2002) — which is the right way round. A noisy
value escalates to the cloud fallback; a garbled label would have made the
whole approach impossible.
"""

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from .policy import FAMILY_BIRTH_CERTIFICATE, FAMILY_FORM_137
from .reconcile import normalize_text
from .types import ParsedDocument, TextBlock

RIGHT = "right"
BELOW = "below"

# How far a value may sit ABOVE the bottom of its own label and still count as
# being below it, in label heights. Captions and handwritten values are not
# printed on tidy separate lines: on the certificate the child's surname
# ("CAPILI", y 240-261) starts *five pixels above* the bottom of its own
# "(Last)" caption (y 230-245). At the old 0.2 the surname was excluded and the
# anchor reached down to the next row of the form instead.
_VALUE_OVERLAP = 0.5

# How close a block's text must be to a label to count as that label. Loose
# enough to survive the recogniser dropping a character, tight enough that
# "FATHER" does not match "MOTHER".
_LABEL_MATCH_THRESHOLD = 0.72


@dataclass(frozen=True)
class Anchor:
    """Where to find one field relative to its printed label."""

    name: str
    labels: tuple[str, ...]
    direction: str = RIGHT
    # Search distance, in multiples of the label's own text height — so the
    # tolerance scales with the resolution the page was scanned at instead of
    # being a pixel count that only works for one image size.
    max_gap: float = 8.0
    # Vertical slack when reading to the right, again in label heights.
    row_tolerance: float = 0.8
    # How many blocks to join (a name split across "JUAN" "DELA" "CRUZ").
    max_blocks: int = 3
    pattern: str | None = None  # value must match, else the anchor yields nothing
    # How far right of the label a value may sit when reading downward, again
    # in label heights. The default suits a caption sitting directly over its
    # own value; a full-width row -- "6. MAIDEN NAME" spanning first, middle
    # and last across the page -- needs a much wider reach.
    x_window: float = 4.0
    # Bare 1-3 digit blocks are normally printed box numbers, not values. A
    # birth date's day is the exception: "18" is the answer, not furniture.
    keep_numeric: bool = False
    # A "tick one of N printed options" field: the form prints every choice and
    # the registrar marks one. Ordered specific-first, because "Female" misread
    # as "Famale" still contains "male".
    choices: tuple[tuple[str, str], ...] = ()


ANCHOR_SETS: dict[str, tuple[Anchor, ...]] = {
    # Municipal Form No. 102 prints its field captions as a *row* of
    # parenthesised sub-labels — "1. NAME   (First)   (Middle)   (Last)" — with
    # the handwritten values on the line BELOW each one. Reading to the right
    # of them returns the neighbouring caption, not the value, which is what an
    # early version of this table did. Every name field here therefore anchors
    # on its sub-label and reads downward. The misspellings are deliberate:
    # they are what the recogniser actually returns off security paper, and
    # matching them directly beats loosening the threshold for everything.
    FAMILY_BIRTH_CERTIFICATE: (
        Anchor("first_name", ("(First)", "(Firat)", "(Firet)"), BELOW,
               max_gap=3.0, max_blocks=2),
        Anchor("middle_name", ("(Middle)", "(Mddla)", "(Mddle)", "(Midde)"), BELOW,
               max_gap=3.0, max_blocks=2),
        Anchor("last_name", ("(Last)", "(Laat)"), BELOW,
               max_gap=3.0, max_blocks=2),
        # Sex is not written, it is ticked: the form prints "1 Male" and
        # "2 Female" side by side and one carries an X. Both options have to
        # be in view for the mark to mean anything, hence the wider window.
        Anchor("sex", ("2. SEX", "SEX"), BELOW, max_gap=3.0, max_blocks=4,
               x_window=10.0,
               choices=(("female", r"f[ae]m[ae]l[ae]"), ("male", r"m[ae]l[ae]"))),
        # `keep_numeric` so the day survives: the value row reads "18" then
        # "MARCH 2002", and the bare-number furniture rule was eating the 18 —
        # producing a birth date a month wide.
        Anchor("birth_date", ("3. DATE OF BIRTH", "DATE OF BIRTH"), BELOW,
               max_gap=3.5, max_blocks=3, keep_numeric=True),
        # Both parents are printed the same way the child is — one caption row
        # spanning (First) (Middle) (Last) across the page — so the anchor is
        # the numbered section header and the window has to reach the whole
        # row. "6. MAIDEN" and "13. NAME" each occur exactly once on the form;
        # a bare "FATHER" does not, which is why it is absent here: it also
        # appears in the certification block at the foot of the page, and that
        # is the label the old anchor was locking onto.
        Anchor("_mother_name", ("6. MAIDEN", "MAIDEN", "NAME OF MOTHER"), BELOW,
               max_gap=3.0, max_blocks=3, x_window=30.0),
        Anchor("_father_name", ("13. NAME", "NAME OF FATHER"), BELOW,
               max_gap=3.0, max_blocks=3, x_window=30.0),
        Anchor("religion", ("RELIGION",), RIGHT, max_blocks=2),
    ),
    # Form 137 is NOT one layout. Real samples turned up at least three:
    # "DepEd Form 137-E" (elementary), a modern JHS sheet, and the older
    # "Form 137-A Secondary Student's Permanent Record" — which uses different
    # captions again and predates LRN entirely, so that field simply does not
    # exist on it. Label variants are listed per anchor rather than split into
    # separate families: the captions differ but the geometry does not, and an
    # anchor that finds no label costs nothing and falls through to the
    # fallback. Recogniser misreads ("Cate of Birm") are included for the same
    # reason they are on the birth certificate — they are what actually comes
    # back off a scanned form.
    FAMILY_FORM_137: (
        Anchor("lrn", ("LRN",), RIGHT, max_blocks=2, pattern=r"^\d[\d\s-]{9,}$"),
        Anchor("last_name", ("LAST NAME", "SURNAME", "NAME OF LEARNER"), RIGHT),
        Anchor("first_name", ("FIRST NAME",), RIGHT),
        Anchor("middle_name", ("MIDDLE NAME",), RIGHT),
        Anchor("sex", ("SEX",), RIGHT, max_blocks=1, pattern=r"^(male|female|m|f)$"),
        Anchor("birth_date", ("DATE OF BIRTH", "BIRTHDATE", "DATE OF BIRM",
                              "CATE OF BIRM"), RIGHT, max_blocks=3),
        Anchor("previous_school_name", ("NAME OF SCHOOL", "SCHOOL ATTENDED"),
               RIGHT, max_blocks=4),
        Anchor("previous_school_address", ("SCHOOL ADDRESS", "PLACE OF BIRTH"),
               RIGHT, max_blocks=4),
        Anchor("_guardian_name", ("PARENT OR GUARDIAN", "PARENT OF GU",
                                  "PARENT", "GUARDIAN"), RIGHT),
    ),
}


def _label_score(block_text: str, label: str) -> float:
    """
    How well a block reads as this label. A label printed as part of a longer
    caption ("18. DATE AND PLACE OF MARRIAGE") should still match, so a clean
    substring hit scores full marks before falling back to fuzzy ratio.
    """
    bt, lb = normalize_text(block_text), normalize_text(label)
    if not bt or not lb:
        return 0.0
    # A caption may be printed inside a longer string ("18. DATE AND PLACE
    # OF MARRIAGE"), so a clean containment wins outright -- but only when the
    # label is specific enough that containment means something.
    if len(lb) >= 4 and lb in bt:
        return 1.0
    return SequenceMatcher(None, bt, lb).ratio()


def find_label(parsed: ParsedDocument, labels) -> TextBlock | None:
    """The block that best reads as any of these labels, if any clears the bar."""
    best, best_score = None, 0.0
    for block in parsed.blocks:
        for label in labels:
            score = _label_score(block.text, label)
            if score > best_score:
                best, best_score = block, score
    return best if best_score >= _LABEL_MATCH_THRESHOLD else None


def _candidates(parsed: ParsedDocument, label: TextBlock, anchor: Anchor) -> list[TextBlock]:
    """
    Blocks lying in the value region for this label, in reading order.

    Untruncated: the `max_blocks` budget is spent by `resolve_anchor`, after
    the form's own furniture has been dropped.
    """
    height = label.height or 12.0
    out = []
    for block in parsed.blocks:
        if block is label:
            continue
        if anchor.direction == RIGHT:
            same_row = abs(block.center_y - label.center_y) <= height * anchor.row_tolerance
            to_right = block.x0 >= label.x1 - height * 0.3
            within = block.x0 - label.x1 <= height * anchor.max_gap
            if same_row and to_right and within:
                out.append(block)
        else:  # BELOW
            below = block.y0 >= label.y1 - height * _VALUE_OVERLAP
            within = block.y0 - label.y1 <= height * anchor.max_gap
            overlaps = (block.x1 >= label.x0
                        and block.x0 <= label.x1 + height * anchor.x_window)
            if below and within and overlaps:
                out.append(block)

    if anchor.direction == RIGHT:
        return sorted(out, key=lambda b: b.x0)

    # Reading downward, keep only the FIRST line of text under the label.
    # Without this the search window spills into the next row of the form and
    # a name comes back as "NIEL ASHLEY 3. DATE OF BIRTH" — the value plus the
    # caption of whatever field is printed beneath it.
    out.sort(key=lambda b: (b.y0, b.x0))
    first = out[0]
    line_height = first.height or height
    same_line = [b for b in out if abs(b.center_y - first.center_y) <= line_height * 0.7]
    return sorted(same_line, key=lambda b: b.x0)


# Printed form furniture that sits in a value region but is not a value.
_NOISE = re.compile(
    r"^("
    r"\(.{0,12}\)"                                   # any short parenthesised caption
    r"|\(?(first|firat|firet|middle|mddla|mddle|last|laat|name|sex|"
    r"type of|type|no\.?|nos\.?|day|month|year|manth|ysar)\)?"
    r"|[|:;_.\-–—]+"
    r"|\d{1,2}\s*[.)]\s*.{0,40}"                     # numbered captions: "21. PREPARED BY"
    r")$",
    re.IGNORECASE,
)

# Split out of `_NOISE` because it is the one furniture rule with a real
# exception. The form prints a box number beside most fields, so a lone "58"
# in a value region is furniture -- but "18" under "3. DATE OF BIRTH" is the
# day of birth. Anchors that expect a number waive this rule alone.
_BARE_NUMBER = re.compile(r"^\d{1,3}$")

# An X, a tick, or a cross placed beside a printed option.
_MARK = re.compile(r"[x✓✔√]", re.IGNORECASE)


def _is_furniture(text: str, anchor: "Anchor") -> bool:
    if _NOISE.match(text):
        return True
    return not anchor.keep_numeric and bool(_BARE_NUMBER.match(text))


def _resolve_choice(blocks, choices) -> tuple[str | None, float]:
    """
    Which printed option was ticked.

    Returns a value only when *exactly one* option carries a mark. A form where
    the mark did not survive scanning, or where two options both look marked,
    yields nothing and escalates to the fallback — guessing a sex off an
    unticked box would be a silent, plausible-looking error in a permanent
    record, which is the one failure mode this pipeline exists to avoid.
    """
    marked = []
    for block in blocks:
        text = block.text
        for value, pattern in choices:
            found = re.search(pattern, text, re.IGNORECASE)
            if not found:
                continue
            # The mark sits beside the printed word, never inside it, so strip
            # the matched option out before looking for it.
            beside = text[: found.start()] + text[found.end():]
            if _MARK.search(beside):
                marked.append((value, block))
            break  # options are ordered specific-first; first hit owns the block

    if len(marked) != 1:
        return None, 0.0
    value, block = marked[0]
    return value, block.confidence


def resolve_anchor(parsed: ParsedDocument, anchor: Anchor) -> tuple[str | None, float]:
    """(value, confidence) for one anchor. Confidence is the recogniser's own."""
    label = find_label(parsed, anchor.labels)
    if label is None:
        return None, 0.0

    # Furniture is dropped BEFORE the max_blocks budget is applied, so the
    # form's own printed words cannot crowd out the value: "6. MAIDEN NAME"
    # arrives as two blocks and the stray "NAME" sits in the value row.
    blocks = [b for b in _candidates(parsed, label, anchor)
              if not _is_furniture(b.text.strip(), anchor)][: anchor.max_blocks]
    if not blocks:
        return None, 0.0

    if anchor.choices:
        return _resolve_choice(blocks, anchor.choices)

    value = " ".join(b.text.strip() for b in blocks).strip(" :|-_")
    if not value:
        return None, 0.0
    if anchor.pattern and not re.match(anchor.pattern, value, re.IGNORECASE):
        return None, 0.0

    confidence = min(b.confidence for b in blocks)
    return value, confidence


def _confidence_word(score: float) -> str:
    if score >= 0.90:
        return "high"
    if score >= 0.75:
        return "medium"
    return "low"


def extract_fields(parsed: ParsedDocument, family: str) -> tuple[dict, dict]:
    """
    (fields, per-field confidence) for a document of this family.

    Fields prefixed `_` are intermediates the caller reshapes — a birth
    certificate's mother and father become one `guardians` list rather than
    two loose names, because that is the shape the enrollment form holds.
    """
    anchors = ANCHOR_SETS.get(family or "", ())
    fields: dict = {}
    confidence: dict = {}

    for anchor in anchors:
        value, score = resolve_anchor(parsed, anchor)
        if value is None:
            continue
        fields[anchor.name] = value
        confidence[anchor.name] = _confidence_word(score)

    guardians = []
    for key, relationship in (("_mother_name", "mother"), ("_father_name", "father"),
                              ("_guardian_name", "guardian")):
        name = fields.pop(key, None)
        confidence.pop(key, None)
        if name:
            guardians.append({"full_name": name, "relationship": relationship})
    if guardians:
        fields["guardians"] = guardians
        confidence["guardians"] = "medium"

    if "lrn" in fields:
        digits = "".join(filter(str.isdigit, fields["lrn"]))
        if len(digits) == 12:
            fields["lrn"] = digits
        else:
            # A partial LRN is worse than none: it is unique on Student, so a
            # wrong one either collides with a real student or creates a
            # phantom. Drop it and let the fallback or the registrar supply it.
            fields.pop("lrn")
            confidence.pop("lrn", None)

    return fields, confidence


def required_fields(family: str) -> set[str]:
    """
    What a successful extraction should contain. Falling short of most of
    these is one of the signals that escalates the document to the fallback.
    """
    return {a.name for a in ANCHOR_SETS.get(family or "", ()) if not a.name.startswith("_")}
