"""
Saved AI summaries (see ai/summaries.py for the rules).

    POST  /api/ai/summaries/lookup/          the viewer's summary + what others shared
    PATCH /api/ai/summaries/<id>/            the owner edits their version
    POST  /api/ai/summaries/<id>/share/      publish / withdraw the current version
    POST  /api/ai/summaries/<id>/archive/    hide it, keeping the row
    GET   /api/ai/summaries/<id>/docx/       the version this viewer may read, as Word

Making one is POST /api/ai/interpret/ (ai/views.py), which saves its answer.
Every view checks summaries.may_use for the summary's own kind and subject:
the role gate below only admits anyone who may use some kind.
Lookup is a POST because "has the data changed?" needs today's payload, which
is a body, not a query string.
"""
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasRole

from . import summaries
from .serializers import SummaryEditSerializer, SummaryShareSerializer
from .summary_docx import DOCX_CONTENT_TYPE, build_docx, byline_for, describe_subject, file_stem
from .views import prepare_payload

NOT_FOUND = {"detail": "Summary not found."}


class _SummaryView(APIView):
    permission_classes = [HasRole]
    required_roles = summaries.AI_SUMMARY_ROLES

    def viewer_id(self, request):
        return summaries.user_id_of(request.user)

    def own(self, request, summary_id):
        """The viewer's own live summary, while they may still use it, else
        None -- a teacher whose learner has left their sections included."""
        summary = summaries.own_summary(summary_id, self.viewer_id(request))
        if summary is None or not summaries.may_use(request.user, summary.context_type, summary.subject_meta):
            return None
        return summary

    def serialize(self, request, summary):
        return summaries.serialize_own(
            summary, current_fingerprint=summary.data_fingerprint,
            can_share=summaries.may_share(request.user),
        )


class SummaryLookupView(_SummaryView):
    def post(self, request):
        context_type = request.data.get("context_type", "")
        try:
            filtered, _ = prepare_payload(context_type, request.data.get("payload", {}))
            subject_key, subject_meta = summaries.resolve_subject(
                context_type, filtered, request.data.get("enrollment_id"),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if not summaries.may_use(request.user, context_type, subject_meta):
            return Response(summaries.NOT_ALLOWED, status=status.HTTP_403_FORBIDDEN)

        return Response(summaries.visible_summaries(
            self.viewer_id(request), context_type, subject_key, summaries.fingerprint(filtered),
            can_share=summaries.may_share(request.user),
        ))


class SummaryDetailView(_SummaryView):
    def patch(self, request, summary_id):
        summary = self.own(request, summary_id)
        if summary is None:
            return Response(NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
        body = SummaryEditSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        text = body.validated_data["text"]
        # Blank, or the AI's own words back, means "no edit of mine".
        if not text or text == summary.ai_text:
            summary.edited_text, summary.edited_at = "", None
        else:
            summary.edited_text, summary.edited_at = text, timezone.now()
        summary.save(update_fields=["edited_text", "edited_at", "updated_at"])
        return Response(self.serialize(request, summary))


class SummaryShareView(_SummaryView):
    def post(self, request, summary_id):
        summary = self.own(request, summary_id)
        if summary is None:
            return Response(NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
        body = SummaryShareSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        # Withdrawing stays open to everyone, so a copy published before a
        # role change can still be taken back.
        if body.validated_data["shared"] and not summaries.may_share(request.user):
            return Response(summaries.NOT_ALLOWED, status=status.HTTP_403_FORBIDDEN)
        if body.validated_data["shared"]:
            # A snapshot: later private edits stay private until published again.
            summary.shared_text = summary.current_text
            summary.shared_fingerprint = summary.data_fingerprint
            summary.shared_at = timezone.now()
        else:
            summary.shared_text, summary.shared_fingerprint, summary.shared_at = "", "", None
        summary.save(update_fields=["shared_text", "shared_fingerprint", "shared_at", "updated_at"])
        return Response(self.serialize(request, summary))


class SummaryArchiveView(_SummaryView):
    def post(self, request, summary_id):
        summary = self.own(request, summary_id)
        if summary is None:
            return Response(NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
        summary.archived_at = timezone.now()
        summary.save(update_fields=["archived_at", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class SummaryDocxView(_SummaryView):
    def get(self, request, summary_id):
        viewer = self.viewer_id(request)
        found = summaries.summary_for_viewer(
            summary_id, viewer, may_read_shared=summaries.may_share(request.user),
        )
        if found is None or not summaries.may_use(request.user, found[0].context_type, found[0].subject_meta):
            return Response(NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
        summary, is_owner = found

        owner_name = summaries.active_owner_names({summary.owner_user_id}).get(summary.owner_user_id, "")
        text = summary.current_text if is_owner else summary.shared_text
        heading, _ = describe_subject(summary)
        content = build_docx(
            summary, text=text,
            byline=byline_for(summary, is_owner=is_owner, owner_name=owner_name),
        )
        response = HttpResponse(content, content_type=DOCX_CONTENT_TYPE)
        response["Content-Disposition"] = f'attachment; filename="{file_stem(summary, heading)}.docx"'
        # A learner's grades: never kept by a browser or a proxy cache.
        response["Cache-Control"] = "no-store"
        return response
