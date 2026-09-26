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

    class Meta:
        model = Subject
        fields = ("school_level", "grade_level", "strand", "semester")

    def filter_for_strand(self, queryset, name, value):
        value = (value or "").strip()
        core = Q(strand__isnull=True) | Q(strand="")
        return queryset.filter(core | Q(strand__iexact=value)) if value else queryset.filter(core)
