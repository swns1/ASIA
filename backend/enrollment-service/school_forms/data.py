"""
Reads what each form needs, one query per table, into the records the
builders take. No per-learner queries: a 60-learner SF1 is the same handful
of queries as a 10-learner one.
"""
import logging
from datetime import timedelta

from django.db import DatabaseError
from django.utils import timezone

from accounts.guardian_mirror import GuardianMirror
from accounts.models import User
from academic_calendar.models import CalendarEvent
from attendance.models import AttendanceRecord
from dashboard.teachers_today import NO_CLASS_EVENT_TYPES, expected_subjects
from enrollments.models import Enrollment, EnrollmentTransfer, Section, SectionAdvisory, Student
from enrollments.rules import ATTENDED_STATUSES, GRADE_ORDER, SCHOOL_LEVEL_OF_GRADE
from grades.models import Grade
from shared.school_year import configured_dates
from subjects.models import Subject

from .models import SchoolIdentity
from .records import (
    AttendanceData, IssueDetails, Learner, PermanentRecordData, PriorLevel, RegisterData, School,
    SectionInfo, Signatories, SubjectRecord, Transfer, YearRecord,
)
from .sf2 import month_end
from .sf10 import subject_group, year_result

logger = logging.getLogger(__name__)

QUARTERS = ("1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter")
SATURDAY = 5


class NothingToPrint(Exception):
    """The request names a section or learner with nothing to put on the form."""


# ─── Shared lookups ─────────────────────────────────────────────────────────

# school_settings' columns in the order they arrived. A database that hasn't
# had a script yet still gets its forms, with those boxes blank.
SCHOOL_FIELDS = (
    ("school_name", "school_address", "contact_email", "contact_phone"),
    # scripts/2026-10-school-identity.sql
    ("deped_school_id", "region", "division", "district", "school_head_name"),
    # scripts/2026-10-sf10-school-format.sql
    ("contact_landline", "records_officer_name", "elementary_principal_name", "jhs_principal_name",
     "shs_principal_name", "shs_department_head_name"),
)


def load_school():
    """The school as the form headers name it. Missing fields print blank."""
    rows = []
    for upto in range(len(SCHOOL_FIELDS), 0, -1):
        fields = [f for group in SCHOOL_FIELDS[:upto] for f in group]
        try:
            rows = list(SchoolIdentity.objects.order_by("setting_id").values(*fields)[:1])
            break
        except DatabaseError:
            logger.warning(
                "school_settings lacks columns the school forms print (%s); run the scripts/2026-10-*.sql "
                "upgrades or migrate billing-service", ", ".join(SCHOOL_FIELDS[upto - 1]),
            )
    row = rows[0] if rows else {}

    def text(name):
        return row.get(name) or ""

    return School(
        name=text("school_name"),
        address=text("school_address"),
        school_id=text("deped_school_id"),
        region=text("region"),
        division=text("division"),
        district=text("district"),
        head=text("school_head_name"),
        phone=text("contact_phone"),
        landline=text("contact_landline"),
        email=text("contact_email"),
        signatories=Signatories(
            records_officer=text("records_officer_name"),
            elementary_principal=text("elementary_principal_name"),
            jhs_principal=text("jhs_principal_name"),
            shs_principal=text("shs_principal_name"),
            shs_department_head=text("shs_department_head_name"),
        ),
    )


def _guardians(student_ids):
    """{student_id: {"father", "mother", "guardian", "contact"}}."""
    rows = (
        GuardianMirror.objects.filter(student_id__in=student_ids)
        .order_by("guardian_id")
        .values("student_id", "relationship", "full_name", "mobile_number", "is_primary_contact")
    )
    order = ("father", "mother", "guardian")
    out = {}
    for r in rows:
        g = out.setdefault(r["student_id"], {"father": "", "mother": "", "guardian": "", "numbers": []})
        relationship = (r["relationship"] or "").lower()
        if relationship in order and not g[relationship]:
            g[relationship] = r["full_name"] or ""
        if r["mobile_number"]:
            # The primary contact's number first, then father's, mother's, guardian's.
            rank = (not r["is_primary_contact"], order.index(relationship) if relationship in order else len(order))
            g["numbers"].append((rank, r["mobile_number"]))
    for g in out.values():
        numbers = g.pop("numbers")
        g["contact"] = min(numbers)[1] if numbers else ""
    return out


def _transfers(enrollment_ids):
    """{(enrollment_id, kind): Transfer}, the latest of each kind."""
    rows = (
        EnrollmentTransfer.objects.filter(
            enrollment_id__in=enrollment_ids, transfer_type__in=("transfer_in", "transfer_out"),
        )
        .order_by("effective_date", "transfer_id")
        .values("enrollment_id", "transfer_type", "effective_date", "origin_school_name", "destination_school_name")
    )
    out = {}
    for r in rows:
        school = r["origin_school_name"] if r["transfer_type"] == "transfer_in" else r["destination_school_name"]
        out[(r["enrollment_id"], r["transfer_type"])] = Transfer(
            kind=r["transfer_type"], effective_date=r["effective_date"], school=school or "",
        )
    return out


def _advisers(keys):
    """{(school_year, grade_level, section): "Name, Name"} for the given sections."""
    keys = set(keys)
    if not keys:
        return {}
    rows = SectionAdvisory.objects.filter(
        school_year__in={k[0] for k in keys},
        grade_level__in={k[1] for k in keys},
        section__in={k[2] for k in keys},
    ).values("school_year", "grade_level", "section", "teacher_user_id")
    names = dict(User.objects.filter(
        user_id__in={r["teacher_user_id"] for r in rows},
    ).values_list("user_id", "name"))
    out = {}
    for r in rows:
        key = (r["school_year"], r["grade_level"], r["section"])
        if key in keys and r["teacher_user_id"] in names:
            out.setdefault(key, []).append(names[r["teacher_user_id"]])
    return {key: tuple(sorted(found)) for key, found in out.items()}


def _learner(enrollment, guardians, transfers):
    st = enrollment.student
    g = guardians.get(st.student_id, {})
    return Learner(
        enrollment_id=enrollment.enrollment_id,
        student_id=st.student_id,
        lrn=st.lrn or "",
        last_name=st.last_name or "",
        first_name=st.first_name or "",
        middle_name=st.middle_name or "",
        suffix=st.suffix or "",
        sex=(st.sex or "").lower(),
        birth_date=st.birth_date,
        religion=st.religion or "",
        address=st.current_address or "",
        father=g.get("father", ""),
        mother=g.get("mother", ""),
        guardian=g.get("guardian", ""),
        contact=g.get("contact") or st.mobile_number or "",
        status=enrollment.enrollment_status,
        student_status=st.status or "active",
        transfer_in=transfers.get((enrollment.enrollment_id, "transfer_in")),
        transfer_out=transfers.get((enrollment.enrollment_id, "transfer_out")),
    )


def _section_info(school_year, grade_level, section, semester, rows, advisers):
    level = SCHOOL_LEVEL_OF_GRADE.get(grade_level, "")
    strand = next(iter(
        Section.objects.filter(school_year_id=school_year, grade_level=grade_level, name=section)
        .values_list("strand", flat=True)[:1]
    ), None)
    if not strand:
        strand = next((r.strand for r in rows if r.strand), "")
    return SectionInfo(
        school_year=school_year, school_level=level, grade_level=grade_level, section=section,
        strand=strand or "", semester=semester or "", advisers=advisers,
    )


def _section_rows(school_year, grade_level, section, semester):
    qs = Enrollment.objects.filter(
        school_year=school_year, grade_level=grade_level, section=section,
        enrollment_status__in=ATTENDED_STATUSES,
    ).select_related("student")
    if semester:
        qs = qs.filter(semester=semester)
    return list(qs)


# ─── SF1 ────────────────────────────────────────────────────────────────────

def load_register(*, school_year, grade_level, section, semester=None):
    rows = _section_rows(school_year, grade_level, section, semester)
    if not rows:
        raise NothingToPrint(f"No learners in {grade_level} – {section} for {school_year}.")
    guardians = _guardians({r.student_id for r in rows})
    transfers = _transfers([r.enrollment_id for r in rows])
    advisers = _advisers([(school_year, grade_level, section)])
    dates = configured_dates(school_year)
    return RegisterData(
        school=load_school(),
        section=_section_info(school_year, grade_level, section, semester, rows,
                              advisers.get((school_year, grade_level, section), ())),
        learners=tuple(_learner(r, guardians, transfers) for r in rows),
        year_ended=bool(dates and dates[1] < timezone.localdate()),
    )


# ─── SF2 ────────────────────────────────────────────────────────────────────

def class_days(school_year, first, last, saturdays=()):
    """The month's weekdays inside the school year, less no-class calendar days.

    A Saturday counts only when attendance was taken on it.
    """
    dates = configured_dates(school_year)
    start, end = dates if dates else (first, last)
    blocked = set()
    events = CalendarEvent.objects.filter(
        school_year=school_year, event_type__in=NO_CLASS_EVENT_TYPES,
        start_date__lte=last, end_date__gte=first,
    ).values_list("start_date", "end_date")
    for s, e in events:
        day = max(s, first)
        while day <= min(e, last):
            blocked.add(day)
            day += timedelta(days=1)
    days, day = [], first
    while day <= last:
        weekday = day.weekday() < SATURDAY or (day.weekday() == SATURDAY and day in saturdays)
        if weekday and start <= day <= end and day not in blocked:
            days.append(day)
        day += timedelta(days=1)
    return days


def load_attendance(*, school_year, grade_level, section, month, semester=None):
    """`month` is the 1st of the month to report."""
    first, last = month, month_end(month)
    rows = _section_rows(school_year, grade_level, section, semester)
    if not rows:
        raise NothingToPrint(f"No learners in {grade_level} – {section} for {school_year}.")
    guardians = {}  # SF2 prints no family details
    transfers = _transfers([r.enrollment_id for r in rows])
    roster = [_learner(r, guardians, transfers) for r in rows]

    marks = {
        (enrollment_id, day): status
        for enrollment_id, day, status in AttendanceRecord.objects.filter(
            enrollment_id__in=[r.enrollment_id for r in rows], date__gte=first, date__lte=last,
        ).values_list("enrollment_id", "date", "status")
    }
    saturdays = {day for (_, day) in marks if day.weekday() == SATURDAY}
    days = class_days(school_year, first, last, saturdays)
    marked = {enrollment_id for (enrollment_id, _) in marks}

    def in_class(l):
        if l.transfer_in and l.transfer_in.effective_date > last:
            return False
        if l.transfer_out and l.transfer_out.effective_date < first:
            return False
        # Someone with no record all month while the class has records was
        # not in it yet (or anymore); a month with no records at all keeps
        # everyone, so the form is never empty for want of attendance.
        return not marks or l.enrollment_id in marked

    listed = [l for l in roster if in_class(l)]
    left_off = [
        l for l in roster
        if not in_class(l) and not (l.transfer_in and l.transfer_in.effective_date > last)
        and not (l.transfer_out and l.transfer_out.effective_date < first)
    ]
    advisers = _advisers([(school_year, grade_level, section)])
    return AttendanceData(
        school=load_school(),
        section=_section_info(school_year, grade_level, section, semester, rows,
                              advisers.get((school_year, grade_level, section), ())),
        month=first,
        class_days=tuple(days),
        roster=tuple(roster),
        listed=tuple(listed),
        marks=marks,
        left_off=tuple(left_off),
    )


# ─── SF10 ───────────────────────────────────────────────────────────────────

# The level before each record's, on the one-row table above its grade
# tables: the grade it comes from, what the Level column says, and the
# remark it gets once completed here (the school's wording, per template).
PRIOR = {
    "elementary": ("Kindergarten", "KINDER", "Grade 1 Ready"),
    "junior_highschool": ("Grade 6", "GRADE 6", "PROMOTED"),
    "senior_highschool": ("Grade 10", "GRADE 10", "PASSED"),
}


def _grade_rank(grade_level):
    return GRADE_ORDER.index(grade_level) if grade_level in GRADE_ORDER else len(GRADE_ORDER)


def _years(rows):
    """YearRecords for enrollment rows, in the order they were attended."""
    rows = sorted(rows, key=lambda r: (_grade_rank(r.grade_level), r.school_year, r.semester or "", r.enrollment_id))
    if not rows:
        return []
    grades = list(
        Grade.objects.filter(enrollment_id__in=[r.enrollment_id for r in rows]).select_related("subject")
    )
    subjects = list(Subject.objects.filter(
        school_year__in={r.school_year for r in rows},
        grade_level__in={r.grade_level for r in rows},
    ).values("subject_id", "subject_name", "school_level", "grade_level", "strand", "semester", "school_year",
             "subject_group"))
    by_id = {s["subject_id"]: s for s in subjects}
    advisers = _advisers([(r.school_year, r.grade_level, r.section) for r in rows])

    years = []
    for r in rows:
        shs = r.school_level == "senior_highschool"
        periods = (f"{r.semester}_semester",) if shs and r.semester else QUARTERS
        mine = [g for g in grades if g.enrollment_id == r.enrollment_id]
        expected = expected_subjects(
            r.school_level, r.grade_level, r.strand,
            [s for s in subjects if s["school_year"] == r.school_year],
            periods[0] if shs else None,
        )
        subject_ids = set(expected) | {g.subject_id for g in mine}
        records = []
        for sid in subject_ids:
            info = by_id.get(sid) or next(
                ({"subject_name": g.subject.subject_name, "strand": g.subject.strand,
                  "subject_group": getattr(g.subject, "subject_group", None)}
                 for g in mine if g.subject_id == sid), None)
            if not info:
                continue
            own = [g for g in mine if g.subject_id == sid]
            records.append(SubjectRecord(
                name=info["subject_name"],
                grades={g.grading_period: g.numeric_grade for g in own if g.numeric_grade is not None},
                recorded_remarks=tuple(sorted({g.remarks for g in own if g.remarks})),
                group=subject_group(info["subject_name"], info.get("strand"), info.get("subject_group")) if shs else "",
                order=sid,
            ))
        years.append(YearRecord(
            school_year=r.school_year, grade_level=r.grade_level, section=r.section,
            periods=periods, subjects=tuple(records), strand=r.strand or "",
            semester=r.semester or "",
            adviser=", ".join(advisers.get((r.school_year, r.grade_level, r.section), ())),
            completed=r.enrollment_status == "completed",
        ))
    return years


def _prior_level(level, rows, school):
    """
    The previous level's row, from its last year here: Kindergarten prints
    no rating, Grades 6 and 10 their general average. A level not taken
    here gets only its label; the registrar fills in the rest.
    """
    _, label, remark = PRIOR[level]
    if level == "elementary":
        if not rows:
            return PriorLevel(level=label)
        last = max(rows, key=lambda r: (r.school_year, r.enrollment_id))
        return PriorLevel(level=label, school_year=last.school_year, school=school.name, final_rating="-",
                          remarks=remark if last.enrollment_status == "completed" else "")
    completed = [r for r in rows if r.enrollment_status == "completed"]
    if not completed:
        return PriorLevel(level=label)
    last = max(completed, key=lambda r: (r.school_year, r.enrollment_id))
    result = year_result(_years([last])[0])
    return PriorLevel(
        level=label, school_year=last.school_year, school=school.name,
        final_rating="" if result.average is None else str(result.average),
        remarks=remark if result.passed else "",
    )


def load_permanent_record(*, student_id, level, issue=None):
    """
    The learner's SF10 for one level. The elementary record starts with
    Kindergarten's row, so a learner who has only been in Kindergarten here
    gets one too.
    """
    student = Student.objects.filter(pk=student_id).first()
    if not student:
        raise NothingToPrint("Learner not found.")
    rows = list(Enrollment.objects.filter(
        student_id=student_id, enrollment_status__in=ATTENDED_STATUSES,
    ))
    at_level = [r for r in rows if r.school_level == level]
    before = [r for r in rows if r.grade_level == PRIOR[level][0]]
    if not at_level and not (level == "elementary" and before):
        raise NothingToPrint("This learner has no records at that level.")

    school = load_school()
    family = _guardians({student.student_id}).get(student.student_id, {})
    learner = Learner(
        enrollment_id=0, student_id=student.student_id, lrn=student.lrn or "",
        last_name=student.last_name or "", first_name=student.first_name or "",
        middle_name=student.middle_name or "", suffix=student.suffix or "",
        sex=(student.sex or "").lower(), birth_date=student.birth_date,
        address=student.permanent_address or student.current_address or "",
        father=family.get("father", ""), mother=family.get("mother", ""), guardian=family.get("guardian", ""),
        student_number=student.student_number or "",
    )
    return PermanentRecordData(
        school=school, level=level, learner=learner, years=tuple(_years(at_level)),
        prior=_prior_level(level, before, school), issue=issue or IssueDetails(),
    )
