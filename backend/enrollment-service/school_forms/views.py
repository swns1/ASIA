"""
GET endpoints that return school forms as .xlsx files: SF1 and SF2 in DepEd's
own files, SF10 in the school's own permanent-record format. Each takes
?file=pdf for a PDF of the same form, laid out as Excel prints it (pdf.py).

    /api/school-forms/sf1/?school_year=&grade_level=&section=[&semester=]
    /api/school-forms/sf2/?school_year=&grade_level=&section=&month=YYYY-MM[&semester=]
    /api/school-forms/sf10/<student_id>/?level=elementary|junior_highschool|senior_highschool
        [&copy_for=&purpose=&graduation_date=YYYY-MM-DD&special_order=]

Roles follow what each form shows: SF1 is enrollment data, read today by every
staff role; SF2 and SF10 are attendance and grades, which accounting can't
read. A teacher gets only the sections they advise in that school year, and
only learners on their own roster.

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

from accounts.permissions import GRADE_READ_ROLES, HasRole, teacher_student_ids
from enrollments.models import SectionAdvisory

from . import data, pdf, sf1, sf2, sf10
from .records import IssueDetails, semester_label
from .serializers import AttendanceFormQuery, PermanentRecordQuery, SectionFormQuery
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
    response = HttpResponse(body, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{name}.{file_type}"'
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
