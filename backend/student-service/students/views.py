from rest_framework import viewsets, filters, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import serializers
from django.db import transaction
from django.db.models import Q
from .models import (
    Student,
    Household,
    Guardian,
    StudentSibling,
    Sibling,
    PreviousSchool,
    RequirementType,
    StudentRequirementSubmission,
)
from .serializers import (
    StudentSerializer,
    HouseholdSerializer,
    GuardianSerializer,
    StudentSiblingSerializer,
    SiblingSerializer,
    PreviousSchoolSerializer,
    RequirementTypeSerializer,
    StudentRequirementSubmissionSerializer,
    StudentBulkCreateSerializer,
    StudentBulkCreateResponseSerializer,
)


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["student_number", "lrn", "first_name", "middle_name", "last_name", "email"]
    ordering_fields = ["student_id", "student_number", "last_name", "birth_date", "status"]

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("sex"):
            queryset = queryset.filter(sex=params["sex"])
        if params.get("household_id"):
            queryset = queryset.filter(household_id=params["household_id"])
        if params.get("student_number"):
            queryset = queryset.filter(student_number=params["student_number"])
        if params.get("lrn"):
            queryset = queryset.filter(lrn=params["lrn"])
        if params.get("name"):
            name = params["name"]
            queryset = queryset.filter(
                Q(first_name__icontains=name) |
                Q(middle_name__icontains=name) |
                Q(last_name__icontains=name)
            )
        return queryset

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        serializer = StudentBulkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            # 1. Create household (optional)
            household_data = data.get("household")
            household = Household.objects.create(**household_data) if household_data else None

            # 2. Create student, link household if present
            student_data = data["student"]
            if household:
                student_data["household"] = household
            student = Student.objects.create(**student_data)

            # 3. Create guardians — inject student FK here, validate primary contact
            guardians = []
            primary_assigned = False
            for guardian_data in data.get("guardians", []):
                is_primary = guardian_data.get("is_primary_contact", False)
                if is_primary:
                    if primary_assigned:
                        raise serializers.ValidationError(
                            {"guardians": "Only one primary guardian is allowed per student."}
                        )
                    primary_assigned = True
                guardians.append(
                    Guardian.objects.create(student=student, **guardian_data)
                )

        response_data = {
            "student": student,
            "household": household,
            "guardians": guardians,
        }
        response_serializer = StudentBulkCreateResponseSerializer(response_data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class HouseholdViewSet(viewsets.ModelViewSet):
    queryset = Household.objects.all()
    serializer_class = HouseholdSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        student_id = self.request.query_params.get("student")
        if student_id:
            queryset = queryset.filter(student__student_id=student_id)
        return queryset


class GuardianViewSet(viewsets.ModelViewSet):
    queryset = Guardian.objects.all()
    serializer_class = GuardianSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["full_name", "email_address", "mobile_number"]
    ordering_fields = ["guardian_id", "full_name"]

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        if params.get("student_id"):
            queryset = queryset.filter(student_id=params["student_id"])
        if params.get("relationship"):
            queryset = queryset.filter(relationship=params["relationship"])
        if params.get("is_primary_contact") in ["true", "false"]:
            queryset = queryset.filter(is_primary_contact=params["is_primary_contact"] == "true")
        return queryset


class StudentSiblingViewSet(viewsets.ModelViewSet):
    queryset = StudentSibling.objects.all()
    serializer_class = StudentSiblingSerializer


class SiblingViewSet(viewsets.ModelViewSet):
    queryset = Sibling.objects.all()
    serializer_class = SiblingSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        student_id = self.request.query_params.get("student_id")
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        return queryset


class PreviousSchoolViewSet(viewsets.ModelViewSet):
    queryset = PreviousSchool.objects.all()
    serializer_class = PreviousSchoolSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        student_id = self.request.query_params.get("student_id")
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        return queryset


class RequirementTypeViewSet(viewsets.ModelViewSet):
    queryset = RequirementType.objects.all()
    serializer_class = RequirementTypeSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["requirement_code", "requirement_name"]
    ordering_fields = ["requirement_type_id", "requirement_code", "requirement_name"]

    def get_queryset(self):
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active in ["true", "false"]:
            queryset = queryset.filter(is_active=is_active == "true")
        return queryset


class StudentRequirementSubmissionViewSet(viewsets.ModelViewSet):
    queryset = StudentRequirementSubmission.objects.all()
    serializer_class = StudentRequirementSubmissionSerializer
    parser_classes = [MultiPartParser, FormParser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    ordering_fields = ["student_requirement_submission_id", "submitted_at", "verified_at"]

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        if params.get("student_id"):
            queryset = queryset.filter(student_id=params["student_id"])
        if params.get("requirement_type_id"):
            queryset = queryset.filter(requirement_type_id=params["requirement_type_id"])
        if params.get("is_submitted") in ["true", "false"]:
            queryset = queryset.filter(is_submitted=params["is_submitted"] == "true")
        return queryset