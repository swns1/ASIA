import django_filters as filters
from .models import Enrollment


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    """A comma-separated list: ?enrollment_status__in=enrolled,completed."""


class EnrollmentFilter(filters.FilterSet):
    student = filters.NumberFilter(field_name="student_id")
    student_id = filters.NumberFilter(field_name="student_id")
    school_year = filters.CharFilter(lookup_expr="iexact")
    school_level = filters.CharFilter(lookup_expr="iexact")
    enrollment_status = filters.CharFilter(lookup_expr="iexact")
    # Several statuses at once, e.g. everyone who attended a year (enrolled,
    # completed, transferred_out) without the pending and cancelled rows.
    enrollment_status__in = CharInFilter(field_name="enrollment_status", lookup_expr="in")
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
