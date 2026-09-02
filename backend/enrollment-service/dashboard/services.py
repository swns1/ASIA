"""
Shaping functions for the dashboard summary.

Every function here takes rows as the ORM's `.values(...).annotate(...)` emits
them and returns the exact JSON the charts consume. They are deliberately pure
— no queryset, no request — for two reasons:

  * Most models in this service are `managed = False`, so pytest-django builds
    no tables for them and a `django_db` test is not available (see
    ai/test_risk_assessment.py for the same constraint). Pure shapers are the
    part that can actually be tested, so all the logic worth testing lives
    here and views.py stays a thin queryset-to-shaper adapter.
  * The same split the codebase already uses for ai/services.py and
    billing/services.py.

**Every shaper zero-fills its full category set.** A chart whose categories
appear and disappear between refreshes is unreadable: bars change position,
colors shift onto different entities, and an axis rescales for no visible
reason. Returning `critical: 0` rather than omitting the key keeps the axis
and the color-to-entity mapping stable when a band happens to be empty.
"""
from datetime import timedelta


# Enrollment.SCHOOL_LEVEL_CHOICES order — youngest to oldest. The chart reads
# these as an ordered scale (a progression through the school), not as
# interchangeable categories, which is why the order is fixed here rather than
# sorted by count at render time.
SCHOOL_LEVELS = [
    "nursery",
    "kindergarten",
    "elementary",
    "junior_highschool",
    "senior_highschool",
]

SCHOOL_LEVEL_LABELS = {
    "nursery":           "Nursery",
    "kindergarten":      "Kindergarten",
    "elementary":        "Elementary",
    "junior_highschool": "Junior High",
    "senior_highschool": "Senior High",
}

# The funnel the registrar actually works through. Enrollment.STATUS_CHOICES
# also has `cancelled` and `transferred_out`; both are exits from the funnel
# rather than stages in it, so they are reported separately as `exited` instead
# of being drawn as a fourth step that the first three don't flow into.
PIPELINE_STAGES = ["pending", "enrolled", "completed"]
EXIT_STATUSES = ["cancelled", "transferred_out"]

# StudentRiskScore.RISK_LEVEL_CHOICES, least to most severe. Kept in this order
# so the stacked bar always runs low → critical regardless of which bands are
# populated in a given run.
RISK_BANDS = ["low", "moderate", "high", "critical"]
FLAGGED_BANDS = {"high", "critical"}

# AttendanceRecord.STATUS_CHOICES, single-letter column → series key.
ATTENDANCE_STATUS_KEYS = {"P": "present", "A": "absent", "L": "late", "E": "excused"}


def shape_pipeline(rows):
    """
    rows: [{"enrollment_status": "pending", "n": 12}, ...]

    Returns the three funnel stages plus `exited` and `total`. `total` counts
    only the funnel stages — an exited enrolment is not a stage the remaining
    students are still flowing through, so including it would make the funnel's
    first bar wider than the population it represents.
    """
    counts = {row["enrollment_status"]: row["n"] for row in rows}
    stages = {stage: counts.get(stage, 0) for stage in PIPELINE_STAGES}
    return {
        **stages,
        "exited": sum(counts.get(status, 0) for status in EXIT_STATUSES),
        "total": sum(stages.values()),
    }


def shape_level_distribution(rows):
    """
    rows: [{"school_level": "elementary", "n": 240}, ...]

    Always returns all five levels in school order, including empty ones — a
    school with no senior-high intake this year should show an empty Senior
    High bar rather than silently dropping the category.
    """
    counts = {row["school_level"]: row["n"] for row in rows}
    return [
        {
            "level": level,
            "label": SCHOOL_LEVEL_LABELS[level],
            "count": counts.get(level, 0),
        }
        for level in SCHOOL_LEVELS
    ]


def shape_risk_bands(rows):
    """
    rows: [{"risk_level": "critical", "n": 3}, ...]

    `flagged` (high + critical) is precomputed because it is the number the
    dashboard headline actually reports, and deriving it in the client would
    mean every consumer re-deciding which bands count as flagged — the same
    definition already used by ai/risk_views._summarize().
    """
    counts = {row["risk_level"]: row["n"] for row in rows}
    bands = {band: counts.get(band, 0) for band in RISK_BANDS}
    return {
        "bands": bands,
        "flagged": sum(n for band, n in bands.items() if band in FLAGGED_BANDS),
        "total": sum(bands.values()),
    }


def shape_attendance_series(rows):
    """
    rows: [{"week": date(2025, 1, 6), "status": "P", "n": 412}, ...]
          as emitted by .annotate(week=TruncWeek("date")).values("week", "status")

    Returns one entry per week, oldest first, with **no week missing between
    the first and last**:
        {week, present, absent, late, excused, total, rate}

    Two things the obvious implementation gets wrong:

    * **`rate` excludes excused absences.** It is present ÷ (present + absent
      + late). An excused absence is approved leave, not an attendance
      failure, and counting it as one penalises a class for taking it.

    * **Weeks with no records at all are emitted, not skipped, and carry
      `rate: None` rather than 0.** Skipping them compresses the time axis and
      draws one straight line across a term break, which reads as unbroken
      attendance through weeks the school was shut. Emitting 0 instead would
      be worse still — it invents a week where every student was absent.
      `None` breaks the line, which is the honest rendering of "no data".
    """
    weeks = {}
    for row in rows:
        week = row["week"]
        bucket = weeks.setdefault(
            week, {"present": 0, "absent": 0, "late": 0, "excused": 0}
        )
        key = ATTENDANCE_STATUS_KEYS.get(row["status"])
        if key:
            bucket[key] += row["n"]

    if not weeks:
        return []

    empty = {"present": 0, "absent": 0, "late": 0, "excused": 0}
    series = []
    cursor, last = min(weeks), max(weeks)
    while cursor <= last:
        bucket = weeks.get(cursor, empty)
        countable = bucket["present"] + bucket["absent"] + bucket["late"]
        series.append({
            "week": cursor.isoformat() if hasattr(cursor, "isoformat") else str(cursor),
            **bucket,
            "total": countable + bucket["excused"],
            "rate": round(bucket["present"] / countable, 4) if countable else None,
        })
        cursor = cursor + timedelta(weeks=1)
    return series
