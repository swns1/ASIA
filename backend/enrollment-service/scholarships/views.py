from django.db.models import Count
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import IsAdminRegistrarOrReadOnly
from .filters import EnrollmentScholarshipFilter
from .models import ScholarshipType, EnrollmentScholarship
from .serializers import (
    ScholarshipTypeSerializer,
    EnrollmentScholarshipSerializer,
)


class ScholarshipTypeViewSet(viewsets.ModelViewSet):
    """
    /api/scholarship-types/

    Reads: any authenticated user.
    Writes: admin/registrar/super_admin only.
    Filters: ?is_active=true, ?discount_mode=percentage
    """
    queryset = ScholarshipType.objects.all().order_by("scholarship_name")
    serializer_class = ScholarshipTypeSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("is_active", "discount_mode")


class EnrollmentScholarshipViewSet(viewsets.ModelViewSet):
    """
    /api/enrollment-scholarships/

    Filters:
      ?enrollment={id}              one specific enrollment
      ?scholarship_type={id}        one scholarship type
      ?school_year=2026-2027        \\
      ?school_level=elementary       > spanned through the enrollment; these are
      ?grade_level=Grade 3          /  the facets the Scholarships page filters on
      ?enrollment_status=enrolled  /
      ?approved_after=2026-01-01    inclusive lower bound on approved_at
      ?approved_before=2026-03-31   inclusive upper bound (whole day included)
      ?search=Cruz                  student name or scholarship name

    Awards are scoped through their enrollment rather than held directly, so
    every facet except scholarship_type is a join. `select_related` below covers
    them, so filtering doesn't add queries.
    """
    queryset = (
        EnrollmentScholarship.objects
        .select_related("scholarship_type", "enrollment", "enrollment__student")
        .all()
    )
    serializer_class = EnrollmentScholarshipSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_class = EnrollmentScholarshipFilter

    search_fields = (
        "enrollment__student__first_name",
        "enrollment__student__middle_name",
        "enrollment__student__last_name",
        "scholarship_type__scholarship_name",
    )
    ordering_fields = (
        "enrollment_scholarship_id",
        "approved_at",
        "enrollment__school_year",
        "enrollment__grade_level",
    )
    ordering = ("-enrollment_scholarship_id",)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """
        GET /api/enrollment-scholarships/summary/

        Per-scholarship-type award counts across ALL matching awards, not just
        the current page. Honours every filter the list does *except*
        `scholarship_type` — each count answers "how many would this chip show",
        so scoping by the selected one would zero out the others.
        """
        params = request.query_params.copy()
        params.pop("scholarship_type", None)

        # Built from the filterset directly rather than via `filter_queryset`,
        # which would also apply OrderingFilter — and the default ordering puts
        # the primary key into the GROUP BY, collapsing every count to 1.
        qs = EnrollmentScholarshipFilter(params, queryset=self.get_queryset(), request=request).qs
        qs = SearchFilter().filter_queryset(request, qs, self)

        rows = (
            qs.order_by()
            .values("scholarship_type")
            .annotate(count=Count("pk"))
        )
        result = {str(r["scholarship_type"]): r["count"] for r in rows}
        result["total"] = sum(r["count"] for r in rows)
        return Response(result)