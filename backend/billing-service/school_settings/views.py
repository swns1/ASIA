from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import HasRole
from .models import SchoolSetting
from .serializers import SchoolSettingSerializer


class SchoolSettingViewSet(viewsets.ModelViewSet):
    """
    /api/school-settings/        GET (list returns singleton in array)
    /api/school-settings/current/ GET (returns the singleton directly)
    /api/school-settings/{id}/   GET, PATCH

    Treated as a singleton table — there's only ever one row.
    """
    queryset = SchoolSetting.objects.all()
    serializer_class = SchoolSettingSerializer
    permission_classes = [HasRole]
    required_roles = {"super_admin", "admin", "accounting"}

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        instance = SchoolSetting.objects.first()
        if not instance:
            return Response(
                {"detail": "No school settings configured."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(SchoolSettingSerializer(instance).data)