from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest


@pytest.fixture
def stub_summary_store():
    """
    The interpret view saves every answer (ai/summaries.py). This service
    cannot build a test database, so tests of the prompt and the provider
    chain stand in for the store: every enrollment exists, and a save hands
    back a summary shaped like the real row. Yields the save mock.
    """
    def fake_save(**kwargs):
        return SimpleNamespace(
            summary_id=1, context_type=kwargs["context_type"],
            ai_text=kwargs["text"], edited_text="", current_text=kwargs["text"],
            provider=kwargs["provider"], data_fingerprint=kwargs["fingerprint"],
            generated_at=datetime(2026, 10, 14, tzinfo=timezone.utc), edited_at=None,
            shared_text="", shared_at=None,
        )

    with patch("ai.summaries.enrollment_exists", return_value=True), \
         patch("ai.summaries.save_generated", side_effect=fake_save) as save:
        yield save
