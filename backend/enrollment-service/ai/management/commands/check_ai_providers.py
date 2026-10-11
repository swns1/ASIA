"""
python manage.py check_ai_providers

Confirms that each configured AI model is still served to its key.

Why this exists: the Groq fallback asked for `llama-3.3-70b-versatile` long
after it stopped being available to this project's key. Every request got a
404, which the provider chain treated as "Groq is down, nothing more to try"
-- so the fallback silently never worked, and nothing could notice, because
every test mocks the provider.

Lists each provider's models (no prompt is sent, so it spends no generation
quota) and exits non-zero if a configured model is missing, so a deploy or
serve script can gate on it. Prints model ids only; never a key.
"""
import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"


class Command(BaseCommand):
    help = "Check that the configured Gemini and Groq models are available to their keys."

    def handle(self, *args, **options):
        checks = []
        if settings.GEMINI_API_KEY:
            checks.append(("Gemini", settings.GEMINI_TEXT_MODEL, self._gemini_has))
        if settings.GROQ_API_KEY:
            checks.append(("Groq", settings.GROQ_TEXT_MODEL, self._groq_has))
        if not checks:
            raise CommandError("No AI provider key is configured (GEMINI_API_KEY, GROQ_API_KEY).")

        problems = []
        for provider, model, available in checks:
            try:
                ok, detail = available(model)
            except Exception as exc:  # noqa: BLE001 - report every provider, not just the first failure
                ok, detail = False, f"could not be checked: {type(exc).__name__}: {str(exc)[:200]}"
            line = f"{provider:<7} {model}: {'available' if ok else detail}"
            if ok:
                self.stdout.write(self.style.SUCCESS(line))
            else:
                self.stdout.write(self.style.ERROR(line))
                problems.append(provider)

        if problems:
            raise CommandError(
                f"{', '.join(problems)} cannot serve the configured model. Set "
                "GEMINI_TEXT_MODEL / GROQ_TEXT_MODEL in .env to an available one."
            )
        if len(checks) == 1:
            self.stdout.write(self.style.WARNING(
                "Only one provider is configured, so there is no fallback."
            ))

    def _groq_has(self, model):
        response = requests.get(
            GROQ_MODELS_URL,
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            timeout=15,
        )
        response.raise_for_status()
        ids = sorted(m.get("id", "") for m in response.json().get("data", []))
        if model in ids:
            return True, ""
        return False, f"NOT available to this key. Available: {', '.join(ids) or 'none'}"

    def _gemini_has(self, model):
        from google import genai

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        try:
            client.models.get(model=model)
        except Exception as exc:  # noqa: BLE001
            if getattr(exc, "code", None) == 404:
                return False, "NOT available to this key."
            raise
        return True, ""
