"""
QA audit - enrollment-service AI surface (ai/views.py, analytics_views.py,
risk_views.py, services.py).

Run from backend/enrollment-service:
    python -m pytest -c pytest.ini <this file> -p no:cacheprovider

No database is touched (pytest-django's DB blocker is on; every ORM entry point
the views use is patched) and no network call is made (providers are mocked).
Each test is written to assert the CORRECT behaviour, so a failure is a
confirmed defect, and the test id is the evidence reference used in the report.
"""
import json
import math
import os
import random
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from django.test import override_settings
from rest_framework.parsers import JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from accounts.permissions import HasRole
from ai import analytics_views as cluster_views
from ai import risk_views
from ai import services
from ai import views as ai_views

STAFF3 = {"super_admin", "admin", "registrar"}
ALL_ROLES = ["super_admin", "admin", "registrar", "teacher", "accounting", "guardian"]


# ───────────────────────── helpers ─────────────────────────

def _drf(method, path, data=None, *, raw_json=None, user=None):
    factory = APIRequestFactory()
    if method == "GET":
        dj = factory.get(path, data or {})
    elif raw_json is not None:
        dj = factory.post(path, data=raw_json, content_type="application/json")
    else:
        dj = factory.post(path, data, format="json")
    request = Request(dj, parsers=[JSONParser()])
    if user is not None:
        request.user = user
    return request


def _interpret(body=None, *, raw_json=None, gemini_text="ok", groq_text=None,
               gemini_key="gk", groq_key="", gemini_exc=None, groq_exc=None):
    """Run GeminiInterpretView.post with both providers mocked. Returns
    (response, gemini_client_mock, requests_post_mock)."""
    client = MagicMock()
    if gemini_exc is not None:
        client.models.generate_content.side_effect = gemini_exc
    else:
        client.models.generate_content.return_value.text = gemini_text
    post = MagicMock()
    post.return_value.json.return_value = {
        "choices": [{"message": {"content": groq_text or "groq says hi"}}]
    }
    if groq_exc is not None:
        post.side_effect = groq_exc
    request = _drf("POST", "/api/ai/interpret/", body, raw_json=raw_json)
    with override_settings(GEMINI_API_KEY=gemini_key, GROQ_API_KEY=groq_key), \
         patch("ai.views._get_client", return_value=client), \
         patch("ai.views.requests.post", post), \
         patch("shared.resilience.time.sleep"):
        response = ai_views.GeminiInterpretView().post(request)
    return response, client, post


def _prompt_sent(body):
    response, client, _ = _interpret(body)
    assert response.status_code == 200, response.data
    return client.models.generate_content.call_args.kwargs["contents"]


# ═════════════════ A. access control (backend enforcement) ═════════════════

VIEWS = [
    (ai_views.GeminiInterpretView, "POST", STAFF3),
    (cluster_views.ClusterAnalyticsView, "GET", STAFF3),
    (risk_views.RiskAssessmentRunView, "POST", STAFF3),
    (risk_views.RiskAssessmentLatestView, "GET", STAFF3 | {"teacher"}),
    (risk_views.RiskAssessmentTrendView, "GET", STAFF3 | {"teacher"}),
]


@pytest.mark.parametrize("view_cls,method,allowed", VIEWS, ids=lambda v: getattr(v, "__name__", None) or "")
@pytest.mark.parametrize("role", ALL_ROLES)
def test_A1_role_matrix(view_cls, method, allowed, role):
    request = SimpleNamespace(user=SimpleNamespace(is_authenticated=True, role=role), method=method)
    assert HasRole().has_permission(request, view_cls()) is (role in allowed)


@pytest.mark.parametrize("view_cls,method,allowed", VIEWS, ids=lambda v: getattr(v, "__name__", None) or "")
@pytest.mark.parametrize("user", [
    SimpleNamespace(is_authenticated=False, role="admin"),   # unauthenticated, role claim ignored
    SimpleNamespace(is_authenticated=True, role=None),
    SimpleNamespace(is_authenticated=True, role="ADMIN"),    # case must not widen access
    SimpleNamespace(is_authenticated=True, role="admin "),   # nor trailing space
    SimpleNamespace(is_authenticated=True, role="superuser"),
    SimpleNamespace(is_authenticated=True),                  # no role attribute at all
], ids=["unauth", "none", "upper", "trailing-space", "unknown", "no-attr"])
def test_A2_malformed_identities_are_denied(view_cls, method, allowed, user):
    request = SimpleNamespace(user=user, method=method)
    assert HasRole().has_permission(request, view_cls()) is False


def test_A3_every_ai_route_is_covered_by_the_matrix():
    from ai.urls import urlpatterns
    covered = {v[0] for v in VIEWS}
    routed = {p.callback.view_class for p in urlpatterns}
    assert routed <= covered, f"AI routes with no authorization test: {routed - covered}"
    for cls in routed:
        assert HasRole in cls.permission_classes
        assert cls.required_roles, f"{cls.__name__} has no required_roles (would fail closed, but be explicit)"


def test_A4_teacher_cannot_read_trend_outside_own_roster():
    view = risk_views.RiskAssessmentTrendView()
    request = _drf("GET", "/api/ai/risk-assessment/trend/", {"student_id": "999"},
                   user=SimpleNamespace(role="teacher", user_id=5, is_authenticated=True))
    with patch.object(risk_views, "teacher_student_ids", return_value={1, 2}):
        assert view.get(request).status_code == 403


def test_A5_teacher_with_no_advisory_fails_closed():
    view = risk_views.RiskAssessmentTrendView()
    request = _drf("GET", "/api/ai/risk-assessment/trend/", {"student_id": "1"},
                   user=SimpleNamespace(role="teacher", user_id=5, is_authenticated=True))
    with patch.object(risk_views, "teacher_student_ids", return_value=set()):
        assert view.get(request).status_code == 403


def test_A6_teacher_latest_run_is_filtered_to_roster():
    """A teacher must only ever receive score rows for their own students, and
    the school-wide summary must be computed from those rows only."""
    run = SimpleNamespace(
        run_id=1, school_year="2025-2026", grading_period="1st_quarter", school_level=None,
        grade_level=None, weights_json={}, created_at=None, updated_at=None,
    )
    def sc(sid, level="high"):
        return SimpleNamespace(
            student_id=sid, enrollment_id=sid * 10, grade_component=50.0, attendance_component=None,
            trend_component=None, narrative_component=None, risk_score=60.0, risk_level=level,
            reasons_json=[{"code": "low_average", "text": "x", "severity": "high"}],
            signals_present=1, average_grade=70.0, attendance_rate=None, grade_delta=None,
            failing_subject_count=1,
        )
    scores = [sc(1), sc(2), sc(3)]
    fake_students = {i: SimpleNamespace(student_id=i, last_name=f"L{i}", first_name=f"F{i}",
                                        middle_name=None, student_number=f"N{i}") for i in (1, 2, 3)}
    with patch.object(risk_views.Student, "objects") as s_objs, \
         patch.object(risk_views.Enrollment, "objects") as e_objs:
        s_objs.filter.return_value = list(fake_students.values())
        e_objs.filter.return_value.only.return_value = []
        out = risk_views._serialize_run(run, scores=scores, allowed_student_ids={2})
    assert [r["student_id"] for r in out["scores"]] == [2]
    assert out["student_count"] == 1
    assert out["summary"]["flagged_count"] == 1


# ═════════════════ B. /ai/interpret/ - payload handling ═════════════════

def test_B1_unknown_context_is_400():
    response, client, post = _interpret({"context_type": "nope", "payload": {"a": 1}})
    assert response.status_code == 400
    client.models.generate_content.assert_not_called()


def test_B2_every_context_advertised_as_valid_actually_works():
    """The 400 body lists PROMPTS' keys as 'Valid'. Each must be usable."""
    response, _, _ = _interpret({"context_type": "nope", "payload": {"a": 1}})
    advertised = [k for k in ai_views.PROMPTS if f"'{k}'" in response.data["detail"] or k in response.data["detail"]]
    unusable = [k for k in advertised if k not in ai_views.ALLOWED_PAYLOAD_FIELDS]
    assert not unusable, f"advertised as valid but always rejected: {unusable}"


@pytest.mark.parametrize("ctx", ["dashboard_insights", "scholarship_eligibility"])
def test_B3_prompts_without_an_allowlist_are_rejected(ctx):
    """Characterisation: these two prompts exist but can never run."""
    response, client, _ = _interpret({"context_type": ctx, "payload": {"total_students": 10}})
    assert response.status_code == 400
    client.models.generate_content.assert_not_called()


def test_B4_top_level_identifier_is_dropped():
    prompt = _prompt_sent({"context_type": "grade_report",
                           "payload": {"grade_level": "Grade 4", "student_name": "Ana Cruz",
                                       "lrn": "136700000620", "student_id": 620}})
    for secret in ("Ana Cruz", "136700000620", "student_name", "'student_id'"):
        assert secret not in prompt


def test_B5_identifier_nested_inside_allowed_key_is_dropped():
    """grades_by_subject is an allowed key, but the filter is top-level only."""
    prompt = _prompt_sent({"context_type": "grade_report", "payload": {
        "grade_level": "Grade 4",
        "grades_by_subject": {"Math": {"1st_quarter": 90},
                              "student_name": "Ana Cruz", "lrn": "136700000620"},
    }})
    assert "Ana Cruz" not in prompt and "136700000620" not in prompt


def test_B6_free_text_value_in_allowed_key_cannot_smuggle_an_identifier():
    prompt = _prompt_sent({"context_type": "grade_report", "payload": {
        "grade_level": "Grade 4", "section": "Ana Cruz (LRN 136700000620)",
    }})
    assert "Ana Cruz" not in prompt and "136700000620" not in prompt


def test_B7_prompt_size_is_bounded():
    big = {f"Subject {i}": {"1st_quarter": 80.0} for i in range(40_000)}
    prompt = _prompt_sent({"context_type": "grade_report",
                           "payload": {"grade_level": "Grade 4", "grades_by_subject": big}})
    assert len(prompt) < 50_000, f"{len(prompt):,} characters forwarded to the provider"


@pytest.mark.parametrize("bad", [["grade_report"], {"a": 1}, 7, True],
                         ids=["list", "dict", "int", "bool"])
def test_B8_non_string_context_type_is_400_not_500(bad):
    response, _, _ = _interpret({"context_type": bad, "payload": {"grade_level": "G4"}})
    assert response.status_code == 400


@pytest.mark.parametrize("raw", ['[1,2,3]', '"just a string"', '42', 'null'],
                         ids=["array", "string", "number", "null"])
def test_B9_non_object_body_is_400_not_500(raw):
    response, _, _ = _interpret(raw_json=raw)
    assert response.status_code == 400


def test_B10_format_placeholders_in_values_are_not_expanded():
    prompt = _prompt_sent({"context_type": "grade_report", "payload": {
        "grade_level": "Grade 4", "section": "{payload} {0} {__class__.__mro__}"}})
    assert "{__class__.__mro__}" in prompt  # literal, not evaluated


def test_B11_empty_model_text_falls_back_to_next_provider():
    """Gemini answering with no text (safety block / empty candidate) is a
    failed answer, not a success - the Groq fallback should be tried."""
    response, client, post = _interpret(
        {"context_type": "grade_report", "payload": {"grade_level": "Grade 4"}},
        gemini_text=None, groq_key="gq", groq_text="real answer",
    )
    assert response.status_code == 200
    assert response.data["interpretation"] == "real answer", (
        f"returned {response.data!r}; groq called={post.called}"
    )


def test_B12_provider_fallback_on_non_transient_gemini_error():
    exc = type("ClientError", (Exception,), {"code": 400})("bad request")
    response, _, post = _interpret(
        {"context_type": "grade_report", "payload": {"grade_level": "Grade 4"}},
        gemini_exc=exc, groq_key="gq", groq_text="from groq",
    )
    assert response.status_code == 200 and response.data["interpretation"] == "from groq"
    assert post.call_count == 1


def test_B13_all_providers_down_is_503_with_no_detail_leak():
    response, client, post = _interpret(
        {"context_type": "grade_report", "payload": {"grade_level": "Grade 4"}},
        gemini_exc=RuntimeError("secret-internal-detail AIzaFAKEKEY"),
        groq_key="gq", groq_exc=RuntimeError("secret-internal-detail gsk_FAKEKEY"),
    )
    body = json.dumps(response.data)
    assert response.status_code == 503, (response.status_code, body)
    assert "secret-internal-detail" not in body and "AIza" not in body and "gsk_" not in body


def test_B14_no_provider_configured_is_503():
    response, _, _ = _interpret({"context_type": "grade_report", "payload": {"grade_level": "G4"}},
                                gemini_key="", groq_key="")
    assert response.status_code == 503


def test_B15_response_declares_which_provider_answered():
    """AIInsightPanel reads data.provider / data.source to label the output."""
    response, _, _ = _interpret({"context_type": "grade_report", "payload": {"grade_level": "G4"}})
    assert response.data.get("provider") or response.data.get("source"), list(response.data)


def test_B16_worst_case_attempts_per_request():
    """Characterisation of cost/latency: provider calls behind ONE request."""
    import requests as rq
    client = MagicMock()
    client.models.generate_content.side_effect = type("ServerError", (Exception,), {"code": 503})("down")
    post = MagicMock(side_effect=rq.exceptions.Timeout("slow"))
    request = _drf("POST", "/api/ai/interpret/",
                   {"context_type": "grade_report", "payload": {"grade_level": "G4"}})
    with override_settings(GEMINI_API_KEY="gk", GROQ_API_KEY="gq"), \
         patch("ai.views._get_client", return_value=client), \
         patch("ai.views.requests.post", post), \
         patch("shared.resilience.time.sleep") as sleep:
        response = ai_views.GeminiInterpretView().post(request)
    assert response.status_code == 503
    calls = client.models.generate_content.call_count + post.call_count
    waits = sum(c.args[0] for c in sleep.call_args_list)
    print(f"\n[B16] provider calls={calls} (gemini={client.models.generate_content.call_count}, "
          f"groq={post.call_count}); backoff sleep={waits}s; groq timeout=20s each")
    assert calls <= 4


# ═════════════════ C. /ai/cluster/ ═════════════════

def _cohort(per_group=10, seed=7, groups=None):
    rng = random.Random(seed)
    groups = groups or [("weak", 68, 0.75, 1.3), ("mid", 82, 0.92, 2.1), ("strong", 93, 0.985, 2.9)]
    data, sid = {}, 1
    for _name, g, a, n in groups:
        for _ in range(per_group):
            grade = round(g + rng.uniform(-2, 2), 2)
            data[sid] = {
                "student_id": sid, "student_name": f"Synthetic, Student{sid:03d}",
                "student_number": f"T-{sid:04d}", "grade": grade,
                "grades": {"Math": grade, "English": grade},
                "attendance_rate": round(min(1.0, a + rng.uniform(-0.02, 0.02)), 4),
                "avg_narrative": round(min(3.0, max(1.0, n + rng.uniform(-0.2, 0.2))), 2),
                "narrative_ratings": ["SO"],
            }
            sid += 1
    return data


def _cluster(params=None, data=None, llm=None, llm_raw=None):
    params = {"school_year": "2025-2026", "grading_period": "1st_quarter", **(params or {})}
    request = _drf("GET", "/api/ai/cluster/", params)
    post = MagicMock()
    content = llm_raw if llm_raw is not None else json.dumps(llm if llm is not None else {
        "cluster_names": ["Needs Intervention", "Steady Performers", "High Achievers"],
        "interpretation": "Three groups.",
    })
    post.return_value.json.return_value = {"choices": [{"message": {"content": content}}]}
    env = {"GROQ_API_KEY": "gq", "GEMINI_API_KEY": ""}
    with patch.object(cluster_views, "build_student_features",
                      return_value=(data if data is not None else _cohort(), "Overall")), \
         patch.dict(os.environ, env), \
         patch("ai.analytics_views.requests.post", post), \
         patch("shared.resilience.time.sleep"):
        return cluster_views.ClusterAnalyticsView().get(request), post


def test_C1_recovers_three_planted_groups_in_standing_order():
    response, _ = _cluster({"n_clusters": "3"})
    assert response.status_code == 200
    clusters = response.data["clusters"]
    assert [c["student_count"] for c in clusters] == [10, 10, 10]
    avgs = [c["avg_grade"] for c in clusters]
    assert avgs == sorted(avgs), avgs                      # weakest -> strongest
    assert [c["band"] for c in clusters] == ["low", "middle", "high"]
    assert [c["color"] for c in clusters] == ["#a32d2d", "#fab219", "#0ca30c"]
    assert response.data["meta"]["silhouette_score"] > 0.5


def test_C2_every_student_assigned_exactly_once_and_totals_reconcile():
    response, _ = _cluster({"n_clusters": "3"})
    ids = [s["student_id"] for c in response.data["clusters"] for s in c["students"]]
    assert sorted(ids) == sorted(_cohort())
    assert len(ids) == len(set(ids)) == response.data["meta"]["total_students"] == 30


def test_C3_per_cluster_statistics_match_independent_recomputation():
    data = _cohort()
    response, _ = _cluster({"n_clusters": "3"}, data=data)
    for c in response.data["clusters"]:
        grades = [data[s["student_id"]]["grade"] for s in c["students"]]
        assert c["avg_grade"] == pytest.approx(np.mean(grades), abs=0.01)
        assert c["min_grade"] == pytest.approx(min(grades), abs=0.01)
        assert c["max_grade"] == pytest.approx(max(grades), abs=0.01)
        att = [data[s["student_id"]]["attendance_rate"] for s in c["students"]]
        assert c["avg_attendance"] == pytest.approx(np.mean(att), abs=0.001)


def test_C4_deterministic_across_runs():
    a, _ = _cluster({"n_clusters": "3"})
    b, _ = _cluster({"n_clusters": "3"})
    sig = lambda r: [[s["student_id"] for s in c["students"]] for c in r.data["clusters"]]  # noqa: E731
    assert sig(a) == sig(b)


def test_C5_response_is_strict_json_serialisable_with_missing_signals():
    data = _cohort()
    for sd in data.values():
        sd["attendance_rate"] = float("nan")
        sd["avg_narrative"] = float("nan")
        sd["narrative_ratings"] = []
    response, _ = _cluster({"n_clusters": "auto"}, data=data)
    assert response.status_code == 200
    JSONRenderer().render(response.data)  # raises on NaN/inf (STRICT_JSON)


@pytest.mark.parametrize("raw,expect", [
    ("abc", 400), ("2.5", 400), ("1e3", 400), ("--1", 400),
    ("0", 200), ("-4", 200), ("99", 200), ("", 200), ("AUTO", 200), ("none", 200),
])
def test_C6_n_clusters_validation(raw, expect):
    response, _ = _cluster({"n_clusters": raw})
    assert response.status_code == expect
    if expect == 200:
        assert 2 <= response.data["meta"]["n_clusters"] <= 7


def test_C7_small_and_degenerate_cohorts_are_400_not_500():
    two = dict(list(_cohort().items())[:2])
    assert _cluster(data=two)[0].status_code == 400
    same = {i: {**_cohort()[1], "student_id": i} for i in range(1, 6)}
    r, _ = _cluster(data=same)
    assert r.status_code == 400 and "nothing to split" in r.data["error"]


def test_C8_malformed_subject_id_is_a_client_error_not_a_crash():
    """Uses the REAL build_student_features (no patch): the ORM rejects the
    value while building the query, before any database access."""
    request = _drf("GET", "/api/ai/cluster/",
                   {"school_year": "2025-2026", "grading_period": "1st_quarter", "subject_id": "abc"})
    try:
        response = cluster_views.ClusterAnalyticsView().get(request)
    except Exception as exc:  # noqa: BLE001
        pytest.fail(f"unhandled {type(exc).__name__}: {exc}")
    assert 400 <= response.status_code < 500


LLM_SHAPES = {
    "json-list": None,                          # replaced by a bare JSON array below
    "names-is-string": {"cluster_names": "High Achievers", "interpretation": "x"},
    "names-is-dict": {"cluster_names": {"0": "A"}, "interpretation": "x"},
    "names-has-non-string": {"cluster_names": [1, None, {"x": 1}], "interpretation": "x"},
    "interpretation-is-object": {"cluster_names": ["Alpha", "Bravo", "Charlie"], "interpretation": {"text": "x"}},
    "interpretation-is-list": {"cluster_names": ["Alpha", "Bravo", "Charlie"], "interpretation": ["x", "y"]},
    "interpretation-missing": {"cluster_names": ["Alpha", "Bravo", "Charlie"]},
}


@pytest.mark.parametrize("shape", list(LLM_SHAPES))
def test_C9_unexpected_llm_json_shapes_never_break_the_page(shape):
    payload = ["Alpha", "Bravo", "Charlie"] if shape == "json-list" else LLM_SHAPES[shape]
    try:
        response, _ = _cluster({"n_clusters": "3"}, llm=payload)
    except Exception as exc:  # noqa: BLE001
        pytest.fail(f"unhandled {type(exc).__name__}: {exc}")
    assert response.status_code == 200
    assert isinstance(response.data["interpretation"], str), type(response.data["interpretation"])
    labels = [c["label"] for c in response.data["clusters"]]
    assert all(isinstance(l, str) and len(l) >= 3 for l in labels), labels


def test_C10_llm_names_are_length_bounded():
    long_name = "High Achievers " * 40
    response, _ = _cluster({"n_clusters": "3"},
                           llm={"cluster_names": [long_name, "B", "C"], "interpretation": "x"})
    assert max(len(c["label"]) for c in response.data["clusters"]) <= 60


def test_C11_misleading_llm_names_are_not_trusted_blindly():
    """The prompt asks the model not to call a weaker group stronger. Nothing
    enforces it server-side: a model that inverts the order is shown as-is."""
    response, _ = _cluster({"n_clusters": "3"}, llm={
        "cluster_names": ["High Achievers", "Steady Performers", "Needs Intervention"],
        "interpretation": "x"})
    weakest = response.data["clusters"][0]
    assert "high achiev" not in weakest["label"].lower(), (
        f"weakest group (avg {weakest['avg_grade']}, red) is labelled {weakest['label']!r}"
    )


def test_C12_markup_in_llm_text_is_returned_verbatim_for_the_client_to_escape():
    response, _ = _cluster({"n_clusters": "3"}, llm={
        "cluster_names": ["<img src=x onerror=alert(1)>", "B", "C"], "interpretation": "<script>1</script>"})
    # Backend returns data; the React panel renders text nodes. Characterisation only.
    assert response.status_code == 200


def test_C13_fenced_json_is_accepted():
    fenced = "```json\n" + json.dumps({"cluster_names": ["A", "B", "C"], "interpretation": "ok"}) + "\n```"
    response, _ = _cluster({"n_clusters": "3"}, llm_raw=fenced)
    assert [c["label"] for c in response.data["clusters"]] == ["A", "B", "C"]


def test_C14_non_json_llm_output_degrades_to_rank_names():
    response, _ = _cluster({"n_clusters": "3"}, llm_raw="Sorry, I cannot do that.")
    assert response.status_code == 200
    assert [c["label"] for c in response.data["clusters"]] == ["Needs Support", "Average", "High Achieving"]


# ═════════════════ D. risk scoring ═════════════════

def _sd(**kw):
    base = {"grade": 85.0, "grades": {"Math": 85.0}, "failing_subjects": [], "attendance_rate": 0.98,
            "grade_delta": 0.0, "avg_narrative": 3.0, "narrative_ratings": ["AO"],
            "previous_period": "1st_quarter", "total_school_days": 40, "absent_days": 1}
    base.update(kw)
    return base


def test_D1_scores_are_bounded_and_levels_match_thresholds():
    rng = random.Random(11)
    students = {}
    for i in range(1500):
        students[i] = _sd(
            grade=rng.uniform(40, 100),
            failing_subjects=[{"subject_name": "s", "grade": 70}] * rng.randint(0, 5),
            attendance_rate=rng.choice([float("nan"), rng.uniform(0.5, 1.0)]),
            grade_delta=rng.choice([float("nan"), rng.uniform(-20, 10)]),
            avg_narrative=rng.choice([float("nan"), rng.uniform(1, 3)]),
        )
    out = services.score_students(students)
    for r in out.values():
        assert 0.0 <= r["risk_score"] <= 100.0
        expected = next(lvl for cut, lvl in services.RISK_LEVEL_THRESHOLDS if r["risk_score"] <= cut)
        assert r["risk_level"] == expected


def test_D2_score_is_monotone_in_each_signal():
    def score(**kw):
        return services.score_students({1: _sd(**kw)})[1]["risk_score"]
    grades = [score(grade=g) for g in range(100, 55, -3)]
    assert grades == sorted(grades)
    att = [score(attendance_rate=a / 100) for a in range(100, 60, -2)]
    assert att == sorted(att)
    trend = [score(grade_delta=d) for d in range(5, -15, -1)]
    assert trend == sorted(trend)
    narr = [score(avg_narrative=n / 10) for n in range(30, 9, -1)]
    assert narr == sorted(narr)


def test_D3_one_students_score_does_not_depend_on_the_rest_of_the_batch():
    a, b = _sd(grade=62.0, failing_subjects=[{"subject_name": "m", "grade": 60}]), _sd(grade=97.0)
    alone = services.score_students({1: a})[1]
    batch = services.score_students({1: a, 2: b})[1]
    assert alone == batch


@pytest.mark.parametrize("rate,code", [
    (0.80, "severe_absence"), (0.81, "chronic_absence"), (0.90, "chronic_absence"),
    (0.91, "frequent_absence"), (0.95, "frequent_absence"), (0.96, None),
])
def test_D4_absence_reason_boundaries(rate, code):
    out = services.score_students({1: _sd(attendance_rate=rate)})[1]
    codes = {r["code"] for r in out["reasons"]}
    absence = codes & {"severe_absence", "chronic_absence", "frequent_absence"}
    assert absence == ({code} if code else set()), (rate, absence)


@pytest.mark.parametrize("grade,code", [(74.99, "low_average"), (75.0, "borderline_average"),
                                        (79.99, "borderline_average"), (80.0, None)])
def test_D5_grade_reason_boundaries(grade, code):
    out = services.score_students({1: _sd(grade=grade)})[1]
    codes = {r["code"] for r in out["reasons"]} & {"low_average", "borderline_average"}
    assert codes == ({code} if code else set())


def test_D6_a_failing_subject_is_never_scored_low():
    out = services.score_students({1: _sd(grade=90.0, failing_subjects=[{"subject_name": "Math", "grade": 70}])})[1]
    assert out["risk_level"] != "low"


def test_D7_custom_weights_cannot_zero_out_every_available_signal():
    """A student with only grade data, scored with weights that only weight
    narrative, comes out 'low' while carrying a 'failing 3 subjects' reason."""
    sd = _sd(grade=58.0, failing_subjects=[{"subject_name": f"S{i}", "grade": 55} for i in range(3)],
             attendance_rate=float("nan"), grade_delta=float("nan"), avg_narrative=float("nan"),
             narrative_ratings=[])
    out = services.score_students(
        {1: sd}, weights={"grade": 0, "attendance": 0, "trend": 0, "narrative": 1})[1]
    contradictory = out["risk_level"] == "low" and any(r["severity"] == "high" for r in out["reasons"])
    assert not contradictory, f"level={out['risk_level']} score={out['risk_score']} reasons={out['reasons']}"


def _run_post(raw_json):
    request = _drf("POST", "/api/ai/risk-assessment/run/", raw_json=raw_json,
                   user=SimpleNamespace(user_id=1, role="admin", is_authenticated=True))
    student_data = {1: _sd(student_id=1, enrollment_id=11, grade=70.0,
                           failing_subjects=[{"subject_name": "Math", "grade": 70}])}
    created = []
    run_row = MagicMock()
    with patch.object(risk_views, "ensure_open"), \
         patch.object(risk_views, "build_student_features", return_value=(student_data, "Overall")), \
         patch.object(risk_views, "transaction"), \
         patch.object(risk_views, "RiskAssessmentRun") as run_model, \
         patch.object(risk_views, "StudentRiskScore", side_effect=lambda **kw: created.append(kw) or kw) as score_model, \
         patch.object(risk_views, "_serialize_run", return_value={"ok": True}):
        run_model.objects.select_for_update.return_value.filter.return_value.first.return_value = None
        run_model.objects.create.return_value = run_row
        response = risk_views.RiskAssessmentRunView().post(request)
    return response, created


def test_D8_absurd_weight_values_are_rejected_before_anything_is_saved():
    body = ('{"school_year":"2025-2026","grading_period":"1st_quarter",'
            '"weights":{"grade":1e999,"attendance":1,"trend":1,"narrative":1}}')
    parsed = json.loads(body)
    assert math.isinf(parsed["weights"]["grade"])           # confirms the input is really +inf
    response, created = _run_post(body)
    persisted = [c["risk_score"] for c in created]
    assert response.status_code == 400, (
        f"status={response.status_code}; risk_score handed to bulk_create={persisted}"
    )


def test_D9_a_nan_score_could_not_be_rendered_if_it_were_ever_stored():
    """Why D8 matters: strict JSON rendering rejects NaN, so a run holding one
    would break every read of that run."""
    with pytest.raises(ValueError):
        JSONRenderer().render({"risk_score": float("nan")})


def test_D10_same_day_rerun_replaces_instead_of_duplicating():
    """Structure check on the update-in-place branch (no DB)."""
    src = open(risk_views.__file__, encoding="utf-8").read()
    assert "select_for_update" in src and "run.scores.all().delete()" in src
