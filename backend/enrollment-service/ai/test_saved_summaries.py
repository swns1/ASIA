"""
Saved AI summaries: private per person, shareable as a published copy,
latest only, flagged when the data moved on, archived rather than deleted.

No test database here (see test_risk_assessment.py): the rules are pure
functions tested directly, rows are unsaved AiSummary instances, and the few
ORM reads (own_summary, summary_for_viewer's lookups) are patched.
"""
from datetime import datetime, timezone
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.core.cache import cache
from django.db import DatabaseError
from django.test import override_settings
from docx import Document
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.permissions import GRADE_READ_ROLES
from ai import summaries
from ai.analytics_views import ClusterAnalyticsView
from ai.models import AiSummary
from ai.summary_docx import _when, build_docx, byline_for, file_stem, parse_blocks, parse_inline
from ai.summary_views import (
    SummaryArchiveView,
    SummaryDetailView,
    SummaryDocxView,
    SummaryLookupView,
    SummaryShareView,
)
from ai.views import GeminiInterpretView, prepare_payload

T0 = datetime(2026, 10, 14, 7, 20, tzinfo=timezone.utc)  # 3:20 PM in Manila
OWNER, OTHER = 7, 8


def _row(**overrides):
    fields = dict(
        summary_id=1, owner_user_id=OWNER, context_type="grade_report",
        subject_key="enrollment:5", subject_meta={"enrollment_id": 5},
        ai_text="**SUMMARY**\nDoing well.", provider="gemini", data_fingerprint="fp-1",
        generated_at=T0, edited_text="", edited_at=None,
        shared_text="", shared_fingerprint="", shared_at=None, archived_at=None,
    )
    fields.update(overrides)
    row = AiSummary(**fields)
    row.save = MagicMock()
    return row


def _user(user_id=OWNER, role="registrar"):
    return SimpleNamespace(user_id=user_id, pk=user_id, role=role, is_authenticated=True)


def _call(view_cls, method, path, *, user=None, data=None, **kwargs):
    factory = APIRequestFactory()
    request = getattr(factory, method)(path, data or {}, format="json")
    force_authenticate(request, user=user or _user())
    return view_cls.as_view()(request, **kwargs)


# ── What a summary is about ───────────────────────────────────────────────────

def test_a_grade_report_is_about_its_enrollment():
    assert summaries.subject_for("grade_report", {}, 42) == ("enrollment:42", {"enrollment_id": 42})
    assert summaries.subject_for("grade_report", {}, " 42 ")[0] == "enrollment:42"


@pytest.mark.parametrize("bad", [None, 0, -3, True, "abc", 4.5, {"id": 1}])
def test_a_grade_report_needs_a_real_enrollment_id(bad):
    with pytest.raises(ValueError):
        summaries.subject_for("grade_report", {}, bad)


def test_a_grouping_is_about_its_filters_only():
    payload = {"school_year": "2025-2026", "grading_period": "1st_quarter",
               "grade_level": "Grade 7", "subject": "Overall", "n_clusters": 3}
    key, meta = summaries.subject_for("clustering_insights", payload)
    assert key == "cluster:2025-2026|1st_quarter|Grade 7|Overall"
    # Another k is the same subject: latest only, flagged stale by the data.
    assert summaries.subject_for("clustering_insights", {**payload, "n_clusters": 5})[0] == key
    assert meta["grade_level"] == "Grade 7"


def test_a_grouping_key_cannot_be_forged_or_run_long():
    key, _ = summaries.subject_for("clustering_insights", {
        "school_year": "2025|2026", "grade_level": "x" * 500, "subject": "  Math \n Science ",
    })
    assert key.count("|") == 3
    assert "Math Science" in key
    assert len(key) <= 200


def test_a_kind_with_no_saved_form_is_refused():
    with pytest.raises(ValueError):
        summaries.subject_for("dashboard_insights", {})


def test_a_missing_enrollment_is_refused():
    with patch("ai.summaries.enrollment_exists", return_value=False), pytest.raises(ValueError):
        summaries.resolve_subject("grade_report", {}, 99)


# ── Has the data changed? ─────────────────────────────────────────────────────

def test_the_fingerprint_ignores_key_order_and_follows_the_data():
    a = summaries.fingerprint({"x": 1, "y": {"b": 2, "a": 1}})
    assert a == summaries.fingerprint({"y": {"a": 1, "b": 2}, "x": 1})
    assert a != summaries.fingerprint({"x": 1, "y": {"a": 1, "b": 3}})


def test_lookup_and_interpret_fingerprint_the_same_filtered_data():
    # A field the AI never sees (a name) must not make a summary look stale.
    with_name = {"grade_level": "Grade 4", "overall_average": "81.00", "student_name": "Ana"}
    without = {"grade_level": "Grade 4", "overall_average": "81.00"}
    a, _ = prepare_payload("grade_report", with_name)
    b, _ = prepare_payload("grade_report", without)
    assert summaries.fingerprint(a) == summaries.fingerprint(b)


# ── Stored text ───────────────────────────────────────────────────────────────

def test_text_is_cleaned_for_a_word_file():
    assert summaries.clean_text("  a\r\nb\x00c\x0b  ") == "a\nbc"


@pytest.mark.parametrize("bad", [None, 5, ["x"], "x" * (summaries.MAX_TEXT_CHARS + 1)])
def test_text_must_be_a_string_under_the_cap(bad):
    with pytest.raises(ValueError):
        summaries.clean_text(bad)


# ── What each reader sees ─────────────────────────────────────────────────────

def test_the_owner_sees_their_edit_and_whether_it_is_stale():
    row = _row(edited_text="My version", edited_at=T0)
    out = summaries.serialize_own(row, current_fingerprint="fp-2")
    assert out["text"] == "My version"
    assert out["ai_text"] == row.ai_text
    assert out["edited"] is True
    assert out["stale"] is True
    assert summaries.serialize_own(row, current_fingerprint="fp-1")["stale"] is False


def test_an_edit_after_publishing_leaves_the_published_copy_behind():
    row = _row(shared_text="**SUMMARY**\nDoing well.", shared_at=T0)
    assert summaries.serialize_own(row, current_fingerprint="fp-1")["shared_is_current"] is True
    row.edited_text = "Changed"
    assert summaries.serialize_own(row, current_fingerprint="fp-1")["shared_is_current"] is False


def test_others_see_only_the_published_copy():
    row = _row(edited_text="private notes", shared_text="published", shared_fingerprint="fp-1", shared_at=T0)
    out = summaries.serialize_shared(row, owner_name="Ana Reyes", current_fingerprint="fp-1")
    assert out["text"] == "published"
    assert "private notes" not in str(out)
    assert "ai_text" not in out and "edited" not in out
    assert out == {**out, "owner_name": "Ana Reyes", "stale": False}


def test_a_deactivated_owner_or_an_unpublished_row_is_not_listed():
    shared = _row(summary_id=2, owner_user_id=OTHER, shared_text="hi", shared_at=T0)
    gone = _row(summary_id=3, owner_user_id=9, shared_text="bye", shared_at=T0)
    unpublished = _row(summary_id=4, owner_user_id=OTHER)
    out = summaries.assemble_visible(None, [shared, gone, unpublished], {OTHER: "Ben"}, "fp-1")
    assert out["mine"] is None
    assert [s["id"] for s in out["shared"]] == [2]


def _found(row, *, active=True, exists=True, may_read_shared=True):
    live = MagicMock()
    live.filter.return_value.first.return_value = row
    with patch("ai.summaries._live", return_value=live), \
         patch("ai.summaries.active_owner_names", return_value={row.owner_user_id: "Ana"} if active else {}), \
         patch("ai.summaries.enrollment_exists", return_value=exists):
        return summaries.summary_for_viewer(row.summary_id, OTHER, may_read_shared=may_read_shared)


def test_someone_elses_summary_is_readable_only_while_published_active_and_on_file():
    published = dict(shared_text="hi", shared_at=T0)
    assert _found(_row(**published)) is not None
    assert _found(_row(**published), may_read_shared=False) is None  # a teacher
    assert _found(_row()) is None                               # never published
    assert _found(_row(**published), active=False) is None      # owner deactivated
    assert _found(_row(**published), exists=False) is None      # enrollment gone


# ── Making one ────────────────────────────────────────────────────────────────

def _interpret(body, *, gemini_text="**SUMMARY**\nok", user=None):
    # Through the real view, so through its tight per-user rate as well: each
    # call starts with an empty count (test_interpret_throttle.py covers it).
    cache.clear()
    client = MagicMock()
    client.models.generate_content.return_value.text = gemini_text
    with override_settings(GEMINI_API_KEY="key", GROQ_API_KEY=""), \
         patch("ai.views._get_client", return_value=client):
        response = _call(GeminiInterpretView, "post", "/api/ai/interpret/", data=body, user=user)
    return response, client


@pytest.mark.usefixtures("stub_summary_store")
def test_the_enrollment_id_never_reaches_the_ai():
    response, client = _interpret({
        "context_type": "grade_report", "enrollment_id": 987654,
        "payload": {"grade_level": "Grade 4", "enrollment_id": 987654},
    })
    assert response.status_code == 200
    assert "987654" not in client.models.generate_content.call_args.kwargs["contents"]


def test_a_summary_with_nowhere_to_be_saved_costs_no_ai_call(stub_summary_store):
    response, client = _interpret({"context_type": "grade_report", "payload": {"grade_level": "Grade 4"}})
    assert response.status_code == 400
    client.models.generate_content.assert_not_called()
    stub_summary_store.assert_not_called()


def test_every_answer_is_saved_against_its_owner_and_data(stub_summary_store):
    payload = {"grade_level": "Grade 4", "student_name": "Ana"}
    response, _ = _interpret({"context_type": "grade_report", "enrollment_id": 5, "payload": payload})
    assert response.status_code == 200
    saved = stub_summary_store.call_args.kwargs
    assert saved["owner_user_id"] == OWNER
    assert saved["subject_key"] == "enrollment:5"
    assert saved["provider"] == "gemini"
    assert saved["fingerprint"] == summaries.fingerprint({"grade_level": "Grade 4"})
    assert response.data["summary"]["id"] == 1


def test_a_failed_save_still_returns_the_paid_for_text(stub_summary_store):
    stub_summary_store.side_effect = DatabaseError("down")
    response, _ = _interpret({"context_type": "grade_report", "enrollment_id": 5,
                              "payload": {"grade_level": "Grade 4"}})
    assert response.status_code == 200
    assert response.data["interpretation"] == "**SUMMARY**\nok"
    assert response.data["summary"] is None


# ── Who may use the endpoints ─────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["accounting", "guardian"])
@pytest.mark.parametrize("view_cls,method,kwargs", [
    (SummaryLookupView, "post", {}),
    (SummaryDetailView, "patch", {"summary_id": 1}),
    (SummaryShareView, "post", {"summary_id": 1}),
    (SummaryArchiveView, "post", {"summary_id": 1}),
    (SummaryDocxView, "get", {"summary_id": 1}),
])
def test_only_ai_summary_roles_reach_the_endpoints(role, view_cls, method, kwargs):
    response = _call(view_cls, method, "/x/", user=_user(role=role), **kwargs)
    assert response.status_code == 403


@pytest.mark.parametrize("view_cls,method", [
    (SummaryDetailView, "patch"), (SummaryShareView, "post"), (SummaryArchiveView, "post"),
])
def test_only_the_owner_may_change_a_summary(view_cls, method):
    with patch("ai.summaries.own_summary", return_value=None) as own:
        response = _call(view_cls, method, "/x/", user=_user(OTHER),
                         data={"text": "x", "shared": True}, summary_id=1)
    assert response.status_code == 404
    own.assert_called_once_with(1, OTHER)


# ── Teachers: their own learners' grade reports, kept private ─────────────────

LEARNER, OTHER_LEARNER = 50, 51


def _teacher(user_id=OWNER):
    return _user(user_id, role="teacher")


@pytest.fixture
def roster():
    """The teacher's sections hold LEARNER; enrollment 5 is LEARNER's and
    enrollment 6 is OTHER_LEARNER's (anything else is not on file)."""
    with patch("ai.summaries.teacher_student_ids", return_value={LEARNER}), \
         patch("ai.summaries.enrollment_student_id",
               side_effect=lambda eid: {5: LEARNER, 6: OTHER_LEARNER}.get(eid)):
        yield


def test_each_kind_of_summary_follows_the_page_it_is_made_on():
    # The same objects, so the Grades page and its summary cannot drift apart
    # again -- teachers saw the panel for months and were refused by it.
    assert summaries.CONTEXT_ROLES["grade_report"] is GRADE_READ_ROLES
    assert summaries.CONTEXT_ROLES["clustering_insights"] is ClusterAnalyticsView.required_roles
    assert set(summaries.CONTEXT_ROLES) == set(summaries.CONTEXT_TITLES)
    assert summaries.AI_SUMMARY_ROLES == GRADE_READ_ROLES | ClusterAnalyticsView.required_roles
    assert "teacher" not in summaries.SHARE_ROLES


@pytest.mark.usefixtures("roster")
def test_a_teacher_may_use_grade_reports_of_their_own_learners_only():
    teacher = _teacher()
    assert summaries.may_use(teacher, "grade_report", {"enrollment_id": 5}) is True
    assert summaries.may_use(teacher, "grade_report", {"enrollment_id": 6}) is False
    assert summaries.may_use(teacher, "grade_report", {"enrollment_id": 99}) is False  # gone
    assert summaries.may_use(teacher, "grade_report", {}) is False
    assert summaries.may_use(teacher, "clustering_insights", {"school_year": "2025-2026"}) is False


def test_other_staff_are_not_held_to_a_roster():
    with patch("ai.summaries.teacher_student_ids") as roster_read:
        assert summaries.may_use(_user(role="registrar"), "grade_report", {"enrollment_id": 6}) is True
        assert summaries.may_use(_user(role="admin"), "clustering_insights", {}) is True
    roster_read.assert_not_called()
    assert summaries.may_use(_user(role="accounting"), "grade_report", {"enrollment_id": 6}) is False


@pytest.mark.usefixtures("roster")
def test_a_teacher_can_analyze_their_own_learner(stub_summary_store):
    response, client = _interpret(
        {"context_type": "grade_report", "enrollment_id": 5, "payload": {"grade_level": "Grade 4"}},
        user=_teacher(),
    )
    assert response.status_code == 200
    assert response.data["summary"]["can_share"] is False
    client.models.generate_content.assert_called_once()


@pytest.mark.usefixtures("roster")
def test_a_teacher_is_refused_another_learner_before_any_ai_call(stub_summary_store):
    response, client = _interpret(
        {"context_type": "grade_report", "enrollment_id": 6, "payload": {"grade_level": "Grade 4"}},
        user=_teacher(),
    )
    assert response.status_code == 403
    client.models.generate_content.assert_not_called()
    stub_summary_store.assert_not_called()


@pytest.mark.usefixtures("roster")
def test_a_teacher_looks_up_only_their_own_summary_of_their_own_learner():
    body = {"context_type": "grade_report", "payload": {"grade_level": "Grade 4"}}
    with patch("ai.summaries.enrollment_exists", return_value=True), \
         patch("ai.summaries.visible_summaries", return_value={"mine": None, "shared": []}) as visible:
        mine = _call(SummaryLookupView, "post", "/x/", user=_teacher(), data={**body, "enrollment_id": 5})
        theirs = _call(SummaryLookupView, "post", "/x/", user=_teacher(), data={**body, "enrollment_id": 6})
    assert mine.status_code == 200
    assert visible.call_args.kwargs["can_share"] is False
    assert theirs.status_code == 403
    visible.assert_called_once()


@pytest.mark.usefixtures("roster")
def test_a_teacher_may_withdraw_but_not_publish():
    row = _row(shared_text="published before", shared_fingerprint="fp-1", shared_at=T0)
    with patch("ai.summaries.own_summary", return_value=row):
        publish = _call(SummaryShareView, "post", "/x/", user=_teacher(), data={"shared": True}, summary_id=1)
        assert publish.status_code == 403
        assert row.shared_text == "published before"
        withdraw = _call(SummaryShareView, "post", "/x/", user=_teacher(), data={"shared": False}, summary_id=1)
    assert withdraw.status_code == 200
    assert row.shared_text == ""


@pytest.mark.usefixtures("roster")
@pytest.mark.parametrize("view_cls,method", [
    (SummaryDetailView, "patch"), (SummaryShareView, "post"), (SummaryArchiveView, "post"),
])
def test_a_teacher_loses_their_summary_when_the_learner_leaves_their_sections(view_cls, method):
    row = _row(subject_key="enrollment:6", subject_meta={"enrollment_id": 6})
    with patch("ai.summaries.own_summary", return_value=row):
        response = _call(view_cls, method, "/x/", user=_teacher(),
                         data={"text": "x", "shared": False}, summary_id=1)
    assert response.status_code == 404
    row.save.assert_not_called()


@pytest.mark.usefixtures("roster")
def test_a_teacher_downloads_only_their_own_summary():
    with patch("ai.summaries.summary_for_viewer", return_value=None) as found:
        response = _call(SummaryDocxView, "get", "/x/", user=_teacher(), summary_id=1)
    assert response.status_code == 404
    assert found.call_args.kwargs["may_read_shared"] is False


# ── Editing, sharing, archiving ───────────────────────────────────────────────

def _edit(row, data):
    with patch("ai.summaries.own_summary", return_value=row):
        return _call(SummaryDetailView, "patch", "/x/", data=data, summary_id=1)


def test_an_edit_is_kept_beside_the_ai_original():
    row = _row()
    response = _edit(row, {"text": "My notes\r\nand more"})
    assert response.status_code == 200
    assert row.edited_text == "My notes\nand more"
    assert row.ai_text == "**SUMMARY**\nDoing well."
    assert response.data["edited"] is True


@pytest.mark.parametrize("text", ["", "   ", "**SUMMARY**\nDoing well."])
def test_blank_or_the_ai_text_back_resets_the_edit(text):
    row = _row(edited_text="old", edited_at=T0)
    _edit(row, {"text": text})
    assert row.edited_text == "" and row.edited_at is None


@pytest.mark.parametrize("data", [{}, {"text": None}, {"text": "x" * 20_001}])
def test_a_bad_edit_is_refused(data):
    row = _row()
    assert _edit(row, data).status_code == 400
    row.save.assert_not_called()


def test_sharing_publishes_a_snapshot_and_unsharing_withdraws_it():
    row = _row(edited_text="Edited version", edited_at=T0)
    with patch("ai.summaries.own_summary", return_value=row):
        _call(SummaryShareView, "post", "/x/", data={"shared": True}, summary_id=1)
        assert row.shared_text == "Edited version"
        assert row.shared_fingerprint == "fp-1"
        assert row.shared_at is not None

        row.edited_text = "Later private change"
        assert row.shared_text == "Edited version"

        _call(SummaryShareView, "post", "/x/", data={"shared": False}, summary_id=1)
        assert (row.shared_text, row.shared_fingerprint, row.shared_at) == ("", "", None)


def test_sharing_needs_a_yes_or_no():
    row = _row()
    with patch("ai.summaries.own_summary", return_value=row):
        response = _call(SummaryShareView, "post", "/x/", data={}, summary_id=1)
    assert response.status_code == 400


def test_archiving_keeps_the_row():
    row = _row()
    with patch("ai.summaries.own_summary", return_value=row):
        response = _call(SummaryArchiveView, "post", "/x/", summary_id=1)
    assert response.status_code == 204
    assert row.archived_at is not None
    row.save.assert_called_once()
    assert row.ai_text  # nothing cleared


def test_latest_only_is_enforced_by_the_database_for_live_rows():
    (constraint,) = AiSummary._meta.constraints
    assert set(constraint.fields) == {"owner_user_id", "context_type", "subject_key"}
    assert "archived_at__isnull" in str(constraint.condition)


# ── The Word file ─────────────────────────────────────────────────────────────

def test_the_file_reads_the_markup_the_page_does():
    blocks = parse_blocks("**KEY POINTS**\n\n* Strong in **Math**\n- Weak in *Filipino*\nPlain line")
    assert blocks == [
        ("heading", "KEY POINTS"),
        ("bullet", [("Strong in ", False, False), ("Math", True, False)]),
        ("bullet", [("Weak in ", False, False), ("Filipino", False, True)]),
        ("paragraph", [("Plain line", False, False)]),
    ]
    assert parse_inline("**") == [("**", False, False)]


def _docx_text(row, text):
    school = SimpleNamespace(name="Sample School", address="Cebu City")
    with patch("ai.summary_docx.load_school", return_value=school), \
         patch("ai.summary_docx.describe_subject", return_value=("Cruz, Ana", "Grade 4 · Rizal")):
        content = build_docx(row, text=text, byline="Generated by Gemini")
    return "\n".join(p.text for p in Document(BytesIO(content)).paragraphs)


def test_the_file_carries_the_school_subject_and_text():
    body = _docx_text(_row(), "**SUMMARY**\n* Strong in **Math**")
    for expected in ("Sample School", "AI Grade Interpretation", "Cruz, Ana", "Summary",
                     "Strong in Math", "For guidance purposes only"):
        assert expected in body


def test_the_byline_names_the_writer_and_the_editor():
    row = _row(edited_text="x", edited_at=T0, shared_at=T0)
    assert byline_for(row, is_owner=True, owner_name="Ana") == (
        "Generated by Gemini on October 14, 2026, 3:20 PM · Edited by Ana on October 14, 2026, 3:20 PM"
    )
    assert byline_for(row, is_owner=False, owner_name="Ana") == "Shared by Ana on October 14, 2026, 3:20 PM"


def test_dates_have_no_padding_on_any_platform():
    assert _when(datetime(2026, 1, 5, 1, 7, tzinfo=timezone.utc)) == "January 5, 2026, 9:07 AM"


def test_the_filename_is_plain_ascii():
    assert file_stem(_row(), "Dela Cruz, Ñiño M.") == "AI-Grade-Interpretation_Dela-Cruz-i-o-M"


def test_a_shared_reader_downloads_the_published_copy_not_the_private_edit():
    row = _row(edited_text="private", shared_text="published", shared_at=T0)
    with patch("ai.summaries.summary_for_viewer", return_value=(row, False)), \
         patch("ai.summaries.active_owner_names", return_value={OWNER: "Ana"}), \
         patch("ai.summary_views.describe_subject", return_value=("Cruz, Ana", "")), \
         patch("ai.summary_views.build_docx", return_value=b"doc") as build:
        response = _call(SummaryDocxView, "get", "/x/", user=_user(OTHER), summary_id=1)
    assert response.status_code == 200
    assert build.call_args.kwargs["text"] == "published"
    assert response["Cache-Control"] == "no-store"
    assert response["Content-Disposition"].endswith('.docx"')


def test_a_summary_the_reader_may_not_see_is_not_found():
    with patch("ai.summaries.summary_for_viewer", return_value=None):
        response = _call(SummaryDocxView, "get", "/x/", user=_user(OTHER), summary_id=1)
    assert response.status_code == 404
