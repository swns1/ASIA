import os

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import IsAdminRegistrarOrReadOnly
from shared.uploads import download_url, file_kind_for, resolve_stored_path, verify_download_token

from .models import RequirementType, StudentRequirementSubmission
from .serializers import (
    DOWNLOAD_PREFIX,
    RequirementTypeSerializer,
    StudentRequirementSubmissionSerializer,
)


class RequirementTypeViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAdminRegistrarOrReadOnly]
    queryset = RequirementType.objects.all()
    serializer_class = RequirementTypeSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["is_active"]


class StudentRequirementSubmissionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminRegistrarOrReadOnly]
    serializer_class = StudentRequirementSubmissionSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["student_id", "requirement_type"]
    ordering_fields = ["created_at", "updated_at"]

    def get_queryset(self):
        qs = StudentRequirementSubmission.objects.select_related("requirement_type")
        student_id = self.request.query_params.get("student_id")
        if student_id:
            qs = qs.filter(student_id=student_id)
        return qs

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        student_id = request.query_params.get("student_id")
        if not student_id:
            return Response({"detail": "student_id is required."}, status=400)

        req_types = RequirementType.objects.filter(is_active=True)
        submissions = {
            s.requirement_type_id: s
            for s in StudentRequirementSubmission.objects.filter(
                student_id=student_id
            ).select_related("requirement_type")
        }

        result = []
        for rt in req_types:
            sub = submissions.get(rt.requirement_type_id)
            result.append(
                {
                    "requirement_type_id": rt.requirement_type_id,
                    "requirement_code": rt.requirement_code,
                    "requirement_name": rt.requirement_name,
                    "description": rt.description,
                    "is_submitted": sub.is_submitted if sub else False,
                    "image_url": download_url(
                        DOWNLOAD_PREFIX,
                        sub.student_requirement_submission_id,
                        bool(sub.image_url),
                    ) if sub else None,
                    "file_kind": file_kind_for(sub.image_url) if sub else None,
                    "remarks": sub.remarks if sub else None,
                    "submitted_at": sub.submitted_at if sub else None,
                    "verified_at": sub.verified_at if sub else None,
                    "submission_id": sub.student_requirement_submission_id if sub else None,
                }
            )
        return Response(result)

    # Deliberately no auth/permission classes: this URL is loaded from plain
    # <img>/<iframe> src attributes, which can't attach an Authorization
    # header. Access control is the signed, submission-scoped, 5-minute
    # token in ?token= (minted only by the authenticated, role-gated
    # endpoints above) — not the request's own credentials. See
    # shared/uploads.py.
    @action(
        detail=True,
        methods=["get"],
        url_path="file",
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
    def file(self, request, pk=None):
        try:
            submission = StudentRequirementSubmission.objects.get(pk=pk)
        except (StudentRequirementSubmission.DoesNotExist, ValueError):
            raise Http404

        token = request.query_params.get("token")
        if not verify_download_token(token, submission.student_requirement_submission_id):
            return Response({"detail": "Invalid or expired download link."}, status=403)

        if not submission.image_url:
            raise Http404

        file_path = resolve_stored_path(settings.MEDIA_ROOT, submission.image_url)
        if not os.path.isfile(file_path):
            raise Http404

        return FileResponse(open(file_path, "rb"), as_attachment=True, filename=os.path.basename(file_path))
