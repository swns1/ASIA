from decimal import Decimal, ROUND_HALF_UP

from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.exceptions import NotFound

from .models import Enrollment
from grades.models import Grade
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


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def report_card(request, enrollment_id):
    try:
        enrollment = Enrollment.objects.select_related("student").get(pk=enrollment_id)
    except Enrollment.DoesNotExist:
        raise NotFound("Enrollment not found.")

    student = enrollment.student

    # Fetch all grades for this enrollment with subject info
    grades_qs = (
        Grade.objects
        .filter(enrollment_id=enrollment_id)
        .select_related("subject")
        .order_by("subject__subject_name", "grading_period")
    )

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

        # Derive overall subject remarks from average
        avg = entry["average"]
        if avg is None:
            entry["overall_remarks"] = None
        elif avg >= 75:
            entry["overall_remarks"] = "passed"
        else:
            entry["overall_remarks"] = "failed"

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
        "subjects":     subjects_list,
        "overall_gpa":  overall_gpa,
        "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    })
