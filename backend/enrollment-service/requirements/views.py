import os

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.throttling import ScopedRateThrottle
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import (
    IsAdminRegistrarOrReadOnly,
    IsStaffOrOwnerGuardianReadOnly,
    guardian_student_ids,
    teacher_student_ids,
)
from shared.uploads import download_url, file_kind_for, resolve_stored_path, verify_download_token

from .models import RequirementType, StudentRequirementSubmission
from .rules import applies_to
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
    # ViewSet.as_view() rejects any @action initkwarg that is not already an
    # attribute of the class, and APIView declares throttle_classes but not
    # throttle_scope -- so the scoped `file` action below made the router raise
    # TypeError while building urlpatterns, taking the whole service down at
    # import. None leaves the default routes unscoped; the action sets its own.
    throttle_scope = None

    def get_queryset(self):
        qs = StudentRequirementSubmission.objects.select_related("requirement_type")

        # IsAdminRegistrarOrReadOnly grants read to every authenticated
        # non-guardian, so without this scoping any teacher or accounting token
        # could list submissions for an arbitrary ?student_id= -- and the
        # serializer hands back a working signed download URL for each file
        # (PSA birth certificates, Form 137s) for any student in the school.
        #
        # The student-service twin of this viewset has always been scoped
        # (students.views._scope_to_teacher_roster). The `summary` action below
        # applies the same rule.
        role = getattr(self.request.user, "role", None)
        if role == "teacher":
            qs = qs.filter(student_id__in=teacher_student_ids(self.request.user))
        elif role == "accounting":
            # Document-submission status isn't billing-relevant, matching the
            # student-service default.
            return qs.none()

        student_id = self.request.query_params.get("student_id")
        if student_id:
            # A non-number went straight into the filter and answered 500.
            try:
                student_id = int(student_id)
            except (TypeError, ValueError):
                raise ValidationError({"student_id": "Must be a whole number."})
            qs = qs.filter(student_id=student_id)
        return qs

    # Guardians are denied by the viewset's IsAdminRegistrarOrReadOnly (it
    # refuses the guardian role outright), so this one read action opens the
    # gate and then scopes by ownership in the body -- the same shape as
    # billing's student_ledger. Staff access is unchanged; a guardian may pull
    # only their own child's summary.
    @action(
        detail=False,
        methods=["get"],
        url_path="summary",
        permission_classes=[IsStaffOrOwnerGuardianReadOnly],
    )
    def summary(self, request):
        student_id = request.query_params.get("student_id")
        if not student_id:
            return Response({"detail": "student_id is required."}, status=400)
        try:
            student_id = int(student_id)
        except (TypeError, ValueError):
            return Response({"detail": "student_id must be an integer."}, status=400)

        # The same reach as the list above. This action only ever checked
        # guardians, so accounting and every teacher could open any student's
        # checklist -- and each row carries a working signed download link to
        # the file itself (PSA birth certificate, Form 137).
        role = getattr(request.user, "role", None)
        if role == "guardian":
            allowed = student_id in guardian_student_ids(request.user)
        elif role == "teacher":
            allowed = student_id in teacher_student_ids(request.user)
        else:
            allowed = role != "accounting"
        if not allowed:
            return Response({"detail": "You do not have access to this record."}, status=403)

        # Optional placement scoping. Without it the summary lists the whole
        # catalogue and marks each row required-or-not on its own terms; with
        # it, `applies` also says whether THIS learner is asked for the
        # document at all, so the enrollment-side panel can separate
        # "still owed" from "not applicable here".
        school_level = request.query_params.get("school_level")
        entry_status = request.query_params.get("entry_status")

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
                    "is_required": rt.is_required,
                    "applies_to_levels": rt.applies_to_levels,
                    "applies_to_entry_statuses": rt.applies_to_entry_statuses,
                    # None when the caller named no placement — "not asked"
                    # is a different statement from "we don't know".
                    "applies": applies_to(
                        rt, school_level=school_level, entry_status=entry_status,
                    ) if (school_level and entry_status) else None,
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
        # authentication_classes=[] means request.user is anonymous, so the
        # default AnonRateThrottle (30/min, keyed on IP) applied here. One
        # registrar opening a student with a dozen documents spends half that
        # budget in a single page load, and a school behind one NAT address
        # shares the bucket building-wide -- so document thumbnails started
        # failing with 429s that looked like broken images. This scope is
        # sized for real viewing bursts; the actual access control is the
        # signed, submission-scoped, 5-minute token checked below, not the
        # rate limit.
        throttle_classes=[ScopedRateThrottle],
        throttle_scope="document_download",
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

        # Inline, not as_attachment. The SPA renders these in <img> and
        # <iframe> (DocumentViewModal.jsx) — Content-Disposition: attachment
        # makes a browser download a PDF instead of displaying it, so the
        # viewer showed a save dialog rather than the document.
        #
        # Safe to serve inline because uploads are restricted to jpg/png/pdf
        # by magic bytes (shared/uploads.py), stored under a generated UUID
        # name, and served from the API origin rather than the SPA's — so even
        # a malicious PDF cannot reach the app's session storage. nosniff stops
        # a browser from second-guessing the declared type.
        response = FileResponse(
            open(file_path, "rb"),
            as_attachment=False,
            filename=os.path.basename(file_path),
        )
        response["X-Content-Type-Options"] = "nosniff"
        return response
