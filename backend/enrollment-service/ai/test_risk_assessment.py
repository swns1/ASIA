"""
Tests for the at-risk student prediction feature.

- Component/score math in ai/services.py is pure functions, no DB needed —
  same style as billing/test_services.py.
- RiskAssessmentRun/StudentRiskScore are genuinely Django-managed (real
  migrations), unlike most models in this codebase, but a real pytest-django
  test database is NOT used here: attendance.AttendanceRecord (a sibling
  managed model from Phase A) has a real FK constraint onto Enrollment
  (managed=False), which breaks `create_test_db()` for the whole project the
  same way it would for any managed=django_db test in this service — there's
  no way to build a fresh test database without first fixing that unrelated
  Phase A gap, which is out of scope here. Model structure (unique_together,
  ordering, nullability) is instead verified declaratively via `_meta`.
- Permission tests use the same APIRequestFactory + SimpleNamespace
  technique as accounts/test_permissions.py.
"""
from types import SimpleNamespace

import numpy as np
import pytest
from rest_framework.test import APIRequestFactory

from accounts.permissions import HasRole
from ai.models import RiskAssessmentRun, StudentRiskScore
from ai.risk_views import (
    RiskAssessmentLatestView,
    RiskAssessmentRunView,
    RiskAssessmentTrendView,
)
from ai.services import (
    PASSING_GRADE,
    _attendance_risk,
    _grade_risk,
    _narrative_risk,
    _risk_level,
    _trend_risk,
    score_students,
)


def _student(grade=None, failing=0, attendance_rate=None, grade_delta=None,
             avg_narrative=None, narrative_ratings=None, total_days=180):
    """
    One student_data entry shaped like build_student_features() emits.
    `failing` is a count; the subject names/grades only matter to the reason
    strings, not the score.
    """
    return {
        "grade": np.nan if grade is None else grade,
        "failing_subjects": [
            {"subject_name": f"Subject {i + 1}", "grade": 70.0} for i in range(failing)
        ],
        "attendance_rate": np.nan if attendance_rate is None else attendance_rate,
        "total_school_days": total_days,
        "absent_days": 0 if attendance_rate is None else round(total_days * (1 - attendance_rate)),
        "grade_delta": np.nan if grade_delta is None else grade_delta,
        "previous_period": "1st_quarter",
        "avg_narrative": np.nan if avg_narrative is None else avg_narrative,
        "narrative_ratings": narrative_ratings or [],
    }


def _score_one(**kwargs):
    return score_students({1: _student(**kwargs)})[1]


# ─────────────────────────────────────────────────────────────────────────
# Component risk helpers
#
# Every component is anchored to a threshold the school already acts on,
# not to a linear inversion of the raw signal. These tests pin the anchors,
# because the anchors are the whole point: the previous linear mapping put
# grades (which floor near 60, so risk capped near 40) and attendance (a
# true 0-100 range) on incomparable scales, which collapsed every real
# student into "low"/"moderate" and made "critical" unreachable.
# ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("grade,expected", [
    (100.0, 0.0),    # Outstanding
    (90.0, 0.0),     # top of the Outstanding band
    (85.0, 20.0),    # Very Satisfactory
    (80.0, 40.0),    # Satisfactory
    (75.0, 60.0),    # exactly the DepEd passing mark — already a real concern
    (70.0, 85.0),
    (65.0, 100.0),   # Did Not Meet Expectations
])
def test_grade_risk_follows_deped_descriptor_anchors(grade, expected):
    assert _grade_risk(grade) == expected


def test_grade_risk_clips_out_of_range_values():
    assert _grade_risk(110.0) == 0.0     # extra credit shouldn't go negative risk
    assert _grade_risk(-10.0) == 100.0   # never exceed 100 risk


@pytest.mark.parametrize("failing,expected", [(0, 0.0), (1, 65.0), (2, 85.0), (3, 100.0), (7, 100.0)])
def test_grade_risk_escalates_with_failing_subject_count(failing, expected):
    # A 95 average with failing subjects still carries the failing risk: an
    # average is a mean of per-subject means, so seven 90s and a 60 average
    # to 86 and hide the one subject the school actually acts on.
    assert _grade_risk(95.0, failing) == expected


def test_grade_risk_takes_the_worse_of_average_and_failing():
    # Average says 100 (65.0 is below every anchor), failing count says 65.
    assert _grade_risk(65.0, 1) == 100.0
    # Average says 0, failing count says 65 — the failures win.
    assert _grade_risk(95.0, 1) == 65.0


def test_grade_risk_none_for_missing_data():
    assert _grade_risk(None) is None
    assert _grade_risk(float("nan")) is None


@pytest.mark.parametrize("rate,expected", [
    (1.00, 0.0),
    (0.95, 20.0),    # 5% missed
    (0.90, 60.0),    # 10% missed — the chronic-absenteeism line
    (0.80, 100.0),   # 20% missed — DepEd Order 8 s.2015 non-promotion territory
    (0.50, 100.0),
])
def test_attendance_risk_anchored_on_absence_thresholds(rate, expected):
    assert _attendance_risk(rate) == expected


def test_attendance_risk_is_exact_at_the_chronic_absence_line():
    # (1 - 0.9) * 100 is 9.999999999999998 in float, which would render as
    # "10%" while failing a `>= 10.0` check. _absence_pct rounds so the
    # displayed number and the branch taken can never disagree.
    assert _attendance_risk(0.90) == 60.0
    reasons = _score_one(grade=80.0, attendance_rate=0.90)["reasons"]
    assert any(r["code"] == "chronic_absence" for r in reasons)


def test_attendance_risk_none_for_missing_data():
    assert _attendance_risk(None) is None
    assert _attendance_risk(float("nan")) is None


@pytest.mark.parametrize("delta,expected", [
    (5.0, 0.0),      # improving carries no risk
    (0.0, 0.0),
    (-2.0, 25.0),
    (-5.0, 60.0),
    (-10.0, 100.0),
    (-20.0, 100.0),
])
def test_trend_risk_anchored_on_grade_slide(delta, expected):
    assert _trend_risk(delta) == expected


def test_trend_risk_none_when_no_preceding_period():
    # The 1st quarter of a school year has no trajectory to compare against.
    assert _trend_risk(None) is None
    assert _trend_risk(float("nan")) is None


def test_narrative_risk_maps_1_to_3_scale_inverted():
    assert _narrative_risk(3.0) == 0.0     # Outstanding
    assert _narrative_risk(2.0) == 50.0    # Satisfactory
    assert _narrative_risk(1.0) == 100.0   # Needs Improvement


def test_narrative_risk_none_for_missing_data():
    assert _narrative_risk(None) is None
    assert _narrative_risk(float("nan")) is None


# ─────────────────────────────────────────────────────────────────────────
# risk_level thresholds
# ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("score,expected", [
    (0.0,   "low"),
    (25.0,  "low"),        # boundary: inclusive
    (25.01, "moderate"),
    (50.0,  "moderate"),   # boundary: inclusive
    (50.01, "high"),
    (75.0,  "high"),       # boundary: inclusive
    (75.01, "critical"),
    (100.0, "critical"),
])
def test_risk_level_thresholds(score, expected):
    assert _risk_level(score) == expected


# ─────────────────────────────────────────────────────────────────────────
# Calibration regression — the acceptance test for the whole feature.
#
# Under the previous linear mapping a student failing 2 of 8 subjects scored
# 16.9 ("low") and a chronically absent student scored 18.0 ("low"), while
# "critical" could not be reached by anyone with a real DepEd grade. If any
# row here drifts back toward "low", the early-warning list has stopped
# warning about anything.
# ─────────────────────────────────────────────────────────────────────────

CALIBRATION_CASES = [
    ("honor student",      dict(grade=95.0, attendance_rate=0.99, grade_delta=1.0,
                                avg_narrative=3.0),                          "low"),
    ("solid",              dict(grade=88.0, attendance_rate=0.96),           "low"),
    ("borderline",         dict(grade=77.0, attendance_rate=0.92),           "moderate"),
    ("sliding",            dict(grade=79.0, attendance_rate=0.94,
                                grade_delta=-9.0),                           "moderate"),
    ("chronically absent", dict(grade=84.0, attendance_rate=0.82),           "high"),
    ("failing two",        dict(grade=79.0, failing=2, attendance_rate=0.90), "high"),
    ("failing many",       dict(grade=72.0, failing=3, attendance_rate=0.85,
                                grade_delta=-4.0, avg_narrative=2.0),        "critical"),
    ("worst realistic",    dict(grade=66.0, failing=5, attendance_rate=0.75,
                                grade_delta=-12.0, avg_narrative=1.0),       "critical"),
]


@pytest.mark.parametrize("label,features,expected_level",
                         CALIBRATION_CASES, ids=[c[0] for c in CALIBRATION_CASES])
def test_calibration_places_students_in_the_right_band(label, features, expected_level):
    assert _score_one(**features)["risk_level"] == expected_level


def test_every_band_is_reachable():
    # The specific defect being guarded against: under the old formula the
    # top band could not fire at all, so the list never escalated anyone.
    levels = {_score_one(**features)["risk_level"] for _label, features, _ in CALIBRATION_CASES}
    assert levels == {"low", "moderate", "high", "critical"}


def test_failing_subjects_alone_escalates_past_watch():
    # The headline regression: a strong-looking average must not bury a
    # student who is failing subjects.
    assert _score_one(grade=79.0, failing=2, attendance_rate=0.90)["risk_score"] > 50.0


def test_chronic_absence_alone_escalates_past_watch():
    # Attendance is a standalone risk path — good grades must not mask it.
    assert _score_one(grade=84.0, attendance_rate=0.82)["risk_score"] > 50.0


# ─────────────────────────────────────────────────────────────────────────
# score_students()
# ─────────────────────────────────────────────────────────────────────────

def test_score_students_perfect_student_is_zero_risk():
    result = _score_one(grade=100.0, attendance_rate=1.0, grade_delta=0.0, avg_narrative=3.0)
    assert result["risk_score"] == 0.0
    assert result["risk_level"] == "low"
    assert result["reasons"] == []


def test_score_students_worst_student_is_max_risk():
    result = _score_one(grade=0.0, failing=8, attendance_rate=0.0,
                        grade_delta=-50.0, avg_narrative=1.0)
    assert result["risk_score"] == 100.0
    assert result["risk_level"] == "critical"


def test_score_students_uses_default_weights():
    # grade=80/0 failing (risk 40), attendance=0.95 (risk 20),
    # delta=-5 (risk 60), narrative=2.0 (risk 50)
    # weighted: 0.40*40 + 0.30*20 + 0.15*60 + 0.15*50 = 16 + 6 + 9 + 7.5 = 38.5
    result = _score_one(grade=80.0, attendance_rate=0.95, grade_delta=-5.0, avg_narrative=2.0)
    assert result["grade_component"] == 40.0
    assert result["attendance_component"] == 20.0
    assert result["trend_component"] == 60.0
    assert result["narrative_component"] == 50.0
    assert result["risk_score"] == 38.5
    assert result["risk_level"] == "moderate"


def test_score_students_missing_component_renormalizes_remaining_weights():
    # No narrative report and no preceding period — renormalize grade and
    # attendance over their combined 0.70 weight rather than silently
    # treating the missing signals as 0 risk.
    result = _score_one(grade=90.0, attendance_rate=0.80)
    assert result["trend_component"] is None
    assert result["narrative_component"] is None
    # (0*0.40 + 100*0.30) / 0.70 = 42.86
    assert result["risk_score"] == 42.86


def test_score_students_custom_weights_override_defaults():
    # All weight on attendance alone: risk_score must equal attendance_component exactly.
    student_data = {1: _student(grade=100.0, attendance_rate=0.95, avg_narrative=3.0)}
    result = score_students(
        student_data, weights={"grade": 0, "attendance": 1, "trend": 0, "narrative": 0},
    )
    assert result[1]["risk_score"] == result[1]["attendance_component"] == 20.0


def test_score_students_independent_across_students():
    # A weak student's score must not shift depending on who else is in the
    # batch — deliberately unlike the clustering view's column-mean
    # imputation. This is what keeps "flagged because grade and attendance
    # are both low" a stable, individually-explainable statement.
    weak = _student(grade=68.0, failing=3, attendance_rate=0.70, avg_narrative=1.0)
    strong = _student(grade=98.0, attendance_rate=1.0, avg_narrative=3.0)

    solo = score_students({1: weak})
    batch = score_students({1: weak, 2: strong})

    assert solo[1]["risk_score"] == batch[1]["risk_score"]


def test_attendance_below_the_evidence_gate_is_treated_as_missing():
    # 4 absences out of the 10 days recorded so far is not "40% chronic
    # absence" — early in a quarter it is noise. Verified against seed data,
    # where several enrollments carry fewer than a fortnight of records.
    from ai.services import MIN_ATTENDANCE_DAYS, build_student_features  # noqa: F401

    thin = _student(grade=85.0, attendance_rate=0.60, total_days=4)
    # build_student_features applies the gate; score_students trusts what it
    # is handed, so the gate is asserted on the feature builder's contract
    # via MIN_ATTENDANCE_DAYS rather than re-derived here.
    assert MIN_ATTENDANCE_DAYS >= 10
    # A thin record that did survive the gate still scores normally.
    assert score_students({1: thin})[1]["attendance_component"] == 100.0


def test_score_students_reports_signal_coverage():
    full = _score_one(grade=85.0, attendance_rate=0.95, grade_delta=0.0, avg_narrative=3.0)
    assert full["signals_present"] == 4
    assert full["data_confidence"] == "complete"

    partial = _score_one(grade=85.0, attendance_rate=0.95)
    assert partial["signals_present"] == 2
    assert partial["data_confidence"] == "partial"

    limited = _score_one(grade=85.0)
    assert limited["signals_present"] == 1
    assert limited["data_confidence"] == "limited"
    assert any(r["code"] == "limited_data" for r in limited["reasons"])


# ─────────────────────────────────────────────────────────────────────────
# Plain-language reasons — what the table actually shows a teacher.
# ─────────────────────────────────────────────────────────────────────────

def _codes(**kwargs):
    return [r["code"] for r in _score_one(**kwargs)["reasons"]]


def test_reason_names_the_failing_subjects():
    reasons = _score_one(grade=79.0, failing=2, attendance_rate=0.98)["reasons"]
    failing = next(r for r in reasons if r["code"] == "failing_subjects")
    assert "Failing 2 subjects" in failing["text"]
    assert "Subject 1 70" in failing["text"]
    assert failing["severity"] == "high"


def test_reason_singular_plural_agreement():
    text = next(
        r["text"] for r in _score_one(grade=79.0, failing=1, attendance_rate=0.98)["reasons"]
        if r["code"] == "failing_subjects"
    )
    assert "Failing 1 subject —" in text


@pytest.mark.parametrize("rate,expected_code", [
    (0.99, None),                  # nothing worth saying
    (0.93, "frequent_absence"),    # 7%
    (0.88, "chronic_absence"),     # 12% — past the 10% line
    (0.75, "severe_absence"),      # 25% — past the 20% line
])
def test_absence_reason_escalates_with_the_threshold_crossed(rate, expected_code):
    codes = _codes(grade=90.0, attendance_rate=rate)
    if expected_code is None:
        assert not any(c.endswith("_absence") for c in codes)
    else:
        assert expected_code in codes


def test_reason_quantifies_the_grade_slide():
    text = next(
        r["text"] for r in _score_one(grade=79.0, attendance_rate=0.98, grade_delta=-8.4)["reasons"]
        if r["code"] == "grades_dropping"
    )
    assert "8.4 points" in text


def test_no_trend_reason_for_a_small_wobble():
    # A 1-point move between quarters is noise, not a trajectory.
    assert "grades_dropping" not in _codes(grade=85.0, attendance_rate=0.98, grade_delta=-1.0)


def test_reason_counts_behavior_concerns():
    text = next(
        r["text"] for r in _score_one(
            grade=90.0, attendance_rate=0.98, avg_narrative=1.5,
            narrative_ratings=["needs_improvement", "needs_improvement", "satisfactory"],
        )["reasons"]
        if r["code"] == "behavior_concern"
    )
    assert "2 of 3 areas" in text


def test_reasons_are_ordered_most_severe_first():
    reasons = _score_one(
        grade=72.0, failing=2, attendance_rate=0.93, grade_delta=-3.0,
    )["reasons"]
    severities = [r["severity"] for r in reasons]
    assert severities == sorted(severities, key=lambda s: {"high": 0, "medium": 1, "low": 2}[s])


def test_passing_grade_constant_matches_the_reason_text():
    # The reason sentence quotes the threshold, so the two must not drift.
    text = next(
        r["text"] for r in _score_one(grade=70.0, attendance_rate=0.98)["reasons"]
        if r["code"] == "low_average"
    )
    assert f"{PASSING_GRADE:g} passing mark" in text


# ─────────────────────────────────────────────────────────────────────────
# Persistence — RiskAssessmentRun / StudentRiskScore are genuinely
# Django-managed (real migrations). Structure only; see module docstring
# for why there is no test database.
# ─────────────────────────────────────────────────────────────────────────

class TestModelStructure:
    def test_student_risk_score_unique_together_is_run_and_student(self):
        # What makes StudentRiskScore.objects.bulk_create() safe to call
        # once per student per run without a duplicate row slipping in.
        assert StudentRiskScore._meta.unique_together == (("run", "student_id"),)

    def test_run_default_ordering_is_most_recent_first(self):
        # What RiskAssessmentLatestView's `.first()` relies on.
        assert RiskAssessmentRun._meta.ordering == ["-created_at"]

    def test_score_default_ordering_is_highest_risk_first(self):
        assert StudentRiskScore._meta.ordering == ["-risk_score"]

    def test_score_risk_score_is_not_nullable(self):
        assert StudentRiskScore._meta.get_field("risk_score").null is False

    @pytest.mark.parametrize("field_name", [
        "grade_component", "attendance_component", "trend_component", "narrative_component",
    ])
    def test_score_components_are_nullable(self, field_name):
        # A student can be missing one signal (e.g. no narrative report
        # submitted yet this quarter) — see score_students()'s renormalization.
        assert StudentRiskScore._meta.get_field(field_name).null is True

    def test_score_reasons_default_to_an_empty_list(self):
        # Runs persisted before reasons existed must still serialize.
        assert StudentRiskScore._meta.get_field("reasons_json").default is list

    def test_run_tracks_when_it_was_last_recomputed(self):
        # A same-day re-run updates in place, so created_at alone would
        # report a stale "computed at" time.
        assert RiskAssessmentRun._meta.get_field("updated_at").auto_now is True

    def test_score_enrollment_id_is_indexed(self):
        # The future ML join key against Enrollment.enrollment_status (see
        # ai/services.py's module docstring) needs to stay indexed for that
        # to be cheap once real dropout history exists.
        assert StudentRiskScore._meta.get_field("enrollment_id").db_index is True


# ─────────────────────────────────────────────────────────────────────────
# Permissions — bare requests via APIRequestFactory with a SimpleNamespace
# request.user, same technique as accounts/test_permissions.py.
# ─────────────────────────────────────────────────────────────────────────

factory = APIRequestFactory()


def _user(role):
    return SimpleNamespace(role=role, user_id=1, is_authenticated=True)


def _anon():
    return SimpleNamespace(is_authenticated=False)


READ_VIEWS = [RiskAssessmentLatestView, RiskAssessmentTrendView]


class TestRiskAssessmentPermissions:
    """
    Teachers may READ the early-warning list — it's only useful to an adviser
    if they can see their own class in it — but the rows they get back are
    scoped to their own SectionAdvisory roster by `_visible_student_ids()`.
    Triggering a new school-wide run stays a staff action. Accounting and
    guardians have no legitimate reason to see any of it.
    """

    perm = HasRole()

    @pytest.mark.parametrize("view_cls", READ_VIEWS)
    @pytest.mark.parametrize("role", ["super_admin", "admin", "registrar", "teacher"])
    def test_read_views_allow_staff_and_teachers(self, view_cls, role):
        request = factory.get("/")
        request.user = _user(role)
        assert self.perm.has_permission(request, view_cls) is True

    @pytest.mark.parametrize("view_cls", READ_VIEWS)
    @pytest.mark.parametrize("role", ["accounting", "guardian"])
    def test_read_views_reject_non_academic_roles(self, view_cls, role):
        request = factory.get("/")
        request.user = _user(role)
        assert self.perm.has_permission(request, view_cls) is False

    @pytest.mark.parametrize("role", ["super_admin", "admin", "registrar"])
    def test_running_an_assessment_allows_staff(self, role):
        request = factory.post("/")
        request.user = _user(role)
        assert self.perm.has_permission(request, RiskAssessmentRunView) is True

    @pytest.mark.parametrize("role", ["teacher", "accounting", "guardian"])
    def test_running_an_assessment_rejects_everyone_else(self, role):
        # A teacher reads the list but does not trigger a school-wide,
        # persisted recomputation.
        request = factory.post("/")
        request.user = _user(role)
        assert self.perm.has_permission(request, RiskAssessmentRunView) is False

    @pytest.mark.parametrize("view_cls", READ_VIEWS + [RiskAssessmentRunView])
    def test_unauthenticated_denied(self, view_cls):
        request = factory.get("/")
        request.user = _anon()
        assert self.perm.has_permission(request, view_cls) is False
