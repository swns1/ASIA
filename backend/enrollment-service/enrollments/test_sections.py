"""
Tests for sections per school year: placement resolution on enrollments and
advisories, SectionSerializer's rules, carry-over, the section API's delete
and strand handling, and promotion's destination check.

No database (see test_school_years.py): ORM calls and transactions are mocked.
"""
from contextlib import nullcontext
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.db import IntegrityError
from rest_framework import serializers
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.models import SchoolYear, Section
from enrollments.serializers import SectionSerializer, resolve_placement_section
from enrollments.views import EnrollmentViewSet, SchoolYearViewSet, SectionViewSet
from shared.permissions import IsAdminRegistrarOrReadOnly

factory = APIRequestFactory()


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _year(label="2026-2027", pk=1, archived=False):
    first = int(label[:4])
    return SchoolYear(
        school_year_id=pk, label=label,
        start_date=date(first, 6, 8), end_date=date(first + 1, 3, 31),
        archived_at=date(2030, 1, 1) if archived else None,
    )


def _section(name="Rizal", grade="Grade 7", level="junior_highschool", strand=None, year="2026-2027", pk=None):
    return Section(
        section_id=pk, school_year_id=year, school_level=level,
        grade_level=grade, name=name, strand=strand,
    )


# -- placement resolution -----------------------------------------------------

def _resolve(attrs, found=None, instance=None):
    with patch("enrollments.serializers.Section.objects") as objects:
        objects.filter.return_value.only.return_value.first.return_value = found
        result = resolve_placement_section(dict(attrs), instance)
    return result, objects


def test_an_unknown_section_gets_a_message_instead_of_a_500():
    with pytest.raises(serializers.ValidationError) as exc:
        _resolve({"school_year": "2026-2027", "grade_level": "Grade 7", "section": "Rizall"})
    assert "has no section named" in str(exc.value.detail["section"])


def test_the_sections_own_spelling_is_stored():
    """The defect this replaces: "rizal" and "Rizal" were two classes, and
    a teacher advising one could not see the learners filed under the other."""
    result, objects = _resolve(
        {"school_year": "2026-2027", "grade_level": "Grade 7", "section": " rizal "},
        found=_section("Rizal"),
    )
    assert result["section"] == "Rizal"
    objects.filter.assert_called_once_with(
        school_year_id="2026-2027", grade_level="Grade 7", name__iexact="rizal",
    )


def test_a_senior_high_learner_takes_the_sections_strand():
    result, _ = _resolve(
        {"school_year": "2026-2027", "grade_level": "Grade 11", "section": "STEM-A", "strand": "ABM"},
        found=_section("STEM-A", "Grade 11", "senior_highschool", strand="STEM"),
    )
    assert result["strand"] == "STEM"


def test_an_update_that_leaves_the_placement_alone_is_not_rechecked():
    instance = SimpleNamespace(school_year="2026-2027", grade_level="Grade 7", section="Rizal")
    result, objects = _resolve({"enrollment_status": "enrolled"}, instance=instance)
    assert result == {"enrollment_status": "enrolled"}
    objects.filter.assert_not_called()


# -- SectionSerializer ----------------------------------------------------------

def _validate(data, instance=None, clash=False, year=None):
    year = year or _year()
    with patch("enrollments.serializers.SchoolYear.objects") as years, \
         patch("enrollments.serializers.Section.objects") as sections:
        years.get.return_value = year
        existing = _section("Rizal") if clash else None
        sections.filter.return_value.first.return_value = existing
        sections.filter.return_value.exclude.return_value.first.return_value = existing
        serializer = SectionSerializer(instance=instance, data=data, partial=instance is not None)
        # SlugRelatedField looks the year up through its queryset.
        serializer.fields["school_year"].queryset = MagicMock(get=MagicMock(return_value=year))
        ok = serializer.is_valid()
    return ok, serializer


def _payload(**overrides):
    base = {"school_year": "2026-2027", "school_level": "junior_highschool",
            "grade_level": "Grade 7", "name": "Rizal"}
    base.update(overrides)
    return base


def test_a_section_is_accepted_and_its_name_tidied():
    ok, serializer = _validate(_payload(name="  Rizal   Hall "))
    assert ok, serializer.errors
    assert serializer.validated_data["name"] == "Rizal Hall"
    assert serializer.validated_data["strand"] is None


def test_the_grade_must_belong_to_the_level():
    ok, serializer = _validate(_payload(grade_level="Grade 3"))
    assert not ok
    assert "grade_level" in serializer.errors


def test_senior_high_sections_need_a_strand():
    ok, serializer = _validate(_payload(school_level="senior_highschool", grade_level="Grade 11", name="STEM-A"))
    assert not ok
    assert serializer.errors["strand"] == ["Senior High sections belong to a strand."]


def test_a_strand_below_senior_high_is_dropped():
    ok, serializer = _validate(_payload(strand="STEM"))
    assert ok, serializer.errors
    assert serializer.validated_data["strand"] is None


def test_names_are_unique_per_grade_whatever_the_case():
    ok, serializer = _validate(_payload(name="rizal"), clash=True)
    assert not ok
    # Names the section that exists, in its own spelling.
    assert serializer.errors["name"] == ["Grade 7 already has a section named \u201cRizal\u201d in S.Y. 2026-2027."]


def test_a_section_cannot_move_to_another_grade():
    """Moving it would carry every enrolled learner with it -- the foreign
    key cascades -- so that is a new section, not an edit."""
    instance = _section(pk=4)
    instance.school_year = _year()
    ok, serializer = _validate({"grade_level": "Grade 8"}, instance=instance)
    assert not ok
    assert "can't move" in serializer.errors["grade_level"][0]


# -- permissions --------------------------------------------------------------

@pytest.mark.parametrize("role,method,allowed", [
    ("teacher", "get", True),
    ("guardian", "get", False),
    ("teacher", "post", False),
    ("registrar", "post", True),   # quick-add while enrolling
    ("admin", "post", True),
])
def test_registrars_can_add_sections_teachers_cannot(role, method, allowed):
    request = getattr(factory, method)("/api/sections/")
    request.user = _user(role)
    assert IsAdminRegistrarOrReadOnly().has_permission(request, SectionViewSet()) is allowed


# -- carry-over ---------------------------------------------------------------

_LAST_YEAR = object()


def _carry(body, target=None, source=_LAST_YEAR, source_sections=(), target_sections=()):
    target = target or _year("2026-2027", pk=2)
    source = _year("2025-2026", pk=1) if source is _LAST_YEAR else source
    request = Request(
        factory.post("/api/school-years/2026-2027/carry-over/", body, format="json"),
        parsers=[JSONParser()],
    )
    request.user = _user("admin")
    view = SchoolYearViewSet()
    view.request, view.format_kwarg, view.action = request, None, "carry_over"
    view.kwargs = {"label": target.label}

    def section_filter(school_year):
        rows = source_sections if school_year is source else target_sections
        qs = MagicMock()
        qs.values_list.return_value = [(s.grade_level, s.name) for s in rows]
        qs.order_by.return_value = list(rows)
        return qs

    with patch.object(view, "get_object", return_value=target), \
         patch("enrollments.views.SchoolYear.objects") as years, \
         patch("enrollments.views.Section.objects") as sections, \
         patch("enrollments.views.transaction.atomic", return_value=nullcontext()):
        years.filter.return_value.first.return_value = source
        sections.filter.side_effect = section_filter
        response = view.carry_over(request, label=target.label)
    return response, sections


LAST_YEAR = [
    _section("Rizal", year="2025-2026"),
    _section("Mabini", year="2025-2026"),
    _section("STEM-A", "Grade 11", "senior_highschool", "STEM", year="2025-2026"),
]


def test_carry_over_copies_what_this_year_lacks_and_skips_the_rest():
    response, sections = _carry(
        {"from": "2025-2026", "parts": ["sections"]},
        source_sections=LAST_YEAR,
        target_sections=[_section("RIZAL")],   # added by hand, different case
    )
    assert response.status_code == 200
    assert [r["name"] for r in response.data["sections"]["copied"]] == ["Mabini", "STEM-A"]
    assert [r["name"] for r in response.data["sections"]["skipped"]] == ["Rizal"]
    created = sections.bulk_create.call_args.args[0]
    assert [(s.grade_level, s.name, s.strand, s.school_level) for s in created] == [
        ("Grade 7", "Mabini", None, "junior_highschool"),
        ("Grade 11", "STEM-A", "STEM", "senior_highschool"),
    ]


def test_a_dry_run_previews_without_writing():
    response, sections = _carry(
        {"from": "2025-2026", "parts": ["sections"], "dry_run": True},
        source_sections=LAST_YEAR,
    )
    assert response.data["dry_run"] is True
    assert len(response.data["sections"]["copied"]) == 3
    sections.bulk_create.assert_not_called()


def test_carry_over_needs_a_different_registered_year():
    target = _year("2026-2027", pk=2)
    response, _ = _carry({"from": "2026-2027"}, target=target, source=target)
    assert response.status_code == 400

    response, _ = _carry({"from": "2019-2020"}, source=None)
    assert response.status_code == 400
    assert "isn't a registered year" in response.data["detail"]


def test_carry_over_refuses_parts_that_dont_exist_yet():
    response, _ = _carry({"from": "2025-2026", "parts": ["fees"]})
    assert response.status_code == 400
    assert "fees" in response.data["detail"]


# -- section API: delete and strand -------------------------------------------

def _section_view(action, method="delete"):
    request = Request(getattr(factory, method)("/api/sections/4/"))
    request.user = _user("admin")
    view = SectionViewSet()
    view.request, view.format_kwarg, view.action = request, None, action
    view.kwargs = {"pk": 4}
    return view, request


def test_a_section_with_learners_cannot_be_deleted():
    view, request = _section_view("destroy")
    section = MagicMock(spec=Section, grade_level="Grade 7", name="Rizal")
    section.delete.side_effect = IntegrityError("violates foreign key constraint")
    with patch.object(view, "get_object", return_value=section), \
         patch("enrollments.archive.archived_among", return_value=set()), \
         patch("enrollments.views.transaction.atomic", return_value=nullcontext()):
        response = view.destroy(request, pk=4)
    assert response.status_code == 409
    assert "still has learners or an adviser" in response.data["detail"]


def test_changing_a_sections_strand_moves_its_learners_with_it():
    view, _ = _section_view("partial_update", method="patch")
    section = _section("STEM-A", "Grade 11", "senior_highschool", "STEM", pk=4)
    serializer = MagicMock(instance=section)

    def save():
        section.strand = "ABM"
        return section
    serializer.save.side_effect = save

    with patch("enrollments.views.transaction.atomic", return_value=nullcontext()), \
         patch("enrollments.archive.archived_among", return_value=set()), \
         patch("enrollments.views.Enrollment.objects") as enrollments, \
         patch("enrollments.views.SectionAdvisory.objects") as advisories:
        view.perform_update(serializer)
    placed = dict(school_year="2026-2027", grade_level="Grade 11", section="STEM-A")
    enrollments.filter.assert_called_once_with(**placed)
    enrollments.filter.return_value.update.assert_called_once_with(strand="ABM")
    advisories.filter.return_value.update.assert_called_once_with(strand="ABM")


# -- promotion ----------------------------------------------------------------

def test_promotion_needs_a_real_destination_section():
    """The destination used to default to the source section's name whether
    or not next year had such a section."""
    request = Request(factory.post("/api/enrollments/promote/preview/", {
        "from_school_year": "2025-2026", "from_grade_level": "Grade 7",
        "from_section": "Rizal", "to_school_year": "2026-2027",
    }, format="json"), parsers=[JSONParser()])
    request.user = _user("registrar")
    view = EnrollmentViewSet()
    view.request, view.format_kwarg = request, None
    with patch("enrollments.views.SchoolYear.objects") as years, \
         patch("enrollments.views.Section.objects") as sections, \
         patch("enrollments.views.Enrollment.objects") as enrollments:
        years.filter.return_value.exists.return_value = True
        sections.filter.return_value.first.return_value = None
        response = view.promote_preview(request)
    assert response.status_code == 400
    assert response.data["reason"] == "unknown_section"
    sections.filter.assert_called_once_with(
        school_year_id="2026-2027", grade_level="Grade 8", name__iexact="Rizal",
    )
    enrollments.filter.assert_not_called()


# -- Senior High promotion: semesters -----------------------------------------

def _shs_promote(confirm=False):
    ana = SimpleNamespace(student_id=1, last_name="Cruz", first_name="Ana")
    ben = SimpleNamespace(student_id=2, last_name="Reyes", first_name="Ben")
    source = [
        SimpleNamespace(student_id=1, student=ana, semester="1st"),
        SimpleNamespace(student_id=1, student=ana, semester="2nd"),
        SimpleNamespace(student_id=2, student=ben, semester="1st"),   # 2nd not done
    ]

    def enrollment_filter(**kwargs):
        qs = MagicMock()
        if kwargs.get("enrollment_status") == "completed":      # the source section
            qs.select_related.return_value = MagicMock(
                exists=lambda: True, __iter__=lambda self: iter(source),
            )
        else:                                                   # already enrolled
            qs.values_list.return_value = []
        return qs

    url = "/api/enrollments/promote/" + ("confirm/" if confirm else "preview/")
    request = Request(factory.post(url, {
        "from_school_year": "2025-2026", "from_grade_level": "Grade 11",
        "from_section": "STEM-A", "to_school_year": "2026-2027", "to_section": "STEM-A",
    }, format="json"), parsers=[JSONParser()])
    request.user = _user("registrar")
    view = EnrollmentViewSet()
    view.request, view.format_kwarg = request, None
    with patch("enrollments.views.SchoolYear.objects") as years, \
         patch("enrollments.views.Section.objects") as sections, \
         patch("enrollments.views.Enrollment.objects") as enrollments, \
         patch("grades.models.Grade.objects") as grades, \
         patch("enrollments.views.transaction.atomic", return_value=nullcontext()):
        years.filter.return_value.exists.return_value = True
        sections.filter.return_value.first.return_value = _section(
            "STEM-A", "Grade 12", "senior_highschool", "STEM",
        )
        enrollments.filter.side_effect = enrollment_filter
        enrollments.create.return_value = SimpleNamespace(enrollment_id=900)
        grades.filter.return_value.select_related.return_value = []
        response = (view.promote_confirm if confirm else view.promote_preview)(request)
    return response, enrollments


def test_grade_11_is_promoted_from_its_2nd_semester_once():
    """The defect: every completed row was promoted, so a learner with both
    semesters done appeared twice, and one with only the 1st semester done
    was moved into Grade 12."""
    response, _ = _shs_promote()
    assert response.status_code == 200
    assert [p["student_id"] for p in response.data["to_promote"]] == [1]
    assert response.data["to_skip"] == [{
        "student_id": 2, "student_name": "Reyes, Ben",
        "reason": "Hasn't completed Grade 11's 2nd semester yet.", "average": None,
    }]
    assert response.data["to_semester"] == "1st"


def test_grade_12_enrollments_open_the_1st_semester_with_the_sections_strand():
    """The defect: the new enrollment had no semester, which the enrollments
    CHECK refuses for Senior High, so every Grade 11 -> 12 promotion failed."""
    response, enrollments = _shs_promote(confirm=True)
    assert [c["student_id"] for c in response.data["created"]] == [1]
    kwargs = enrollments.create.call_args.kwargs
    assert kwargs["semester"] == "1st"
    assert kwargs["strand"] == "STEM"
    assert kwargs["grade_level"] == "Grade 12"
    enrollments.create.assert_called_once()
