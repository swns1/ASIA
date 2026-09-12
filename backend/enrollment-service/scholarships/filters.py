from django_filters import rest_framework as filters

from .models import EnrollmentScholarship


class EnrollmentScholarshipFilter(filters.FilterSet):
    """
    Awards don't hold a school year or grade of their own — those live on the
    enrollment the award is attached to, so every facet here except
    `scholarship_type` spans that relation.

    Names deliberately drop the `enrollment__` prefix: the Scholarships page
    sends the same `school_year` / `grade_level` params as every other list
    page, and callers shouldn't have to know the award is one join away.
    """

    school_year       = filters.CharFilter(field_name="enrollment__school_year",       lookup_expr="iexact")
    school_level      = filters.CharFilter(field_name="enrollment__school_level",      lookup_expr="iexact")
    grade_level       = filters.CharFilter(field_name="enrollment__grade_level",       lookup_expr="iexact")
    enrollment_status = filters.CharFilter(field_name="enrollment__enrollment_status", lookup_expr="iexact")
    student           = filters.NumberFilter(field_name="enrollment__student_id")

    # Date bounds are inclusive on both ends. `approved_at` is a datetime, so
    # the upper bound uses a date lookup rather than `lte` against a bare date,
    # which would otherwise exclude everything awarded after midnight that day.
    approved_after  = filters.DateFilter(field_name="approved_at", lookup_expr="date__gte")
    approved_before = filters.DateFilter(field_name="approved_at", lookup_expr="date__lte")

    class Meta:
        model = EnrollmentScholarship
        fields = (
            "enrollment",
            "scholarship_type",
            "school_year",
            "school_level",
            "grade_level",
            "enrollment_status",
            "student",
            "approved_after",
            "approved_before",
        )
