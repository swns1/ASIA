"""
Tests for the school year registry: SchoolYear.state(), SchoolYearSerializer's
rules, SchoolYearField(registered=True), and SchoolYearViewSet's permissions,
delete guard and make-current.

No database (see test_school_years.py): ORM calls and transactions are mocked.
"""
from contextlib import nullcontext
from datetime import date, datetime, timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.db import IntegrityError
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.models import SchoolYear
from enrollments.serializers import SchoolYearField, SchoolYearSerializer
from enrollments.views import SchoolYearViewSet
from shared.permissions import HasRole

factory = APIRequestFactory()


def _year(label="2025-2026", start=None, end=None, is_current=False, archived=False, pk=None):
    first = int(label[:4])
    return SchoolYear(
        school_year_id=pk,
        label=label,
        start_date=start or date(first, 6, 1),
        end_date=end or date(first + 1, 3, 31),
        is_current=is_current,
        archived_at=datetime(2030, 1, 1, tzinfo=dt_timezone.utc) if archived else None,
    )


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


# -- state --------------------------------------------------------------------

def test_state_is_derived_from_the_current_year():
    assert _year("2026-2027").state("2025-2026") == "upcoming"
    assert _year("2025-2026", is_current=True).state("2025-2026") == "current"
    assert _year("2024-2025").state("2025-2026") == "open"
    assert _year("2023-2024", archived=True).state("2025-2026") == "archived"


def test_a_past_year_stays_open_after_the_switch():
    """Making next year current must not lock the old one: final grades and
    late payments still land in it until someone archives it."""
    assert _year("2025-2026").state("2026-2027") == "open"


def test_with_no_current_year_nothing_is_upcoming():
    assert _year("2026-2027").state(None) == "open"


# -- serializer ---------------------------------------------------------------

def _validate(data, instance=None, overlap=None, exists=False):
    """Run SchoolYearSerializer validation with the registry mocked."""
    with patch("enrollments.serializers.SchoolYear.objects") as objects:
        objects.filter.return_value.exists.return_value = exists
        chain = objects.filter.return_value
        chain.exclude.return_value.first.return_value = overlap
        chain.first.return_value = overlap
        serializer = SchoolYearSerializer(instance=instance, data=data, partial=instance is not None)
        ok = serializer.is_valid()
    return ok, serializer.errors


def test_a_well_formed_year_is_accepted():
    ok, errors = _validate({"label": "2026-2027", "start_date": "2026-06-08", "end_date": "2027-03-31"})
    assert ok, errors


def test_end_date_must_follow_start_date():
    ok, errors = _validate({"label": "2026-2027", "start_date": "2026-06-08", "end_date": "2026-06-01"})
    assert not ok
    assert "end_date" in errors


def test_dates_must_sit_in_the_labels_years():
    ok, errors = _validate({"label": "2026-2027", "start_date": "2025-06-08", "end_date": "2027-03-31"})
    assert not ok
    assert errors["start_date"] == ["S.Y. 2026-2027 has to start in 2026."]

    ok, errors = _validate({"label": "2026-2027", "start_date": "2026-06-08", "end_date": "2028-03-31"})
    assert not ok
    assert errors["end_date"] == ["S.Y. 2026-2027 has to end in 2027."]


def test_overlapping_years_are_refused():
    clash = _year("2025-2026", start=date(2025, 6, 1), end=date(2026, 7, 15))
    ok, errors = _validate(
        {"label": "2026-2027", "start_date": "2026-07-01", "end_date": "2027-05-31"},
        overlap=clash,
    )
    assert not ok
    assert "overlap S.Y. 2025-2026" in errors["start_date"][0]


def test_a_duplicate_label_is_refused():
    ok, errors = _validate(
        {"label": "2026-2027", "start_date": "2026-06-08", "end_date": "2027-03-31"},
        exists=True,
    )
    assert not ok
    assert errors["label"] == ["S.Y. 2026-2027 already exists."]


def test_the_label_cannot_be_renamed():
    ok, errors = _validate({"label": "2027-2028"}, instance=_year("2026-2027", pk=3))
    assert not ok
    assert "can't be changed" in errors["label"][0]


def test_current_and_archived_cannot_be_written_directly():
    """Only make-current moves the current year (so exactly one flips, in one
    transaction); a PATCH that sets it is ignored."""
    fields = SchoolYearSerializer().fields
    assert fields["is_current"].read_only
    assert fields["archived_at"].read_only


# -- SchoolYearField(registered=True) ----------------------------------------

def test_an_unregistered_year_gets_a_message_instead_of_a_500():
    field = SchoolYearField(registered=True)
    with patch("enrollments.serializers.SchoolYear.objects") as objects:
        objects.filter.return_value.exists.return_value = False
        with pytest.raises(serializers.ValidationError) as exc:
            field.to_internal_value("2027-2028")
    assert "hasn't been set up yet" in str(exc.value.detail[0])


def test_a_registered_year_passes():
    field = SchoolYearField(registered=True)
    with patch("enrollments.serializers.SchoolYear.objects") as objects:
        objects.filter.return_value.exists.return_value = True
        assert field.to_internal_value(" 2026-2027 ") == "2026-2027"


def test_the_plain_field_does_not_touch_the_registry():
    with patch("enrollments.serializers.SchoolYear.objects") as objects:
        assert SchoolYearField().to_internal_value("2026-2027") == "2026-2027"
    objects.filter.assert_not_called()


# -- permissions --------------------------------------------------------------

@pytest.mark.parametrize("role,method,allowed", [
    ("teacher", "get", True),
    ("accounting", "get", True),
    ("registrar", "get", True),
    ("guardian", "get", False),
    ("registrar", "post", False),
    ("teacher", "post", False),
    ("admin", "post", True),
    ("super_admin", "post", True),
])
def test_everyone_on_staff_reads_only_admins_write(role, method, allowed):
    request = getattr(factory, method)("/api/school-years/")
    request.user = _user(role)
    assert HasRole().has_permission(request, SchoolYearViewSet()) is allowed


# -- delete -------------------------------------------------------------------

def _view(action, user_role="admin", method="post"):
    request = Request(getattr(factory, method)("/api/school-years/2025-2026/"))
    request.user = _user(user_role)
    view = SchoolYearViewSet()
    view.request = request
    view.format_kwarg = None
    view.action = action
    view.kwargs = {"label": "2025-2026"}
    return view, request


def test_the_current_year_cannot_be_deleted():
    view, request = _view("destroy", method="delete")
    with patch.object(view, "get_object", return_value=_year(is_current=True)):
        response = view.destroy(request, label="2025-2026")
    assert response.status_code == 409
    assert "Make another year current first" in response.data["detail"]


def test_a_year_with_records_cannot_be_deleted():
    view, request = _view("destroy", method="delete")
    year = MagicMock(spec=SchoolYear, label="2024-2025", is_current=False)
    year.delete.side_effect = IntegrityError("violates foreign key constraint")
    with patch.object(view, "get_object", return_value=year), \
         patch("enrollments.views.transaction.atomic", return_value=nullcontext()):
        response = view.destroy(request, label="2024-2025")
    assert response.status_code == 409
    assert "still has records" in response.data["detail"]


# -- make-current -------------------------------------------------------------

def test_an_archived_year_cannot_be_made_current():
    view, request = _view("make_current")
    with patch.object(view, "get_object", return_value=_year(archived=True)):
        response = view.make_current(request, label="2025-2026")
    assert response.status_code == 409


def test_make_current_moves_the_flag_and_syncs_settings_in_one_transaction():
    view, request = _view("make_current")
    year = _year("2026-2027", pk=12)
    with patch.object(view, "get_object", return_value=year), \
         patch.object(SchoolYear, "save") as save, \
         patch("enrollments.views.SchoolYear.objects") as objects, \
         patch("enrollments.views.transaction.atomic", return_value=nullcontext()) as atomic, \
         patch("enrollments.views._sync_school_settings") as sync:
        objects.filter.return_value.values_list.return_value.first.return_value = "2025-2026"
        response = view.make_current(request, label="2026-2027")

    assert response.status_code == 200
    atomic.assert_called_once()
    # The old current year is unset first (the partial unique index allows
    # one at a time), then this one is set.
    objects.filter.assert_any_call(is_current=True)
    objects.filter.return_value.exclude.assert_called_once_with(pk=12)
    assert year.is_current is True
    save.assert_called_once_with(update_fields=["is_current", "updated_at"])
    sync.assert_called_once_with(year)
    assert response.data["state"] == "current"


# -- promotion target year -----------------------------------------------------

def test_promoting_into_a_year_nobody_set_up_is_refused_up_front():
    """Promotion creates enrollments directly, past the serializer, so without
    this every learner would fail on the foreign key one by one."""
    from rest_framework.parsers import JSONParser
    from enrollments.views import EnrollmentViewSet

    request = Request(factory.post("/api/enrollments/promote/preview/", {
        "from_school_year": "2025-2026", "from_grade_level": "Grade 7",
        "from_section": "Rizal", "to_school_year": "2026-2027",
    }, format="json"), parsers=[JSONParser()])
    request.user = _user("registrar")
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    with patch("enrollments.views.SchoolYear.objects") as objects, \
         patch("enrollments.views.Enrollment.objects") as enrollments:
        objects.filter.return_value.exists.return_value = False
        response = view.promote_preview(request)
    assert response.status_code == 400
    assert "hasn't been set up yet" in response.data["detail"]
    enrollments.filter.assert_not_called()
