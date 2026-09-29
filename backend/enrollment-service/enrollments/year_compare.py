"""
School years side by side: the numbers behind GET /api/school-years/compare/.

Split the way dashboard/ is: `build()` turns plain rows into the response and
touches no database, so every rule about what counts is tested on its own;
`gather()` is only the queries that feed it.

What the numbers mean:

  * A learner is a student, not an enrollment row. A Senior High learner has
    one row per semester, so everything is counted per distinct student.
  * A learner "attended" the year when they have an enrollment there that is
    enrolled, completed or transferred out. Pending and cancelled rows are
    applications, not attendance.
  * New / returning looks at the year before. Came back looks at the year
    after, and only counts learners who were still there at the end (not
    transferred out). Either is None when that neighbouring year isn't
    registered: there is nothing to compare against, which isn't the same as
    zero.
  * Grades go through grading.deped, the same reduction the report card and
    promotion use: a subject's year grade is the mean of its periods, the
    general average the mean of those. For a year still running they are
    grades so far.
  * Attendance rate is present + late over every record, the definition the
    risk model and the section stats share (excused still counts against).
"""
from collections import defaultdict
from types import SimpleNamespace

from django.db.models import Count

from grading.deped import general_average, summarize_subjects

from .models import Enrollment, Section, SectionAdvisory

ATTENDED = ("enrolled", "completed", "transferred_out")
# Next year's enrollments that show a learner came back. Cancelled doesn't.
CAME_BACK = ("enrolled", "pending", "completed", "transferred_out")
LEVELS = ("nursery", "kindergarten", "elementary", "junior_highschool", "senior_highschool")

MAX_YEARS = 5


def previous_label(label):
    first = int(label[:4])
    return f"{first - 1}-{first}"


def next_label(label):
    first = int(label[:4])
    return f"{first + 1}-{first + 2}"


# ── Pure: rows in, response out ─────────────────────────────────────────────
def summarize_enrollment(rows, previous_ids=None, next_ids=None):
    """
    One year's learners from its enrollment rows.

    `rows`: dicts with enrollment_id, student_id, school_level and
    enrollment_status. `previous_ids`: the students who attended the year
    before, or None when it isn't registered. `next_ids`: the students with
    an enrollment in the year after, or None likewise.
    """
    attended_level = {}      # student -> level of their latest attended row
    latest_row = {}
    transferred, waiting = set(), set()
    for row in rows:
        student, status = row["student_id"], row["enrollment_status"]
        if status in ATTENDED:
            if student not in latest_row or row["enrollment_id"] > latest_row[student]:
                latest_row[student] = row["enrollment_id"]
                attended_level[student] = row["school_level"]
            if status == "transferred_out":
                transferred.add(student)
        elif status == "pending":
            waiting.add(student)

    learners = set(attended_level)
    by_level = {level: 0 for level in LEVELS}
    for level in attended_level.values():
        if level in by_level:
            by_level[level] += 1

    returning = len(learners & previous_ids) if previous_ids is not None else None
    stayed = learners - transferred
    return {
        "learners": len(learners),
        "by_level": by_level,
        "returning": returning,
        "new": len(learners) - returning if returning is not None else None,
        "transferred_out": len(transferred),
        # Only waiting: a learner already attending isn't also an applicant.
        "pending": len(waiting - learners),
        "came_back": (
            {"count": len(stayed & next_ids), "of": len(stayed)}
            if next_ids is not None else None
        ),
    }


def summarize_grades(rows):
    """
    `rows`: dicts with student_id, subject_id, numeric_grade and remarks --
    every period's grade for the year's attending learners.
    """
    by_student = defaultdict(list)
    for row in rows:
        by_student[row["student_id"]].append(SimpleNamespace(
            subject=SimpleNamespace(subject_id=row["subject_id"]),
            numeric_grade=row["numeric_grade"],
            remarks=row["remarks"],
        ))

    averages, passed_all = [], 0
    for grades in by_student.values():
        outcomes = summarize_subjects(grades).values()
        average = general_average([o["average"] for o in outcomes])
        if average is not None:
            averages.append(average)
        if outcomes and all(o["remarks"] == "passed" for o in outcomes):
            passed_all += 1

    return {
        "graded_learners": len(by_student),
        "general_average": round(sum(averages) / len(averages), 1) if averages else None,
        "passed_all": passed_all,
    }


def attendance_rate(counts):
    """`counts`: {status letter: records}. None when nothing was recorded."""
    total = sum(counts.values())
    if not total:
        return None
    return round((counts.get("P", 0) + counts.get("L", 0)) * 100 / total, 1)


def build(labels, registered, enrollment_rows, grade_rows, attendance, sections, advisories, scholarships):
    """
    The response for `labels` (oldest first).

    `enrollment_rows`: {year: [row, ...]} covering the requested years and
    their registered neighbours. `grade_rows`: {year: [row, ...]}.
    `attendance`: {year: {status: n}}. `sections`: {year: n}. `advisories`:
    {year: {"sections": n, "advisers": n}}. `scholarships`: {year: n}.
    """
    def attended_ids(year):
        return {r["student_id"] for r in enrollment_rows.get(year, ()) if r["enrollment_status"] in ATTENDED}

    def came_back_ids(year):
        return {r["student_id"] for r in enrollment_rows.get(year, ()) if r["enrollment_status"] in CAME_BACK}

    years = []
    for label in labels:
        before, after = previous_label(label), next_label(label)
        advised = advisories.get(label, {})
        years.append({
            "label": label,
            "enrollment": summarize_enrollment(
                enrollment_rows.get(label, ()),
                previous_ids=attended_ids(before) if before in registered else None,
                next_ids=came_back_ids(after) if after in registered else None,
            ),
            "sections": {
                "total": sections.get(label, 0),
                "with_adviser": advised.get("sections", 0),
                "advisers": advised.get("advisers", 0),
            },
            "academics": {
                **summarize_grades(grade_rows.get(label, ())),
                "attendance_rate": attendance_rate(attendance.get(label, {})),
            },
            "scholarships": {"awarded": scholarships.get(label, 0)},
        })
    return {"years": years}


# ── The queries ──────────────────────────────────────────────────────────────
def gather(labels, registered):
    """Read everything `build()` needs for `labels`, in six queries."""
    from attendance.models import AttendanceRecord
    from grades.models import Grade
    from scholarships.models import EnrollmentScholarship

    neighbours = {previous_label(l) for l in labels} | {next_label(l) for l in labels}
    wanted = (set(labels) | neighbours) & set(registered)

    enrollment_rows = defaultdict(list)
    for row in (
        Enrollment.objects.filter(school_year__in=wanted).order_by()
        .values("enrollment_id", "student_id", "school_year", "school_level", "enrollment_status")
    ):
        enrollment_rows[row["school_year"]].append(row)

    grade_rows = defaultdict(list)
    for row in (
        Grade.objects.filter(
            enrollment__school_year__in=labels,
            enrollment__enrollment_status__in=ATTENDED,
        ).order_by()
        .values("enrollment__school_year", "enrollment__student_id", "subject_id", "numeric_grade", "remarks")
    ):
        grade_rows[row["enrollment__school_year"]].append({
            "student_id": row["enrollment__student_id"],
            "subject_id": row["subject_id"],
            "numeric_grade": row["numeric_grade"],
            "remarks": row["remarks"],
        })

    attendance = defaultdict(dict)
    for row in (
        AttendanceRecord.objects.filter(
            enrollment__school_year__in=labels,
            enrollment__enrollment_status__in=ATTENDED,
        ).order_by()
        .values("enrollment__school_year", "status").annotate(n=Count("attendance_id"))
    ):
        attendance[row["enrollment__school_year"]][row["status"]] = row["n"]

    sections = {
        row["school_year"]: row["n"]
        for row in Section.objects.filter(school_year__in=labels).order_by()
        .values("school_year").annotate(n=Count("section_id"))
    }

    advised_sections, advisers = defaultdict(set), defaultdict(set)
    for row in (
        SectionAdvisory.objects.filter(school_year__in=labels).order_by()
        .values("school_year", "grade_level", "section", "teacher_user_id")
    ):
        advised_sections[row["school_year"]].add((row["grade_level"], row["section"]))
        advisers[row["school_year"]].add(row["teacher_user_id"])
    advisories = {
        year: {"sections": len(advised_sections[year]), "advisers": len(advisers[year])}
        for year in advised_sections
    }

    scholarships = {
        row["enrollment__school_year"]: row["n"]
        for row in EnrollmentScholarship.objects.filter(enrollment__school_year__in=labels).order_by()
        .values("enrollment__school_year").annotate(n=Count("enrollment_scholarship_id"))
    }

    return build(labels, set(registered), enrollment_rows, grade_rows, attendance,
                 sections, advisories, scholarships)
