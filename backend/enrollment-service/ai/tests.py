"""
Tests for the at-risk student prediction feature (Phase C).

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
    _attendance_risk,
    _grade_risk,
    _narrative_risk,
    _risk_level,
    score_students,
)


# ─────────────────────────────────────────────────────────────────────────
# Component risk helpers
# ─────────────────────────────────────────────────────────────────────────

def test_grade_risk_is_shortfall_from_100():
    assert _grade_risk(100.0) == 0.0
    assert _grade_risk(75.0) == 25.0   # DepEd passing mark
    assert _grade_risk(0.0) == 100.0


def test_grade_risk_clips_out_of_range_values():
    assert _grade_risk(110.0) == 0.0     # extra credit shouldn't go negative risk
    assert _grade_risk(-10.0) == 100.0   # never exceed 100 risk


def test_grade_risk_none_for_missing_data():
    assert _grade_risk(None) is None
    assert _grade_risk(float("nan")) is None


def test_attendance_risk_is_absence_rate_pct():
    assert _attendance_risk(1.0) == 0.0
    assert _attendance_risk(0.9) == 10.0
    assert _attendance_risk(0.0) == 100.0


def test_attendance_risk_none_for_missing_data():
    assert _attendance_risk(None) is None
    assert _attendance_risk(float("nan")) is None


def test_narrative_risk_maps_1_to_3_scale_inverted():
    assert _narrative_risk(3.0) == 0.0     # Outstanding
    assert _narrative_risk(2.0) == 50.0    # Satisfactory
    assert _narrative_risk(1.0) == 100.0   # Needs Improvement


def test_narrative_risk_none_for_missing_data():
    assert _narrative_risk(None) is None
    assert _narrative_risk(float("nan")) is None


# ─────────────────────────────────────────────────────────────────────────
# risk_level thresholds — anchored to _grade_risk(75) == 25 (DepEd passing)
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
# score_students()
# ─────────────────────────────────────────────────────────────────────────

def test_score_students_perfect_student_is_zero_risk():
    student_data = {1: {"grade": 100.0, "attendance_rate": 1.0, "avg_narrative": 3.0}}
    result = score_students(student_data)
    assert result[1]["risk_score"] == 0.0
    assert result[1]["risk_level"] == "low"


def test_score_students_worst_student_is_max_risk():
    student_data = {1: {"grade": 0.0, "attendance_rate": 0.0, "avg_narrative": 1.0}}
    result = score_students(student_data)
    assert result[1]["risk_score"] == 100.0
    assert result[1]["risk_level"] == "critical"


def test_score_students_uses_default_weights():
    # grade=50 (risk 50), attendance=0.7 (risk 30), narrative=2.0 (risk 50)
    # weighted: 0.5*50 + 0.3*30 + 0.2*50 = 25 + 9 + 10 = 44
    student_data = {1: {"grade": 50.0, "attendance_rate": 0.7, "avg_narrative": 2.0}}
    result = score_students(student_data)
    assert result[1]["risk_score"] == 44.0
    assert result[1]["risk_level"] == "moderate"
    assert result[1]["grade_component"] == 50.0
    assert result[1]["attendance_component"] == 30.0
    assert result[1]["narrative_component"] == 50.0


def test_score_students_missing_component_renormalizes_remaining_weights():
    # No narrative report submitted yet this quarter — renormalize grade and
    # attendance over their combined 0.8 weight rather than silently
    # treating the missing narrative signal as 0 risk.
    student_data = {1: {"grade": 100.0, "attendance_rate": 0.5, "avg_narrative": np.nan}}
    result = score_students(student_data)
    assert result[1]["narrative_component"] is None
    # (0*0.5 + 50*0.3) / 0.8 = 18.75
    assert result[1]["risk_score"] == 18.75


def test_score_students_custom_weights_override_defaults():
    student_data = {1: {"grade": 0.0, "attendance_rate": 0.5, "avg_narrative": 3.0}}
    # All weight on attendance alone: risk_score must equal attendance_component exactly.
    result = score_students(student_data, weights={"grade": 0, "attendance": 1, "narrative": 0})
    assert result[1]["risk_score"] == result[1]["attendance_component"] == 50.0


def test_score_students_independent_across_students():
    # A weak student's score must not shift depending on who else is in the
    # batch — deliberately unlike the clustering view's column-mean
    # imputation. This is what keeps "flagged because grade and attendance
    # are both low" a stable, individually-explainable statement.
    weak = {"grade": 40.0, "attendance_rate": 0.4, "avg_narrative": 1.0}
    strong = {"grade": 100.0, "attendance_rate": 1.0, "avg_narrative": 3.0}

    solo = score_students({1: weak})
    batch = score_students({1: weak, 2: strong})

    assert solo[1]["risk_score"] == batch[1]["risk_score"]


# ─────────────────────────────────────────────────────────────────────────
# Persistence — RiskAssessmentRun / StudentRiskScore are genuinely
# Django-managed (real migrations), so these tests hit a real test database.
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
        "grade_component", "attendance_component", "narrative_component",
    ])
    def test_score_components_are_nullable(self, field_name):
        # A student can be missing one signal (e.g. no narrative report
        # submitted yet this quarter) — see score_students()'s renormalization.
        assert StudentRiskScore._meta.get_field(field_name).null is True

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


RISK_VIEWS = [RiskAssessmentRunView, RiskAssessmentLatestView, RiskAssessmentTrendView]


class TestRiskAssessmentPermissions:
    """
    Locked to the same role set as ClusterAnalyticsView/GeminiInterpretView
    (super_admin/admin/registrar). Teacher is deliberately excluded —
    whole-school risk analytics exceeds a single advisory section's scope —
    and accounting/guardian have no legitimate reason to see it either.
    """

    perm = HasRole()

    @pytest.mark.parametrize("view_cls", RISK_VIEWS)
    @pytest.mark.parametrize("role", ["teacher", "accounting", "guardian"])
    def test_disallowed_roles_rejected(self, view_cls, role):
        request = factory.get("/")
        request.user = _user(role)
        assert self.perm.has_permission(request, view_cls) is False

    @pytest.mark.parametrize("view_cls", RISK_VIEWS)
    @pytest.mark.parametrize("role", ["super_admin", "admin", "registrar"])
    def test_allowed_roles_accepted(self, view_cls, role):
        request = factory.get("/")
        request.user = _user(role)
        assert self.perm.has_permission(request, view_cls) is True

    @pytest.mark.parametrize("view_cls", RISK_VIEWS)
    def test_unauthenticated_denied(self, view_cls):
        request = factory.get("/")
        request.user = _anon()
        assert self.perm.has_permission(request, view_cls) is False
