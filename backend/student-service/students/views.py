import os

from rest_framework import viewsets, filters, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import serializers
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404

from accounts.permissions import IsAdminRegistrarOrReadOnly, teacher_student_ids
from shared.uploads import resolve_stored_path, verify_download_token
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
    StudentBillingSummarySerializer,
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


def _scope_to_teacher_roster(queryset, user, *, field="student_id__in", deny_accounting=True):
    """
    A teacher only sees records for students in their own section advisory
    roster (accounts.permissions.teacher_student_ids). accounting is denied
    outright by default -- guardian contacts, sibling relationships,
    previous-school history, and document-submission status aren't
    billing-relevant (see StudentViewSet.get_serializer_class and
    HouseholdViewSet, the two places accounting does have a real need, for
    the deny_accounting=False exception). super_admin/admin/registrar are
    unfiltered, matching this class's existing behavior before this scoping
    was added.
    """
    role = getattr(user, "role", None)
    if role == "teacher":
        return queryset.filter(**{field: teacher_student_ids(user)})
    if role == "accounting" and deny_accounting:
        return queryset.none()
    return queryset


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
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
        # accounting keeps roster-wide access (see get_serializer_class --
        # it gets a reduced field set instead, not a filtered queryset: any
        # student could need an invoice, so scoping by teacher-style roster
        # doesn't make sense here).
        return _scope_to_teacher_roster(queryset, self.request.user, deny_accounting=False)

    def get_serializer_class(self):
        # accounting gets enough to identify a student for invoicing (name,
        # LRN, status, household) without the demographic PII (religion,
        # birth_date, exact addresses, personal contact info) it has no
        # billing-relevant need for -- see StudentBillingSummarySerializer.
        if getattr(self.request.user, "role", None) == "accounting":
            return StudentBillingSummarySerializer
        return super().get_serializer_class()

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
    permission_classes = [IsAdminRegistrarOrReadOnly]

    def get_queryset(self):
        queryset = super().get_queryset()
        student_id = self.request.query_params.get("student")
        if student_id:
            queryset = queryset.filter(student__student_id=student_id)
        # accounting keeps access here (unlike the other viewsets below):
        # is_4ps_beneficiary / parent_marital_status / living_arrangement
        # are exactly the kind of thing that affects fee discounts and
        # scholarship eligibility.
        return _scope_to_teacher_roster(
            queryset, self.request.user, field="student__student_id__in", deny_accounting=False
        )


class GuardianViewSet(viewsets.ModelViewSet):
    queryset = Guardian.objects.all()
    serializer_class = GuardianSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
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
        if params.get("user_id"):
            queryset = queryset.filter(user_id=params["user_id"])
        if params.get("user_id__in"):
            ids = [v.strip() for v in params["user_id__in"].split(",") if v.strip()]
            queryset = queryset.filter(user_id__in=ids)
        return _scope_to_teacher_roster(queryset, self.request.user)


class StudentSiblingViewSet(viewsets.ModelViewSet):
    queryset = StudentSibling.objects.all()
    serializer_class = StudentSiblingSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    def get_queryset(self):
        queryset = super().get_queryset()
        role = getattr(self.request.user, "role", None)
        if role == "teacher":
            # Two FK's to Student (student, sibling_student); a teacher can
            # see the relationship if either side is one of their own.
            ids = teacher_student_ids(self.request.user)
            queryset = queryset.filter(Q(student_id__in=ids) | Q(sibling_student_id__in=ids))
        elif role == "accounting":
            queryset = queryset.none()
        return queryset


class SiblingViewSet(viewsets.ModelViewSet):
    queryset = Sibling.objects.all()
    serializer_class = SiblingSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    def get_queryset(self):
        queryset = super().get_queryset()
        student_id = self.request.query_params.get("student_id")
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        return _scope_to_teacher_roster(queryset, self.request.user)


class PreviousSchoolViewSet(viewsets.ModelViewSet):
    queryset = PreviousSchool.objects.all()
    serializer_class = PreviousSchoolSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    def get_queryset(self):
        queryset = super().get_queryset()
        student_id = self.request.query_params.get("student_id")
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        return _scope_to_teacher_roster(queryset, self.request.user)


class RequirementTypeViewSet(viewsets.ModelViewSet):
    queryset = RequirementType.objects.all()
    serializer_class = RequirementTypeSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
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
    permission_classes = [IsAdminRegistrarOrReadOnly]
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
        return _scope_to_teacher_roster(queryset, self.request.user)

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