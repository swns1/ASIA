import django_filters as filters
from .models import Enrollment


class EnrollmentFilter(filters.FilterSet):
    student = filters.NumberFilter(field_name="student_id")
    student_id = filters.NumberFilter(field_name="student_id")
    school_year = filters.CharFilter(lookup_expr="iexact")
    school_level = filters.CharFilter(lookup_expr="iexact")
    enrollment_status = filters.CharFilter(lookup_expr="iexact")
    grade_level = filters.CharFilter(lookup_expr="iexact")
    strand = filters.CharFilter(lookup_expr="iexact")

    class Meta:
        model = Enrollment
        fields = (
            "student",
            "student_id",
            "school_year",
            "school_level",
            "grade_level",
            "section",
            "strand",
            "semester",
            "enrollment_status",
        )
