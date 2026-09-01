"""
At-Risk Student Prediction (persisted rule-based risk scoring)
================================================================
POST /api/ai/risk-assessment/run/
    body: {
      "school_year": "2024-2025",        (required)
      "grading_period": "1st_quarter",   (required, or "overall")
      "school_level": "Junior High",     (optional)
      "grade_level": "7",                (optional)
      "weights": {"grade": 0.4, "attendance": 0.3, "trend": 0.15, "narrative": 0.15}  (optional)
    }
GET /api/ai/risk-assessment/latest/
    ?school_year=2024-2025&grading_period=1st_quarter&school_level=...&grade_level=...   (all optional filters)
GET /api/ai/risk-assessment/trend/?student_id=123

Unlike the K-Means clustering in ai/analytics_views.py — recomputed and
discarded on every request — a "run" here is persisted (RiskAssessmentRun +
one StudentRiskScore per student) so risk can be tracked over time and the
weights/thresholds used stay inspectable per run instead of silently
hardcoded.

Deliberately a weighted rule-based composite, not a trained classifier:
Enrollment.enrollment_status doesn't yet carry enough historical
dropped/withdrawn outcomes to train and validate a model against, and a
transparent formula stays explainable to a teacher ("flagged because grade
and attendance are both low") in a way a classifier wouldn't be at this
school's scale. StudentRiskScore.enrollment_id is kept specifically so a
future retrospective model could be trained off this history once real
outcome data exists — see ai/services.py.

Teachers are included in RISK_ROLES but see only their own advisory roster
(see `_visible_student_ids`) — the early-warning list is only useful to an
adviser if they can actually see their own class in it, and the existing
`teacher_student_ids()` scoping makes that safe.
"""

import math
from collections import Counter, defaultdict

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasRole, teacher_student_ids
from enrollments.models import Enrollment, Student

from .models import RiskAssessmentRun, StudentRiskScore
from .services import (
    DEFAULT_WEIGHTS,
    RISK_LEVEL_THRESHOLDS,
    build_student_features,
    score_students,
)

RISK_ROLES = {"super_admin", "admin", "registrar", "teacher"}

# Roles that may trigger a new run. A teacher can read the school's latest
# assessment scoped to their own section, but recomputing (and persisting) a
# school-wide run stays a staff action.
RUN_ROLES = {"super_admin", "admin", "registrar"}


def _finite(value):
    """
    build_student_features() uses np.nan for "no data". NaN is not valid JSON
    and must never reach a FloatField, so it is normalized to None on the way
    into the database.
    """
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(value) or math.isinf(value) else value


def _student_name(student):
    return f"{student.last_name}, {student.first_name}" + (
        f" {student.middle_name[0]}." if student.middle_name else ""
    )


def _visible_student_ids(request):
    """
    None = no restriction (staff see every student in the run). A teacher
    gets the set of student_ids on their own SectionAdvisory roster, reusing
    the same helper that scopes grades and attendance — so a teacher can
    never read a risk score for a student outside their section.
    """
    if getattr(request.user, "role", None) == "teacher":
        return teacher_student_ids(request.user)
    return None


def _summarize(score_list):
    """
    School-level rollups computed once here so the dashboard charts need no
    second round trip: counts per risk band, per grade level, per section,
    and how often each reason code fires. Ordered most-affected first, since
    that's the order the charts read in.
    """
    by_level = Counter()
    by_grade = defaultdict(Counter)
    by_section = defaultdict(Counter)
    reasons = Counter()
    flagged_levels = {"high", "critical"}

    for row in score_list:
        level = row["risk_level"]
        by_level[level] += 1
        by_grade[row.get("grade_level") or "Unassigned"][level] += 1
        by_section[row.get("section") or "Unassigned"][level] += 1
        # One student contributes at most once per reason code, so the bar
        # chart counts students-affected rather than sentences-emitted.
        for code in {r["code"] for r in row.get("reasons") or []}:
            reasons[code] += 1

    def _group(counter_map):
        rows = [
            {
                "name": name,
                "total": sum(levels.values()),
                "flagged": sum(v for k, v in levels.items() if k in flagged_levels),
                "by_level": dict(levels),
            }
            for name, levels in counter_map.items()
        ]
        rows.sort(key=lambda r: (-r["flagged"], -r["total"], r["name"]))
        return rows

    return {
        "by_level": {level: by_level.get(level, 0)
                     for _cutoff, level in RISK_LEVEL_THRESHOLDS},
        "by_grade_level": _group(by_grade),
        "by_section": _group(by_section),
        "by_reason": [
            {"code": code, "count": count}
            for code, count in reasons.most_common()
        ],
        "flagged_count": sum(by_level.get(lv, 0) for lv in flagged_levels),
    }


def _serialize_run(run, scores=None, allowed_student_ids=None):
    """
    Serializes a RiskAssessmentRun with its per-student scores, enriching
    each score with the student's current name/number and their grade
    level/section. Both are looked up at read time (not stored on the score
    row) so a later name correction or section transfer doesn't require
    rewriting history.

    allowed_student_ids, when not None, restricts the rows to that set — how
    a teacher sees only their own advisory roster.
    """
    if scores is None:
        scores = list(run.scores.all())  # Meta.ordering = ["-risk_score"]

    if allowed_student_ids is not None:
        scores = [s for s in scores if s.student_id in allowed_student_ids]

    students = Student.objects.filter(student_id__in=[s.student_id for s in scores])
    student_map = {s.student_id: s for s in students}

    enrollments = Enrollment.objects.filter(
        enrollment_id__in=[s.enrollment_id for s in scores]
    ).only("enrollment_id", "grade_level", "section")
    enrollment_map = {e.enrollment_id: e for e in enrollments}

    score_list = []
    for sc in scores:
        student = student_map.get(sc.student_id)
        enrollment = enrollment_map.get(sc.enrollment_id)
        score_list.append({
            "student_id":           sc.student_id,
            "enrollment_id":        sc.enrollment_id,
            "student_name":         _student_name(student) if student else None,
            "student_number":       student.student_number if student else None,
            "grade_level":          enrollment.grade_level if enrollment else None,
            "section":              enrollment.section if enrollment else None,
            "grade_component":      sc.grade_component,
            "attendance_component": sc.attendance_component,
            "trend_component":      sc.trend_component,
            "narrative_component":  sc.narrative_component,
            "risk_score":           sc.risk_score,
            "risk_level":           sc.risk_level,
            "reasons":              sc.reasons_json or [],
            "signals_present":      sc.signals_present,
            # The raw figures a teacher reads, not the risk contributions —
            # see StudentRiskScore for why these can't be reconstructed.
            "average_grade":         sc.average_grade,
            "attendance_rate":       sc.attendance_rate,
            "grade_delta":           sc.grade_delta,
            "failing_subject_count": sc.failing_subject_count,
        })

    return {
        "run_id":         run.run_id,
        "school_year":    run.school_year,
        "grading_period": run.grading_period,
        "school_level":   run.school_level,
        "grade_level":    run.grade_level,
        "weights":        run.weights_json,
        "created_at":     run.created_at,
        "updated_at":     run.updated_at,
        "student_count":  len(score_list),
        "scores":         score_list,
        "summary":        _summarize(score_list),
    }


class RiskAssessmentRunView(APIView):
    """
    POST /api/ai/risk-assessment/run/

    Computes a rule-based risk score for every enrolled student with grade
    data matching the filters, and persists the result as one
    RiskAssessmentRun + one StudentRiskScore per student.

    Re-running the same filters on the same day updates that day's run in
    place instead of inserting a duplicate — otherwise clicking the button
    three times puts three identical points on every student's trend chart,
    which is the one thing the persisted history exists to show.
    """

    permission_classes = [HasRole]
    required_roles     = RUN_ROLES

    def post(self, request):
        school_year    = request.data.get("school_year")
        grading_period = request.data.get("grading_period")
        school_level   = request.data.get("school_level") or None
        grade_level    = request.data.get("grade_level") or None
        weights_input  = request.data.get("weights")

        if not school_year:
            return Response({"detail": "school_year is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not grading_period:
            return Response({"detail": "grading_period is required."}, status=status.HTTP_400_BAD_REQUEST)

        weights = DEFAULT_WEIGHTS
        if weights_input is not None:
            valid = (
                isinstance(weights_input, dict)
                and set(weights_input.keys()) == set(DEFAULT_WEIGHTS.keys())
                and all(isinstance(v, (int, float)) and v >= 0 for v in weights_input.values())
                and sum(weights_input.values()) > 0
            )
            if not valid:
                return Response(
                    {"detail": "weights must be an object with numeric, non-negative "
                               "grade/attendance/trend/narrative keys summing above 0."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            weights = weights_input

        student_data, _subject_name = build_student_features(
            school_year, grading_period, None, school_level, grade_level,
        )

        if not student_data:
            return Response(
                {"detail": "No enrolled students with grade data found for the given filters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        scored = score_students(student_data, weights=weights)
        triggered_by = getattr(request.user, "user_id", None) or getattr(request.user, "pk", None)
        weights_json = {
            "weights": weights,
            "thresholds": {level: cutoff for cutoff, level in RISK_LEVEL_THRESHOLDS},
        }

        with transaction.atomic():
            run = (
                RiskAssessmentRun.objects
                .select_for_update()
                .filter(
                    school_year=school_year,
                    grading_period=grading_period,
                    school_level=school_level,
                    grade_level=grade_level,
                    created_at__date=timezone.localdate(),
                )
                .first()
            )
            if run:
                run.weights_json = weights_json
                run.triggered_by = triggered_by
                run.save(update_fields=["weights_json", "triggered_by", "updated_at"])
                run.scores.all().delete()
            else:
                run = RiskAssessmentRun.objects.create(
                    school_year=school_year,
                    grading_period=grading_period,
                    school_level=school_level,
                    grade_level=grade_level,
                    weights_json=weights_json,
                    triggered_by=triggered_by,
                )

            StudentRiskScore.objects.bulk_create([
                StudentRiskScore(
                    run=run,
                    student_id=sid,
                    enrollment_id=student_data[sid]["enrollment_id"],
                    grade_component=scored[sid]["grade_component"],
                    attendance_component=scored[sid]["attendance_component"],
                    trend_component=scored[sid]["trend_component"],
                    narrative_component=scored[sid]["narrative_component"],
                    risk_score=scored[sid]["risk_score"],
                    risk_level=scored[sid]["risk_level"],
                    reasons_json=scored[sid]["reasons"],
                    signals_present=scored[sid]["signals_present"],
                    average_grade=_finite(student_data[sid].get("grade")),
                    attendance_rate=_finite(student_data[sid].get("attendance_rate")),
                    grade_delta=_finite(student_data[sid].get("grade_delta")),
                    failing_subject_count=len(student_data[sid].get("failing_subjects") or []),
                )
                for sid in scored
            ])

        run.refresh_from_db()
        return Response(
            _serialize_run(run, allowed_student_ids=_visible_student_ids(request)),
            status=status.HTTP_201_CREATED,
        )


class RiskAssessmentLatestView(APIView):
    """
    GET /api/ai/risk-assessment/latest/

    Returns the most recent RiskAssessmentRun (optionally narrowed by
    school_year/grading_period/school_level/grade_level) with its
    per-student scores. Read-only — does not recompute anything.
    """

    permission_classes = [HasRole]
    required_roles     = RISK_ROLES

    def get(self, request):
        runs = RiskAssessmentRun.objects.all()

        school_year    = request.query_params.get("school_year")
        grading_period = request.query_params.get("grading_period")
        school_level   = request.query_params.get("school_level")
        grade_level    = request.query_params.get("grade_level")

        if school_year:
            runs = runs.filter(school_year=school_year)
        if grading_period:
            runs = runs.filter(grading_period=grading_period)
        if school_level:
            runs = runs.filter(school_level=school_level)
        if grade_level:
            runs = runs.filter(grade_level=grade_level)

        run = runs.first()  # Meta.ordering = ["-created_at"]
        if not run:
            return Response({"detail": "No risk assessment runs found."}, status=status.HTTP_404_NOT_FOUND)

        return Response(_serialize_run(run, allowed_student_ids=_visible_student_ids(request)))


class RiskAssessmentTrendView(APIView):
    """
    GET /api/ai/risk-assessment/trend/?student_id=123

    A single student's risk_score across every historical run, ordered
    oldest → newest, so the frontend can plot risk over time.
    """

    permission_classes = [HasRole]
    required_roles     = RISK_ROLES

    def get(self, request):
        student_id = request.query_params.get("student_id")
        if not student_id:
            return Response({"detail": "student_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            student_id = int(student_id)
        except (TypeError, ValueError):
            return Response({"detail": "student_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        # Same advisory scoping as the list views — a teacher must not be
        # able to pull an arbitrary student's history by guessing an id.
        allowed = _visible_student_ids(request)
        if allowed is not None and student_id not in allowed:
            return Response(
                {"detail": "You do not have access to this student."},
                status=status.HTTP_403_FORBIDDEN,
            )

        scores = (
            StudentRiskScore.objects
            .filter(student_id=student_id)
            .select_related("run")
            .order_by("run__created_at")
        )

        points = [
            {
                "run_id":               sc.run.run_id,
                "created_at":           sc.run.created_at,
                "school_year":          sc.run.school_year,
                "grading_period":       sc.run.grading_period,
                "risk_score":           sc.risk_score,
                "risk_level":           sc.risk_level,
                "grade_component":      sc.grade_component,
                "attendance_component": sc.attendance_component,
                "trend_component":      sc.trend_component,
                "narrative_component":  sc.narrative_component,
                "reasons":              sc.reasons_json or [],
            }
            for sc in scores
        ]

        student = Student.objects.filter(student_id=student_id).first()

        return Response({
            "student_id":     student_id,
            "student_name":   _student_name(student) if student else None,
            "student_number": student.student_number if student else None,
            "points":         points,
        })
