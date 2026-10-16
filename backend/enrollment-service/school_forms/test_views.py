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
from school_forms.records import IssueDetails

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


def built(level="junior_highschool", warnings=(), years=()):
    """What a loader and builder return, minus the work."""
    loaded = SimpleNamespace(section=SimpleNamespace(school_level=level),
                             learner=SimpleNamespace(lrn="109100000005", last_name="Dela Cruz"),
                             years=tuple(years))
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


def sf10(params, as_user, roster=frozenset(), years=()):
    loaded, result = built(years=years)
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
    # Nothing typed for this copy: a transfer credential, its lines left to fill in.
    load.assert_called_once_with(student_id=5, level="junior_highschool", issue=IssueDetails())


def test_sf10_senior_high_file_names_the_strand():
    years = [SimpleNamespace(strand="STEM"), SimpleNamespace(strand="HUMSS")]
    response, _ = sf10({"level": "senior_highschool"}, user("registrar"), years=years)
    assert 'filename="SF10-SHS-HUMSS_109100000005_Dela-Cruz.xlsx"' in response["Content-Disposition"]


def test_sf10_carries_what_the_registrar_typed_for_this_copy():
    params = {"level": "senior_highschool", "copy_for": " Adamson University ", "purpose": "Scholarship purposes",
              "graduation_date": "2026-03-31", "special_order": " 051 "}
    _, load = sf10(params, user("registrar"))
    assert load.call_args.kwargs["issue"] == IssueDetails(
        copy_for="Adamson University", purpose="Scholarship purposes",
        graduation_date=date(2026, 3, 31), special_order="051",
    )


@pytest.mark.parametrize("bad", [
    {"graduation_date": "March 31"}, {"copy_for": "x" * 151}, {"special_order": "x" * 31},
])
def test_sf10_rejects_bad_issue_details(bad):
    response, load = sf10({"level": "elementary", **bad}, user("admin"))
    assert response.status_code == 400
    load.assert_not_called()


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
    assert views.filename("SF1", "Grade 7", 'Ri"zal/../x', "SY2026-2027") == "SF1_Grade-7_Ri-zal-x_SY2026-2027"


@pytest.mark.parametrize("download, params, name, stretch", [
    (sf1, SF1_QUERY, "SF1_Grade-7_Rizal_SY2026-2027.pdf", "EXCEL_PRINT"),
    (sf2, SF2_QUERY, "SF2_Grade-7_Rizal_2026-09.pdf", "EXCEL_PRINT"),
    # The SF10 is drawn to the school's templates in inches, so it prints as drawn.
    (sf10, {"level": "junior_highschool"}, "SF10-JHS_109100000005_Dela-Cruz.pdf", "AS_DRAWN"),
])
def test_each_form_also_comes_as_a_pdf(download, params, name, stretch):
    with patch("school_forms.views.pdf.render", wraps=views.pdf.render) as render:
        response, load = download({**params, "file": "pdf"}, user("registrar"))
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"] == f'attachment; filename="{name}"'
    assert response["Cache-Control"] == "no-store"
    assert response.content.startswith(b"%PDF-")
    assert render.call_args.kwargs["stretch"] == getattr(views.pdf, stretch)
    assert "file" not in load.call_args.kwargs                  # the loaders never see it


@pytest.mark.parametrize("download, params", [
    (sf1, SF1_QUERY), (sf2, SF2_QUERY), (sf10, {"level": "junior_highschool"}),
])
def test_an_unknown_file_type_is_refused(download, params):
    response, load = download({**params, "file": "docx"}, user("registrar"))
    assert response.status_code == 400 and "file" in response.data
    load.assert_not_called()


# ── COR ──────────────────────────────────────────────────────────────────────

def registration(status="enrolled", semester="", student_id=5):
    return SimpleNamespace(
        learner=SimpleNamespace(student_id=student_id, lrn="109100000005", student_number="2026-00005",
                                last_name="Dela Cruz", status=status),
        section=SimpleNamespace(school_year="2026-2027", semester=semester),
    )


def cor(params, as_user, roster=frozenset(), warnings=(), **kw):
    with patch.object(data, "load_registration", return_value=registration(**kw)) as load, \
         patch("school_forms.views.cor.build", return_value=(b"%PDF-1.4 cor", list(warnings))) as build, \
         patch("school_forms.views.teacher_student_ids", return_value=set(roster)):
        response = call(views.CORView, "/api/school-forms/cor/41/", params, as_user, enrollment_id=41)
    return response, load, build


def test_cor_is_a_pdf_named_for_the_learner_and_year():
    response, load, build = cor({}, user("registrar"), warnings=["No subjects are set up."])
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"] == 'attachment; filename="COR_109100000005_Dela-Cruz_SY2026-2027.pdf"'
    assert response["Cache-Control"] == "no-store"
    assert json.loads(response["X-Form-Warnings"]) == ["No subjects are set up."]
    assert response.content == b"%PDF-1.4 cor"
    load.assert_called_once_with(enrollment_id=41)
    assert build.call_args.kwargs == {"copy": "slis"}


def test_cor_senior_high_file_names_the_semester():
    response, _, _ = cor({}, user("registrar"), semester="2nd")
    assert 'filename="COR_109100000005_Dela-Cruz_SY2026-2027_2nd-Semester.pdf"' in response["Content-Disposition"]


def test_cor_parents_copy():
    _, _, build = cor({"copy": "parent"}, user("registrar"))
    assert build.call_args.kwargs == {"copy": "parent"}


def test_cor_refuses_an_unknown_copy():
    response, load, _ = cor({"copy": "teacher"}, user("registrar"))
    assert response.status_code == 400 and "copy" in response.data
    load.assert_not_called()


@pytest.mark.parametrize("role", ["super_admin", "admin", "registrar", "accounting"])
def test_cor_every_staff_role(role):
    assert cor({}, user(role))[0].status_code == 200


def test_cor_refuses_a_guardian():
    response, load, _ = cor({}, user("guardian"))
    assert response.status_code == 403
    load.assert_not_called()


def test_cor_teacher_only_for_a_learner_on_their_roster():
    response, _, build = cor({}, user("teacher", 7))
    assert response.status_code == 403
    build.assert_not_called()
    assert cor({}, user("teacher", 7), roster={5})[0].status_code == 200


@pytest.mark.parametrize("status", ["pending", "enrolled", "completed", "transferred_out"])
def test_cor_prints_for_any_enrollment_not_cancelled(status):
    assert cor({}, user("registrar"), status=status)[0].status_code == 200


def test_cor_of_a_cancelled_enrollment_is_refused_with_a_reason():
    response, _, build = cor({}, user("registrar"), status="cancelled")
    assert response.status_code == 409
    assert response.data == {"detail": "This enrollment was cancelled, so there is no registration to certify."}
    build.assert_not_called()


def test_cor_of_an_unknown_enrollment_is_a_404():
    with patch.object(data, "load_registration", side_effect=data.NothingToPrint("Enrollment not found.")):
        response = call(views.CORView, "/api/school-forms/cor/999/", {}, user("admin"), enrollment_id=999)
    assert response.status_code == 404 and response.data == {"detail": "Enrollment not found."}


def test_cor_end_to_end_is_a_real_pdf():
    from school_forms.test_cor import registration as full_registration

    with patch.object(data, "load_registration", return_value=full_registration()):
        response = call(views.CORView, "/api/school-forms/cor/1/", {"copy": "parent"}, user("registrar"),
                        enrollment_id=1)
    assert response.status_code == 200 and response.content.startswith(b"%PDF-")
    assert "X-Form-Warnings" not in response


# ── SF9 ──────────────────────────────────────────────────────────────────────

def report_card(status="completed", student_id=5):
    return SimpleNamespace(
        learner=SimpleNamespace(student_id=student_id, lrn="109100000005", student_number="2026-00005",
                                last_name="Dela Cruz", status=status),
        section=SimpleNamespace(school_year="2026-2027"),
    )


def sf9(as_user, roster=frozenset(), children=frozenset(), warnings=(), **kw):
    with patch.object(data, "load_report_card", return_value=report_card(**kw)) as load, \
         patch("school_forms.views.sf9.build", return_value=(b"%PDF-1.4 sf9", list(warnings))) as build, \
         patch("school_forms.views.teacher_student_ids", return_value=set(roster)), \
         patch("school_forms.views.guardian_student_ids", return_value=set(children)):
        response = call(views.SF9View, "/api/school-forms/sf9/41/", {}, as_user, enrollment_id=41)
    return response, load, build


def test_sf9_is_a_pdf_named_for_the_learner_and_year():
    response, load, _ = sf9(user("registrar"), warnings=["No adviser is assigned."])
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"] == 'attachment; filename="SF9_109100000005_Dela-Cruz_SY2026-2027.pdf"'
    assert response["Cache-Control"] == "no-store"
    assert json.loads(response["X-Form-Warnings"]) == ["No adviser is assigned."]
    assert response.content == b"%PDF-1.4 sf9"
    load.assert_called_once_with(enrollment_id=41)


@pytest.mark.parametrize("role", ["super_admin", "admin", "registrar"])
def test_sf9_every_grade_reading_role(role):
    assert sf9(user(role))[0].status_code == 200


def test_sf9_refuses_accounting():
    response, load, _ = sf9(user("accounting"))
    assert response.status_code == 403
    load.assert_not_called()


def test_sf9_teacher_only_for_a_learner_on_their_roster():
    response, _, build = sf9(user("teacher", 7))
    assert response.status_code == 403
    build.assert_not_called()
    assert sf9(user("teacher", 7), roster={5})[0].status_code == 200


def test_sf9_guardian_only_for_their_own_child_and_without_the_schools_warnings():
    response, _, build = sf9(user("guardian", 8), children={6})
    assert response.status_code == 403
    build.assert_not_called()
    response, _, _ = sf9(user("guardian", 8), children={5}, warnings=["No adviser is assigned."])
    assert response.status_code == 200 and "X-Form-Warnings" not in response


@pytest.mark.parametrize("status, reason", [
    ("pending", "This enrollment hasn't started yet, so there is no report card."),
    ("cancelled", "This enrollment was cancelled, so there is no report card."),
])
def test_sf9_of_an_enrollment_never_attended_is_refused_with_a_reason(status, reason):
    response, _, build = sf9(user("registrar"), status=status)
    assert response.status_code == 409 and response.data == {"detail": reason}
    build.assert_not_called()


@pytest.mark.parametrize("status", ["enrolled", "completed", "transferred_out"])
def test_sf9_prints_for_any_attended_enrollment(status):
    assert sf9(user("registrar"), status=status)[0].status_code == 200


def test_sf9_of_an_unknown_enrollment_is_a_404():
    with patch.object(data, "load_report_card", side_effect=data.NothingToPrint("Enrollment not found.")):
        response = call(views.SF9View, "/api/school-forms/sf9/999/", {}, user("admin"), enrollment_id=999)
    assert response.status_code == 404 and response.data == {"detail": "Enrollment not found."}


def test_sf9_end_to_end_is_a_real_pdf():
    from school_forms.test_sf9 import card

    with patch.object(data, "load_report_card", return_value=card()):
        response = call(views.SF9View, "/api/school-forms/sf9/1/", {}, user("registrar"), enrollment_id=1)
    assert response.status_code == 200 and response.content.startswith(b"%PDF-")
    assert response["Content-Disposition"] == 'attachment; filename="SF9_109100000005_Dela-Cruz_SY2024-2025.pdf"'
