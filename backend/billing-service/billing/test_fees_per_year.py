"""
Tests for fees per school year: an invoice is built from its enrollment's own
year's schedule, a schedule is created for a registered, unarchived year and
stays in it, an earlier year's fees copy across without overwriting, and an
archived year's fees are read-only.

No database, matching test_services.py: the ORM and the school-year registry
(SchoolYearMirror, another service's table) are mocked.
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from billing import services
from billing.archive import YearArchived
from billing.models import FeeSchedule, FeeScheduleItem
from billing.serializers import FeeScheduleSerializer
from billing.views import FeeScheduleItemViewSet, FeeScheduleViewSet

factory = APIRequestFactory()
REGISTRY = {"2025-2026": None, "2026-2027": None, "2024-2025": "2030-01-01T00:00:00Z"}   # label → archived_at


def _registry(registry=REGISTRY):
    """Mocks SchoolYearMirror for every query shape the fee code uses."""
    objects = MagicMock()

    def filter_(**kwargs):
        qs = MagicMock()
        if "label__in" in kwargs:
            rows = [{"label": l, "archived_at": registry[l]} for l in kwargs["label__in"] if l in registry]
            qs.values.return_value = rows
        else:
            label = kwargs["label"]
            known = label in registry
            archived = known and registry[label] is not None
            qs.values.return_value.first.return_value = {"archived_at": registry[label]} if known else None
            qs.exists.return_value = archived if "archived_at__isnull" in kwargs else known
        return qs

    objects.filter.side_effect = filter_
    return patch("billing.enrollment_mirror.SchoolYearMirror.objects", objects)


# -- invoices use their own year's fees ---------------------------------------

def test_the_fee_lookup_is_for_one_year():
    with patch("billing.services.FeeSchedule.objects") as objects:
        objects.filter.return_value.first.return_value = None
        assert services._read_fee_schedule("2026-2027", "junior_highschool", "Grade 7") is None
    objects.filter.assert_called_once_with(
        school_year="2026-2027", school_level="junior_highschool", grade_level="Grade 7", is_active=True,
    )


def test_an_enrollment_is_billed_from_its_own_years_schedule():
    enrollment = {"enrollment_id": 4, "student_id": 9, "school_level": "junior_highschool",
                  "grade_level": "Grade 7", "school_year": "2027-2028", "enrollment_status": "enrolled"}
    with patch("billing.services._fetch_enrollment", return_value=enrollment), \
         patch("billing.services._read_fee_schedule", return_value=None) as lookup:
        with pytest.raises(ValueError) as exc:
            services._build_invoice_for_enrollment(4, "monthly")
    lookup.assert_called_once_with("2027-2028", "junior_highschool", "Grade 7")
    assert "S.Y. 2027-2028 has no active fee schedule for Grade 7" in str(exc.value)
    assert "copy an earlier year's fees" in str(exc.value)


# -- creating and editing a schedule --------------------------------------------

def _validate(data, instance=None, duplicate=False):
    with _registry(), patch("billing.serializers.FeeSchedule.objects") as schedules:
        schedules.filter.return_value.exists.return_value = duplicate
        serializer = FeeScheduleSerializer(instance=instance, data=data, partial=instance is not None)
        return serializer.is_valid(), serializer


GRADE_7 = {"school_year": "2026-2027", "school_level": "junior_highschool", "grade_level": "Grade 7"}


def test_a_schedule_is_for_a_registered_open_year():
    assert _validate(GRADE_7)[0]

    valid, serializer = _validate({**GRADE_7, "school_year": "2031-2032"})
    assert not valid and "hasn't been set up yet" in str(serializer.errors["school_year"])

    valid, serializer = _validate({**GRADE_7, "school_year": "2024-2025"})
    assert not valid and "archived" in str(serializer.errors["school_year"])


def test_one_schedule_per_grade_per_year():
    valid, serializer = _validate(GRADE_7, duplicate=True)
    assert not valid
    assert "S.Y. 2026-2027 already has a Grade 7 fee schedule" in str(serializer.errors["grade_level"])


def test_a_schedule_stays_in_its_year():
    schedule = FeeSchedule(fee_schedule_id=1, **GRADE_7)
    valid, serializer = _validate({"school_year": "2025-2026"}, instance=schedule)
    assert not valid and "stays in its year and grade" in str(serializer.errors["school_year"])
    # Everything else stays editable.
    assert _validate({"notes": "Rates approved in March."}, instance=schedule)[0]


# -- an archived year's fees are read-only -------------------------------------

def test_an_archived_years_fee_items_cannot_change():
    schedule = FeeSchedule(fee_schedule_id=3, school_year="2024-2025",
                           school_level="junior_highschool", grade_level="Grade 7")
    serializer = MagicMock(validated_data={"fee_schedule": schedule})
    with _registry(), patch("billing.views.recalculate_invoices_for_schedule") as recalc:
        with pytest.raises(YearArchived) as exc:
            FeeScheduleItemViewSet().perform_create(serializer)
    assert "S.Y. 2024-2025 is archived, so its fees are read-only" in str(exc.value.detail)
    serializer.save.assert_not_called()
    recalc.assert_not_called()

    item = FeeScheduleItem(fee_schedule=schedule, item_category="tuition", item_name="Tuition", amount=1)
    item.delete = MagicMock()
    with _registry(), patch("billing.views.recalculate_invoices_for_schedule"):
        with pytest.raises(YearArchived):
            FeeScheduleItemViewSet().perform_destroy(item)
    item.delete.assert_not_called()


def test_an_open_years_fee_items_recalculate_as_before():
    schedule = FeeSchedule(fee_schedule_id=3, **GRADE_7)
    serializer = MagicMock(validated_data={"fee_schedule": schedule})
    serializer.save.return_value = SimpleNamespace(fee_schedule_id=3)
    with _registry(), patch("billing.views.recalculate_invoices_for_schedule") as recalc:
        FeeScheduleItemViewSet().perform_create(serializer)
    recalc.assert_called_once_with(3)


# -- copying an earlier year's fees ----------------------------------------------

def _schedule(grade, level="junior_highschool", amounts=(Decimal("20000"), Decimal("3500"))):
    schedule = MagicMock(school_level=level, grade_level=grade, is_active=True, notes=None)
    schedule.items.all.return_value = [
        SimpleNamespace(item_category=cat, item_name=name, amount=amt, sort_order=i)
        for i, (cat, name, amt) in enumerate(zip(("tuition", "misc"), ("Tuition", "Books"), amounts))
    ]
    return schedule


def _carry(body, source=(), target=()):
    request = Request(factory.post("/api/fee-schedules/carry-over/", body, format="json"),
                      parsers=[JSONParser()])
    request.user = SimpleNamespace(role="accounting", user_id=2, is_authenticated=True)
    view = FeeScheduleViewSet()
    view.request, view.format_kwarg, view.action = request, None, "carry_over"

    def schedule_filter(school_year):
        qs = MagicMock()
        rows = source if school_year == body.get("from") else target
        qs.values_list.return_value = [(s.school_level, s.grade_level) for s in rows]
        qs.prefetch_related.return_value.order_by.return_value = list(rows)
        return qs

    with _registry(), \
         patch("billing.views.FeeSchedule.objects") as schedules, \
         patch("billing.views.FeeScheduleItem.objects") as items, \
         patch("billing.views.transaction.atomic"):
        schedules.filter.side_effect = schedule_filter
        schedules.create.side_effect = lambda **kw: FeeSchedule(**kw)
        response = view.carry_over(request)
    return response, schedules, items


def test_an_earlier_years_fees_copy_across_without_overwriting():
    response, schedules, items = _carry(
        {"from": "2025-2026", "to": "2026-2027"},
        source=[_schedule("Grade 7"), _schedule("Grade 8")],
        target=[_schedule("Grade 7", amounts=(Decimal("22000"), Decimal("3600")))],   # already set up
    )
    assert response.status_code == 200
    assert [r["grade_level"] for r in response.data["fees"]["copied"]] == ["Grade 8"]
    assert response.data["fees"]["copied"][0] == {
        "school_level": "junior_highschool", "grade_level": "Grade 8", "items": 2, "total": "23500",
    }
    assert [r["grade_level"] for r in response.data["fees"]["skipped"]] == ["Grade 7"]

    schedules.create.assert_called_once()
    assert schedules.create.call_args.kwargs["school_year"] == "2026-2027"
    copied_items = items.bulk_create.call_args.args[0]
    assert [(i.item_name, i.amount) for i in copied_items] == [("Tuition", Decimal("20000")), ("Books", Decimal("3500"))]


def test_a_fee_copy_preview_writes_nothing():
    response, schedules, items = _carry(
        {"from": "2025-2026", "to": "2026-2027", "dry_run": True}, source=[_schedule("Grade 7")],
    )
    assert response.data["dry_run"] is True
    assert len(response.data["fees"]["copied"]) == 1
    schedules.create.assert_not_called()
    items.bulk_create.assert_not_called()


def test_fees_copy_between_two_different_registered_years_into_an_open_one():
    response, _, _ = _carry({"from": "2019-2020", "to": "2026-2027"})
    assert response.status_code == 400 and "isn't a registered year" in response.data["detail"]

    response, _, _ = _carry({"from": "2026-2027", "to": "2026-2027"})
    assert response.status_code == 400

    with pytest.raises(YearArchived):
        _carry({"from": "2025-2026", "to": "2024-2025"})
