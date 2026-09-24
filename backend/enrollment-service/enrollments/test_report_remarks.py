"""
Tests for the Remarks column on a report card (grading.deped.subject_remarks).

This rule started life as report_views._subject_remarks and moved into
grading.deped so promotion could share it: promotion used to block on ANY
period marked failed/incomplete while the report card reduced the subject over
its whole year, so one system printed Passed and the other refused to promote
the same learner. The import alias below keeps these tests pointed at the
rule rather than at where it happens to live.

The bug these exist for: report_card() derived that column purely from the
subject's numeric average (`avg >= 75 -> "passed"`), while the remark a
teacher had actually recorded on each Grade row was fetched, serialized
beside every grade, and then never consulted. Grade.REMARKS_CHOICES carries
"incomplete" and "dropped" as well as pass/fail, and those two exist because
a score cannot express them — so a subject a teacher marked Dropped printed
as "Passed" whenever its average happened to clear 75, and neither INC nor
Dropped could appear on a report card at all.

No @pytest.mark.django_db: per ai/test_risk_assessment.py, a real test
database can't be built in this service (attendance.AttendanceRecord holds an
FK onto an unmanaged Enrollment). The precedence rule is a pure function for
exactly that reason, and is tested directly.
"""
import pytest

from grading.deped import PASSING_GRADE, subject_remarks as _subject_remarks


# ── the regression ───────────────────────────────────────────────────────


@pytest.mark.parametrize("recorded", [{"dropped"}, {"incomplete"}])
def test_recorded_remark_wins_over_a_passing_average(recorded):
    """
    The actual bug: a passing average used to mask the teacher's remark
    entirely. A subject dropped or left incomplete mid-year can still average
    well above the passing mark.
    """
    assert _subject_remarks(recorded, 88.0) == next(iter(recorded))


@pytest.mark.parametrize("recorded", [{"dropped"}, {"incomplete"}])
def test_recorded_remark_wins_over_a_failing_average_too(recorded):
    assert _subject_remarks(recorded, 60.0) == next(iter(recorded))


def test_dropped_outranks_incomplete():
    """Dropping is terminal; an incomplete is still awaiting a final mark."""
    assert _subject_remarks({"incomplete", "dropped"}, 88.0) == "dropped"


def test_recorded_remark_applies_even_with_no_average():
    assert _subject_remarks({"dropped"}, None) == "dropped"
    assert _subject_remarks({"incomplete"}, None) == "incomplete"


# ── the derived pass/fail is otherwise unchanged ─────────────────────────


def test_average_decides_when_nothing_conclusive_was_recorded():
    assert _subject_remarks(set(), 75.0) == "passed"
    assert _subject_remarks(set(), 74.99) == "failed"
    assert _subject_remarks(set(), None) is None


def test_passing_mark_is_the_deped_constant():
    """Guards against the literal 75 this function used to hardcode."""
    assert _subject_remarks(set(), float(PASSING_GRADE)) == "passed"
    assert _subject_remarks(set(), float(PASSING_GRADE) - 0.01) == "failed"


@pytest.mark.parametrize("recorded", [{"passed"}, {"failed"}, {"passed", "failed"}])
def test_recorded_pass_fail_does_not_override_the_average(recorded):
    """
    Deliberate: those are per-period marks, while the number printed beside
    this column is the average across every period. A subject passed in one
    quarter can still fail on the year, and the row has to agree with the
    figure next to it.
    """
    assert _subject_remarks(recorded, 60.0) == "failed"
    assert _subject_remarks(recorded, 90.0) == "passed"
