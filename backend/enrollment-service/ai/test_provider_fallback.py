"""
The Groq fallback has to be able to answer.

It asked for `llama-3.3-70b-versatile` after that model stopped being served
to this project's key, so every fallback attempt was a 404 and the chain gave
up -- unnoticed, because providers are always mocked in tests. Model ids now
come from settings, an empty answer counts as a failure (so the next provider
is actually tried), and `check_ai_providers` reports a retired id.
"""
import os
from unittest.mock import MagicMock, patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from ai import analytics_views
from ai.views import GeminiInterpretView

BODY = {"context_type": "grade_report", "payload": {"grade_level": "Grade 4"}}


def _groq_reply(content):
    response = MagicMock()
    response.json.return_value = {"choices": [{"message": {"content": content}}]}
    return response


def _interpret(*, gemini_text="from gemini", gemini_exc=None, groq_content="from groq", **settings):
    client = MagicMock()
    if gemini_exc is not None:
        client.models.generate_content.side_effect = gemini_exc
    else:
        client.models.generate_content.return_value.text = gemini_text
    post = MagicMock(return_value=_groq_reply(groq_content))
    request = Request(APIRequestFactory().post("/api/ai/interpret/", BODY, format="json"),
                      parsers=[JSONParser()])
    config = {"GEMINI_API_KEY": "gk", "GROQ_API_KEY": "gq", **settings}
    with override_settings(**config), \
         patch("ai.views._get_client", return_value=client), \
         patch("ai.views.requests.post", post), \
         patch("shared.resilience.time.sleep"):
        response = GeminiInterpretView().post(request)
    return response, client, post


def test_models_come_from_settings():
    _, client, _ = _interpret(GEMINI_TEXT_MODEL="gemini-x")
    assert client.models.generate_content.call_args.kwargs["model"] == "gemini-x"

    _, _, post = _interpret(gemini_exc=RuntimeError("down"), GROQ_TEXT_MODEL="groq-y")
    assert post.call_args.kwargs["json"]["model"] == "groq-y"


@pytest.mark.parametrize("empty", [None, "", "   \n"])
def test_an_empty_gemini_answer_falls_back_to_groq(empty):
    response, client, post = _interpret(gemini_text=empty)
    assert response.status_code == 200
    assert response.data == {"interpretation": "from groq"}
    assert client.models.generate_content.call_count == 1  # not retried: empty isn't transient


def test_an_empty_answer_from_every_provider_is_a_503_not_a_blank():
    response, _, _ = _interpret(gemini_text="", groq_content=None)
    assert response.status_code == 503


def test_cluster_naming_falls_back_when_groq_answers_empty():
    post = MagicMock(return_value=_groq_reply(""))
    gemini = MagicMock()
    gemini.models.generate_content.return_value.text = '{"cluster_names": ["A", "B"], "interpretation": "ok"}'
    meta = {"school_year": "2025-2026", "grading_period": "1st_quarter", "subject": "Overall",
            "total_students": 10}
    with patch.dict(os.environ, {"GROQ_API_KEY": "gq", "GEMINI_API_KEY": "gk"}), \
         patch("ai.analytics_views.requests.post", post), \
         patch("google.genai.Client", return_value=gemini), \
         patch("shared.resilience.time.sleep"):
        result = analytics_views._call_groq_for_interpretation("Cluster 0: ...", meta)
    assert result["cluster_names"] == ["A", "B"]


# ── check_ai_providers ────────────────────────────────────────────────────

def _models(*ids):
    response = MagicMock()
    response.json.return_value = {"data": [{"id": i} for i in ids]}
    return response


def _check(groq_ids, *, gemini_missing=False, **settings):
    gemini = MagicMock()
    if gemini_missing:
        gemini.models.get.side_effect = type("ClientError", (Exception,), {"code": 404})("not found")
    config = {"GEMINI_API_KEY": "gk", "GROQ_API_KEY": "gq",
              "GEMINI_TEXT_MODEL": "gemini-x", "GROQ_TEXT_MODEL": "groq-y", **settings}
    with override_settings(**config), \
         patch("ai.management.commands.check_ai_providers.requests.get", return_value=_models(*groq_ids)), \
         patch("google.genai.Client", return_value=gemini):
        call_command("check_ai_providers")


def test_check_passes_when_both_models_are_served():
    _check(["groq-y", "other"])


def test_check_fails_on_a_retired_groq_model():
    with pytest.raises(CommandError, match="Groq"):
        _check(["something-else"])


def test_check_fails_on_a_missing_gemini_model():
    with pytest.raises(CommandError, match="Gemini"):
        _check(["groq-y"], gemini_missing=True)


def test_check_fails_with_no_keys_at_all():
    with pytest.raises(CommandError, match="No AI provider key"):
        _check([], GEMINI_API_KEY="", GROQ_API_KEY="")
