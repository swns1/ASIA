"""
Tests for advisers per school year: the one roster query every teacher-scoped
path shares (advisory_roster), and carrying a year's advisers over to another
year's sections.

No database (see test_school_years.py): ORM calls and transactions are mocked.
"""
from contextlib import nullcontext
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.models import SchoolYear, SectionAdvisory, advisory_roster
from enrollments.views import SchoolYearViewSet

factory = APIRequestFactory()


# -- advisory_roster ----------------------------------------------------------

def _advisory(section="Rizal", grade="Grade 7", level="junior_highschool", strand=None,
              year="2025-2026", teacher=7):
    return SectionAdvisory(
        teacher_user_id=teacher, school_year=year, school_level=level,
        grade_level=grade, section=section, strand=strand,
    )


def test_the_roster_is_the_sections_enrolled_learners():
    with patch("enrollments.models.Enrollment.objects") as objects:
        advisory_roster(_advisory())
    objects.filter.assert_called_once_with(
        school_year="2025-2026", school_level="junior_highschool",
        grade_level="Grade 7", section="Rizal", enrollment_status="enrolled",
    )
    objects.filter.return_value.filter.assert_not_called()


def test_a_senior_high_roster_is_narrowed_to_the_strand():
    with patch("enrollments.models.Enrollment.objects") as objects:
        qs = advisory_roster(_advisory("STEM-A", "Grade 11", "senior_highschool", "STEM"))
    objects.filter.return_value.filter.assert_called_once_with(strand="STEM")
    assert qs is objects.filter.return_value.filter.return_value


# -- carry-over: advisers -----------------------------------------------------

def _year(label, pk):
    first = int(label[:4])
    return SchoolYear(
        school_year_id=pk, label=label,
        start_date=date(first, 6, 8), end_date=date(first + 1, 3, 31),
    )


LAST, THIS = _year("2025-2026", 1), _year("2026-2027", 2)


def _sec(name, grade="Grade 7", strand=None):
    return {"grade_level": grade, "name": name, "strand": strand}


def _carry(body, *, source_advisers=(), target_advisers=(), target_sections=(),
           source_sections=(), teachers=None, inactive=()):
    """Run carry_over with the ORM mocked. `teachers` maps user_id → name for
    accounts that are still teachers; by default every source adviser is.
    Ids in `inactive` are teacher accounts that have been deactivated."""
    if teachers is None:
        teachers = {a.teacher_user_id: f"Teacher {a.teacher_user_id}" for a in source_advisers}

    request = Request(
        factory.post("/api/school-years/2026-2027/carry-over/", body, format="json"),
        parsers=[JSONParser()],
    )
    request.user = SimpleNamespace(role="admin", user_id=1, is_authenticated=True)
    view = SchoolYearViewSet()
    view.request, view.format_kwarg, view.action = request, None, "carry_over"
    view.kwargs = {"label": THIS.label}

    def section_filter(school_year):
        rows = source_sections if school_year is LAST else target_sections
        qs = MagicMock()
        qs.values_list.return_value = [(r["grade_level"], r["name"]) for r in rows]
        qs.values.return_value = [dict(r) for r in rows]
        qs.order_by.return_value = [SimpleNamespace(**r) for r in rows]
        return qs

    def advisory_filter(school_year):
        qs = MagicMock()
        if school_year == LAST.label:
            qs.order_by.return_value = list(source_advisers)
        else:
            qs.values_list.return_value = [
                (a.grade_level, a.section, a.teacher_user_id) for a in target_advisers
            ]
        return qs

    with patch.object(view, "get_object", return_value=THIS), \
         patch("enrollments.views.SchoolYear.objects") as years, \
         patch("enrollments.views.Section.objects") as sections, \
         patch("enrollments.views.SectionAdvisory.objects") as advisories, \
         patch("accounts.models.User.objects") as users, \
         patch("enrollments.views.transaction.atomic", return_value=nullcontext()):
        years.filter.return_value.first.return_value = LAST
        sections.filter.side_effect = section_filter
        advisories.filter.side_effect = advisory_filter
        users.filter.return_value.values_list.return_value = [
            (user_id, name, user_id not in inactive) for user_id, name in teachers.items()
        ]
        response = view.carry_over(request, label=THIS.label)
    return response, advisories, sections, users


def test_advisers_follow_their_section_into_the_new_year():
    response, advisories, _, users = _carry(
        {"from": "2025-2026", "parts": ["advisers"]},
        source_advisers=[
            _advisory("Rizal", teacher=7),
            _advisory("stem-a", "Grade 11", "senior_highschool", "STEM", teacher=8),
        ],
        target_sections=[_sec("Rizal"), _sec("STEM-A", "Grade 11", "STEM")],
    )
    assert response.status_code == 200
    assert response.data["advisers"]["skipped"] == []
    created = advisories.bulk_create.call_args.args[0]
    assert [
        (a.teacher_user_id, a.school_year, a.school_level, a.grade_level, a.section, a.strand)
        for a in created
    ] == [
        (7, "2026-2027", "junior_highschool", "Grade 7", "Rizal", None),
        # Filed under this year's spelling of the section, with its strand.
        (8, "2026-2027", "senior_highschool", "Grade 11", "STEM-A", "STEM"),
    ]
    assert response.data["advisers"]["copied"][0]["teacher_name"] == "Teacher 7"
    # Only accounts that are still teachers count.
    assert users.filter.call_args.kwargs["role"] == "teacher"


def test_an_adviser_is_never_overwritten_or_duplicated():
    response, advisories, _, _ = _carry(
        {"from": "2025-2026", "parts": ["advisers"]},
        source_advisers=[
            _advisory("Rizal", teacher=7),     # Rizal already has teacher 9
            _advisory("Mabini", teacher=8),    # teacher 8 already advises Mabini
            _advisory("Luna", teacher=10),     # no Luna this year
        ],
        target_sections=[_sec("Rizal"), _sec("Mabini")],
        target_advisers=[_advisory("Rizal", teacher=9, year="2026-2027"),
                         _advisory("MABINI", teacher=8, year="2026-2027")],
    )
    skipped = {r["section"]: r["reason"] for r in response.data["advisers"]["skipped"]}
    assert skipped == {"Rizal": "has_adviser", "Mabini": "already", "Luna": "no_section"}
    assert response.data["advisers"]["copied"] == []
    advisories.bulk_create.assert_not_called()


def test_co_advisers_carry_over_together():
    response, advisories, _, _ = _carry(
        {"from": "2025-2026", "parts": ["advisers"]},
        source_advisers=[_advisory("Rizal", teacher=7), _advisory("Rizal", teacher=8)],
        target_sections=[_sec("Rizal")],
    )
    assert [a.teacher_user_id for a in advisories.bulk_create.call_args.args[0]] == [7, 8]


def test_a_teacher_who_has_left_is_not_carried_over():
    response, advisories, _, _ = _carry(
        {"from": "2025-2026", "parts": ["advisers"]},
        source_advisers=[_advisory("Rizal", teacher=7)],
        target_sections=[_sec("Rizal")],
        teachers={},     # account deleted, or no longer a teacher
    )
    assert response.data["advisers"]["skipped"][0]["reason"] == "not_a_teacher"
    advisories.bulk_create.assert_not_called()


def test_a_deactivated_teacher_is_not_carried_over():
    response, advisories, _, _ = _carry(
        {"from": "2025-2026", "parts": ["advisers"]},
        source_advisers=[_advisory("Rizal", teacher=7), _advisory("Mabini", teacher=8)],
        target_sections=[_sec("Rizal"), _sec("Mabini")],
        inactive={7},
    )
    skipped = response.data["advisers"]["skipped"]
    assert [(r["teacher_user_id"], r["reason"], r["teacher_name"]) for r in skipped] == [
        (7, "inactive", "Teacher 7"),
    ]
    assert [a.teacher_user_id for a in advisories.bulk_create.call_args.args[0]] == [8]


def test_a_dry_run_of_both_counts_advisers_for_sections_it_would_add():
    response, advisories, sections, _ = _carry(
        {"from": "2025-2026", "parts": ["sections", "advisers"], "dry_run": True},
        source_sections=[_sec("Rizal")],
        source_advisers=[_advisory("Rizal", teacher=7)],
    )
    assert [r["name"] for r in response.data["sections"]["copied"]] == ["Rizal"]
    assert [r["section"] for r in response.data["advisers"]["copied"]] == ["Rizal"]
    sections.bulk_create.assert_not_called()
    advisories.bulk_create.assert_not_called()


def test_advisers_alone_need_the_sections_to_exist_already():
    response, _, _, _ = _carry(
        {"from": "2025-2026", "parts": ["advisers"], "dry_run": True},
        source_advisers=[_advisory("Rizal", teacher=7)],
    )
    assert response.data["advisers"]["skipped"][0]["reason"] == "no_section"
    assert "sections" not in response.data


# -- who can be made an adviser -----------------------------------------------

def _validate_teacher(value, account, instance=None):
    """SectionAdvisorySerializer.validate_teacher_user_id with the `users`
    lookup mocked to find `account` (None: no such user)."""
    from enrollments.serializers import SectionAdvisorySerializer

    serializer = SectionAdvisorySerializer(instance=instance)
    with patch("accounts.models.User.objects") as users:
        users.filter.return_value.values.return_value.first.return_value = account
        return serializer.validate_teacher_user_id(value), users


def test_an_active_teacher_can_be_made_an_adviser():
    value, users = _validate_teacher(7, {"role": "teacher", "is_active": True})
    assert value == 7
    users.filter.assert_called_once_with(user_id=7)


@pytest.mark.parametrize("account, message", [
    (None, "Choose a teacher account."),
    ({"role": "guardian", "is_active": True}, "Choose a teacher account."),
    ({"role": "registrar", "is_active": True}, "Choose a teacher account."),
    ({"role": "teacher", "is_active": False}, "This teacher's account is inactive."),
])
def test_only_an_active_teacher_can_be_made_an_adviser(account, message):
    with pytest.raises(ValidationError) as exc:
        _validate_teacher(7, account)
    assert exc.value.detail == [message]


def test_keeping_a_deactivated_teachers_existing_advisory_is_allowed():
    value, users = _validate_teacher(
        7, {"role": "teacher", "is_active": False}, instance=_advisory(teacher=7),
    )
    assert value == 7
    users.filter.assert_not_called()


def test_moving_an_advisory_to_a_deactivated_teacher_is_refused():
    with pytest.raises(ValidationError):
        _validate_teacher(9, {"role": "teacher", "is_active": False}, instance=_advisory(teacher=7))
