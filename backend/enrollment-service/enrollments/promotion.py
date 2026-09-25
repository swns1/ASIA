"""
Who a section promotion carries into next year, and why the rest stay behind.

Pulled out of EnrollmentViewSet._promote_logic so the decision can be tested
without the ORM -- this service cannot build a test database (see
ai/test_risk_assessment.py), and every rule below was either missing or wrong
before it had a test:

- A learner with no grade rows at all was promoted. summarize_subjects([])
  finds no failed learning area, so "nothing recorded" read as "passed
  everything".
- Grade 11 learners appeared twice, once per semester row, and the Grade 12
  rows written for them carried no semester -- which the enrollments CHECK
  constraint rejects for senior high, so every one of them failed.

Duck-typed throughout, same convention as requirements/rules.py: grades are
anything carrying `.subject`, `.numeric_grade` and `.remarks`; source rows are
anything carrying `.enrollment_id` and `.student_id`.
"""
from grading.deped import general_average, summarize_subjects

# Assessed through the narrative (observed values) report, not numeric
# grades -- DepEd's kindergarten assessment is a checklist, and nursery follows
# it here. Recorded grades still count when present; their absence does not
# block promotion.
UNGRADED_LEVELS = frozenset({"Nursery", "Kindergarten"})

# The per-semester grade level: promoting out of it needs both semesters.
SEMESTERED_SOURCE = "Grade 11"

SKIP_ALREADY_ENROLLED = "already_enrolled"
SKIP_NO_GRADES = "no_grades"
SKIP_FIRST_SEMESTER = "first_semester_missing"
SKIP_FAILED = "failed"


def one_per_student(rows):
    """
    The newest source row per learner, in the order learners first appear.

    A learner can legitimately hold more than one completed row in the same
    section and year -- both Grade 11 semesters, or a row completed, reopened
    and completed again -- and each must still be promoted exactly once.
    """
    latest = {}
    for row in rows:
        kept = latest.get(row.student_id)
        if kept is None or row.enrollment_id > kept.enrollment_id:
            latest[row.student_id] = row
    return list(latest.values())


def assess(grades, *, from_grade_level, to_school_year,
           already_enrolled=False, first_semester_done=True):
    """
    Promote this learner, or say why not.

    Returns (average, skip) where `skip` is None to promote, else
    {"kind": SKIP_*, "reason": str}. `kind` lets the screen offer the right
    next step -- only a learner skipped for failing should be steered toward
    repeating the grade.

    `grades` is every grade row the promotion is judged on: the one
    enrollment's, or both semesters' for Grade 11. `first_semester_done` only
    matters for Grade 11.
    """
    grades = list(grades)
    outcomes = summarize_subjects(grades)
    averages = [o["average"] for o in outcomes.values()]
    avg = float(general_average(averages)) if averages else None

    if already_enrolled:
        return avg, {
            "kind": SKIP_ALREADY_ENROLLED,
            "reason": f"Already has an active enrollment in {to_school_year}.",
        }

    if not grades and from_grade_level not in UNGRADED_LEVELS:
        return avg, {
            "kind": SKIP_NO_GRADES,
            "reason": "No final grades recorded.",
        }

    if from_grade_level == SEMESTERED_SOURCE and not first_semester_done:
        return avg, {
            "kind": SKIP_FIRST_SEMESTER,
            "reason": "Grade 11 1st semester is not marked completed.",
        }

    # Failed ON THE YEAR, per learning area -- the same reduction the report
    # card prints (grading.deped), not any single quarter's remark.
    failed = [
        o for o in outcomes.values()
        if o["remarks"] in ("failed", "incomplete", "dropped")
    ]
    if failed:
        names = ", ".join(
            f"{o['subject'].subject_name} "
            f"({o['average'] if o['average'] is not None else o['remarks']})"
            for o in failed
        )
        return avg, {"kind": SKIP_FAILED, "reason": f"Failed/incomplete: {names}"}

    return avg, None


def failed_learning_areas(grades):
    """
    Names of the learning areas failed, incomplete or dropped on the year.

    The per-learner enrollment path asks the same question Promote does; this
    is that one answer, so the two can no longer disagree about a learner who
    failed a quarter and passed the year.
    """
    return [
        o["subject"].subject_name
        for o in summarize_subjects(grades).values()
        if o["remarks"] in ("failed", "incomplete", "dropped")
    ]
