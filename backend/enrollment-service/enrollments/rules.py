"""
Enrollment rules that more than one path has to agree on.

Each of these was either missing or restated with its own variation: the
serializer, Promote, the eligibility report, the transfer actions and the demo
seed all decide "which level is Grade 7", "may this status become that one" or
"did this learner ever actually attend". Pure and DB-free, like promotion.py and
requirements/rules.py, so the rules can be tested without the ORM.
"""
from datetime import date

GRADE_ORDER = [
    "Nursery", "Kindergarten",
    "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
    "Grade 7", "Grade 8", "Grade 9", "Grade 10",
    "Grade 11", "Grade 12",
]

SCHOOL_LEVEL_OF_GRADE = {
    "Nursery": "nursery",
    "Kindergarten": "kindergarten",
    **{f"Grade {n}": "elementary" for n in range(1, 7)},
    **{f"Grade {n}": "junior_highschool" for n in range(7, 11)},
    "Grade 11": "senior_highschool",
    "Grade 12": "senior_highschool",
}

# Rows where the learner actually studied here. A cancelled row is an
# application that never became a place, and a pending one has not started, so
# neither makes a learner "continuing" -- counting them let a walk-in with one
# cancelled row skip the transferee documents (Good Moral, Form 137).
ATTENDED_STATUSES = ("enrolled", "completed", "transferred_out")

# Which status an edit may move an enrollment to. Anything else used to be
# accepted, and Pending -> Cancelled -> Enrolled walked straight past the
# document check that Pending -> Enrolled enforces.
#
# - transferred_out is set only by the transfer-out action, which also records
#   where the learner went; a learner who comes back gets a new enrollment.
# - completed -> enrolled reopens a year closed by mistake (Complete Section
#   closes a whole class at once). It is not an admission, so no document check.
STATUS_CHANGES = {
    "pending":         {"enrolled", "cancelled"},
    "enrolled":        {"completed", "cancelled"},
    "cancelled":       {"pending"},
    "completed":       {"enrolled"},
    "transferred_out": set(),
}

STATUS_LABELS = {
    "pending": "Pending",
    "enrolled": "Enrolled",
    "cancelled": "Cancelled",
    "completed": "Completed",
    "transferred_out": "Transferred Out",
}


def status_change_problem(old, new):
    """None when an edit may move an enrollment from `old` to `new`, else why not."""
    if old == new or old is None:
        return None
    if new == "transferred_out":
        return "Use Transfer Out to record that a learner left; it also records where they went."
    allowed = STATUS_CHANGES.get(old, set())
    if new in allowed:
        return None
    label = STATUS_LABELS.get(old, old)
    if not allowed:
        return f"A {label} enrollment can't be changed. Enroll the learner again instead."
    options = " or ".join(STATUS_LABELS[s] for s in sorted(allowed))
    hint = " Move it back to Pending first, so the documents are checked." if old == "cancelled" and new == "enrolled" else ""
    return f"A {label} enrollment can only become {options}.{hint}"


def placement_problems(*, school_level, grade_level, strand):
    """{field: message} for a placement that contradicts itself; empty when fine."""
    problems = {}
    if grade_level not in SCHOOL_LEVEL_OF_GRADE:
        problems["grade_level"] = f"'{grade_level}' is not a grade level this school offers."
        return problems
    expected = SCHOOL_LEVEL_OF_GRADE[grade_level]
    if school_level != expected:
        problems["school_level"] = (
            f"{grade_level} belongs to {expected.replace('_', ' ')}, not "
            f"{(school_level or 'no level').replace('_', ' ')}."
        )
    if expected == "senior_highschool" and not (strand or "").strip():
        problems["strand"] = "Senior high enrollments need a strand."
    return problems


def school_year_dates(school_year):
    """
    The widest dates a school year's records can carry.

    From 1 May of the opening year to 31 July of the closing one: generous on
    purpose, because the actual opening and closing days move from year to
    year (DepEd has opened in June and in August). It exists to catch a date
    typed into the wrong year -- attendance for 2031 on a 2026-2027 roster --
    not to police the calendar.
    """
    start = int(school_year[:4])
    return date(start, 5, 1), date(start + 1, 7, 31)


def date_outside_school_year(value, school_year):
    """A message when `value` can't belong to `school_year`, else None."""
    try:
        first, last = school_year_dates(school_year)
    except (TypeError, ValueError):
        return None
    if first <= value <= last:
        return None
    return f"{value.isoformat()} is outside school year {school_year}."
