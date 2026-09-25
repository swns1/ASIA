"""
Endpoints for self-service student intake.

Staff-facing (Bearer-authenticated, HasRole {super_admin, admin, registrar}):
    POST/GET  /api/application-invites/
    POST      /api/application-invites/{id}/revoke/
    POST      /api/application-invites/{id}/reissue/
    GET       /api/student-applications/[{id}/]
    PATCH     /api/student-applications/{id}/claim/
    POST      /api/student-applications/{id}/approve/
    POST      /api/student-applications/{id}/reject/

Applicant-facing (public — authentication_classes=[] is load-bearing, not
cosmetic; see the module docstring on why below):
    POST      /api/apply/{invite_id}/verify/
    GET/PATCH /api/apply/{invite_id}/draft/
    POST      /api/apply/{invite_id}/submit/

Why `authentication_classes = []` on the public views: the default
SingleSessionJWTAuthentication (student_service/settings.py) would try to
decode whatever's in the Authorization header. A stale staff Bearer token
still sitting in a shared front-desk device's storage would then produce a
401 — which the SPA's apiClient interceptor turns into a silent refresh
attempt and, on failure, `window.location.href = "/login"`, wiping
whatever the applicant had typed. Emptying the auth classes here makes that
mechanically impossible server-side, independent of the frontend's own fix
(apiClient.js's `redirectOnAuthFailure: false` option).

Why the applicant token is checked inside each view's method body rather
than in a permission class: DRF's request lifecycle runs
authenticate -> check_permissions -> check_throttles. A permission class
would reject (403) *before* throttling ever runs, so a flood of bad tokens
would never be counted against the throttle. Checking inside the handler
puts every caller behind the throttle first.
"""
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
# DRF's, not django.shortcuts': it turns a malformed id (a non-UUID invite,
# "abc" for an application) into a 404, where Django's raised ValueError or
# ValidationError and answered 500.
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasRole

from . import duplicates, invites, services
from .invites import InvalidApplicantToken
from .models import ApplicationInvite, StudentApplication
from .serializers import (
    ApplicantSubmissionSerializer,
    ApplicationApproveSerializer,
    ApplicationInviteIssueSerializer,
    ApplicationInviteSerializer,
    ApplicationRejectSerializer,
    StudentApplicationDetailSerializer,
    StudentApplicationListSerializer,
)
from .throttles import ApplicantDraftThrottle, ApplicantSubmitThrottle, ApplicantVerifyThrottle

REVIEW_ROLES = {"super_admin", "admin", "registrar"}

# Deliberately HasRole with an explicit role set, not IsAdminRegistrarOrReadOnly
# (the class every other StudentViewSet uses). That class grants READ to any
# authenticated non-guardian — teachers, accounting — which here would mean
# every applicant family's home address, contact numbers and marital status.
# Applications carry more sensitive household detail than a saved student
# record does, so the read gate is the same as the write gate.


def _build_apply_url(invite_id):
    from django.conf import settings
    base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
    return f"{base}/apply/{invite_id}"


def _invite_ttl_seconds():
    from django.conf import settings
    return int(getattr(settings, "APPLICATION_INVITE_TTL_SECONDS", 3 * 24 * 3600))  # 3 days


class ApplicationInviteViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    queryset = ApplicationInvite.objects.all()
    serializer_class = ApplicationInviteSerializer
    permission_classes = [HasRole]
    required_roles = REVIEW_ROLES

    def create(self, request, *args, **kwargs):
        payload = ApplicationInviteIssueSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        actor_id = getattr(request.user, "user_id", None) or getattr(request.user, "id", None)
        raw_code = invites.generate_access_code()

        invite = ApplicationInvite(
            applicant_first_name=data["applicant_first_name"],
            applicant_last_name=data["applicant_last_name"],
            contact_email=data.get("contact_email") or None,
            contact_mobile=data.get("contact_mobile") or None,
            issued_by_user_id=actor_id,
            expires_at=timezone.now() + timezone.timedelta(seconds=_invite_ttl_seconds()),
        )
        invite.set_access_code(raw_code)
        invite.save()

        apply_url = _build_apply_url(invite.pk)

        return Response(
            {
                **ApplicationInviteSerializer(invite).data,
                "access_code": raw_code,  # shown exactly once — never stored or re-derivable
                "apply_url": apply_url,
            },
            status=status.HTTP_201_CREATED,
        )

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get("status")
        if status_param == "active":
            now = timezone.now()
            qs = qs.filter(revoked_at__isnull=True, consumed_at__isnull=True, expires_at__gt=now)
        return qs

    def _get_invite(self, pk):
        return get_object_or_404(ApplicationInvite, pk=pk)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        invite = self._get_invite(pk)
        if invite.revoked_at is None:
            invite.revoked_at = timezone.now()
            invite.save(update_fields=["revoked_at"])
        return Response(ApplicationInviteSerializer(invite).data)

    @action(detail=True, methods=["post"])
    def reissue(self, request, pk=None):
        """Revokes the old invite (if not already) and issues a fresh one
        for the same applicant — used when a code is lost. A new invite_id
        means the old link stops working even if it was shared beyond the
        intended applicant."""
        old = self._get_invite(pk)
        if old.revoked_at is None:
            old.revoked_at = timezone.now()
            old.save(update_fields=["revoked_at"])

        actor_id = getattr(request.user, "user_id", None) or getattr(request.user, "id", None)
        raw_code = invites.generate_access_code()
        new_invite = ApplicationInvite(
            applicant_first_name=old.applicant_first_name,
            applicant_last_name=old.applicant_last_name,
            contact_email=old.contact_email,
            contact_mobile=old.contact_mobile,
            issued_by_user_id=actor_id,
            expires_at=timezone.now() + timezone.timedelta(seconds=_invite_ttl_seconds()),
        )
        new_invite.set_access_code(raw_code)
        new_invite.save()

        apply_url = _build_apply_url(new_invite.pk)

        return Response(
            {
                **ApplicationInviteSerializer(new_invite).data,
                "access_code": raw_code,
                "apply_url": apply_url,
            },
            status=status.HTTP_201_CREATED,
        )


class StudentApplicationViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    # Drafts are excluded from the staff-visible queue entirely — an
    # in-progress, unconfirmed form isn't something for the registrar to
    # act on yet, and a household mid-typing is not "submitted" anything.
    queryset = StudentApplication.objects.exclude(status=StudentApplication.DRAFT).select_related("invite")
    permission_classes = [HasRole]
    required_roles = REVIEW_ROLES

    def get_serializer_class(self):
        if self.action == "retrieve":
            return StudentApplicationDetailSerializer
        return StudentApplicationListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q
            qs = qs.filter(Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(lrn__icontains=search))
        return qs

    @action(detail=True, methods=["patch"])
    def claim(self, request, pk=None):
        get_object_or_404(StudentApplication, pk=pk)
        with transaction.atomic():
            application = StudentApplication.objects.select_for_update().get(pk=pk)
            services.transition(application, StudentApplication.IN_REVIEW, actor=request.user)
        return Response(StudentApplicationDetailSerializer(application).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        overrides = ApplicationApproveSerializer(data=request.data)
        overrides.is_valid(raise_exception=True)
        application, created = services.approve_application(
            pk, actor=request.user, overrides=overrides.validated_data,
        )
        return Response(
            StudentApplicationDetailSerializer(application).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        payload = ApplicationRejectSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        application = services.reject_application(
            pk, actor=request.user, note=payload.validated_data["decision_note"],
        )
        return Response(StudentApplicationDetailSerializer(application).data)


# ── Public applicant-facing views ──

def _token_error_response(exc):
    return Response(
        {"detail": "This link is no longer valid. Please ask a staff member for help.",
         "code": "applicant_token_invalid", "reason": str(exc)},
        status=status.HTTP_403_FORBIDDEN,
    )


class ApplyVerifyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ApplicantVerifyThrottle]

    @transaction.atomic
    def post(self, request, invite_id):
        # Locked for the read-check-write below. check_access_code() increments
        # code_attempts and locks the invite at MAX_CODE_ATTEMPTS, but without
        # the row lock two simultaneous guesses both read the same count and
        # both write it back as count+1 -- so a parallel guesser got more
        # attempts than the cap allows, which is the one thing the cap exists
        # to prevent. The per-invite throttle limits the rate; it does not
        # serialise what arrives inside one window.
        invite = get_object_or_404(
            ApplicationInvite.objects.select_for_update(), pk=invite_id
        )

        if invite.is_revoked or invite.is_expired:
            return Response(
                {"detail": "This invitation is no longer active.", "code": "invite_inactive"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if invite.is_consumed:
            return Response(
                {"detail": "This form has already been submitted.", "code": "invite_consumed"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if invite.is_locked:
            return Response(
                {"detail": "Too many incorrect attempts. Please ask a staff member for a new link.",
                 "code": "invite_locked"},
                status=status.HTTP_403_FORBIDDEN,
            )

        body = request.data if isinstance(request.data, dict) else {}
        code = str(body.get("access_code") or "").strip()
        ok = invite.check_access_code(code)
        invite.save(update_fields=["code_attempts", "locked_at"])
        if not ok:
            return Response(
                {"detail": "Incorrect code.", "code": "invalid_code",
                 "attempts_remaining": max(0, invite.MAX_CODE_ATTEMPTS - invite.code_attempts)},
                status=status.HTTP_403_FORBIDDEN,
            )

        # One draft per invite: resume returns the SAME row rather than a
        # fresh one, which is what makes closing the tab and reopening the
        # link (with the code) safe.
        application, _ = StudentApplication.objects.get_or_create(
            invite=invite, status=StudentApplication.DRAFT,
            defaults={"payload_json": {}},
        )

        token = invites.issue_session_token(invite, application)
        return Response({
            "token": token,
            "applicant_full_name": invite.applicant_full_name,
            "payload": application.payload_json,
            "revision": application.revision,
        })


class ApplyDraftView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ApplicantDraftThrottle]

    def _authorize(self, request, invite_id):
        token = request.META.get("HTTP_X_APPLICANT_TOKEN", "")
        return invites.verify_session_token(token, invite_id=invite_id)

    def get(self, request, invite_id):
        try:
            application = self._authorize(request, invite_id)
        except InvalidApplicantToken as exc:
            return _token_error_response(exc)
        return Response({"payload": application.payload_json, "revision": application.revision})

    def patch(self, request, invite_id):
        try:
            application = self._authorize(request, invite_id)
        except InvalidApplicantToken as exc:
            return _token_error_response(exc)

        from .serializers import (
            ALLOWED_APPLYING_FOR_FIELDS, ALLOWED_GUARDIAN_FIELDS,
            ALLOWED_HOUSEHOLD_FIELDS, ALLOWED_PREVIOUS_SCHOOL_FIELDS,
            ALLOWED_SIBLING_FIELDS, ALLOWED_STUDENT_FIELDS, whitelist,
        )

        body = request.data if isinstance(request.data, dict) else {}
        client_revision = body.get("revision")
        raw_payload = body.get("payload") or {}
        if client_revision is None:
            return Response({"detail": "revision is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            client_revision = int(client_revision)
        except (TypeError, ValueError):
            return Response({"detail": "revision must be a whole number."}, status=status.HTTP_400_BAD_REQUEST)
        # A malformed body used to reach .get() on a list, or iterate a null,
        # and answer 500 on this public endpoint.
        if not isinstance(raw_payload, dict):
            return Response({"detail": "payload must be an object."}, status=status.HTTP_400_BAD_REQUEST)

        def rows(key, allowed):
            value = raw_payload.get(key)
            return [whitelist(row, allowed) for row in value] if isinstance(value, list) else []

        # Best-effort whitelist on every autosave — not full serializer
        # validation, since the applicant may be mid-step with an
        # intentionally incomplete bundle. Nothing here is ever used to
        # create a real record without going through the strict validation
        # in ApplySubmitView / approve_application, so this pass exists to
        # keep the stored draft clean, not as the security boundary itself.
        cleaned = {
            "student": whitelist(raw_payload.get("student"), ALLOWED_STUDENT_FIELDS),
            "household": (whitelist(raw_payload.get("household"), ALLOWED_HOUSEHOLD_FIELDS)
                          if raw_payload.get("household") else None),
            "guardians": rows("guardians", ALLOWED_GUARDIAN_FIELDS),
            "siblings": rows("siblings", ALLOWED_SIBLING_FIELDS),
            "previous_schools": rows("previous_schools", ALLOWED_PREVIOUS_SCHOOL_FIELDS),
            "applying_for": whitelist(raw_payload.get("applying_for"), ALLOWED_APPLYING_FOR_FIELDS),
        }

        updated = StudentApplication.objects.filter(
            pk=application.pk, revision=client_revision,
        ).update(payload_json=cleaned, revision=F("revision") + 1, updated_at=timezone.now())

        if not updated:
            # Someone else's save landed first (two tabs on the same draft).
            # Hand back the current server copy so the client can reload
            # instead of blindly overwriting it.
            current = StudentApplication.objects.get(pk=application.pk)
            return Response(
                {"detail": "This draft was updated elsewhere. Reload to continue.",
                 "payload": current.payload_json, "revision": current.revision},
                status=status.HTTP_409_CONFLICT,
            )

        fresh = StudentApplication.objects.get(pk=application.pk)
        # A fresh token with every save, so an applicant who keeps working
        # never reaches the TTL (invites.issue_session_token always said this
        # happened; nothing did it, so the session ended two hours after the
        # code was entered however busy the applicant was).
        return Response({
            "payload": fresh.payload_json,
            "revision": fresh.revision,
            "token": invites.issue_session_token(application.invite, fresh),
        })


class ApplySubmitView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ApplicantSubmitThrottle]

    def post(self, request, invite_id):
        token = request.META.get("HTTP_X_APPLICANT_TOKEN", "")
        try:
            # require_draft=False: a replay of this same POST (double-tap,
            # a retry on flaky mobile data) must still resolve to this
            # application so the idempotent-replay branch below can run,
            # rather than being rejected here first. See verify_session_token's
            # docstring.
            application = invites.verify_session_token(token, invite_id=invite_id, require_draft=False)
        except InvalidApplicantToken as exc:
            return _token_error_response(exc)

        with transaction.atomic():
            application = StudentApplication.objects.select_for_update().get(pk=application.pk)

            if application.status != StudentApplication.DRAFT:
                # Replay of an already-submitted request (double-tap, retry
                # on flaky mobile data) — return the same result rather than
                # erroring or creating anything new.
                return Response({
                    "reference": application.reference,
                    "status": application.status,
                    "submitted_at": application.submitted_at,
                })

            serializer = ApplicantSubmissionSerializer(data=application.payload_json)
            serializer.is_valid(raise_exception=True)
            validated_view = serializer.data  # JSON-safe (dates -> strings), see intake/services.py

            student_data = validated_view.get("student", {})
            matches = duplicates.find_matches(student_data)

            # ApplicantSubmissionSerializer declares only the five keys that go
            # on to become real records, so `serializer.data` does not carry
            # `applying_for` -- and assigning it wholesale below used to destroy
            # the grade level the applicant chose. That key is the only piece of
            # enrolment intent the kiosk collects, and StudentApplicationsPage
            # reads it back on approval to prefill the enrolment form, so losing
            # it here silently emptied that prefill.
            #
            # Re-whitelisted through the same allow-list the draft PATCH uses,
            # so submit is no more permissive than autosave. It cannot reach a
            # student record: intake/services.py re-whitelists to the student
            # keys again before create_student_bundle.
            from .serializers import ALLOWED_APPLYING_FOR_FIELDS, whitelist
            applying_for = whitelist(
                (application.payload_json or {}).get("applying_for"),
                ALLOWED_APPLYING_FOR_FIELDS,
            )
            if applying_for:
                validated_view["applying_for"] = applying_for

            application.payload_json = validated_view
            application.lrn = (student_data.get("lrn") or "").strip() or None
            application.first_name = student_data.get("first_name", "")
            application.last_name = student_data.get("last_name", "")
            application.birth_date = student_data.get("birth_date") or None
            application.sex = student_data.get("sex")
            application.contact_email = student_data.get("email") or application.invite.contact_email
            application.contact_mobile = student_data.get("mobile_number") or application.invite.contact_mobile
            application.duplicate_matches_json = matches
            application.duplicate_of_student_id = duplicates.strongest_student_id(matches)
            application.status = StudentApplication.SUBMITTED
            application.submitted_at = timezone.now()
            application.save()

            # Consumes the invite so a fresh code-entry doesn't reopen this
            # draft. Conditioned on consumed_at IS NULL so a concurrent
            # request (extremely unlikely given the row lock above, but
            # cheap to guard) can't double-consume it.
            ApplicationInvite.objects.filter(pk=invite_id, consumed_at__isnull=True).update(
                consumed_at=timezone.now(), consumed_by_application_id=application.pk,
            )

        # Identical shape regardless of whether a duplicate was flagged —
        # see intake/duplicates.py's module docstring on why the response
        # must never leak that signal to an unauthenticated caller.
        return Response(
            {
                "reference": application.reference,
                "status": application.status,
                "submitted_at": application.submitted_at,
            },
            status=status.HTTP_201_CREATED,
        )
