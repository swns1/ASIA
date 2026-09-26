from decimal import Decimal, ROUND_HALF_UP

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.exceptions import NotFound
from django.utils import timezone

from accounts.permissions import GRADE_READ_ROLES, HasRole, guardian_student_ids, teacher_student_ids
from .models import Enrollment
from .rules import ATTENDED_STATUSES
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


SHS_SEMESTERS = (("1st_semester", "1st Semester", "1st"), ("2nd_semester", "2nd Semester", "2nd"))


def senior_high_year_rows(enrollment):
    """
    The rows that make up a senior high learner's school year: the one asked
    for, plus the other semester's if they attended it.

    Each semester is its own enrollment, so a report card read off one row
    printed half the year -- a Grade 11 learner's 2nd-semester card listed
    three subjects and left the 1st semester's off entirely. DepEd's SF9 for
    senior high reports both semesters.
    """
    others = Enrollment.objects.filter(
        student_id=enrollment.student_id,
        school_year=enrollment.school_year,
        school_level="senior_highschool",
        grade_level=enrollment.grade_level,
        enrollment_status__in=ATTENDED_STATUSES,
    ).exclude(pk=enrollment.pk)
    return sorted([enrollment, *others], key=lambda r: (r.semester or "", r.enrollment_id))


def shs_semester_summary(subjects, year_rows):
    """
    Per semester: the row it was taken on (or None, not yet enrolled) and its
    General Average; and the year's, as the mean of the two semesters'.

    `subjects` are report-card subject entries carrying "semester" (a period
    key) and "average"; `year_rows` anything with .semester, .enrollment_id
    and .enrollment_status. Pure, so it is tested without a database.
    """
    semesters = []
    for key, label, short in SHS_SEMESTERS:
        rows = [r for r in year_rows if r.semester == short]
        row = max(rows, key=lambda r: r.enrollment_id) if rows else None
        semesters.append({
            "key": key,
            "label": label,
            "enrollment_id": row.enrollment_id if row else None,
            "enrollment_status": row.enrollment_status if row else None,
            "general_average": general_average(
                [s["average"] for s in subjects if s.get("semester") == key]
            ),
        })
    year_average = general_average([s["general_average"] for s in semesters])
    return semesters, year_average


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

    # Senior high is enrolled per semester; its card covers the whole year.
    is_shs = enrollment.school_level == "senior_highschool"
    year_rows = senior_high_year_rows(enrollment) if is_shs else [enrollment]

    # Fetch all grades for the year's row(s) with subject info
    base_qs = (
        Grade.objects
        .filter(enrollment_id__in=[r.enrollment_id for r in year_rows])
        .select_related("subject")
        .order_by("subject__subject_name", "grading_period")
    )

    base = list(base_qs)

    # Full set of periods with data, regardless of the filter below — lets the
    # frontend keep offering every period in its selector even while filtered.
    periods_with_data = {g.grading_period for g in base}
    available_periods = [p for p in GRADING_PERIOD_ORDER if p in periods_with_data]

    grading_period = request.query_params.get("grading_period")
    grades_qs = [g for g in base if g.grading_period == grading_period] if grading_period else base

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

    # Determine grading periods to show in column order. A senior high card
    # always shows both semesters, so a 2nd semester not yet graded reads as
    # pending rather than disappearing from the card.
    if is_shs and not grading_period:
        periods_seen |= {key for key, _label, _short in SHS_SEMESTERS}
    ordered_periods = [p for p in GRADING_PERIOD_ORDER if p in periods_seen]

    # Per-subject average and year outcome, computed over EVERY period the
    # learner has a grade in -- base_qs, not the filtered grades_qs.
    #
    # The `?grading_period=` filter narrows which columns are PRINTED. It used
    # to narrow this too, so opening the card on the 1st quarter reported a
    # subject's year average and its Passed/Failed from that one quarter, under
    # a heading that claims to be the year. A learner who failed Q1 and
    # recovered read as Failed for the year on their own report card.
    outcomes = summarize_subjects(base)
    # A senior high learning area is taken in one semester; which one is the
    # period its grade was recorded in.
    semester_of = {g.subject.subject_id: g.grading_period for g in base} if is_shs else {}
    for sid, entry in subject_map.items():
        outcome = outcomes.get(sid)
        entry["average"] = _round2(outcome["average"]) if outcome else None
        entry["overall_remarks"] = outcome["remarks"] if outcome else None
        if is_shs:
            entry["semester"] = semester_of.get(sid)

    subjects_list = sorted(
        subject_map.values(),
        key=lambda s: (s.get("semester") or "", s["subject_name"]),
    )

    # DO 8 General Average: the mean of the learner's final grades across
    # learning areas, as a whole number. Named for what DepEd calls it --
    # this was "overall_gpa", a term DO 8 does not use and which invites the
    # weighted reading that grading.deped.general_average explicitly rejects.
    #
    # Senior high reports it per semester; the year's figure is the mean of the
    # two, over every subject of the year whatever the period filter shows.
    semesters = None
    if is_shs:
        year_subjects = [
            {"semester": semester_of.get(sid), "average": _round2(o["average"])}
            for sid, o in outcomes.items()
        ]
        semesters, general_avg = shs_semester_summary(year_subjects, year_rows)
    else:
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
        # Senior high only: [{key, label, enrollment_id, enrollment_status,
        # general_average}] per semester; null for every other level.
        "semesters":    semesters,
        "general_average": general_avg,
        # Kept so an older frontend build still renders a figure; the number
        # is the same one, and `general_average` is the name to read.
        "overall_gpa":  general_avg,
        "generated_at": timezone.now().isoformat(),
    })


# Staff who may read report cards, plus guardians (scoped to their own child
# by the ownership check inside the view above).
report_card.cls.required_roles = GRADE_READ_ROLES | {"guardian"}
