from decimal import Decimal, ROUND_HALF_UP

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.exceptions import NotFound
from django.utils import timezone

from accounts.permissions import GRADE_READ_ROLES, HasRole, guardian_student_ids, teacher_student_ids
from .models import Enrollment
from grades.models import Grade
from grading.deped import general_average, summarize_subjects
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

    # Per-subject average and year outcome, computed over EVERY period the
    # learner has a grade in -- base_qs, not the filtered grades_qs.
    #
    # The `?grading_period=` filter narrows which columns are PRINTED. It used
    # to narrow this too, so opening the card on the 1st quarter reported a
    # subject's year average and its Passed/Failed from that one quarter, under
    # a heading that claims to be the year. A learner who failed Q1 and
    # recovered read as Failed for the year on their own report card.
    outcomes = summarize_subjects(base_qs)
    for sid, entry in subject_map.items():
        outcome = outcomes.get(sid)
        entry["average"] = _round2(outcome["average"]) if outcome else None
        entry["overall_remarks"] = outcome["remarks"] if outcome else None

    subjects_list = sorted(subject_map.values(), key=lambda s: s["subject_name"])

    # DO 8 General Average: the mean of the learner's final grades across
    # learning areas, as a whole number. Named for what DepEd calls it --
    # this was "overall_gpa", a term DO 8 does not use and which invites the
    # weighted reading that grading.deped.general_average explicitly rejects.
    general_avg = general_average([s["average"] for s in subjects_list])

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
        "general_average": general_avg,
        # Kept so an older frontend build still renders a figure; the number
        # is the same one, and `general_average` is the name to read.
        "overall_gpa":  general_avg,
        "generated_at": timezone.now().isoformat(),
    })


# Staff who may read report cards, plus guardians (scoped to their own child
# by the ownership check inside the view above).
report_card.cls.required_roles = GRADE_READ_ROLES | {"guardian"}
