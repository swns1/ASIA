"""
Tests for the dashboard summary endpoint.

The shapers in dashboard/services.py are pure functions over ORM rows, so they
are tested directly with no database — the same constraint and the same style
as ai/test_risk_assessment.py and billing/test_services.py (most models here
are `managed = False`, so pytest-django builds no tables for them).

Role behaviour is tested through the permission class with APIRequestFactory +
SimpleNamespace, matching accounts/test_permissions.py.
"""
from datetime import date
from types import SimpleNamespace

from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from accounts.permissions import HasRole
from dashboard.services import (
    RISK_BANDS,
    SCHOOL_LEVELS,
    shape_attendance_series,
    shape_level_distribution,
    shape_pipeline,
    shape_risk_bands,
)
from dashboard.views import DASHBOARD_ROLES, DEFAULT_WEEKS, MAX_WEEKS, DashboardSummaryView

factory = APIRequestFactory()


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


# ── shape_pipeline ──────────────────────────────────────────────────────────
class TestShapePipeline:
    def test_zero_fills_missing_stages(self):
        result = shape_pipeline([{"enrollment_status": "enrolled", "n": 5}])
        assert result["pending"] == 0
        assert result["enrolled"] == 5
        assert result["completed"] == 0

    def test_exits_are_separated_from_the_funnel(self):
        # cancelled/transferred_out are exits, not a fourth stage — they must
        # not inflate the funnel's total or they'd widen its first bar beyond
        # the population it represents.
        result = shape_pipeline([
            {"enrollment_status": "pending", "n": 2},
            {"enrollment_status": "enrolled", "n": 10},
            {"enrollment_status": "cancelled", "n": 3},
            {"enrollment_status": "transferred_out", "n": 1},
        ])
        assert result["total"] == 12
        assert result["exited"] == 4

    def test_empty_input_is_all_zeroes_not_missing_keys(self):
        result = shape_pipeline([])
        assert result == {"pending": 0, "enrolled": 0, "completed": 0,
                          "exited": 0, "total": 0}

    def test_unknown_status_is_ignored(self):
        result = shape_pipeline([{"enrollment_status": "something_new", "n": 9}])
        assert result["total"] == 0
        assert result["exited"] == 0


# ── shape_level_distribution ────────────────────────────────────────────────
class TestShapeLevelDistribution:
    def test_always_returns_every_level_in_school_order(self):
        result = shape_level_distribution([{"school_level": "elementary", "n": 240}])
        assert [r["level"] for r in result] == SCHOOL_LEVELS
        assert len(result) == 5

    def test_empty_levels_are_zero_not_dropped(self):
        result = shape_level_distribution([{"school_level": "nursery", "n": 8}])
        by_level = {r["level"]: r["count"] for r in result}
        assert by_level["nursery"] == 8
        assert by_level["senior_highschool"] == 0

    def test_order_is_independent_of_row_order(self):
        # The chart reads these as a progression through the school, so the
        # axis must not reorder itself when the biggest level changes.
        rows = [
            {"school_level": "senior_highschool", "n": 300},
            {"school_level": "nursery", "n": 1},
        ]
        assert [r["level"] for r in shape_level_distribution(rows)] == SCHOOL_LEVELS

    def test_every_level_carries_a_display_label(self):
        assert all(r["label"] for r in shape_level_distribution([]))


# ── shape_risk_bands ────────────────────────────────────────────────────────
class TestShapeRiskBands:
    def test_flagged_is_high_plus_critical(self):
        result = shape_risk_bands([
            {"risk_level": "low", "n": 100},
            {"risk_level": "moderate", "n": 20},
            {"risk_level": "high", "n": 7},
            {"risk_level": "critical", "n": 3},
        ])
        assert result["flagged"] == 10
        assert result["total"] == 130

    def test_zero_fills_every_band(self):
        result = shape_risk_bands([{"risk_level": "low", "n": 4}])
        assert set(result["bands"]) == set(RISK_BANDS)
        assert result["bands"]["critical"] == 0

    def test_empty_run_reports_zero_not_missing(self):
        result = shape_risk_bands([])
        assert result["flagged"] == 0
        assert result["total"] == 0
        assert all(v == 0 for v in result["bands"].values())


# ── shape_attendance_series ─────────────────────────────────────────────────
class TestShapeAttendanceSeries:
    def test_orders_weeks_oldest_first(self):
        # Consecutive weeks, deliberately supplied out of order — this asserts
        # sorting alone, without the gap-filling covered below.
        rows = [
            {"week": date(2025, 1, 20), "status": "P", "n": 5},
            {"week": date(2025, 1, 6), "status": "P", "n": 5},
            {"week": date(2025, 1, 13), "status": "P", "n": 5},
        ]
        weeks = [r["week"] for r in shape_attendance_series(rows)]
        assert weeks == ["2025-01-06", "2025-01-13", "2025-01-20"]

    def test_rate_excludes_excused_absences(self):
        # An excused absence is approved leave, not an attendance failure.
        # 8 present of 8 countable (P+A+L) = 1.0, even with 2 excused present.
        rows = [
            {"week": date(2025, 1, 6), "status": "P", "n": 8},
            {"week": date(2025, 1, 6), "status": "E", "n": 2},
        ]
        entry = shape_attendance_series(rows)[0]
        assert entry["rate"] == 1.0
        assert entry["excused"] == 2
        assert entry["total"] == 10

    def test_rate_counts_late_against_attendance(self):
        rows = [
            {"week": date(2025, 1, 6), "status": "P", "n": 6},
            {"week": date(2025, 1, 6), "status": "A", "n": 2},
            {"week": date(2025, 1, 6), "status": "L", "n": 2},
        ]
        assert shape_attendance_series(rows)[0]["rate"] == 0.6

    def test_week_with_only_excused_has_null_rate_not_zero(self):
        # A holiday week must break the line, not plunge it to 0% and invent a
        # collapse in attendance that never happened.
        rows = [{"week": date(2025, 1, 6), "status": "E", "n": 4}]
        assert shape_attendance_series(rows)[0]["rate"] is None

    def test_missing_weeks_are_emitted_not_skipped(self):
        # Found by smoke-testing against the real database: live data had a
        # three-week term break, and skipping those weeks drew one straight
        # line across it — reading as unbroken attendance through weeks the
        # school was closed.
        rows = [
            {"week": date(2025, 1, 6), "status": "P", "n": 10},
            {"week": date(2025, 2, 3), "status": "P", "n": 10},
        ]
        weeks = [r["week"] for r in shape_attendance_series(rows)]
        assert weeks == ["2025-01-06", "2025-01-13", "2025-01-20",
                         "2025-01-27", "2025-02-03"]

    def test_gap_weeks_carry_null_rate_rather_than_zero(self):
        # 0 would claim every student was absent that week; None breaks the
        # line, which is the honest rendering of "no data".
        rows = [
            {"week": date(2025, 1, 6), "status": "P", "n": 10},
            {"week": date(2025, 1, 20), "status": "P", "n": 10},
        ]
        gap = shape_attendance_series(rows)[1]
        assert gap["week"] == "2025-01-13"
        assert gap["rate"] is None
        assert gap["total"] == 0

    def test_statuses_accumulate_within_a_week(self):
        rows = [
            {"week": date(2025, 1, 6), "status": "P", "n": 3},
            {"week": date(2025, 1, 6), "status": "P", "n": 4},
        ]
        assert shape_attendance_series(rows)[0]["present"] == 7

    def test_empty_input_is_an_empty_series(self):
        assert shape_attendance_series([]) == []


# ── roles ───────────────────────────────────────────────────────────────────
class TestDashboardRoles:
    perm = HasRole()
    view = DashboardSummaryView()

    def _allows(self, role):
        request = factory.get("/api/dashboard/summary/")
        request.user = _user(role)
        return self.perm.has_permission(request, self.view)

    def test_staff_roles_allowed(self):
        for role in ("super_admin", "admin", "registrar", "accounting"):
            assert self._allows(role) is True

    def test_teacher_allowed(self):
        # Scoped to their own roster inside the view, but allowed through.
        assert self._allows("teacher") is True

    def test_guardian_denied(self):
        # Guardians have their own portal; this is the staff landing page.
        assert self._allows("guardian") is False

    def test_unauthenticated_denied(self):
        request = factory.get("/api/dashboard/summary/")
        request.user = SimpleNamespace(is_authenticated=False)
        assert self.perm.has_permission(request, self.view) is False

    def test_required_roles_is_set_explicitly(self):
        # The service's DRF default is HasRole with no roles, which returns
        # True for any authenticated user. An endpoint that omits this
        # attribute is readable by every logged-in account — this test is the
        # guard against that regression.
        assert DashboardSummaryView.required_roles == DASHBOARD_ROLES
        assert "guardian" not in DashboardSummaryView.required_roles


# ── weeks parameter ─────────────────────────────────────────────────────────
class TestWeeksParam:
    def _weeks(self, raw):
        # APIRequestFactory yields a plain WSGIRequest; `query_params` lives on
        # DRF's Request wrapper, which APIView.dispatch() applies in production.
        # Wrapping here tests the view against the request object it actually
        # receives at runtime.
        wsgi = factory.get("/api/dashboard/summary/", {"weeks": raw} if raw is not None else {})
        return DashboardSummaryView._weeks(Request(wsgi))

    def test_defaults_when_absent(self):
        assert self._weeks(None) == DEFAULT_WEEKS

    def test_clamped_to_max(self):
        assert self._weeks(9999) == MAX_WEEKS

    def test_clamped_to_at_least_one(self):
        assert self._weeks(0) == 1
        assert self._weeks(-5) == 1

    def test_garbage_falls_back_to_default_rather_than_400(self):
        # One bad optional query param should narrow the chart, not fail the
        # whole dashboard.
        assert self._weeks("abc") == DEFAULT_WEEKS

    def test_valid_value_passes_through(self):
        assert self._weeks(6) == 6
