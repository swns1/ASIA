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
"""

from collections import defaultdict

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


def build_student_features(school_year, grading_period, subject_id=None,
                            school_level=None, grade_level=None):
    """
    Returns (student_data, subject_name).

    student_data: dict of student_id -> {
        "student_id", "enrollment_id", "student_name", "student_number",
        "grades": {subject_name: avg_numeric_grade},
        "grade": overall avg grade across "grades" (float, DepEd 0-100 scale),
        "attendance_rate": non-absent / total for the full school year, or
                            np.nan if the student has no attendance rows,
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
                "grade_accum":   defaultdict(list),
            }
        student_data[sid]["grade_accum"][g.subject.subject_name].append(float(g.numeric_grade))

    # Resolve accumulated lists → per-subject mean, and one overall average
    for sd in student_data.values():
        sd["grades"] = {
            subj: float(np.mean(vals))
            for subj, vals in sd["grade_accum"].items()
        }
        sd["grade"] = float(np.mean(list(sd["grades"].values()))) if sd["grades"] else np.nan

    enrollment_ids = [sd["enrollment_id"] for sd in student_data.values()]

    # ── Fetch attendance (full school year) ───────────────────────────
    att_qs = (
        AttendanceRecord.objects
        .filter(
            enrollment_id__in=enrollment_ids,
            enrollment__school_year=school_year,
        )
        .values("enrollment_id")
        .annotate(
            total=Count("attendance_id"),
            absent=Count("attendance_id", filter=Q(status="A")),
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

    # ── Attach attendance_rate and avg_narrative ───────────────────────
    for sd in student_data.values():
        eid = sd["enrollment_id"]

        att = att_map.get(eid)
        if att and att["total"] > 0:
            sd["attendance_rate"] = (att["total"] - att["absent"]) / att["total"]
        else:
            sd["attendance_rate"] = np.nan

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

DEFAULT_WEIGHTS = {"grade": 0.5, "attendance": 0.3, "narrative": 0.2}

# Cut points on the final 0-100 composite risk_score. Anchored to the DepEd
# 75-mark passing convention (enrollments/report_views.py): _grade_risk(75)
# == 25, so a student sitting exactly at the passing grade with no other
# risk factors lands right on the low/moderate boundary. The remaining
# boundaries are evenly spaced from there.
RISK_LEVEL_THRESHOLDS = (
    (25.0, "low"),
    (50.0, "moderate"),
    (75.0, "high"),
    (100.0, "critical"),
)


def _risk_level(risk_score):
    for cutoff, level in RISK_LEVEL_THRESHOLDS:
        if risk_score <= cutoff:
            return level
    return "critical"


def _grade_risk(grade):
    """Risk is the shortfall from a perfect 100 (so the DepEd passing mark
    of 75 contributes 25 risk), clipped to a valid 0-100 range."""
    if grade is None or (isinstance(grade, float) and np.isnan(grade)):
        return None
    return round(float(np.clip(100.0 - grade, 0.0, 100.0)), 2)


def _attendance_risk(attendance_rate):
    """attendance_rate is 0-1 (non-absent / total). Risk is the absence
    rate rescaled to 0-100 — 90% attendance contributes 10 risk."""
    if attendance_rate is None or (isinstance(attendance_rate, float) and np.isnan(attendance_rate)):
        return None
    return round(float(np.clip(100.0 - attendance_rate * 100.0, 0.0, 100.0)), 2)


def _narrative_risk(avg_narrative):
    """avg_narrative is on NARRATIVE_SCORE's 1 (Needs Improvement) - 3
    (Outstanding) scale. Risk is the inverse rescaled to 0-100: Outstanding
    contributes 0, Satisfactory 50, Needs Improvement 100."""
    if avg_narrative is None or (isinstance(avg_narrative, float) and np.isnan(avg_narrative)):
        return None
    return round(float(np.clip((3.0 - avg_narrative) * 50.0, 0.0, 100.0)), 2)


def score_students(student_data, weights=None):
    """
    student_data: the dict returned by build_student_features() (or anything
    with the same "grade"/"attendance_rate"/"avg_narrative" keys per student).
    weights: {"grade": w, "attendance": w, "narrative": w} — defaults to
    DEFAULT_WEIGHTS. Need not sum to 1; only relative proportions matter,
    since a student missing a component has the remaining weights
    renormalized (see below).

    Returns a dict of student_id -> {
        "grade_component", "attendance_component", "narrative_component"
            (each a 0-100 risk contribution, or None if that signal had no
             data at all for this student),
        "risk_score" (0-100 weighted composite, higher = more at-risk),
        "risk_level" ("low" | "moderate" | "high" | "critical"),
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
            "grade":      _grade_risk(sd.get("grade")),
            "attendance": _attendance_risk(sd.get("attendance_rate")),
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
        results[sid] = {
            "grade_component":      components["grade"],
            "attendance_component": components["attendance"],
            "narrative_component":  components["narrative"],
            "risk_score":           risk_score,
            "risk_level":           _risk_level(risk_score),
        }

    return results
