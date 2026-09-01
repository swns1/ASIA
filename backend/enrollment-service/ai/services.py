"""
Shared feature-building + rule-based risk scoring for enrollment-service AI
analytics.

`build_student_features()` is the single source of truth for turning
grades/attendance/narrative-report rows into one row per student — used by
both the ephemeral K-means clustering view (ai/analytics_views.py) and the
persisted at-risk scoring view (ai/risk_views.py), so the two never drift
apart with separately-maintained query logic.

`score_students()` turns those features into a transparent, explainable
0-100 risk score per student. This is deliberately a weighted formula, not a
trained classifier — see ai/risk_views.py module docstring for why.

Each component is anchored to a real DepEd decision threshold rather than a
naive linear inversion of the raw signal. The earlier version mapped
`grade_risk = 100 - grade`, which put grades (which floor around 60 on the
DepEd scale, so risk topped out near 40) and attendance (a true 0-100 range)
on incomparable scales. The composite collapsed into a narrow band: a
student failing 2 of 8 subjects scored 16.9 ("low"), a chronically absent
student scored 18.0 ("low"), and "critical" was unreachable for anyone with
a real grade (ceiling 0.5*40 + 0.3*100 + 0.2*100 = 70, below the 75 cut).
Anchoring to thresholds the school already acts on — the 75 passing mark,
the 10% chronic-absence line, DepEd Order 8 s.2015's 20% rule — is what
makes the bands fire.
"""

from collections import defaultdict
from datetime import date

import numpy as np
from django.db.models import Count, Q

from attendance.models import AttendanceRecord
from grades.models import Grade, NarrativeReport
from subjects.models import Subject

NARRATIVE_SCORE = {
    "outstanding":       3.0,
    "satisfactory":      2.0,
    "needs_improvement": 1.0,
}

# DepEd passing mark. The most load-bearing constant in this module — it's
# the line the school itself acts on (enrollments/report_views.py uses the
# same 75 for pass/fail remarks).
PASSING_GRADE = 75.0

# Which period precedes which, for the quarter-over-quarter trend signal.
# Absent from the map = no prior period exists (1st quarter, or "overall").
PERIOD_SEQUENCE = {
    "2nd_quarter":  "1st_quarter",
    "3rd_quarter":  "2nd_quarter",
    "4th_quarter":  "3rd_quarter",
    "2nd_semester": "1st_semester",
}

QUARTER_INDEX = {
    "1st_quarter": 0,
    "2nd_quarter": 1,
    "3rd_quarter": 2,
    "4th_quarter": 3,
}


def _school_year_bounds(school_year):
    """
    Outer date bounds for a "2025-2026"-style school year string.
    Deliberately generous (whole calendar years) rather than guessing a
    June/March academic window — this is only ever the outermost clamp for a
    period window, and a too-wide clamp degrades to the previous full-year
    behavior instead of silently dropping attendance rows.
    """
    try:
        start_year, end_year = (int(part) for part in str(school_year).split("-", 1))
    except (ValueError, TypeError):
        return None, None
    return date(start_year, 1, 1), date(end_year, 12, 31)


def resolve_period_window(school_year, grading_period):
    """
    Returns {"from": date|None, "to": date|None, "source": "calendar"|"full_year"}
    — the date window a grading period's attendance should be counted over.

    Quarter boundaries are derived from the school's own `quarter_break`
    calendar events (n breaks delimit n+1 quarters): quarter N runs from the
    end of break N-1 to the start of break N. When the school hasn't entered
    enough breaks — or the period is a semester or "overall" — this falls
    back to the full school year and says so via "source", so the UI can
    state which window the attendance figure actually covers instead of
    implying a precision that isn't there.
    """
    outer_from, outer_to = _school_year_bounds(school_year)
    full_year = {"from": outer_from, "to": outer_to, "source": "full_year"}

    index = QUARTER_INDEX.get(grading_period)
    if index is None:
        return full_year

    # Imported lazily: academic_calendar is a sibling app, and this module is
    # otherwise import-light enough to stay usable from a non-Django context.
    from academic_calendar.models import CalendarEvent

    breaks = list(
        CalendarEvent.objects
        .filter(school_year=school_year, event_type="quarter_break")
        .order_by("start_date")
        .values_list("start_date", "end_date")
    )
    # Quarter N needs break N to close it (except the last quarter, which the
    # school year itself closes). Too few breaks entered → don't guess.
    if len(breaks) < index:
        return full_year

    window_from = breaks[index - 1][1] if index > 0 else outer_from
    window_to = breaks[index][0] if index < len(breaks) else outer_to

    if window_from and window_to and window_from > window_to:
        return full_year

    return {"from": window_from, "to": window_to, "source": "calendar"}


def build_student_features(school_year, grading_period, subject_id=None,
                            school_level=None, grade_level=None):
    """
    Returns (student_data, subject_name).

    student_data: dict of student_id -> {
        "student_id", "enrollment_id", "student_name", "student_number",
        "grade_level", "section",
        "grades": {subject_name: avg_numeric_grade},
        "grade": overall avg grade across "grades" (float, DepEd 0-100 scale),
        "failing_subjects": [{"subject_name", "grade"}] below PASSING_GRADE,
        "lowest_subject": {"subject_name", "grade"} or None,
        "previous_grade": overall avg for the preceding grading period, or
                           np.nan when there is no preceding period,
        "grade_delta": grade - previous_grade (negative = slipping), or np.nan,
        "attendance_rate": non-absent / total over the period's window, or
                            np.nan if the student has no attendance rows,
        "absent_days", "total_school_days": the counts behind that rate,
        "avg_narrative": mean of NARRATIVE_SCORE over rated categories for the
                          selected grading_period (or all periods when
                          grading_period == "overall"), or np.nan if none,
        "narrative_ratings": raw rating strings behind avg_narrative,
    }

    subject_name: resolved Subject.subject_name, or "Overall" when subject_id
    is not given. Raises Subject.DoesNotExist if subject_id doesn't resolve —
    callers turn that into their own 404 Response; this module stays
    DRF-agnostic so it's equally usable from a non-request context later.

    Only enrollment_status="enrolled" students are considered.
    """
    is_overall_period = grading_period == "overall"

    grades_qs = Grade.objects.select_related(
        "enrollment", "enrollment__student", "subject"
    ).filter(
        enrollment__school_year=school_year,
        enrollment__enrollment_status="enrolled",
    )

    if not is_overall_period:
        grades_qs = grades_qs.filter(grading_period=grading_period)
    if school_level:
        grades_qs = grades_qs.filter(enrollment__school_level=school_level)
    if grade_level:
        grades_qs = grades_qs.filter(enrollment__grade_level=grade_level)

    subject_name = "Overall"
    if subject_id:
        grades_qs = grades_qs.filter(subject_id=subject_id)
        subject_name = Subject.objects.get(pk=subject_id).subject_name

    # ── Build per-student grade data ──────────────────────────────────
    # Accumulate into lists so multiple periods (overall mode) are
    # averaged rather than the last-seen value silently overwriting.
    student_data = {}  # student_id → dict

    for g in grades_qs:
        sid = g.enrollment.student_id
        if sid not in student_data:
            s = g.enrollment.student
            student_data[sid] = {
                "student_id":    s.student_id,
                "enrollment_id": g.enrollment.enrollment_id,
                "student_name":  f"{s.last_name}, {s.first_name}"
                                 + (f" {s.middle_name[0]}." if s.middle_name else ""),
                "student_number": s.student_number,
                "grade_level":   g.enrollment.grade_level,
                "section":       g.enrollment.section,
                "grade_accum":   defaultdict(list),
            }
        student_data[sid]["grade_accum"][g.subject.subject_name].append(float(g.numeric_grade))

    # Resolve accumulated lists → per-subject mean, one overall average, and
    # the per-subject detail the "why is this student flagged" reasons need.
    # A mean of per-subject means alone hides the thing the school actually
    # acts on: failing even one subject (seven 90s and a 60 average to 86).
    for sd in student_data.values():
        sd["grades"] = {
            subj: float(np.mean(vals))
            for subj, vals in sd["grade_accum"].items()
        }
        sd["grade"] = float(np.mean(list(sd["grades"].values()))) if sd["grades"] else np.nan

        failing = [
            {"subject_name": subj, "grade": round(avg, 2)}
            for subj, avg in sd["grades"].items()
            if avg < PASSING_GRADE
        ]
        sd["failing_subjects"] = sorted(failing, key=lambda f: f["grade"])

        if sd["failing_subjects"]:
            sd["lowest_subject"] = sd["failing_subjects"][0]
        elif sd["grades"]:
            worst_subject = min(sd["grades"], key=sd["grades"].get)
            sd["lowest_subject"] = {
                "subject_name": worst_subject,
                "grade": round(sd["grades"][worst_subject], 2),
            }
        else:
            sd["lowest_subject"] = None

    enrollment_ids = [sd["enrollment_id"] for sd in student_data.values()]

    # ── Previous grading period, for the trajectory signal ─────────────
    # A student sliding 88 → 79 → 72 is the strongest early-warning signal
    # available here, and it is invisible in any single period's average.
    previous_period = PERIOD_SEQUENCE.get(grading_period)
    previous_avg = {}
    if previous_period:
        prev_qs = Grade.objects.filter(
            enrollment_id__in=enrollment_ids,
            grading_period=previous_period,
        )
        if subject_id:
            prev_qs = prev_qs.filter(subject_id=subject_id)

        prev_accum = defaultdict(lambda: defaultdict(list))
        for g in prev_qs:
            prev_accum[g.enrollment_id][g.subject_id].append(float(g.numeric_grade))
        for eid, by_subject in prev_accum.items():
            subject_means = [float(np.mean(vals)) for vals in by_subject.values()]
            previous_avg[eid] = float(np.mean(subject_means)) if subject_means else np.nan

    # ── Fetch attendance, scoped to the grading period's window ────────
    # This previously always pulled the full school year regardless of the
    # requested period, so a 1st-quarter run mixed that quarter's grades
    # with year-long attendance.
    window = resolve_period_window(school_year, grading_period)
    att_filters = {
        "enrollment_id__in": enrollment_ids,
        "enrollment__school_year": school_year,
    }
    if window["source"] == "calendar":
        if window["from"]:
            att_filters["date__gte"] = window["from"]
        if window["to"]:
            att_filters["date__lte"] = window["to"]

    att_qs = (
        AttendanceRecord.objects
        .filter(**att_filters)
        .values("enrollment_id")
        .annotate(
            total=Count("attendance_id"),
            absent=Count("attendance_id", filter=Q(status="A")),
            excused=Count("attendance_id", filter=Q(status="E")),
        )
    )
    att_map = {row["enrollment_id"]: row for row in att_qs}

    # ── Fetch narrative reports ───────────────────────────────────────
    narrative_qs = NarrativeReport.objects.filter(enrollment_id__in=enrollment_ids)
    if not is_overall_period:
        narrative_qs = narrative_qs.filter(grading_period=grading_period)

    narrative_map = defaultdict(list)
    narrative_ratings_map = defaultdict(list)
    for nr in narrative_qs:
        score = NARRATIVE_SCORE.get(nr.rating)
        if score is not None:
            narrative_map[nr.enrollment_id].append(score)
            narrative_ratings_map[nr.enrollment_id].append(nr.rating)

    # ── Attach attendance, trend and narrative ─────────────────────────
    for sd in student_data.values():
        eid = sd["enrollment_id"]

        att = att_map.get(eid)
        if att and att["total"] >= MIN_ATTENDANCE_DAYS:
            # Present + Late count as attended; Excused still counts against
            # the rate (it's the reason that's excused, not the absence
            # itself) — matches the convention used everywhere else
            # (see frontend/admin-portal/src/utils/attendance.js).
            #
            # NOTE: enrollments/views.py's section_attendance_stats computes
            # a different number — (present + late) / total, ignoring
            # excused. Two definitions of one concept; this one is
            # authoritative for risk scoring. Reconciling them is its own
            # change.
            missed = att["absent"] + att["excused"]
            sd["attendance_rate"] = (att["total"] - missed) / att["total"]
            sd["absent_days"] = missed
            sd["total_school_days"] = att["total"]
        else:
            # Too few records to read an absence rate off — see
            # MIN_ATTENDANCE_DAYS. The raw counts are still reported so the
            # UI can say "3 days recorded" instead of showing a blank.
            sd["attendance_rate"] = np.nan
            sd["absent_days"] = (att["absent"] + att["excused"]) if att else 0
            sd["total_school_days"] = att["total"] if att else 0

        sd["attendance_window"] = window["source"]

        prev = previous_avg.get(eid, np.nan)
        sd["previous_grade"] = prev
        sd["previous_period"] = previous_period
        current = sd.get("grade")
        if previous_period and not _is_missing(prev) and not _is_missing(current):
            sd["grade_delta"] = round(float(current) - float(prev), 2)
        else:
            sd["grade_delta"] = np.nan

        scores = narrative_map.get(eid, [])
        sd["avg_narrative"] = float(np.mean(scores)) if scores else np.nan
        sd["narrative_ratings"] = narrative_ratings_map.get(eid, [])

    return student_data, subject_name


# ─────────────────────────────────────────────────────────────────────────
# Rule-based risk scoring
# ─────────────────────────────────────────────────────────────────────────
# Weighted composite, not a trained classifier: Enrollment.STATUS_CHOICES
# doesn't yet carry enough historical dropped/withdrawn outcomes to train
# and validate a real model against, and a formula stays explainable to a
# teacher ("flagged because grade and attendance are both low") in a way a
# classifier wouldn't be at this school's scale. StudentRiskScore.enrollment_id
# is kept specifically so a future retrospective model can be trained off
# this history once real outcome data exists.

DEFAULT_WEIGHTS = {"grade": 0.40, "attendance": 0.30, "trend": 0.15, "narrative": 0.15}

# Every anchor table below maps a raw signal to a 0-100 risk contribution by
# piecewise-linear interpolation between points the school already acts on.
# These are the tuning surface: adjust the anchors, not the formula.

# DepEd grade descriptors: 90+ Outstanding, 85-89 Very Satisfactory, 80-84
# Satisfactory, 75-79 Fairly Satisfactory, below 75 Did Not Meet
# Expectations. Sitting exactly on the 75 passing mark is already a real
# concern, so it maps to 60 — not to "barely any risk".
GRADE_ANCHORS = [(65.0, 100.0), (70.0, 85.0), (75.0, 60.0), (80.0, 40.0),
                 (85.0, 20.0), (90.0, 0.0), (100.0, 0.0)]

# Failing even one subject is the risk event the school acts on, and an
# overall average can hide it entirely.
FAILING_SUBJECT_RISK = {0: 0.0, 1: 65.0, 2: 85.0}  # 3 or more → 100
FAILING_SUBJECT_RISK_MAX = 100.0

# 10% of school days missed is the standard chronic-absenteeism definition;
# DepEd Order 8 s.2015 puts non-promotion in play past 20%.
ABSENCE_ANCHORS = [(0.0, 0.0), (3.0, 10.0), (5.0, 20.0), (10.0, 60.0),
                   (20.0, 100.0), (100.0, 100.0)]

# Minimum attendance records before the absence rate is allowed to drive the
# score. Below this, a single missed day swings the rate by 10+ points and
# "missed 40% of school days" really means "absent 4 times out of the 10 days
# anyone has recorded yet" — early in a quarter that is noise, not chronic
# absence. Under the gate the signal is reported as missing, so the weights
# renormalize onto the signals that do have evidence rather than the score
# inheriting a number nobody should act on.
MIN_ATTENDANCE_DAYS = 10

# Change in overall average against the preceding grading period. Improving
# or holding steady carries no risk; a 5-point slide is a real signal.
TREND_ANCHORS = [(-10.0, 100.0), (-5.0, 60.0), (-2.0, 25.0), (0.0, 0.0), (100.0, 0.0)]

# Cut points on the final 0-100 composite risk_score. The stored enum stays
# low/moderate/high/critical (StudentRiskScore.RISK_LEVEL_CHOICES); the UI
# renders them as On track / Watch / Needs attention / Needs urgent help.
RISK_LEVEL_THRESHOLDS = (
    (25.0, "low"),
    (50.0, "moderate"),
    (75.0, "high"),
    (100.0, "critical"),
)


def _is_missing(value):
    return value is None or (isinstance(value, float) and np.isnan(value))


def _absence_pct(attendance_rate):
    """
    Percentage of school days missed, from a 0-1 attendance rate. Rounded
    because the naive form is not exact at the thresholds that matter:
    (1 - 0.9) * 100 is 9.999999999999998, which would render as "10%" while
    failing a `>= 10.0` chronic-absence check.
    """
    return round((1.0 - float(attendance_rate)) * 100.0, 6)


def _interp(x, anchors):
    xs = [a[0] for a in anchors]
    ys = [a[1] for a in anchors]
    return round(float(np.clip(np.interp(float(x), xs, ys), 0.0, 100.0)), 2)


def _risk_level(risk_score):
    for cutoff, level in RISK_LEVEL_THRESHOLDS:
        if risk_score <= cutoff:
            return level
    return "critical"


def _grade_risk(grade, failing_count=0):
    """
    Whichever is worse: what the overall average says, or what the failing
    subjects say. Taking the max rather than blending keeps the rule
    statable in one sentence to a teacher, and stops a strong average from
    masking a subject the student is actually failing.
    """
    if _is_missing(grade):
        return None
    average_risk = _interp(grade, GRADE_ANCHORS)
    failing_risk = FAILING_SUBJECT_RISK.get(int(failing_count or 0), FAILING_SUBJECT_RISK_MAX)
    return round(max(average_risk, failing_risk), 2)


def _attendance_risk(attendance_rate):
    """
    attendance_rate is 0-1 (non-absent / total). Anchored on the absence
    percentage: 10% missed (the chronic-absenteeism line) is already 60
    risk, 20% (DepEd Order 8 s.2015 non-promotion territory) tops out at 100.
    """
    if _is_missing(attendance_rate):
        return None
    return _interp(_absence_pct(attendance_rate), ABSENCE_ANCHORS)


def _trend_risk(grade_delta):
    """
    grade_delta is this period's average minus the preceding period's
    (negative = slipping). None when there is no preceding period to compare
    against — the first quarter of a school year has no trajectory yet.
    """
    if _is_missing(grade_delta):
        return None
    return _interp(grade_delta, TREND_ANCHORS)


def _narrative_risk(avg_narrative):
    """avg_narrative is on NARRATIVE_SCORE's 1 (Needs Improvement) - 3
    (Outstanding) scale. Risk is the inverse rescaled to 0-100: Outstanding
    contributes 0, Satisfactory 50, Needs Improvement 100."""
    if _is_missing(avg_narrative):
        return None
    return round(float(np.clip((3.0 - avg_narrative) * 50.0, 0.0, 100.0)), 2)


# ─────────────────────────────────────────────────────────────────────────
# Plain-language explanations
# ─────────────────────────────────────────────────────────────────────────
# The score alone tells a teacher nothing they can act on. Every component
# that actually fired gets turned into one sentence naming the number and
# the threshold it crossed, so the table answers "why is this student on
# the list" without anyone needing to know how the score is computed.

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _plural(n, singular, plural=None):
    return singular if n == 1 else (plural or singular + "s")


def _grade_reasons(sd):
    reasons = []
    failing = sd.get("failing_subjects") or []
    if failing:
        named = ", ".join(f"{f['subject_name']} {f['grade']:g}" for f in failing[:3])
        more = len(failing) - 3
        if more > 0:
            named += f", +{more} more"
        reasons.append({
            "code": "failing_subjects",
            "text": f"Failing {len(failing)} {_plural(len(failing), 'subject')} — {named}",
            "severity": "high",
        })

    grade = sd.get("grade")
    if not _is_missing(grade):
        grade = float(grade)
        if grade < PASSING_GRADE:
            reasons.append({
                "code": "low_average",
                "text": f"Average of {grade:.1f} is below the {PASSING_GRADE:g} passing mark",
                "severity": "high",
            })
        elif grade < PASSING_GRADE + 5:
            reasons.append({
                "code": "borderline_average",
                "text": f"Average of {grade:.1f} is only just above the {PASSING_GRADE:g} passing mark",
                "severity": "medium",
            })
    return reasons


def _attendance_reasons(sd):
    rate = sd.get("attendance_rate")
    if _is_missing(rate):
        return []
    absence_pct = _absence_pct(rate)
    total = sd.get("total_school_days") or 0
    missed = sd.get("absent_days") or 0
    counted = f" ({missed} of {total} days)" if total else ""

    if absence_pct >= 20.0:
        return [{
            "code": "severe_absence",
            "text": f"Missed {absence_pct:.0f}% of school days{counted} — past the 20% mark "
                    f"where promotion is at risk",
            "severity": "high",
        }]
    if absence_pct >= 10.0:
        return [{
            "code": "chronic_absence",
            "text": f"Missed {absence_pct:.0f}% of school days{counted} — above the 10% "
                    f"chronic-absence line",
            "severity": "high",
        }]
    if absence_pct >= 5.0:
        return [{
            "code": "frequent_absence",
            "text": f"Missed {absence_pct:.0f}% of school days{counted}",
            "severity": "medium",
        }]
    return []


def _trend_reasons(sd):
    delta = sd.get("grade_delta")
    if _is_missing(delta) or float(delta) >= -2.0:
        return []
    previous = (sd.get("previous_period") or "").replace("_", " ")
    since = f" since the {previous}" if previous else ""
    return [{
        "code": "grades_dropping",
        "text": f"Average dropped {abs(float(delta)):.1f} points{since}",
        "severity": "high" if float(delta) <= -5.0 else "medium",
    }]


def _narrative_reasons(sd):
    ratings = sd.get("narrative_ratings") or []
    needs = [r for r in ratings if r == "needs_improvement"]
    if not needs:
        return []
    return [{
        "code": "behavior_concern",
        "text": f"Behavior rated Needs Improvement in {len(needs)} of {len(ratings)} "
                f"{_plural(len(ratings), 'area')}",
        "severity": "high" if len(needs) > 1 else "medium",
    }]


def _build_reasons(sd, components):
    reasons = []
    if components.get("grade") is not None:
        reasons += _grade_reasons(sd)
    if components.get("attendance") is not None:
        reasons += _attendance_reasons(sd)
    if components.get("trend") is not None:
        reasons += _trend_reasons(sd)
    if components.get("narrative") is not None:
        reasons += _narrative_reasons(sd)
    reasons.sort(key=lambda r: SEVERITY_ORDER.get(r["severity"], 9))
    return reasons


def _data_confidence(signals_present):
    """
    How much of the picture we actually have. A student scored from one
    signal is not as confidently placed as one scored from four, and the
    weight renormalization below hides that — so it's reported alongside the
    score rather than folded into it.
    """
    if signals_present >= 4:
        return "complete"
    if signals_present >= 2:
        return "partial"
    return "limited"


def score_students(student_data, weights=None):
    """
    student_data: the dict returned by build_student_features() (or anything
    with the same per-student keys). Only "grade" is required; every other
    signal degrades to None.
    weights: {"grade": w, "attendance": w, "trend": w, "narrative": w} —
    defaults to DEFAULT_WEIGHTS. Need not sum to 1; only relative proportions
    matter, since a student missing a component has the remaining weights
    renormalized (see below).

    Returns a dict of student_id -> {
        "grade_component", "attendance_component", "trend_component",
        "narrative_component"
            (each a 0-100 risk contribution, or None if that signal had no
             data at all for this student),
        "risk_score" (0-100 weighted composite, higher = more at-risk),
        "risk_level" ("low" | "moderate" | "high" | "critical"),
        "reasons" ([{code, text, severity}], most severe first),
        "signals_present" (int 0-4),
        "data_confidence" ("complete" | "partial" | "limited"),
    }

    A student missing one or two signals (e.g. no narrative report submitted
    yet this quarter) is scored from whichever signals it does have, with
    weights renormalized over just those — deliberately NOT imputed from the
    cohort mean the way the clustering view does, since keeping one
    student's score independent of who else is in the batch is what makes
    "flagged because grade and attendance are both low" a stable,
    individually-explainable statement over time.
    """
    weights = weights or DEFAULT_WEIGHTS
    results = {}

    for sid, sd in student_data.items():
        components = {
            "grade":      _grade_risk(sd.get("grade"), len(sd.get("failing_subjects") or [])),
            "attendance": _attendance_risk(sd.get("attendance_rate")),
            "trend":      _trend_risk(sd.get("grade_delta")),
            "narrative":  _narrative_risk(sd.get("avg_narrative")),
        }
        available = {k: v for k, v in components.items() if v is not None}
        weight_sum = sum(weights.get(k, 0) for k in available)

        if not available or weight_sum <= 0:
            # Not reachable in practice — every student entering this
            # function came from build_student_features() having at least
            # one Grade row, so "grade" is always present. Kept as an
            # honest fallback for any other caller of this pure function.
            risk_score = 0.0
        else:
            risk_score = sum(components[k] * weights.get(k, 0) for k in available) / weight_sum

        risk_score = round(risk_score, 2)
        signals_present = len(available)
        reasons = _build_reasons(sd, components)
        if signals_present <= 1:
            reasons.append({
                "code": "limited_data",
                "text": f"Based on {signals_present} of 4 signals — this score is less certain",
                "severity": "low",
            })

        results[sid] = {
            "grade_component":      components["grade"],
            "attendance_component": components["attendance"],
            "trend_component":      components["trend"],
            "narrative_component":  components["narrative"],
            "risk_score":           risk_score,
            "risk_level":           _risk_level(risk_score),
            "reasons":              reasons,
            "signals_present":      signals_present,
            "data_confidence":      _data_confidence(signals_present),
        }

    return results
