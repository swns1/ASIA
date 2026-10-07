"""
SubjectFilter's `has_template` -- the split the Subjects page's status band
counts. A subject with no grading template can't have a grade worked out
(compute-grade refuses it), so the page shows how many are still without one.

No database (see enrollments/test_school_years.py): the queryset is mocked,
and the query string is only parsed.
"""
from unittest.mock import MagicMock

import pytest

from subjects.filters import SubjectFilter
from subjects.models import Subject


@pytest.mark.parametrize("value, isnull", [(True, False), (False, True)])
def test_has_template_splits_on_the_grading_template(value, isnull):
    queryset = MagicMock()

    SubjectFilter().filter_has_template(queryset, "has_template", value)

    queryset.filter.assert_called_once_with(grading_template__isnull=isnull)


@pytest.mark.parametrize("query, parsed", [("true", True), ("false", False), ("", None)])
def test_the_query_string_reads_as_yes_no_or_unset(query, parsed):
    filterset = SubjectFilter(data={"has_template": query}, queryset=Subject.objects.none())
    assert filterset.form.is_valid()
    assert filterset.form.cleaned_data["has_template"] is parsed
