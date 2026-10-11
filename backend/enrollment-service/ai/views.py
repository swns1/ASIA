import logging

import requests
from django.conf import settings
from google import genai
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from accounts.permissions import HasRole
from grading.deped import descriptor
from shared.resilience import AllProvidersFailedError, call_with_provider_fallback

from .analytics_views import ClusterRateThrottle
from .providers import require_text

logger = logging.getLogger(__name__)


class InterpretRateThrottle(ClusterRateThrottle):
    """
    Per-user limit on AI interpretation. Every call spends quota on a
    third-party API (Gemini, then Groq), and up to four provider attempts sit
    behind one request, so the general 300/minute user rate let a single
    session -- or a script with a stolen token -- drain the key. Both buttons
    that call this are click-only, so a person never gets near the limit.
    Keyed by user id like the clustering throttle it extends.
    """
    scope = "ai_interpret"

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

Every grade in the data is followed by its DepEd descriptor in parentheses, for example
"72 (Did Not Meet Expectations)". The school's system computed those descriptors from the
official scale. Use them exactly as given: never assign a different descriptor to a grade and
never work one out from the number yourself, not even for a grade close to a boundary such as
74.6 or 79.8. "Did Not Meet Expectations" means the grade is failing.

Structure your response in exactly three sections:
1. PERFORMANCE SUMMARY — 2-3 sentences on overall academic standing
2. STRENGTHS — bullet list of subjects or periods whose descriptor is Outstanding or Very Satisfactory
3. AREAS FOR IMPROVEMENT — bullet list of subjects or periods whose descriptor is Fairly Satisfactory or Did Not Meet Expectations, with brief actionable suggestions

Be concise, encouraging, and practical. Address the interpretation to a teacher or parent.
The student is not named in the data - refer to them as "the student", never as a placeholder.
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
One bullet per cluster. For each cluster state: its DepEd descriptor, how many students it contains, and what that descriptor implies about their academic standing.
Each cluster's DepEd descriptor is given in the data. The school's system computed it from the cluster's average grade. Copy it exactly: never state a different descriptor and never work one out from the average yourself, not even for an average close to a boundary. The passing grade is 75; a cluster whose descriptor is "Did Not Meet Expectations" is below it, however close its average is.

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

# Only these payload keys are forwarded to the AI provider, per context. The
# payload is built in the browser, so the filter lives here rather than in the
# client: anything not listed - student names, LRNs, database ids - is dropped
# before it can reach a third-party API. A context with no entry is rejected, so
# adding a prompt forces a deliberate decision about what may leave the system.
ALLOWED_PAYLOAD_FIELDS = {
    "grade_report": {
        "grade_level", "school_level", "section", "school_year",
        "overall_average", "passed_subjects", "failed_subjects",
        "total_grades", "grades_by_subject",
        # Sent instead of passed/failed_subjects while no subject has a final
        # rating yet: counts of quarter grades, under a name that says so.
        # The page used to send those counts as subjects.
        "passed_period_grades", "failed_period_grades",
    },
    "clustering_insights": {
        "school_year", "grading_period", "grade_level", "subject",
        "total_students", "n_clusters", "include_recommendations",
        # Structured, not text: each cluster's descriptor is computed here
        # from its numbers (see _cluster_details), which a pre-written line of
        # prose from the browser didn't allow.
        "clusters",
    },
}

# analytics_views.ClusterAnalyticsView clamps n_clusters to [2, 7].
MAX_CLUSTERS = 7


def _with_descriptor(value):
    """
    "72 (Did Not Meet Expectations)" for a value that reads as a 0-100 grade;
    anything else is returned unchanged.

    The descriptor comes from grading.deped.descriptor, the same function the
    report card uses, so the model never has to place a number on the DepEd
    scale itself. Left to do that, it called a 73.8 average "Fairly
    Satisfactory" -- a failing group described as passing.
    """
    if isinstance(value, bool):
        return value
    try:
        grade = float(value)
    except (TypeError, ValueError):
        return value
    if not 0 <= grade <= 100:  # also rejects NaN
        return value
    return f"{value} ({descriptor(grade)})"


def _describe_grade_report(payload):
    """The grade report with every grade labelled by _with_descriptor."""
    described = dict(payload)
    if "overall_average" in described:
        described["overall_average"] = _with_descriptor(described["overall_average"])
    by_subject = described.get("grades_by_subject")
    if isinstance(by_subject, dict):
        described["grades_by_subject"] = {
            subject: (
                {period: _with_descriptor(grade) for period, grade in grades.items()}
                if isinstance(grades, dict) else _with_descriptor(grades)
            )
            for subject, grades in by_subject.items()
        }
    return described


def _bounded_number(value, low, high, name, *, required=False):
    if value is None:
        if required:
            raise ValueError(f"{name} is required for every cluster.")
        return None
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a number.")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number.") from None
    if not low <= number <= high:
        raise ValueError(f"{name} must be between {low} and {high}.")
    return number


def _cluster_details(clusters):
    """
    The clusters as the prompt reads them, one line each, carrying the DepEd
    descriptor of each cluster's average. Raises ValueError (its message is
    safe to return) on anything but a short list of in-range summaries.
    """
    if not isinstance(clusters, list) or not 1 <= len(clusters) <= MAX_CLUSTERS:
        raise ValueError(f"clusters must be a list of 1 to {MAX_CLUSTERS} groups.")
    lines = []
    for number, cluster in enumerate(clusters, start=1):
        if not isinstance(cluster, dict):
            raise ValueError("Each cluster must be an object.")
        average = _bounded_number(cluster.get("avg_grade"), 0, 100, "avg_grade", required=True)
        lowest = _bounded_number(cluster.get("min_grade"), 0, 100, "min_grade")
        highest = _bounded_number(cluster.get("max_grade"), 0, 100, "max_grade")
        attendance = _bounded_number(cluster.get("avg_attendance"), 0, 1, "avg_attendance")
        behavior = _bounded_number(cluster.get("avg_narrative"), 1, 3, "avg_narrative")
        count = cluster.get("student_count")
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            raise ValueError("student_count must be a whole number.")
        label = " ".join(str(cluster.get("label") or "").split())[:60] or f"Group {number}"

        parts = [
            f'Group {number} "{label}": {count} student(s)',
            f"average grade {average:.2f}, DepEd descriptor: {descriptor(average)}",
        ]
        if lowest is not None and highest is not None:
            parts.append(f"grade range {lowest:.2f}-{highest:.2f}")
        if attendance is not None:
            parts.append(f"attendance {attendance:.0%}")
        if behavior is not None:
            parts.append(f"behavior {behavior:.2f}/3")
        lines.append("; ".join(parts))
    return "\n".join(lines)


class GeminiInterpretView(APIView):
    permission_classes = [HasRole]
    required_roles = {"super_admin", "admin", "registrar"}
    throttle_classes = [InterpretRateThrottle]

    def post(self, request):
        context_type = request.data.get("context_type", "")
        payload      = request.data.get("payload", {})

        if context_type not in PROMPTS:
            return Response(
                {"detail": f"Unknown context_type '{context_type}'. Valid: {list(PROMPTS.keys())}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed = ALLOWED_PAYLOAD_FIELDS.get(context_type)
        if allowed is None:
            return Response(
                {"detail": f"context_type '{context_type}' declares no payload fields."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(payload, dict):
            return Response(
                {"detail": "payload must be an object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = {k: v for k, v in payload.items() if k in allowed}

        if not payload:
            return Response(
                {"detail": "payload is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if context_type == "grade_report":
            payload = _describe_grade_report(payload)
        elif context_type == "clustering_insights" and "clusters" in payload:
            try:
                payload["cluster_details"] = _cluster_details(payload.pop("clusters"))
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        prompt     = PROMPTS[context_type].format(payload=payload)
        gemini_key = getattr(settings, "GEMINI_API_KEY", "")
        groq_key   = getattr(settings, "GROQ_API_KEY", "")

        def _call_gemini() -> str:
            response = _get_client().models.generate_content(
                model=settings.GEMINI_TEXT_MODEL,
                contents=prompt,
            )
            return require_text(response.text, "gemini")

        def _call_groq() -> str:
            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                json={
                    "model": settings.GROQ_TEXT_MODEL,
                    "temperature": 0.3,
                    # Room for the answer and for a reasoning model's thinking,
                    # which counts against the same cap: the default model
                    # (gpt-oss) reasons before it writes.
                    "max_tokens": 1500,
                    "messages": [{"role": "user", "content": prompt}],
                },
                headers={"Authorization": f"Bearer {groq_key}"},
                timeout=20,
            )
            response.raise_for_status()
            return require_text(response.json()["choices"][0]["message"].get("content"), "groq")

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
