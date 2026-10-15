"""Query-string validation for the school form downloads."""
from datetime import date

from rest_framework import serializers

from enrollments.rules import GRADE_ORDER, SCHOOL_LEVEL_OF_GRADE, school_year_dates
from shared.school_year import InvalidSchoolYear, configured_dates, normalize

from .sf2 import month_end

SEMESTERS = ("1st", "2nd")
# The form as DepEd's (or the school's) Excel file, or as a PDF of how it prints.
FILE_TYPES = ("xlsx", "pdf")
SF10_LEVELS = ("elementary", "junior_highschool", "senior_highschool")


class SectionFormQuery(serializers.Serializer):
    """SF1: one section of one school year (one semester, in senior high)."""

    school_year = serializers.CharField(max_length=20)
    grade_level = serializers.ChoiceField(choices=GRADE_ORDER)
    section = serializers.CharField(max_length=50)
    semester = serializers.ChoiceField(choices=SEMESTERS, required=False, allow_blank=True)
    file = serializers.ChoiceField(choices=FILE_TYPES, required=False, default="xlsx")

    def validate_school_year(self, value):
        try:
            return normalize(value)
        except InvalidSchoolYear as exc:
            raise serializers.ValidationError(str(exc))

    def validate_section(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Choose a section.")
        return value

    def validate(self, attrs):
        senior_high = SCHOOL_LEVEL_OF_GRADE.get(attrs["grade_level"]) == "senior_highschool"
        if senior_high and not attrs.get("semester"):
            raise serializers.ValidationError({"semester": "Choose the semester for Grades 11 and 12."})
        attrs["semester"] = attrs.get("semester") if senior_high else None
        return attrs


class AttendanceFormQuery(SectionFormQuery):
    """SF2: a section's month, which has to fall in its school year."""

    month = serializers.RegexField(r"^\d{4}-(0[1-9]|1[0-2])$", error_messages={
        "invalid": "Use the form YYYY-MM, like 2026-09.",
    })

    def validate(self, attrs):
        attrs = super().validate(attrs)
        year, month = (int(part) for part in attrs["month"].split("-"))
        first = date(year, month, 1)
        start, end = configured_dates(attrs["school_year"]) or school_year_dates(attrs["school_year"])
        if month_end(first) < start or first > end:
            raise serializers.ValidationError({
                "month": f"{first:%B} {first.year} is outside school year {attrs['school_year']}.",
            })
        attrs["month"] = first
        return attrs


class PermanentRecordQuery(serializers.Serializer):
    """
    SF10: which level's record (elementary includes Kindergarten), and what
    the registrar types for this copy. Blank prints a fill-in line.
    """

    level = serializers.ChoiceField(choices=SF10_LEVELS)
    copy_for = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    purpose = serializers.CharField(max_length=100, required=False, allow_blank=True,
                                    default="TRANSFER CREDENTIAL PURPOSES")
    graduation_date = serializers.DateField(required=False, allow_null=True, default=None)
    special_order = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    file = serializers.ChoiceField(choices=FILE_TYPES, required=False, default="xlsx")
