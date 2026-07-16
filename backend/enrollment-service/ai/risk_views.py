"""
At-Risk Student Prediction (persisted rule-based risk scoring)
================================================================
POST /api/ai/risk-assessment/run/
    body: {
      "school_year": "2024-2025",        (required)
      "grading_period": "1st_quarter",   (required, or "overall")
      "school_level": "Junior High",     (optional)
      "grade_level": "7",                (optional)
      "weights": {"grade": 0.5, "attendance": 0.3, "narrative": 0.2}  (optional)
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
"""

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasRole
from enrollments.models import Student

from .models import RiskAssessmentRun, StudentRiskScore
from .services import (
    DEFAULT_WEIGHTS,
    RISK_LEVEL_THRESHOLDS,
    build_student_features,
    score_students,
)

RISK_ROLES = {"super_admin", "admin", "registrar"}


def _student_name(student):
    return f"{student.last_name}, {student.first_name}" + (
        f" {student.middle_name[0]}." if student.middle_name else ""
    )


def _serialize_run(run, scores=None):
    """
    Serializes a RiskAssessmentRun with its per-student scores, enriching
    each score with the student's current name/number via the Student
    mirror model. Names are looked up at read time (not stored on the
    score row) so a later name correction doesn't require rewriting history.
    """
    if scores is None:
        scores = list(run.scores.all())  # Meta.ordering = ["-risk_score"]

    students = Student.objects.filter(student_id__in=[s.student_id for s in scores])
    student_map = {s.student_id: s for s in students}

    score_list = []
    for sc in scores:
        student = student_map.get(sc.student_id)
        score_list.append({
            "student_id":           sc.student_id,
            "enrollment_id":        sc.enrollment_id,
            "student_name":         _student_name(student) if student else None,
            "student_number":       student.student_number if student else None,
            "grade_component":      sc.grade_component,
            "attendance_component": sc.attendance_component,
            "narrative_component":  sc.narrative_component,
            "risk_score":           sc.risk_score,
            "risk_level":           sc.risk_level,
        })

    return {
        "run_id":         run.run_id,
        "school_year":    run.school_year,
        "grading_period": run.grading_period,
        "school_level":   run.school_level,
        "grade_level":    run.grade_level,
        "weights":        run.weights_json,
        "created_at":     run.created_at,
        "student_count":  len(score_list),
        "scores":         score_list,
    }


class RiskAssessmentRunView(APIView):
    """
    POST /api/ai/risk-assessment/run/

    Computes a rule-based risk score for every enrolled student with grade
    data matching the filters, and persists the result as one
    RiskAssessmentRun + one StudentRiskScore per student.
    """

    permission_classes = [HasRole]
    required_roles     = RISK_ROLES

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
                               "grade/attendance/narrative keys summing above 0."},
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

        with transaction.atomic():
            run = RiskAssessmentRun.objects.create(
                school_year=school_year,
                grading_period=grading_period,
                school_level=school_level,
                grade_level=grade_level,
                weights_json={
                    "weights": weights,
                    "thresholds": {level: cutoff for cutoff, level in RISK_LEVEL_THRESHOLDS},
                },
                triggered_by=triggered_by,
            )
            StudentRiskScore.objects.bulk_create([
                StudentRiskScore(
                    run=run,
                    student_id=sid,
                    enrollment_id=student_data[sid]["enrollment_id"],
                    grade_component=scored[sid]["grade_component"],
                    attendance_component=scored[sid]["attendance_component"],
                    narrative_component=scored[sid]["narrative_component"],
                    risk_score=scored[sid]["risk_score"],
                    risk_level=scored[sid]["risk_level"],
                )
                for sid in scored
            ])

        return Response(_serialize_run(run), status=status.HTTP_201_CREATED)


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

        return Response(_serialize_run(run))


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
                "narrative_component":  sc.narrative_component,
            }
            for sc in scores
        ]

        student = Student.objects.filter(student_id=student_id).first()

        return Response({
            "student_id":     int(student_id),
            "student_name":   _student_name(student) if student else None,
            "student_number": student.student_number if student else None,
            "points":         points,
        })
