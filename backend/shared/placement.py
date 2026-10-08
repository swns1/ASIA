"""
Where a learner is placed in a school year, decided once for every service.

Two screens ask "who has no place this year?": the Students masterlist's
"Not enrolled" filter (student-service) and the Enrollments page's "not yet
placed" worklist (enrollment-service). Each answered it its own way. The
masterlist counted only enrolled and pending rows, so once a year was closed
-- every row "completed" -- all 551 learners read as not enrolled for it, and
it also listed learners who had graduated or left. The worklist kept to
active learners but had the same blind spot for a finished year. For the same
year one said 120 and the other 43.

The rule, as both now apply it:

- Only an `active` student can be waiting for a place; a graduated,
  transferred, dropped or inactive one is not expected back.
- A row holds the learner's place for its year when it is enrolled, pending
  or transferred_out (placed, then left: nothing to place), or completed --
  the year was attended. The exception is a senior high 1st semester that was
  completed on its own: that learner still needs the 2nd semester.
- A cancelled row never holds a place.
"""

# The order grades read in, lowest first. enrollments.rules re-exports it.
GRADE_ORDER = (
    "Nursery", "Kindergarten",
    "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
    "Grade 7", "Grade 8", "Grade 9", "Grade 10",
    "Grade 11", "Grade 12",
)

# Rows that place a learner for their school year whatever happens next.
PLACING_STATUSES = ("enrolled", "pending", "transferred_out")


def holds_place(enrollment_status, semester=None):
    """Whether one enrollment row places its learner for its school year."""
    if enrollment_status in PLACING_STATUSES:
        return True
    return enrollment_status == "completed" and semester != "1st"


def holds_place_q():
    """`holds_place` as a filter over an enrollments queryset.

    `semester` is NULL below senior high; Django's negation of a nullable
    column keeps those rows, which is what `semester != "1st"` means above.
    """
    from django.db.models import Q

    return Q(enrollment_status__in=PLACING_STATUSES) | (
        Q(enrollment_status="completed") & ~Q(semester="1st")
    )
