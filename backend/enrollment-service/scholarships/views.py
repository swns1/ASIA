from rest_framework import viewsets
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import IsAdminRegistrarOrReadOnly
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

    Filters: ?enrollment={id}, ?scholarship_type={id}
    """
    queryset = (
        EnrollmentScholarship.objects
        .select_related("scholarship_type", "enrollment", "enrollment__student")
        .all()
    )
    serializer_class = EnrollmentScholarshipSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("enrollment", "scholarship_type")