"""
The school form endpoints: who may download what, what gets refused, and the
response a browser receives. The loaders and builders are patched out (no
test database; see enrollments/fake_orm.py); test_sf1/sf2/sf10 cover them.
"""
import json
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

import openpyxl
import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from enrollments.fake_orm import FakeQuerySet
from school_forms import data, views

factory = APIRequestFactory()
# Read before the fixture below swaps them out for each test.
THROTTLES = tuple(views.SchoolFormView.throttle_classes)
SF1_QUERY = {"school_year": "2026-2027", "grade_level": "Grade 7", "section": "Rizal"}
SF2_QUERY = {**SF1_QUERY, "month": "2026-09"}
SY_DATES = (date(2026, 6, 8), date(2027, 4, 8))


@pytest.fixture(autouse=True)
def no_throttling(monkeypatch):
    # Throttle counters live in the shared file cache; one test file's worth
    # of requests from user 1 must not trip another's 30/minute.
    monkeypatch.setattr(views.SchoolFormView, "throttle_classes", [])


@pytest.fixture(autouse=True)
def school_year_dates():
    with patch("school_forms.serializers.configured_dates", return_value=SY_DATES):
        yield


def user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def call(view, path, params, as_user, **kwargs):
    request = factory.get(path, params)
    force_authenticate(request, user=as_user)
    return view.as_view()(request, **kwargs)


def built(level="junior_highschool", warnings=()):
    """What a loader and builder return, minus the work."""
    loaded = SimpleNamespace(section=SimpleNamespace(school_level=level),
                             learner=SimpleNamespace(lrn="109100000005", last_name="Dela Cruz"))
    return loaded, (openpyxl.Workbook(), list(warnings))


def sf1(params, as_user, level="junior_highschool", warnings=(), advisories=()):
    loaded, result = built(level, warnings)
    with patch.object(data, "load_register", return_value=loaded) as load, \
         patch("school_forms.views.sf1.build", return_value=result), \
         patch("school_forms.views.SectionAdvisory.objects", FakeQuerySet(advisories)):
        response = call(views.SF1View, "/api/school-forms/sf1/", params, as_user)
    return response, load


def sf2(params, as_user, advisories=()):
    loaded, result = built()
    with patch.object(data, "load_attendance", return_value=loaded) as load, \
         patch("school_forms.views.sf2.build", return_value=result), \
         patch("school_forms.views.SectionAdvisory.objects", FakeQuerySet(advisories)):
        response = call(views.SF2View, "/api/school-forms/sf2/", params, as_user)
    return response, load


def sf10(params, as_user, roster=frozenset()):
    loaded, result = built()
    with patch.object(data, "load_permanent_record", return_value=loaded) as load, \
         patch("school_forms.views.sf10.build", return_value=result), \
         patch("school_forms.views.teacher_student_ids", return_value=set(roster)):
        response = call(views.SF10View, "/api/school-forms/sf10/5/", params, as_user, student_id=5)
    return response, load


def advisory(teacher=7, section="Rizal"):
    return SimpleNamespace(teacher_user_id=teacher, school_year="2026-2027", grade_level="Grade 7", section=section)


# ── SF1 ──────────────────────────────────────────────────────────────────────

def test_sf1_is_an_xlsx_attachment_nobody_caches():
    response, load = sf1(SF1_QUERY, user("registrar"), warnings=["Ünïcode – warning ◤"])
    assert response.status_code == 200
    assert response["Content-Type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert response["Content-Disposition"] == 'attachment; filename="SF1_Grade-7_Rizal_SY2026-2027.xlsx"'
    assert response["Cache-Control"] == "no-store"
    header = response["X-Form-Warnings"]
    assert header.isascii() and json.loads(header) == ["Ünïcode – warning ◤"]
    assert response.content[:2] == b"PK"           # a zip, as .xlsx files are
    load.assert_called_once_with(school_year="2026-2027", grade_level="Grade 7", section="Rizal", semester=None)


@pytest.mark.parametrize("role", ["super_admin", "admin", "registrar", "accounting"])
def test_sf1_staff_roles(role):
    assert sf1(SF1_QUERY, user(role))[0].status_code == 200


def test_sf1_refuses_a_guardian():
    response, load = sf1(SF1_QUERY, user("guardian"))
    assert response.status_code == 403
    load.assert_not_called()


def test_sf1_teacher_only_for_a_section_they_advise():
    assert sf1(SF1_QUERY, user("teacher", 7), advisories=[advisory(teacher=8)])[0].status_code == 403
    assert sf1(SF1_QUERY, user("teacher", 7), advisories=[advisory(section="Bonifacio")])[0].status_code == 403
    assert sf1(SF1_QUERY, user("teacher", 7), advisories=[advisory()])[0].status_code == 200


def test_sf1_senior_high_needs_a_semester_and_names_it_in_the_file():
    shs = {**SF1_QUERY, "grade_level": "Grade 11"}
    response, load = sf1(shs, user("admin"))
    assert response.status_code == 400 and "semester" in response.data
    load.assert_not_called()

    response, load = sf1({**shs, "semester": "2nd"}, user("admin"), level="senior_highschool")
    assert response.status_code == 200
    assert "SF1-SHS_Grade-11_Rizal_2nd-Semester_SY2026-2027.xlsx" in response["Content-Disposition"]
    assert load.call_args.kwargs["semester"] == "2nd"


def test_sf1_drops_a_semester_below_senior_high():
    _, load = sf1({**SF1_QUERY, "semester": "1st"}, user("admin"))
    assert load.call_args.kwargs["semester"] is None


@pytest.mark.parametrize("bad", [
    {"school_year": "2026-27"},
    {"school_year": "2026-2028"},
    {"grade_level": "Grade 13"},
    {"section": "   "},
    {"section": "x" * 51},
])
def test_sf1_rejects_bad_input(bad):
    response, load = sf1({**SF1_QUERY, **bad}, user("admin"))
    assert response.status_code == 400
    load.assert_not_called()


def test_sf1_empty_section_is_a_404_with_a_reason():
    with patch.object(data, "load_register", side_effect=data.NothingToPrint("No learners in Grade 7 – Rizal for 2026-2027.")):
        request = factory.get("/api/school-forms/sf1/", SF1_QUERY)
        force_authenticate(request, user=user("admin"))
        response = views.SF1View.as_view()(request)
    assert response.status_code == 404
    assert response.data == {"detail": "No learners in Grade 7 – Rizal for 2026-2027."}


# ── SF2 ──────────────────────────────────────────────────────────────────────

def test_sf2_for_a_month_in_the_year():
    response, load = sf2(SF2_QUERY, user("registrar"))
    assert response.status_code == 200
    assert 'filename="SF2_Grade-7_Rizal_2026-09.xlsx"' in response["Content-Disposition"]
    assert load.call_args.kwargs["month"] == date(2026, 9, 1)


def test_sf2_refuses_accounting_and_guardians():
    assert sf2(SF2_QUERY, user("accounting"))[0].status_code == 403
    assert sf2(SF2_QUERY, user("guardian"))[0].status_code == 403


def test_sf2_teacher_only_for_their_section():
    assert sf2(SF2_QUERY, user("teacher", 7))[0].status_code == 403
    assert sf2(SF2_QUERY, user("teacher", 7), advisories=[advisory()])[0].status_code == 200


@pytest.mark.parametrize("month", ["2027-06", "2026-05", "2026-13", "2026-9", "September"])
def test_sf2_rejects_a_month_outside_the_year_or_malformed(month):
    response, load = sf2({**SF2_QUERY, "month": month}, user("admin"))
    assert response.status_code == 400 and "month" in response.data
    load.assert_not_called()


def test_sf2_month_message_names_the_year():
    response, _ = sf2({**SF2_QUERY, "month": "2027-06"}, user("admin"))
    assert str(response.data["month"][0]) == "June 2027 is outside school year 2026-2027."


# ── SF10 ─────────────────────────────────────────────────────────────────────

def test_sf10_names_the_file_by_level_and_learner():
    response, load = sf10({"level": "junior_highschool"}, user("registrar"))
    assert response.status_code == 200
    assert 'filename="SF10-JHS_109100000005_Dela-Cruz.xlsx"' in response["Content-Disposition"]
    load.assert_called_once_with(student_id=5, level="junior_highschool")


def test_sf10_teacher_only_for_a_learner_on_their_roster():
    assert sf10({"level": "elementary"}, user("teacher", 7))[0].status_code == 403
    assert sf10({"level": "elementary"}, user("teacher", 7), roster={5})[0].status_code == 200


def test_sf10_refuses_accounting_and_guardians():
    assert sf10({"level": "elementary"}, user("accounting"))[0].status_code == 403
    assert sf10({"level": "elementary"}, user("guardian"))[0].status_code == 403


@pytest.mark.parametrize("params", [{}, {"level": "kindergarten"}, {"level": "college"}])
def test_sf10_needs_one_of_the_three_levels(params):
    response, load = sf10(params, user("admin"))
    assert response.status_code == 400
    load.assert_not_called()


# ── Shared ───────────────────────────────────────────────────────────────────

def test_downloads_are_rate_limited_under_their_own_scope():
    from django.conf import settings
    from rest_framework.throttling import ScopedRateThrottle, UserRateThrottle

    assert set(THROTTLES) == {ScopedRateThrottle, UserRateThrottle}
    assert views.SchoolFormView.throttle_scope == "school_forms"
    assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["school_forms"] == "30/minute"


def test_filenames_keep_to_safe_characters():
    assert views.filename("SF1", "Grade 7", 'Ri"zal/../x', "SY2026-2027") == "SF1_Grade-7_Ri-zal-x_SY2026-2027.xlsx"
