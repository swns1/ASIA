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

    # Writing settings stays admin/accounting.
    required_roles = {"super_admin", "admin", "accounting"}

    # Reading is open to every role, because everything on this row is
    # reference data that already appears on documents the school hands out:
    # the school name and address are the letterhead on SF1/SF2/SF9/SF10 and
    # the CoR, and `current_school_year` is what SchoolYearContext asks for on
    # every page load. Restricting reads to the write set meant the registrar
    # and teacher -- the roles that actually print DepEd forms -- got a 403
    # that every caller swallows, so the forms printed a blank school address
    # and those two roles silently fell back to a school year derived from
    # the calendar date while admin and accounting used the configured one.
    # Guardians are included for the same reason: the printable report card
    # the parent portal links to renders the same letterhead.
    read_roles = {"super_admin", "admin", "accounting", "registrar", "teacher", "guardian"}

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        instance = SchoolSetting.objects.first()
        if not instance:
            return Response(
                {"detail": "No school settings configured."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(SchoolSettingSerializer(instance).data)