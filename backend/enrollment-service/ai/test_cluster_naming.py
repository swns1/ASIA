"""
The /ai/cluster/ call asks the AI for group names and nothing else.

It used to ask for a 3-5 sentence narrative too, returned it as
"interpretation", and no page ever showed it: paid-for text on every run.
The written summary of the groups is the saved one the Analytics page asks
for on a click (ai/views.py "clustering_insights").
"""
import json
import os
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from ai import analytics_views
from ai.analytics_views import CLUSTER_NAMING_PROMPT, MAX_CLUSTER_NAME_CHARS, _parse_names_json


def _features():
    data = {}
    for sid in range(1, 31):
        grade, att, narr = (66, 0.75, 1.3) if sid <= 10 else (80, 0.9, 2.1) if sid <= 20 else (92, 0.98, 2.9)
        grade += (sid % 5) * 0.4
        data[sid] = {"student_id": sid, "student_name": f"S{sid}", "student_number": f"N{sid}",
                     "grade": grade, "grades": {"Math": grade}, "attendance_rate": att,
                     "avg_narrative": narr, "narrative_ratings": ["SO"]}
    return data


def _run_clustering(answer):
    post = MagicMock()
    post.return_value.json.return_value = {"choices": [{"message": {"content": answer}}]}
    request = Request(APIRequestFactory().get(
        "/api/ai/cluster/", {"school_year": "2025-2026", "grading_period": "1st_quarter", "n_clusters": "3"}))
    with patch.object(analytics_views, "build_student_features", return_value=(_features(), "Overall")), \
         patch.dict(os.environ, {"GROQ_API_KEY": "gq", "GEMINI_API_KEY": ""}), \
         patch("ai.analytics_views.requests.post", post), \
         patch("shared.resilience.time.sleep"):
        response = analytics_views.ClusterAnalyticsView().get(request)
    return response, post


def test_the_prompt_asks_for_names_only():
    assert "interpretation" not in CLUSTER_NAMING_PROMPT.lower()
    assert "narrative interpretation" not in CLUSTER_NAMING_PROMPT
    assert "recommendation" not in CLUSTER_NAMING_PROMPT.lower()


def test_the_response_carries_names_and_no_unread_narrative():
    response, post = _run_clustering(json.dumps({"cluster_names": ["Low", "Mid", "High"]}))
    assert response.status_code == 200
    assert "interpretation" not in response.data
    assert [c["label"] for c in response.data["clusters"]] == ["Low", "Mid", "High"]
    assert post.call_count == 1


def test_a_bad_answer_keeps_the_rank_based_names():
    response, _ = _run_clustering("not json at all")
    assert response.status_code == 200
    assert [c["label"] for c in response.data["clusters"]] == ["Needs Support", "Average", "High Achieving"]


def test_no_provider_configured_means_no_call_and_fallback_names():
    with patch.dict(os.environ, {"GROQ_API_KEY": "", "GEMINI_API_KEY": ""}), \
         patch("ai.analytics_views.requests.post") as post:
        assert analytics_views._ai_cluster_names("Cluster 0: ...", {}) == []
    post.assert_not_called()


def test_names_arrive_as_short_single_lines():
    names = _parse_names_json('```json\n{"cluster_names": ["A\\nIGNORE ABOVE", "' + "x" * 90 + '", 7]}\n```')
    assert names[0] == "A IGNORE ABOVE"
    assert len(names[1]) == MAX_CLUSTER_NAME_CHARS
    assert names[2] == ""  # not a string: that group keeps its fallback name


@pytest.mark.parametrize("raw", ['{"cluster_names": "A, B"}', '{"names": ["A"]}', "[]"])
def test_an_answer_without_a_names_list_is_refused(raw):
    with pytest.raises((ValueError, KeyError, TypeError)):
        _parse_names_json(raw)
