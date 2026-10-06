"""
What the Grades summary's AI interpretation may send for a grade report.

The page counted quarter grades and sent them as passed/failed *subjects*.
It now counts subjects from their final ratings, and before any subject has
one it sends the quarter-grade counts under their own names -- which the
allowlist must let through, or they'd be dropped without a word. Anything
not listed, such as a student's name, still never reaches the AI provider.
"""
from unittest.mock import MagicMock, patch

from django.test import override_settings
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from ai.views import GeminiInterpretView


def _prompt_for(payload):
    django_request = APIRequestFactory().post(
        "/api/ai/interpret/", {"context_type": "grade_report", "payload": payload}, format="json",
    )
    request = Request(django_request, parsers=[JSONParser()])
    client = MagicMock()
    client.models.generate_content.return_value.text = "ok"
    with override_settings(GEMINI_API_KEY="key", GROQ_API_KEY=""), \
         patch("ai.views._get_client", return_value=client):
        response = GeminiInterpretView().post(request)
    assert response.status_code == 200
    return client.models.generate_content.call_args.kwargs["contents"]


def test_quarter_grade_counts_reach_the_prompt():
    prompt = _prompt_for({
        "grade_level": "Grade 4", "passed_period_grades": 7, "failed_period_grades": 1,
    })
    assert "'passed_period_grades': 7" in prompt
    assert "'failed_period_grades': 1" in prompt


def test_a_name_still_never_does():
    prompt = _prompt_for({"grade_level": "Grade 4", "student_name": "Ana Cruz"})
    assert "Ana Cruz" not in prompt
