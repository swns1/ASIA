import logging

import requests
from django.conf import settings
from google import genai
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from accounts.permissions import HasRole
from shared.resilience import AllProvidersFailedError, call_with_provider_fallback

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=getattr(settings, "GEMINI_API_KEY", ""))
    return _client

PROMPTS = {
    "grade_report": """
You are an academic advisor assistant for a Philippine basic education school (DepEd system).
Analyze the following student grade report and provide a clear, professional interpretation.

Structure your response in exactly three sections:
1. PERFORMANCE SUMMARY — 2-3 sentences on overall academic standing
2. STRENGTHS — bullet list of subjects or periods where the student performed well (85 and above)
3. AREAS FOR IMPROVEMENT — bullet list of subjects or periods needing attention (below 80), with brief actionable suggestions

Use the DepEd grading scale:
- 90-100: Outstanding
- 85-89: Very Satisfactory
- 80-84: Satisfactory
- 75-79: Fairly Satisfactory
- Below 75: Did Not Meet Expectations (failing)

Be concise, encouraging, and practical. Address the interpretation to a teacher or parent.
Keep the total response under 300 words.

Student Data:
{payload}
""",

    "dashboard_insights": """
You are a school administrator assistant for a Philippine basic education school.
Analyze the following school-wide data and provide brief, actionable insights.

Structure your response in exactly two sections:
1. KEY OBSERVATIONS — 3 bullet points on notable patterns in the data
2. RECOMMENDED ACTIONS — 2-3 bullet points of concrete next steps for administrators

Be direct and practical. Keep the total response under 200 words.

School Data:
{payload}
""",

    "clustering_insights": """
You are an academic analytics assistant for a Philippine basic education school (DepEd K–12 system).
Analyze the following K-Means clustering results on student grades and provide a clear, professional interpretation with actionable recommendations for school administrators and teachers.

Structure your response in exactly four sections using this exact format:

**CLUSTER ANALYSIS**
2-3 sentences describing what the clustering reveals about overall student performance distribution across the grade level and period.

**CLUSTER BREAKDOWN**
One bullet per cluster. For each cluster state: what performance band it falls in (use the DepEd scale below), how many students it contains, and what the average grade implies about their academic standing.
DepEd Scale: 90-100 Outstanding · 85-89 Very Satisfactory · 80-84 Satisfactory · 75-79 Fairly Satisfactory · below 75 Did Not Meet Expectations

**KEY CONCERNS**
2-3 bullets identifying specific risks or patterns that need attention (e.g. clusters below passing, wide grade spread, large low-performing groups).

**RECOMMENDATIONS**
3-4 concrete, actionable steps that teachers or administrators should take. Be specific — reference the actual cluster data (student counts, averages). Each bullet should name who should act and what they should do.

Be direct, encouraging, and practical. Keep the total response under 400 words.

Clustering Data:
{payload}
""",

    "scholarship_eligibility": """
You are an academic records officer for a Philippine basic education school.
Based on the following student grade data, write a brief scholarship eligibility justification.

Keep it to 2-3 sentences. Be factual, professional, and cite specific grade averages.
Use the DepEd grading scale where 75 is passing and 90 and above is Outstanding.

Student Data:
{payload}
""",
}


class GeminiInterpretView(APIView):
    permission_classes = [HasRole]
    required_roles = {"super_admin", "admin", "registrar"}

    def post(self, request):
        context_type = request.data.get("context_type", "")
        payload      = request.data.get("payload", {})

        if context_type not in PROMPTS:
            return Response(
                {"detail": f"Unknown context_type '{context_type}'. Valid: {list(PROMPTS.keys())}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not payload:
            return Response(
                {"detail": "payload is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prompt     = PROMPTS[context_type].format(payload=payload)
        gemini_key = getattr(settings, "GEMINI_API_KEY", "")
        groq_key   = getattr(settings, "GROQ_API_KEY", "")

        def _call_gemini() -> str:
            response = _get_client().models.generate_content(
                model="gemini-2.5-flash-lite",
                contents=prompt,
            )
            return response.text

        def _call_groq() -> str:
            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                json={
                    "model": "llama-3.3-70b-versatile",
                    "temperature": 0.3,
                    "max_tokens": 700,
                    "messages": [{"role": "user", "content": prompt}],
                },
                headers={"Authorization": f"Bearer {groq_key}"},
                timeout=20,
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()

        # Gemini first — these prompts are tuned against it — Groq as the
        # fallback when Gemini is unavailable or exhausted.
        providers = []
        if gemini_key:
            providers.append(("gemini", _call_gemini))
        if groq_key:
            providers.append(("groq", _call_groq))

        if not providers:
            return Response(
                {"detail": "AI interpretation is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            interpretation = call_with_provider_fallback(providers, attempts_per_provider=2)
            return Response({"interpretation": interpretation})
        except AllProvidersFailedError as exc:
            logger.warning("AI interpretation: all providers failed: %s", exc)
            return Response(
                {"detail": "AI interpretation is temporarily unavailable. Please try again in a moment."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
