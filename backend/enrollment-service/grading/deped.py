"""
DepEd Order No. 8, s. 2015 — grade computation rules.

This module exists because the service previously reported the raw weighted
score as the final grade. Three things were wrong with that, all of them
visible to a registrar:

1. No transmutation. DO 8 requires the Initial Grade to be converted to a
   Transmuted Grade via the mandated table, whose floor is 60. A learner with
   an Initial Grade of 40 was being recorded as 40.

2. The pass/fail line was applied to the wrong number. An Initial Grade of
   74.99 transmutes to 84 -- Passed -- but was being recorded as Failed. The
   determination was wrong across the whole 60-99 initial-grade band.

3. Percentage Score was the unweighted mean of per-assessment percentages, so
   a 5-point seatwork counted as much as a 50-point long test. DO 8 defines it
   over summed raw scores against summed highest-possible scores.

Everything here is pure and DB-free so it can be tested without a database --
GradingTemplate and ScoreEntry are managed=False, so a fresh pytest-django
database has no tables for them.
"""
from decimal import Decimal, ROUND_HALF_UP

PASSING_GRADE = 75
LOWEST_TRANSMUTED_GRADE = 60
HIGHEST_TRANSMUTED_GRADE = 100

# DO 8 s.2015 transmutation table, as (lowest Initial Grade in the band,
# Transmuted Grade), ordered high to low. `transmute` returns the first band
# whose lower bound the Initial Grade reaches.
#
# The table is deliberately written out in full rather than derived from a
# formula: it is piecewise (1.6-point bands from 60 up, 4-point bands below),
# and a registrar checking our arithmetic against the published table should
# be able to read it off line by line.
TRANSMUTATION_TABLE = (
    (Decimal("100.00"), 100),
    (Decimal("98.40"), 99),
    (Decimal("96.80"), 98),
    (Decimal("95.20"), 97),
    (Decimal("93.60"), 96),
    (Decimal("92.00"), 95),
    (Decimal("90.40"), 94),
    (Decimal("88.80"), 93),
    (Decimal("87.20"), 92),
    (Decimal("85.60"), 91),
    (Decimal("84.00"), 90),
    (Decimal("82.40"), 89),
    (Decimal("80.80"), 88),
    (Decimal("79.20"), 87),
    (Decimal("77.60"), 86),
    (Decimal("76.00"), 85),
    (Decimal("74.40"), 84),
    (Decimal("72.80"), 83),
    (Decimal("71.20"), 82),
    (Decimal("69.60"), 81),
    (Decimal("68.00"), 80),
    (Decimal("66.40"), 79),
    (Decimal("64.80"), 78),
    (Decimal("63.20"), 77),
    (Decimal("61.60"), 76),
    (Decimal("60.00"), 75),
    (Decimal("56.00"), 74),
    (Decimal("52.00"), 73),
    (Decimal("48.00"), 72),
    (Decimal("44.00"), 71),
    (Decimal("40.00"), 70),
    (Decimal("36.00"), 69),
    (Decimal("32.00"), 68),
    (Decimal("28.00"), 67),
    (Decimal("24.00"), 66),
    (Decimal("20.00"), 65),
    (Decimal("16.00"), 64),
    (Decimal("12.00"), 63),
    (Decimal("8.00"), 62),
    (Decimal("4.00"), 61),
    (Decimal("0.00"), 60),
)

# DO 8 descriptors. Ordered high to low; `descriptor` returns the first match.
DESCRIPTORS = (
    (90, "Outstanding"),
    (85, "Very Satisfactory"),
    (80, "Satisfactory"),
    (75, "Fairly Satisfactory"),
    (0, "Did Not Meet Expectations"),
)


def transmute(initial_grade):
    """
    Initial Grade -> Transmuted Grade, per the DO 8 s.2015 table.

    Returns a whole number between 60 and 100. `None` in, `None` out, so a
    subject with nothing encoded yet stays uncomputed rather than becoming 60.
    """
    if initial_grade is None:
        return None

    ig = Decimal(str(initial_grade))
    if ig >= TRANSMUTATION_TABLE[0][0]:
        return HIGHEST_TRANSMUTED_GRADE

    for lower_bound, transmuted in TRANSMUTATION_TABLE:
        if ig >= lower_bound:
            return transmuted
    return LOWEST_TRANSMUTED_GRADE


def percentage_score(entries):
    """
    DO 8 Percentage Score: (sum of raw scores / sum of highest possible
    scores) x 100, so each assessment contributes in proportion to its size.

    `entries` is any iterable of objects with `.score` and `.max_score`.
    Returns `None` when there is nothing to compute from -- which the caller
    must treat as "not yet encoded", never as zero.
    """
    total_score = Decimal("0")
    total_max = Decimal("0")

    for entry in entries:
        max_score = Decimal(str(entry.max_score or 0))
        if max_score <= 0:
            # A zero-point assessment can't contribute to either total; it
            # would otherwise divide by zero.
            continue
        total_score += Decimal(str(entry.score or 0))
        total_max += max_score

    if total_max <= 0:
        return None

    return (total_score / total_max) * 100


def descriptor(grade):
    """DO 8 descriptor for a transmuted grade."""
    if grade is None:
        return None
    for minimum, label in DESCRIPTORS:
        if grade >= minimum:
            return label
    return DESCRIPTORS[-1][1]


def quantize(value, places="0.01"):
    """Round half-up to `places`, the way a grade sheet does."""
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal(places), rounding=ROUND_HALF_UP)


def general_average(transmuted_grades):
    """
    DO 8 General Average: the mean of the learner's transmuted final grades
    across learning areas, reported as a whole number.

    Note this is an unweighted mean -- DepEd does not weight learning areas
    against each other -- so the term "General Weighted Average"/"GWA" does
    not apply and is not used here.
    """
    grades = [g for g in transmuted_grades if g is not None]
    if not grades:
        return None
    mean = sum(Decimal(str(g)) for g in grades) / len(grades)
    return int(quantize(mean, "1"))


# ── Subject outcomes across a school year ────────────────────────────────────
#
# One definition of "did this learner pass this learning area", shared by the
# report card and by promotion. They used to disagree: the report card averaged
# a subject across its periods, while promotion looked for ANY period whose
# recorded remark was "failed" or "incomplete" -- so a learner who failed the
# first quarter and recovered to an 84 average was printed as Passed and then
# refused promotion by the same system, in the same school year.
#
# DO 8 computes the Final Grade per learning area as the mean of the quarters,
# and it is that number the promotion decision is made on. The report card's
# reading was the correct one; promotion now shares it.

def subject_remarks(recorded, average):
    """
    The year-level outcome for one learning area.

    `recorded` is the set of per-period remarks a teacher entered for it;
    `average` is the mean of its numeric grades, or None when none carry one.

    A teacher's "dropped" or "incomplete" wins over anything the average would
    say, because a numeric score cannot express either -- a subject dropped
    mid-quarter can still average 88. "dropped" outranks "incomplete":
    dropping is terminal, an incomplete is a subject still awaiting its mark.

    A recorded "passed"/"failed" is deliberately NOT preferred over the
    average. Those are per-period marks, and a subject passed in one quarter
    can still fail on the year.
    """
    recorded = set(recorded or ())
    if "dropped" in recorded:
        return "dropped"
    if "incomplete" in recorded:
        return "incomplete"
    if average is None:
        return None
    return "passed" if average >= PASSING_GRADE else "failed"


def summarize_subjects(grades):
    """
    Group `grades` by learning area and reduce each to its year outcome.

    `grades` is any iterable of objects carrying `.subject`, `.numeric_grade`
    and `.remarks` -- Grade rows, in practice, but nothing here touches the
    database.

    Returns {subject_id: {"subject": obj, "average": Decimal|None,
                          "remarks": str|None, "periods": int}}.
    """
    by_subject = {}
    for g in grades:
        key = g.subject.subject_id
        bucket = by_subject.setdefault(
            key, {"subject": g.subject, "values": [], "recorded": set(), "periods": 0}
        )
        bucket["periods"] += 1
        if g.numeric_grade is not None:
            bucket["values"].append(Decimal(str(g.numeric_grade)))
        if g.remarks:
            bucket["recorded"].add(g.remarks)

    out = {}
    for key, bucket in by_subject.items():
        values = bucket["values"]
        average = (sum(values) / len(values)) if values else None
        out[key] = {
            "subject": bucket["subject"],
            "average": quantize(average) if average is not None else None,
            "remarks": subject_remarks(bucket["recorded"], average),
            "periods": bucket["periods"],
        }
    return out
