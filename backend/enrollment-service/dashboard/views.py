"""
One aggregate endpoint behind the staff dashboard.

GET /api/dashboard/summary/?school_year=2024-2025&weeks=12

Replaces the ~11 requests the dashboard previously made to assemble scalar
counts: it read `.count` off eleven paginated list responses fetched with
`page_size=1` (five of them just to break enrolment down by school level).
That pattern transfers a page of rows to read one integer, and it cannot
produce a trend at all — nothing in the API returned data grouped by period,
which is why the dashboard had no charts.

Everything here is aggregated in SQL (`values().annotate()`), so the row count
never reaches Python.

Role model:
  * super_admin / admin / registrar / accounting — whole school.
  * teacher — scoped to their own SectionAdvisory roster via the same
    `teacher_student_ids()` helper that scopes grades, attendance and risk, so
    a teacher's dashboard describes their own class rather than the school.
  * guardian — denied. Guardians have their own portal; this is the staff
    landing page.

`required_roles` is set explicitly and deliberately, for clarity even though
`HasRole` (shared/permissions.py) now fails closed if it's omitted — it used
to return True for any authenticated user when a view forgot this line,
guardians included, which is why every `HasRole` view in this codebase sets
it explicitly rather than relying on the (now safe) default.
"""
from datetime import timedelta

from django.db.models import Count
from django.db.models.functions import TruncWeek
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasRole, teacher_student_ids
from ai.models import RiskAssessmentRun, StudentRiskScore
from attendance.models import AttendanceRecord
from enrollments.models import Enrollment

from .services import (
    shape_attendance_series,
    shape_level_distribution,
    shape_pipeline,
    shape_risk_bands,
)

DASHBOARD_ROLES = {"super_admin", "admin", "registrar", "teacher", "accounting"}

# How much attendance history the chart shows by default. Twelve weeks is
# roughly one grading period — long enough for a trend to have a shape, short
# enough that the series stays readable and the response stays small.
DEFAULT_WEEKS = 12
MAX_WEEKS = 52


class DashboardSummaryView(APIView):
    permission_classes = [HasRole]
    required_roles     = DASHBOARD_ROLES

    def get(self, request):
        school_year = request.query_params.get("school_year") or None
        weeks = self._weeks(request)

        # None = no restriction. A teacher gets their advisory roster; an empty
        # set (teacher with no advisory yet) correctly yields zeroes rather
        # than the whole school — teacher_student_ids() fails closed.
        student_ids = (
            teacher_student_ids(request.user)
            if getattr(request.user, "role", None) == "teacher"
            else None
        )

        return Response({
            "school_year":        school_year or "all",
            "weeks":              weeks,
            "pipeline":           self._pipeline(school_year, student_ids),
            "level_distribution": self._levels(school_year, student_ids),
            "attendance_series":  self._attendance(school_year, student_ids, weeks),
            "risk":               self._risk(school_year, student_ids),
        })

    # ── helpers ────────────────────────────────────────────────────────────
    @staticmethod
    def _weeks(request):
        """Clamped rather than validated — a bad `weeks` value should narrow
        the chart, not 400 a whole dashboard over one optional parameter."""
        try:
            weeks = int(request.query_params.get("weeks", DEFAULT_WEEKS))
        except (TypeError, ValueError):
            return DEFAULT_WEEKS
        return max(1, min(weeks, MAX_WEEKS))

    @staticmethod
    def _scoped(qs, school_year, student_ids, prefix=""):
        """
        Apply the school-year and teacher-roster filters.

        `prefix` is the path from this model to Enrollment — "" when the
        queryset is Enrollment itself, "enrollment__" when it hangs off one
        (AttendanceRecord). Passing the path in beats branching on the model
        inside here, which is how this got subtly wrong the first time.
        """
        if school_year:
            qs = qs.filter(**{f"{prefix}school_year": school_year})
        if student_ids is not None:
            qs = qs.filter(**{f"{prefix}student_id__in": student_ids})
        return qs

    def _pipeline(self, school_year, student_ids):
        qs = self._scoped(Enrollment.objects.all(), school_year, student_ids)
        rows = qs.values("enrollment_status").annotate(n=Count("enrollment_id"))
        return shape_pipeline(rows)

    def _levels(self, school_year, student_ids):
        # Distribution describes who is actually in school right now, so it
        # counts enrolled students only — including pending applications would
        # overstate every bar by the size of the unprocessed queue.
        qs = self._scoped(
            Enrollment.objects.filter(enrollment_status="enrolled"),
            school_year, student_ids,
        )
        rows = qs.values("school_level").annotate(n=Count("enrollment_id"))
        return shape_level_distribution(rows)

    def _attendance(self, school_year, student_ids, weeks):
        since = timezone.now().date() - timedelta(weeks=weeks)
        qs = AttendanceRecord.objects.filter(date__gte=since)
        qs = self._scoped(qs, school_year, student_ids, prefix="enrollment__")
        rows = (
            qs.annotate(week=TruncWeek("date"))
              .values("week", "status")
              .annotate(n=Count("attendance_id"))
        )
        return shape_attendance_series(rows)

    def _risk(self, school_year, student_ids):
        """
        Counts per band off the most recent run, aggregated in SQL.

        Deliberately not a call to /api/ai/risk-assessment/latest/: that
        endpoint serializes every student's score with their reasons_json to
        produce the same rollup, which is the right shape for the Analytics
        page but far too heavy for a landing page that loads on every sign-in.
        """
        runs = RiskAssessmentRun.objects.all()
        if school_year:
            runs = runs.filter(school_year=school_year)
        run = runs.first()  # Meta.ordering = ["-created_at"]
        if not run:
            return {"run_id": None, "computed_at": None,
                    **shape_risk_bands([])}

        scores = StudentRiskScore.objects.filter(run=run)
        if student_ids is not None:
            scores = scores.filter(student_id__in=student_ids)
        rows = scores.values("risk_level").annotate(n=Count("score_id"))
        return {
            "run_id":      run.run_id,
            "computed_at": run.updated_at,
            **shape_risk_bands(rows),
        }
