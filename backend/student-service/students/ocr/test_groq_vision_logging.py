"""
Regression tests: _call_groq/_call_gemini used to log the model's raw
transcription on failure (`logger.warning("...returned non-JSON: %s",
raw_text[:200])`, `logger.error("Unexpected Groq response structure: %s",
result)`). For a scanned birth certificate or similar, that transcription
is PII -- a minor's name, birth date, parents' names. Both now log only
non-sensitive metadata (family/document type, content length, response
shape) sufficient to debug a parsing failure without ever writing the
actual transcribed content anywhere.
"""
from unittest.mock import MagicMock, patch

import pytest

from students.ocr import groq_vision

SENSITIVE_TEXT = "Maria Clara Santos Reyes, born 1990-01-15, mother Juana Reyes"


def _no_sensitive_content(caplog):
    for record in caplog.records:
        assert SENSITIVE_TEXT not in record.getMessage()
        assert "Maria" not in record.getMessage()
        assert "Reyes" not in record.getMessage()


def test_call_groq_non_json_response_logs_length_not_content(caplog):
    fake_response = MagicMock()
    fake_response.raise_for_status.return_value = None
    fake_response.json.return_value = {
        "choices": [{"message": {"content": SENSITIVE_TEXT}, "finish_reason": "stop"}]
    }
    with patch("students.ocr.groq_vision.requests.post", return_value=fake_response):
        with pytest.raises(groq_vision._RetryableContentError):
            groq_vision._call_groq("base64img", "image/jpeg", "psa_birth_certificate", "fake-key")

    _no_sensitive_content(caplog)
    assert any(
        "length=%d" % len(SENSITIVE_TEXT) in r.getMessage() or f"length={len(SENSITIVE_TEXT)}" in r.getMessage()
        for r in caplog.records
    )


def test_call_groq_unexpected_response_shape_logs_keys_not_content(caplog):
    fake_response = MagicMock()
    fake_response.raise_for_status.return_value = None
    # Malformed/partial-success shape: no "choices" key, but some other
    # provider payload that happens to carry the transcription anyway.
    fake_response.json.return_value = {"unexpected_field": SENSITIVE_TEXT}
    with patch("students.ocr.groq_vision.requests.post", return_value=fake_response):
        with pytest.raises(ValueError):
            groq_vision._call_groq("base64img", "image/jpeg", "psa_birth_certificate", "fake-key")

    _no_sensitive_content(caplog)
    assert any("keys=" in r.getMessage() for r in caplog.records)


def test_call_gemini_non_json_response_logs_length_not_content(caplog):
    fake_response = MagicMock(text=SENSITIVE_TEXT)
    fake_client = MagicMock()
    fake_client.models.generate_content.return_value = fake_response
    with patch("students.ocr.groq_vision.genai.Client", return_value=fake_client):
        with pytest.raises(groq_vision._RetryableContentError):
            groq_vision._call_gemini(b"fake-bytes", "image/jpeg", "psa_birth_certificate", "fake-key")

    _no_sensitive_content(caplog)
    assert any(f"length={len(SENSITIVE_TEXT)}" in r.getMessage() for r in caplog.records)
