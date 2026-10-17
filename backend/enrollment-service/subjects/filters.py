from django.db.models import Q
from django_filters import rest_framework as filters

from .models import Subject


class SubjectFilter(filters.FilterSet):
    """
    `?strand=` is an exact match, which is right for managing the catalogue but
    wrong for "the subjects this learner takes": a senior high learner takes the
    core subjects (no strand) as well as their own strand's. Filtering SF9,
    SF10 and the Certificate of Registration by the exact strand dropped every
    core subject -- and ABM/HUMSS learners, whose strands had none of their
    own, printed an empty subject table.

    `?for_strand=ABM` is that learner's list: core subjects plus ABM's.
    """

    for_strand = filters.CharFilter(method="filter_for_strand")
    for_semester = filters.CharFilter(method="filter_for_semester")
    has_template = filters.BooleanFilter(method="filter_has_template")

    class Meta:
        model = Subject
        fields = ("school_year", "school_level", "grade_level", "strand", "semester")

    def filter_has_template(self, queryset, name, value):
        """
        `?has_template=false` -- the subjects nobody can work a grade out for
        yet: computing one needs the subject's grading template, and without
        it the server refuses. The Subjects page's status band counts these.
        """
        return queryset.filter(grading_template__isnull=not value)

    def filter_for_strand(self, queryset, name, value):
        value = (value or "").strip()
        core = Q(strand__isnull=True) | Q(strand="")
        return queryset.filter(core | Q(strand__iexact=value)) if value else queryset.filter(core)

    def filter_for_semester(self, queryset, name, value):
        """
        `?semester=` is exact too, and senior high subjects recorded with no
        semester -- core subjects among them -- fell out of it. Together with
        for_strand that emptied the list for a strand with no subjects of its
        own: a HUMSS or ABM learner's Certificate of Registration printed "No
        subjects on record", and their grade entry offered nothing to grade.

        `?for_semester=1st` is that semester's subjects plus those with no
        semester set.
        """
        value = (value or "").strip()
        if not value:
            return queryset
        return queryset.filter(Q(semester=value) | Q(semester__isnull=True) | Q(semester=""))
