from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend
from .models import RequirementType, StudentRequirementSubmission
from .serializers import RequirementTypeSerializer, StudentRequirementSubmissionSerializer


class RequirementTypeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RequirementType.objects.all()
    serializer_class = RequirementTypeSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["is_active"]


class StudentRequirementSubmissionViewSet(viewsets.ModelViewSet):
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
                    "image_url": sub.image_url if sub else None,
                    "remarks": sub.remarks if sub else None,
                    "submitted_at": sub.submitted_at if sub else None,
                    "verified_at": sub.verified_at if sub else None,
                    "submission_id": sub.student_requirement_submission_id if sub else None,
                }
            )
        return Response(result)