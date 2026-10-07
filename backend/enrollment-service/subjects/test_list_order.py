"""
The Subjects list's order: grade by grade, Nursery to Grade 12, then by name.
Sorting on the level and grade columns sorted text -- Grade 10 before Grade 7,
Kindergarten after Junior High.

No database (see enrollments/test_school_years.py): the queryset is mocked.
"""
from unittest.mock import MagicMock, patch

from enrollments.rules import GRADE_ORDER
from subjects.views import GRADE_RANK, SubjectViewSet


def test_the_list_runs_up_the_grade_ladder_then_by_name():
    assert SubjectViewSet.ordering == ("grade_rank", "subject_name")
    base = MagicMock()
    with patch("rest_framework.viewsets.ModelViewSet.get_queryset", return_value=base):
        SubjectViewSet().get_queryset()
    base.annotate.assert_called_once_with(grade_rank=GRADE_RANK)


def test_each_grade_ranks_in_ladder_order_and_an_unknown_one_last():
    ranks = {w.condition.children[0][1]: w.result.value for w in GRADE_RANK.cases}
    assert [ranks[g] for g in GRADE_ORDER] == list(range(len(GRADE_ORDER)))
    assert ranks["Grade 7"] < ranks["Grade 10"]
    assert GRADE_RANK.default.value == len(GRADE_ORDER)
