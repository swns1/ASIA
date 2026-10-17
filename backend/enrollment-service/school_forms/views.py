"""
GET endpoints that return school forms as .xlsx files: SF1 and SF2 in DepEd's
own files, SF10 in the school's own permanent-record format. Each takes
?file=pdf for a PDF of the same form, laid out as Excel prints it (pdf.py).

    /api/school-forms/sf1/?school_year=&grade_level=&section=[&semester=]
    /api/school-forms/sf2/?school_year=&grade_level=&section=&month=YYYY-MM[&semester=]
    /api/school-forms/sf10/<student_id>/?level=elementary|junior_highschool|senior_highschool
        [&copy_for=&purpose=&graduation_date=YYYY-MM-DD&special_order=]

and two that are PDFs only: the Certificate of Registration with the
school's Admissions Agreement after it (cor.py), and the SF9 report card in
DepEd's layout with the school's letterhead (sf9.py).

    /api/school-forms/cor/<enrollment_id>/[?copy=slis|parent]
    /api/school-forms/sf9/<enrollment_id>/

Roles follow what each form shows: SF1 and the COR are enrollment data, read
today by every staff role; SF2, SF9 and SF10 are attendance and grades, which
accounting can't read. A teacher gets only the sections they advise in that
school year, and only learners on their own roster. The SF9 is also the
guardian portal's report card, so a guardian gets it for their own child;
a guardian also prints their own child's COR (the parent's copy) once the
enrollment is official.

Anything the file could not fully say (class days missing attendance, more
records than DepEd's form has room for) goes back in X-Form-Warnings as a
JSON list, for the page to show beside the download.
"""
import json
import re

from django.http import HttpResponse
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from accounts.permissions import GRADE_READ_ROLES, HasRole, guardian_student_ids, teacher_student_ids
from enrollments.models import SectionAdvisory
from enrollments.rules import ATTENDED_STATUSES

from . import cor, data, pdf, sf1, sf2, sf9, sf10
from .records import IssueDetails, semester_label
from .serializers import AttendanceFormQuery, PermanentRecordQuery, RegistrationQuery, SectionFormQuery
from .workbook import XLSX_CONTENT_TYPE, to_bytes

STAFF_READ_ROLES = {"super_admin", "admin", "registrar", "accounting", "teacher"}

LEVEL_FORM = {
    "elementary": "SF10-ES",
    "junior_highschool": "SF10-JHS",
    "senior_highschool": "SF10-SHS",
}


def filename(*parts):
    """'SF1_Grade-7_Rizal_SY2026-2027': ASCII letters, digits and dashes only."""
    cleaned = [re.sub(r"[^A-Za-z0-9-]+", "-", str(p)).strip("-") for p in parts if p]
    return "_".join(p for p in cleaned if p)


def form_response(workbook, name, warnings, file_type="xlsx", stretch=pdf.EXCEL_PRINT):
    """
    The form as its .xlsx file, or (file_type "pdf") as a PDF of how that
    file prints; `stretch` says which printout to follow (see pdf.py).
    """
    if file_type == "pdf":
        body = pdf.render(workbook.active, title=name, stretch=stretch)
        content_type = pdf.PDF_CONTENT_TYPE
    else:
        body, content_type = to_bytes(workbook), XLSX_CONTENT_TYPE
    return file_response(body, content_type, f"{name}.{file_type}", warnings)


def file_response(body, content_type, filename, warnings):
    """A download, with what it could not fully say in X-Form-Warnings."""
    response = HttpResponse(body, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    # Learner records: never kept by a browser or a proxy cache.
    response["Cache-Control"] = "no-store"
    if warnings:
        response["X-Form-Warnings"] = json.dumps(warnings)  # ASCII: json escapes the rest
    return response


def _user_id(user):
    return getattr(user, "user_id", None) or getattr(user, "id", None)


def assert_may_read_section(user, school_year, grade_level, section):
    """A teacher may download only a section they advise in that school year."""
    if getattr(user, "role", None) != "teacher":
        return
    advises = SectionAdvisory.objects.filter(
        teacher_user_id=_user_id(user), school_year=school_year,
        grade_level=grade_level, section=section,
    ).exists()
    if not advises:
        raise PermissionDenied("You can download forms only for sections you advise.")


class SchoolFormView(APIView):
    permission_classes = [HasRole]
    throttle_classes = [UserRateThrottle, ScopedRateThrottle]
    throttle_scope = "school_forms"


class SF1View(SchoolFormView):
    required_roles = STAFF_READ_ROLES

    def get(self, request):
        query = SectionFormQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        p = query.validated_data
        file_type = p.pop("file")
        assert_may_read_section(request.user, p["school_year"], p["grade_level"], p["section"])
        try:
            register = data.load_register(**p)
        except data.NothingToPrint as exc:
            return Response({"detail": str(exc)}, status=404)
        workbook, warnings = sf1.build(register)
        form = "SF1-SHS" if register.section.school_level == "senior_highschool" else "SF1"
        name = filename(form, p["grade_level"], p["section"],
                        semester_label(p["semester"]) if p["semester"] else None, f"SY{p['school_year']}")
        return form_response(workbook, name, warnings, file_type)


class SF2View(SchoolFormView):
    required_roles = GRADE_READ_ROLES

    def get(self, request):
        query = AttendanceFormQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        p = query.validated_data
        file_type = p.pop("file")
        assert_may_read_section(request.user, p["school_year"], p["grade_level"], p["section"])
        try:
            attendance = data.load_attendance(**p)
        except data.NothingToPrint as exc:
            return Response({"detail": str(exc)}, status=404)
        workbook, warnings = sf2.build(attendance)
        form = "SF2-SHS" if attendance.section.school_level == "senior_highschool" else "SF2"
        name = filename(form, p["grade_level"], p["section"], f"{p['month']:%Y-%m}")
        return form_response(workbook, name, warnings, file_type)


class SF10View(SchoolFormView):
    required_roles = GRADE_READ_ROLES

    def get(self, request, student_id):
        query = PermanentRecordQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        p = query.validated_data
        level = p["level"]
        user = request.user
        if getattr(user, "role", None) == "teacher" and student_id not in teacher_student_ids(user):
            raise PermissionDenied("You can download records only for learners in your sections.")
        issue = IssueDetails(
            copy_for=p["copy_for"].strip(), purpose=p["purpose"].strip(),
            graduation_date=p["graduation_date"], special_order=p["special_order"].strip(),
        )
        try:
            record = data.load_permanent_record(student_id=student_id, level=level, issue=issue)
        except data.NothingToPrint as exc:
            return Response({"detail": str(exc)}, status=404)
        workbook, warnings = sf10.build(record)
        # Senior high names its strand: the school keeps a file per strand.
        strand = next((y.strand for y in reversed(record.years) if y.strand), "")
        form = f"{LEVEL_FORM[level]}-{strand}" if strand else LEVEL_FORM[level]
        name = filename(form, record.learner.lrn, record.learner.last_name)
        # Drawn to the school's templates in exact inches, it prints as drawn.
        return form_response(workbook, name, warnings, p["file"], stretch=pdf.AS_DRAWN)


class CORView(SchoolFormView):
    """
    The Certificate of Registration, then the Admissions Agreement for the
    learner's level, for the parent to sign at the counter. A pending
    enrollment prints too (its COR says it is not yet official); a cancelled
    one has nothing to certify.

    A guardian prints their own child's from the guardian portal, for a family
    that missed the enrollment email: the parent's copy only, and only once
    the enrollment is Enrolled, since before that the school hasn't confirmed
    it.
    """
    required_roles = STAFF_READ_ROLES | {"guardian"}

    def get(self, request, enrollment_id):
        query = RegistrationQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        try:
            registration = data.load_registration(enrollment_id=enrollment_id)
        except data.NothingToPrint as exc:
            return Response({"detail": str(exc)}, status=404)
        learner, section = registration.learner, registration.section
        user = request.user
        role = getattr(user, "role", None)
        if role == "teacher" and learner.student_id not in teacher_student_ids(user):
            raise PermissionDenied("You can print a COR only for learners in your sections.")
        if role == "guardian" and learner.student_id not in guardian_student_ids(user):
            raise PermissionDenied("You can print a COR only for your own children.")
        if learner.status == "cancelled":
            return Response({"detail": "This enrollment was cancelled, so there is no registration to certify."},
                            status=409)
        if role == "guardian" and learner.status != "enrolled":
            return Response({"detail": "The COR is ready once the school confirms this enrollment."},
                            status=409)
        copy = "parent" if role == "guardian" else query.validated_data["copy"]
        body, warnings = cor.build(registration, copy=copy)
        # What a missing setting leaves blank is the school's to fix; a
        # guardian can't act on it.
        if role == "guardian":
            warnings = []
        name = filename("COR", learner.lrn or learner.student_number, learner.last_name,
                        f"SY{section.school_year}", semester_label(section.semester) if section.semester else None)
        return file_response(body, pdf.PDF_CONTENT_TYPE, f"{name}.pdf", warnings)


class SF9View(SchoolFormView):
    """
    The SF9, the Learner's Progress Report Card, for one enrollment's school
    year (both semesters in senior high). It is also the report card the
    enrollment page and the guardian portal print, so a guardian may read
    their own child's. An enrollment not yet started, or cancelled, has no
    card to print.
    """
    required_roles = GRADE_READ_ROLES | {"guardian"}

    def get(self, request, enrollment_id):
        try:
            card = data.load_report_card(enrollment_id=enrollment_id)
        except data.NothingToPrint as exc:
            return Response({"detail": str(exc)}, status=404)
        learner, section = card.learner, card.section
        user = request.user
        role = getattr(user, "role", None)
        if role == "teacher" and learner.student_id not in teacher_student_ids(user):
            raise PermissionDenied("You can print a report card only for learners in your sections.")
        if role == "guardian" and learner.student_id not in guardian_student_ids(user):
            raise PermissionDenied("You can view report cards only for your own children.")
        if learner.status not in ATTENDED_STATUSES:
            reason = ("was cancelled" if learner.status == "cancelled" else "hasn't started yet")
            return Response({"detail": f"This enrollment {reason}, so there is no report card."}, status=409)
        body, warnings = sf9.build(card)
        # What a missing setting leaves blank is the school's to fix; a
        # guardian can't act on it.
        if role == "guardian":
            warnings = []
        name = filename("SF9", learner.lrn or learner.student_number, learner.last_name, f"SY{section.school_year}")
        return file_response(body, pdf.PDF_CONTENT_TYPE, f"{name}.pdf", warnings)
