"""
Tests for shared.placement -- whether a learner holds a place in a school year.

The defect these exist for: the Students page's "Not enrolled" filter counted
only enrolled and pending rows, so a closed school year (every row completed)
listed all 551 learners as not enrolled for it, and the Enrollments page's
"not yet placed" list had the same blind spot. Both services now read this
rule, one as a function over rows and one as a queryset filter, so the two
forms must agree.
"""
import pytest
from django.db.models import Q

from shared.placement import GRADE_ORDER, holds_place, holds_place_q

CASES = [
    ("enrolled", None, True),
    ("pending", None, True),
    ("transferred_out", None, True),   # placed, then left: nothing to place
    ("completed", None, True),         # a closed year was attended
    ("completed", "2nd", True),
    ("completed", "1st", False),       # senior high between semesters
    ("enrolled", "1st", True),
    ("cancelled", None, False),
    ("cancelled", "2nd", False),
]


@pytest.mark.parametrize("status, semester, expected", CASES)
def test_which_rows_hold_a_place(status, semester, expected):
    assert holds_place(status, semester) is expected


def _evaluate(q, row):
    """A Q tree over one row, for the lookups holds_place_q uses. A NULL
    semester reads as "not 1st", as Django's negation of a nullable column
    makes it."""
    results = []
    for child in q.children:
        if isinstance(child, Q):
            results.append(_evaluate(child, row))
            continue
        key, value = child
        field, _, lookup = key.partition("__")
        results.append(row[field] in value if lookup == "in" else row[field] == value)
    matched = any(results) if q.connector == Q.OR else all(results)
    return not matched if q.negated else matched


@pytest.mark.parametrize("status, semester, expected", CASES)
def test_the_queryset_filter_says_the_same(status, semester, expected):
    row = {"enrollment_status": status, "semester": semester}
    assert _evaluate(holds_place_q(), row) is expected


def test_grades_read_lowest_first():
    assert GRADE_ORDER[0] == "Nursery"
    assert GRADE_ORDER.index("Grade 2") < GRADE_ORDER.index("Grade 10")
    assert GRADE_ORDER[-1] == "Grade 12"
    assert len(set(GRADE_ORDER)) == 14
