"""
Tests for archiving a school year: which years can be archived and
unarchived, and that an archived year's records refuse every change -- a
grade correction included -- until it's unarchived.

No database (see test_school_years.py): the registry lookup is mocked.
"""
from contextlib import nullcontext
from datetime import date, datetime, timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.archive import ArchivedYearGuard, YearArchived, ensure_open, year_of
from enrollments.models import Enrollment, SchoolYear, Section, SectionAdvisory
from enrollments.views import EnrollmentViewSet, SchoolYearViewSet

factory = APIRequestFactory()
ARCHIVED = "2024-2025"


def _user(role="admin", user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _year(label, *, is_current=False, archived=False):
    first = int(label[:4])
    return SchoolYear(
        school_year_id=first, label=label,
        start_date=date(first, 6, 1), end_date=date(first + 1, 3, 31),
        is_current=is_current,
        archived_at=datetime(2030, 1, 1, tzinfo=dt_timezone.utc) if archived else None,
    )


def _registry(archived=(ARCHIVED,)):
    """Mocks the one query the guard makes: which of these years are archived."""
    def archived_among(labels):
        return {label for label in labels if label in archived}
    return patch("enrollments.archive.archived_among", side_effect=archived_among)


# -- which year a record belongs to -------------------------------------------

def test_a_record_knows_its_year_directly_or_through_its_enrollment():
    enrollment = Enrollment(school_year="2025-2026")
    assert year_of(enrollment) == "2025-2026"
    assert year_of(SectionAdvisory(school_year="2025-2026")) == "2025-2026"
    # A section's year is a foreign key to the label: read without a query.
    assert year_of(Section(school_year_id="2025-2026")) == "2025-2026"
    # Grades, attendance, scholarships... have theirs through the enrollment.
    assert year_of(SimpleNamespace(enrollment=enrollment)) == "2025-2026"
    # Validated data, with the year as a label, a registry row, or an enrollment.
    assert year_of({"school_year": "2025-2026"}) == "2025-2026"
    assert year_of({"school_year": _year("2025-2026")}) == "2025-2026"
    assert year_of({"enrollment": enrollment}) == "2025-2026"
    # A PATCH that doesn't touch the placement says nothing.
    assert year_of({"remarks": "Passed"}) is None


def test_an_archived_year_refuses_with_a_way_through():
    with _registry():
        ensure_open("2025-2026", None, "")   # open, and blanks ignored
        with pytest.raises(YearArchived) as exc:
            ensure_open("2025-2026", ARCHIVED)
    assert exc.value.status_code == 409
    assert "S.Y. 2024-2025 is archived" in str(exc.value.detail)
    assert "unarchive it under School Years" in str(exc.value.detail)


# -- the viewset guard ----------------------------------------------------------

class _Guarded(ArchivedYearGuard):
    pass


def _serializer(data, instance=None):
    return MagicMock(validated_data=data, instance=instance)


def test_nothing_is_added_to_an_archived_year():
    serializer = _serializer({"enrollment": Enrollment(school_year=ARCHIVED)})
    with _registry(), pytest.raises(YearArchived):
        _Guarded().perform_create(serializer)
    serializer.save.assert_not_called()


def test_a_grade_in_an_archived_year_cannot_be_corrected():
    grade = SimpleNamespace(enrollment=Enrollment(school_year=ARCHIVED))
    serializer = _serializer({"numeric_grade": 90}, instance=grade)
    with _registry(), pytest.raises(YearArchived):
        _Guarded().perform_update(serializer)
    serializer.save.assert_not_called()


def test_a_record_cannot_be_moved_into_an_archived_year_either():
    serializer = _serializer({"school_year": ARCHIVED}, instance=SectionAdvisory(school_year="2025-2026"))
    with _registry(), pytest.raises(YearArchived):
        _Guarded().perform_update(serializer)


def test_or_deleted_from_one():
    record = MagicMock(school_year=ARCHIVED, school_year_id=None)
    with _registry(), pytest.raises(YearArchived):
        _Guarded().perform_destroy(record)
    record.delete.assert_not_called()


def test_an_open_years_records_save_as_before():
    serializer = _serializer({"enrollment": Enrollment(school_year="2025-2026")})
    with _registry():
        _Guarded().perform_create(serializer, recorded_by=7)
    serializer.save.assert_called_once_with(recorded_by=7)


# -- archive and unarchive ----------------------------------------------------

def _year_view(action):
    request = Request(factory.post(f"/api/school-years/x/{action}/"))
    request.user = _user("admin", user_id=5)
    view = SchoolYearViewSet()
    view.request, view.format_kwarg, view.action = request, None, action
    view.kwargs = {"label": "x"}
    return view, request


def _archive(year, current="2026-2027", action="archive"):
    view, request = _year_view(action)
    with patch.object(view, "get_object", return_value=year), \
         patch.object(SchoolYear, "save") as save, \
         patch("enrollments.views.SchoolYear.objects") as objects:
        objects.filter.return_value.values_list.return_value.first.return_value = current
        response = getattr(view, action)(request, label=year.label)
    return response, save


def test_a_finished_year_is_archived_by_whoever_did_it():
    year = _year("2025-2026")
    response, save = _archive(year)
    assert response.status_code == 200
    assert response.data["state"] == "archived"
    assert year.archived_at is not None and year.archived_by == 5
    save.assert_called_once_with(update_fields=["archived_at", "archived_by", "updated_at"])


def test_the_current_year_and_years_to_come_cannot_be_archived():
    response, save = _archive(_year("2026-2027", is_current=True))
    assert response.status_code == 409
    assert "current year" in response.data["detail"]

    response, save = _archive(_year("2027-2028"))
    assert response.status_code == 409
    assert "hasn't started yet" in response.data["detail"]
    save.assert_not_called()


def test_unarchiving_reopens_the_year():
    year = _year(ARCHIVED, archived=True)
    year.archived_by = 5
    response, save = _archive(year, action="unarchive")
    assert response.data["state"] == "open"
    assert year.archived_at is None and year.archived_by is None
    save.assert_called_once()


def test_an_archived_years_dates_are_fixed_too():
    view, _ = _year_view("partial_update")
    serializer = MagicMock(instance=_year(ARCHIVED, archived=True))
    with pytest.raises(YearArchived):
        view.perform_update(serializer)
    serializer.save.assert_not_called()


# -- custom write paths --------------------------------------------------------

def _enrollment_view(path, body):
    request = Request(factory.post(path, body, format="json"), parsers=[JSONParser()])
    request.user = _user("registrar")
    view = EnrollmentViewSet()
    view.request, view.format_kwarg = request, None
    return view, request


def test_learners_cannot_be_promoted_into_an_archived_year():
    view, request = _enrollment_view("/api/enrollments/promote/confirm/", {
        "from_school_year": "2023-2024", "from_grade_level": "Grade 7",
        "from_section": "Rizal", "to_school_year": ARCHIVED,
    })
    with _registry(), \
         patch("enrollments.views.SchoolYear.objects") as years, \
         patch("enrollments.views.Enrollment.objects") as enrollments:
        years.filter.return_value.exists.return_value = True
        with pytest.raises(YearArchived):
            view.promote_confirm(request)
    enrollments.filter.assert_not_called()


def test_bulk_enrolment_into_an_archived_year_is_refused_as_a_whole():
    view, request = _enrollment_view("/api/enrollments/bulk/", {
        "students": [1, 2], "school_year": ARCHIVED, "school_level": "elementary",
        "grade_level": "Grade 5", "section": "Sampaguita",
    })
    with _registry(), patch("enrollments.views.EnrollmentSerializer") as serializer:
        with pytest.raises(YearArchived):
            view.bulk_create(request)
    serializer.assert_not_called()


def test_a_learner_in_an_archived_year_cannot_be_transferred_out():
    view, request = _enrollment_view("/api/enrollments/9/transfer-out/", {
        "reason": "Moving", "effective_date": "2025-01-10",
    })
    enrollment = Enrollment(enrollment_id=9, school_year=ARCHIVED, enrollment_status="enrolled")
    with _registry(), patch.object(view, "get_object", return_value=enrollment), \
         patch("enrollments.views.transaction.atomic", return_value=nullcontext()), \
         patch("enrollments.views.EnrollmentTransfer.objects") as transfers:
        with pytest.raises(YearArchived):
            view.transfer_out(request, pk=9)
    transfers.create.assert_not_called()
    assert enrollment.enrollment_status == "enrolled"
