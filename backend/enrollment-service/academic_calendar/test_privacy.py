"""
Who sees what on the calendar.

Personal events are private to their owner: every query is scoped to the
caller, so another person's event is a 404, admins included, and the owner is
always the caller, never something the request body names. Guardians read
the school calendar through their own endpoint, which shows only the events
the registrar left visible to them, never a grading period (the teachers'
grade deadline), and none of the staff-only fields.

No @pytest.mark.django_db: this service cannot build a test database (see
ai/test_risk_assessment.py). Querysets are checked by the SQL they would run.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from accounts.permissions import HasRole
from academic_calendar.models import CalendarEvent, PersonalEvent
from academic_calendar.serializers import (
    CalendarEventSerializer, GuardianCalendarEventSerializer, PersonalEventSerializer,
)
from academic_calendar.views import (
    CalendarEventViewSet, GuardianCalendarEventViewSet, PersonalEventViewSet,
)

factory = APIRequestFactory()
STAFF = ["super_admin", "admin", "registrar", "teacher", "accounting"]


def _user(role, user_id=7):
    return SimpleNamespace(user_id=user_id, role=role, is_authenticated=True)


def _view(cls, user, method="get"):
    request = Request(getattr(factory, method)("/"))
    request.user = user
    view = cls()
    view.request = request
    view.format_kwarg = None
    return view


def _allowed(cls, role, method="get"):
    view = _view(cls, _user(role), method)
    return HasRole().has_permission(view.request, view)


# -- personal events: private to their owner ---------------------------------

def test_personal_events_are_only_ever_the_callers_own():
    qs = _view(PersonalEventViewSet, _user("admin", user_id=7)).get_queryset()
    assert str(qs.query) == str(PersonalEvent.objects.filter(owner_user_id=7).query)


def test_an_admin_does_not_see_a_teachers_events():
    admin_sql = str(_view(PersonalEventViewSet, _user("super_admin", user_id=1)).get_queryset().query)
    assert '"owner_user_id" = 1' in admin_sql
    assert '"owner_user_id" = 2' not in admin_sql


def test_a_new_event_belongs_to_the_caller():
    view = _view(PersonalEventViewSet, _user("teacher", user_id=42), "post")
    serializer = MagicMock()
    view.perform_create(serializer)
    serializer.save.assert_called_once_with(owner_user_id=42)


def test_the_request_body_cannot_name_an_owner():
    s = PersonalEventSerializer(data={
        "title": "Dentist", "start_date": "2026-10-20", "end_date": "2026-10-20", "owner_user_id": 99,
    })
    assert s.is_valid(), s.errors
    assert "owner_user_id" not in s.validated_data
    assert "owner_user_id" not in PersonalEventSerializer.Meta.fields


def test_a_personal_event_cannot_end_before_it_starts():
    s = PersonalEventSerializer(data={"title": "Trip", "start_date": "2026-10-20", "end_date": "2026-10-19"})
    assert not s.is_valid()


@pytest.mark.parametrize("role", STAFF)
@pytest.mark.parametrize("method", ["get", "post", "patch", "delete"])
def test_every_staff_role_keeps_a_personal_calendar(role, method):
    assert _allowed(PersonalEventViewSet, role, method)


@pytest.mark.parametrize("method", ["get", "post"])
def test_guardians_have_no_personal_calendar(method):
    assert not _allowed(PersonalEventViewSet, "guardian", method)


# -- the guardian's school calendar -------------------------------------------

def test_guardians_see_only_events_left_visible_to_them_and_no_grading_period():
    sql = str(GuardianCalendarEventViewSet.queryset.query)
    assert '"visible_to_guardians"' in sql
    assert "grading_period" in sql and "NOT" in sql


def test_the_guardian_calendar_is_guardians_only_and_read_only():
    assert _allowed(GuardianCalendarEventViewSet, "guardian")
    for role in STAFF:
        assert not _allowed(GuardianCalendarEventViewSet, role)
    for action in ("create", "update", "partial_update", "destroy"):
        assert not hasattr(GuardianCalendarEventViewSet, action)


def test_a_guardian_is_not_sent_staff_only_fields():
    fields = set(GuardianCalendarEventSerializer.Meta.fields)
    assert {"grading_period", "visible_to_guardians", "created_at", "updated_at"}.isdisjoint(fields)


def test_staff_calendar_still_refuses_guardians():
    view = _view(CalendarEventViewSet, _user("guardian"))
    assert not CalendarEventViewSet.permission_classes[0]().has_permission(view.request, view)


# -- the visibility flag -------------------------------------------------------

def test_a_grading_period_is_never_visible_to_guardians():
    no_clash = MagicMock()
    no_clash.exists.return_value = False
    with patch.object(CalendarEvent.objects, "filter", return_value=no_clash):
        data = CalendarEventSerializer().validate({
            "school_year": "2026-2027", "event_type": "grading_period", "grading_period": "1st_quarter",
            "start_date": "2026-08-01", "end_date": "2026-10-20", "visible_to_guardians": True,
        })
    assert data["visible_to_guardians"] is False


@pytest.mark.parametrize("visible", [True, False])
def test_other_events_keep_the_registrars_choice(visible):
    data = CalendarEventSerializer().validate({
        "school_year": "2026-2027", "event_type": "event", "start_date": "2026-10-01",
        "end_date": "2026-10-01", "visible_to_guardians": visible,
    })
    assert data["visible_to_guardians"] is visible


def test_the_visibility_flag_is_sent_to_staff():
    assert "visible_to_guardians" in CalendarEventSerializer.Meta.fields


# -- date windows ---------------------------------------------------------------

@pytest.mark.parametrize("cls, model", [
    (PersonalEventViewSet, PersonalEvent),
    (GuardianCalendarEventViewSet, CalendarEvent),
])
def test_both_new_lists_filter_by_a_window_of_days(cls, model):
    filters = DjangoFilterBackend().get_filterset_class(cls(), model.objects.all()).base_filters
    assert filters["end_date__gte"].lookup_expr == "gte"
    assert filters["start_date__lte"].lookup_expr == "lte"
