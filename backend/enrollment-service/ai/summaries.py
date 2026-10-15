"""
Saved AI summaries: what makes one, who may read it, and how it is described.

The rules live here, apart from the views, so they can be tested without a
database (this service cannot build a test one -- see test_risk_assessment.py):
the pure helpers take plain values, and the few ORM reads are small functions
the view tests patch.

    resolve_subject   what a summary is about, built by the server
    fingerprint       a hash of the data the AI was given, for "has it changed?"
    save_generated    latest only: one live row per person per subject
    visible_summaries the viewer's own summary plus what others published
    summary_for_viewer one summary, if this viewer may read it
"""
import hashlib
import json
import re

from django.utils import timezone

from accounts.models import User
from enrollments.models import Enrollment

from .models import AiSummary

# Who may make, keep and read AI summaries: the interpret endpoint's roles.
# "Share with staff" publishes to exactly this set.
AI_SUMMARY_ROLES = {"super_admin", "admin", "registrar"}

# The heading each kind of summary carries on screen and in the Word file.
CONTEXT_TITLES = {
    "grade_report": "AI Grade Interpretation",
    "clustering_insights": "AI Student Grouping Summary",
}

# Generous for a 300-400 word summary plus a person's notes, small enough
# that a pasted novel is refused rather than stored.
MAX_TEXT_CHARS = 20_000

# Others' published summaries of one subject listed at once. Three roles can
# share, so a real school never gets near it; the cap only bounds the query.
MAX_SHARED = 20

_CLUSTER_SCOPE = ("school_year", "grading_period", "grade_level", "subject")
_SCOPE_PART_CHARS = 40

# Characters an XML 1.0 document (a .docx) cannot hold. python-docx raises on
# them, so an AI answer or an edit carrying one would make the file fail.
_XML_INVALID = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]")


def user_id_of(user):
    return getattr(user, "user_id", None) or getattr(user, "pk", None)


def clean_text(value):
    """Text as stored: \\r\\n folded to \\n, XML-invalid characters dropped,
    ends trimmed. Raises ValueError for anything but a string under the cap."""
    if not isinstance(value, str):
        raise ValueError("text must be a string.")
    text = _XML_INVALID.sub("", value.replace("\r\n", "\n").replace("\r", "\n")).strip()
    if len(text) > MAX_TEXT_CHARS:
        raise ValueError(f"text must be at most {MAX_TEXT_CHARS} characters.")
    return text


def fingerprint(filtered_payload):
    """sha256 of the payload the AI was given, independent of key order."""
    canonical = json.dumps(filtered_payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _scope_part(value):
    text = " ".join(str(value if value is not None else "").split())
    return text.replace("|", "/")[:_SCOPE_PART_CHARS]


def _enrollment_id(value):
    if isinstance(value, bool):
        raise ValueError("enrollment_id must be a whole number.")
    if isinstance(value, str) and value.strip().isdigit():
        value = int(value.strip())
    if not isinstance(value, int) or value <= 0:
        raise ValueError("enrollment_id is required for a grade report.")
    return value


def subject_for(context_type, filtered_payload, enrollment_id=None):
    """
    (subject_key, subject_meta) for a summary, from values only -- no lookup.

    A grade report is about one enrollment, named by id beside the payload
    (never inside it: the payload goes to the AI provider, and ids must not).
    A grouping is about its filters, read from the already-filtered payload,
    so two runs of the same filters share one saved summary.
    """
    if context_type == "grade_report":
        eid = _enrollment_id(enrollment_id)
        return f"enrollment:{eid}", {"enrollment_id": eid}
    if context_type == "clustering_insights":
        scope = {name: _scope_part(filtered_payload.get(name)) for name in _CLUSTER_SCOPE}
        return "cluster:" + "|".join(scope[name] for name in _CLUSTER_SCOPE), scope
    raise ValueError(f"context_type '{context_type}' cannot be saved.")


def enrollment_exists(enrollment_id):
    return Enrollment.objects.filter(pk=enrollment_id).exists()


def resolve_subject(context_type, filtered_payload, enrollment_id=None):
    """subject_for, plus a check that a named enrollment exists."""
    key, meta = subject_for(context_type, filtered_payload, enrollment_id)
    if "enrollment_id" in meta and not enrollment_exists(meta["enrollment_id"]):
        raise ValueError("That enrollment does not exist.")
    return key, meta


def save_generated(*, owner_user_id, context_type, subject_key, subject_meta, text, provider, fingerprint):
    """
    Latest only: a new answer replaces the owner's live summary of this
    subject, and with it any edit (the page asks before regenerating over
    one). A published copy is left as it was: others keep reading what the
    owner chose to share until they publish again.
    """
    summary, _ = AiSummary.objects.update_or_create(
        owner_user_id=owner_user_id,
        context_type=context_type,
        subject_key=subject_key,
        archived_at__isnull=True,
        defaults={
            "subject_meta": subject_meta,
            "ai_text": clean_text(text),
            "provider": provider,
            "data_fingerprint": fingerprint,
            "generated_at": timezone.now(),
            "edited_text": "",
            "edited_at": None,
        },
    )
    return summary


def is_shared(summary):
    return bool(summary.shared_text)


def serialize_own(summary, *, current_fingerprint):
    """The owner's view of their summary."""
    current = summary.current_text
    return {
        "id": summary.summary_id,
        "context_type": summary.context_type,
        "text": current,
        "ai_text": summary.ai_text,
        "edited": bool(summary.edited_text),
        "provider": summary.provider,
        "generated_at": summary.generated_at,
        "edited_at": summary.edited_at,
        "stale": summary.data_fingerprint != current_fingerprint,
        "shared": is_shared(summary),
        "shared_at": summary.shared_at,
        # False once the owner edits or regenerates after publishing: the
        # page then offers to update the published copy.
        "shared_is_current": is_shared(summary) and summary.shared_text == current,
    }


def serialize_shared(summary, *, owner_name, current_fingerprint):
    """Another staff member's view: the published copy only."""
    return {
        "id": summary.summary_id,
        "context_type": summary.context_type,
        "text": summary.shared_text,
        "owner_name": owner_name,
        "shared_at": summary.shared_at,
        "stale": summary.shared_fingerprint != current_fingerprint,
    }


def active_owner_names(user_ids):
    """{user_id: name} for the active accounts among user_ids. A deactivated
    owner's summaries count as archived: kept, but no longer shown."""
    if not user_ids:
        return {}
    return dict(
        User.objects.filter(user_id__in=user_ids, is_active=True).values_list("user_id", "name")
    )


def _live(context_type=None, subject_key=None):
    qs = AiSummary.objects.filter(archived_at__isnull=True)
    if context_type is not None:
        qs = qs.filter(context_type=context_type, subject_key=subject_key)
    return qs


def visible_summaries(viewer_id, context_type, subject_key, current_fingerprint):
    """{"mine": own summary or None, "shared": others' published copies}."""
    live = _live(context_type, subject_key)
    mine = live.filter(owner_user_id=viewer_id).first()
    others = list(
        live.exclude(owner_user_id=viewer_id).exclude(shared_text="").order_by("-shared_at")[:MAX_SHARED]
    )
    return assemble_visible(
        mine, others, active_owner_names({s.owner_user_id for s in others}), current_fingerprint,
    )


def assemble_visible(mine, others, names, current_fingerprint):
    """visible_summaries' answer from rows already read. `names` holds only
    active owners, so a deactivated owner's published copy drops out here."""
    return {
        "mine": serialize_own(mine, current_fingerprint=current_fingerprint) if mine else None,
        "shared": [
            serialize_shared(s, owner_name=names[s.owner_user_id], current_fingerprint=current_fingerprint)
            for s in others if s.owner_user_id in names and is_shared(s)
        ],
    }


def own_summary(summary_id, viewer_id):
    """The viewer's own live summary with this id, else None."""
    return _live().filter(pk=summary_id, owner_user_id=viewer_id).first()


def subject_exists(summary):
    eid = (summary.subject_meta or {}).get("enrollment_id")
    return eid is None or enrollment_exists(eid)


def summary_for_viewer(summary_id, viewer_id):
    """
    (summary, is_owner) when this viewer may read it, else None. Someone
    else's summary is readable only while it is published, live, its owner
    active and its enrollment still there; anything else is a plain "not
    found", so an id reveals nothing about whose summary it was.
    """
    summary = _live().filter(pk=summary_id).first()
    if summary is None:
        return None
    if summary.owner_user_id == viewer_id:
        return summary, True
    if not is_shared(summary) or summary.owner_user_id not in active_owner_names({summary.owner_user_id}):
        return None
    if not subject_exists(summary):
        return None
    return summary, False
