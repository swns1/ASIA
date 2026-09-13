from decimal import Decimal, ROUND_HALF_UP

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.exceptions import NotFound

from accounts.permissions import GRADE_READ_ROLES, HasRole, guardian_student_ids, teacher_student_ids
from .models import Enrollment
from grades.models import Grade
from grading.deped import PASSING_GRADE
from subjects.models import Subject


GRADING_PERIOD_ORDER = [
    "1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter",
    "1st_semester", "2nd_semester",
]

GRADING_PERIOD_LABELS = {
    "1st_quarter":  "1st Quarter",
    "2nd_quarter":  "2nd Quarter",
    "3rd_quarter":  "3rd Quarter",
    "4th_quarter":  "4th Quarter",
    "1st_semester": "1st Semester",
    "2nd_semester": "2nd Semester",
}


def _round2(value):
    if value is None:
        return None
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _subject_remarks(recorded, average):
    """
    The Remarks a subject shows on its report card row.

    A remark a teacher actually recorded outranks one derived from the
    average. Grade.remarks carries "incomplete" and "dropped" as well as
    pass/fail, and a teacher sets those two by hand (see GradesPage's
    REMARKS_META) precisely because a numeric score cannot express them — a
    subject dropped mid-quarter can still average 88. Deriving this column
    from the average alone, as this used to, reported every such subject as
    "passed" and left the report card no way to show INC or Dropped at all,
    even though each period's recorded remark was already being serialized
    right beside its grade.

    "dropped" outranks "incomplete": dropping is terminal, whereas an
    incomplete is a subject still awaiting its final mark.

    A recorded "passed"/"failed" is deliberately *not* preferred over the
    average. Those are per-period marks, and the figure printed next to this
    column is the average across every period — a subject passed in one
    quarter can still fail on the year, and the row has to agree with the
    number beside it.

    `recorded` is the set of remarks across that subject's periods; `average`
    is its mean numeric grade, or None when no period carries one.
    """
    if "dropped" in recorded:
        return "dropped"
    if "incomplete" in recorded:
        return "incomplete"
    if average is None:
        return None
    return "passed" if average >= PASSING_GRADE else "failed"


@api_view(["GET"])
@permission_classes([HasRole])
def report_card(request, enrollment_id):
    try:
        enrollment = Enrollment.objects.select_related("student").get(pk=enrollment_id)
    except Enrollment.DoesNotExist:
        raise NotFound("Enrollment not found.")

    role = getattr(request.user, "role", None)
    if role in ("teacher", "guardian"):
        allowed = teacher_student_ids(request.user) if role == "teacher" else guardian_student_ids(request.user)
        if enrollment.student_id not in allowed:
            return Response(
                {"detail": "You do not have access to this record."},
                status=403,
            )

    student = enrollment.student

    # Fetch all grades for this enrollment with subject info
    base_qs = (
        Grade.objects
        .filter(enrollment_id=enrollment_id)
        .select_related("subject")
        .order_by("subject__subject_name", "grading_period")
    )

    # Full set of periods with data, regardless of the filter below — lets the
    # frontend keep offering every period in its selector even while filtered.
    periods_with_data = set(base_qs.values_list("grading_period", flat=True))
    available_periods = [p for p in GRADING_PERIOD_ORDER if p in periods_with_data]

    grading_period = request.query_params.get("grading_period")
    grades_qs = base_qs.filter(grading_period=grading_period) if grading_period else base_qs

    # Build subject → period → grade map
    subject_map = {}
    periods_seen = set()

    for g in grades_qs:
        subj = g.subject
        sid = subj.subject_id
        periods_seen.add(g.grading_period)

        if sid not in subject_map:
            subject_map[sid] = {
                "subject_id":   sid,
                "subject_code": subj.subject_code,
                "subject_name": subj.subject_name,
                "grades":       {},
            }
        subject_map[sid]["grades"][g.grading_period] = {
            "numeric_grade": _round2(g.numeric_grade),
            "remarks":       g.remarks,
        }

    # Determine grading periods to show in column order
    ordered_periods = [p for p in GRADING_PERIOD_ORDER if p in periods_seen]

    # Compute per-subject average across the periods that have grades
    for entry in subject_map.values():
        values = [v["numeric_grade"] for v in entry["grades"].values() if v["numeric_grade"] is not None]
        entry["average"] = _round2(sum(values) / len(values)) if values else None

        # See _subject_remarks: a teacher's recorded INC/Dropped wins over the
        # pass/fail this would otherwise derive from the average alone.
        entry["overall_remarks"] = _subject_remarks(
            {v["remarks"] for v in entry["grades"].values() if v["remarks"]},
            entry["average"],
        )

    subjects_list = sorted(subject_map.values(), key=lambda s: s["subject_name"])

    # Overall GPA
    averages = [s["average"] for s in subjects_list if s["average"] is not None]
    overall_gpa = _round2(sum(averages) / len(averages)) if averages else None

    return Response({
        "enrollment": {
            "enrollment_id":     enrollment.enrollment_id,
            "school_year":       enrollment.school_year,
            "school_level":      enrollment.school_level,
            "grade_level":       enrollment.grade_level,
            "section":           enrollment.section,
            "strand":            enrollment.strand,
            "semester":          enrollment.semester,
            "enrollment_status": enrollment.enrollment_status,
        },
        "student": {
            "student_id":     student.student_id,
            "student_number": student.student_number,
            "lrn":            student.lrn,
            "first_name":     student.first_name,
            "middle_name":    student.middle_name,
            "last_name":      student.last_name,
            "suffix":         student.suffix,
            "sex":            student.sex,
            "birth_date":     str(student.birth_date) if student.birth_date else None,
        },
        "grading_periods": [
            {"key": p, "label": GRADING_PERIOD_LABELS[p]} for p in ordered_periods
        ],
        "available_periods": [
            {"key": p, "label": GRADING_PERIOD_LABELS[p]} for p in available_periods
        ],
        "subjects":     subjects_list,
        "overall_gpa":  overall_gpa,
        "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    })


# Staff who may read report cards, plus guardians (scoped to their own child
# by the ownership check inside the view above).
report_card.cls.required_roles = GRADE_READ_ROLES | {"guardian"}
