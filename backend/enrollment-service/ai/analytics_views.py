"""
Student Performance Clustering Analytics
=========================================
GET /api/ai/cluster/
    ?school_year=2024-2025         (required)
    &grading_period=1st_quarter    (required)
    &subject_id=5                  (optional — omit for overall across all subjects)
    &n_clusters=3                  (optional, default 3)

Returns:
{
  "clusters": [
    {
      "cluster_id": 0,
      "label": "AI-generated name",
      "color": "#ef4444",
      "student_count": 12,
      "avg_grade": 72.4,
      "min_grade": 60.0,
      "max_grade": 79.5,
      "students": [
        {
          "student_id": 1,
          "student_name": "Dela Cruz, Juan M.",
          "student_number": "2024-00001",
          "grade": 72.5,
          "subject_name": "Mathematics 7",   // or "Overall" if no subject filter
          "x": 1.23,
          "y": -0.45
        }, ...
      ]
    }, ...
  ],
  "interpretation": "AI-generated narrative ...",
  "meta": {
    "total_students": 35,
    "school_year": "2024-2025",
    "grading_period": "1st_quarter",
    "subject": "Mathematics 7" | "Overall",
    "n_clusters": 3
  }
}
"""

import json
import logging
import os
from collections import defaultdict

import numpy as np
import requests
from django.db.models import Avg
from rest_framework import permissions, status
from rest_framework.throttling import UserRateThrottle

class ClusterRateThrottle(UserRateThrottle):
    """K-Means + PCA is CPU-heavy — cap it tighter than general endpoints."""
    scope = "cluster"

from rest_framework.response import Response
from rest_framework.views import APIView

from enrollments.models import Enrollment, Student
from grades.models import Grade
from subjects.models import Subject

logger = logging.getLogger(__name__)

# ── Cluster colours ───────────────────────────────────────────────────────────
CLUSTER_COLORS = [
    "#ef4444",  # red
    "#3b82f6",  # blue
    "#22c55e",  # green
    "#f59e0b",  # amber
    "#8b5cf6",  # violet
    "#ec4899",  # pink
    "#14b8a6",  # teal
]

# ── AI prompt ─────────────────────────────────────────────────────────────────
CLUSTER_INTERPRETATION_PROMPT = """
You are an academic analytics assistant for a Philippine basic education school (DepEd K–12 system).
You are given the results of a K-Means clustering analysis on student grades.

Your tasks:
1. Give each cluster a SHORT, descriptive name (2-4 words max).
   Example names: "High Achievers", "At-Risk Learners", "Steady Performers", "Needs Intervention"
2. Write a concise narrative interpretation (3-5 sentences) covering:
   - Overall patterns and what the clustering reveals
   - Actionable recommendations for teachers

Return ONLY valid JSON — no markdown, no code fences:
{{
  "cluster_names": ["Name for Cluster 0", "Name for Cluster 1", "Name for Cluster 2"],
  "interpretation": "Your 3-5 sentence narrative here."
}}

Cluster Data:
{cluster_summary}

Context:
- School Year: {school_year}
- Grading Period: {grading_period}
- Subject: {subject}
- Total Students: {total_students}
- DepEd scale: 90-100 Outstanding, 85-89 Very Satisfactory, 80-84 Satisfactory, 75-79 Fairly Satisfactory, Below 75 Did Not Meet Expectations
"""


def _call_groq_for_interpretation(cluster_summary: str, meta: dict) -> dict:
    """Call Groq to generate cluster names and interpretation."""
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return {
            "cluster_names": [],
            "interpretation": "AI interpretation unavailable — GROQ_API_KEY not configured.",
        }

    prompt = CLUSTER_INTERPRETATION_PROMPT.format(
        cluster_summary=cluster_summary,
        school_year=meta["school_year"],
        grading_period=meta["grading_period"],
        subject=meta["subject"],
        total_students=meta["total_students"],
    )

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            json={
                "model": "meta-llama/llama-4-scout-17b-16e-instruct",
                "temperature": 0.2,
                "max_tokens": 512,
                "messages": [{"role": "user", "content": prompt}],
            },
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"].strip()

        # Strip code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        return json.loads(raw)

    except Exception as e:
        logger.warning("Groq cluster interpretation failed: %s", e)
        return {
            "cluster_names": [],
            "interpretation": f"AI interpretation temporarily unavailable ({type(e).__name__}).",
        }


class ClusterAnalyticsView(APIView):
    """
    GET /api/ai/cluster/

    Performs K-Means clustering on student grades and returns
    PCA-reduced 2D coordinates for scatter plot visualization.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes   = [ClusterRateThrottle]

    def get(self, request):
        # ── Parse params ──────────────────────────────────────────────────
        school_year    = request.query_params.get("school_year")
        grading_period = request.query_params.get("grading_period")
        subject_id     = request.query_params.get("subject_id")  # None = overall
        grade_level    = request.query_params.get("grade_level")  # None = all levels
        n_clusters     = int(request.query_params.get("n_clusters", 3))

        if not school_year:
            return Response(
                {"error": "school_year is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not grading_period:
            return Response(
                {"error": "grading_period is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        n_clusters = max(2, min(n_clusters, 7))

        # ── Fetch grades ──────────────────────────────────────────────────
        grades_qs = Grade.objects.select_related(
            "enrollment", "enrollment__student", "subject"
        ).filter(
            enrollment__school_year=school_year,
            enrollment__enrollment_status="enrolled",
        )

        # Filter by grading period (skip if "overall" — use all periods)
        is_overall_period = grading_period == "overall"
        if not is_overall_period:
            grades_qs = grades_qs.filter(grading_period=grading_period)

        # Filter by grade level
        if grade_level:
            grades_qs = grades_qs.filter(enrollment__grade_level=grade_level)

        subject_name = "Overall"
        if subject_id:
            grades_qs = grades_qs.filter(subject_id=subject_id)
            try:
                subject_name = Subject.objects.get(pk=subject_id).subject_name
            except Subject.DoesNotExist:
                return Response(
                    {"error": f"Subject {subject_id} not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # ── Build per-student feature vectors ─────────────────────────────
        # For "overall": average across all subjects → single feature
        # For specific subject: single grade → single feature
        # Either way we also support multi-subject if needed later

        student_data = {}  # student_id → { info, grades: {subject_name: grade} }

        for g in grades_qs:
            sid = g.enrollment.student_id
            if sid not in student_data:
                s = g.enrollment.student
                student_data[sid] = {
                    "student_id": s.student_id,
                    "student_name": f"{s.last_name}, {s.first_name}"
                                    + (f" {s.middle_name[0]}." if s.middle_name else ""),
                    "student_number": s.student_number,
                    "grades": {},
                }
            student_data[sid]["grades"][g.subject.subject_name] = float(g.numeric_grade)

        if len(student_data) < n_clusters:
            return Response(
                {
                    "error": f"Not enough students ({len(student_data)}) for {n_clusters} clusters. "
                             f"Need at least {n_clusters} students with grades.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Build feature matrix ──────────────────────────────────────────
        student_ids = list(student_data.keys())

        if subject_id:
            # Single subject → 1D feature
            features = np.array([
                [np.mean(list(student_data[sid]["grades"].values()))]
                for sid in student_ids
            ])
        else:
            # Overall → collect all unique subjects, make a matrix
            all_subjects = sorted({
                subj for sd in student_data.values() for subj in sd["grades"]
            })

            if len(all_subjects) == 1:
                features = np.array([
                    [list(student_data[sid]["grades"].values())[0]]
                    for sid in student_ids
                ])
            else:
                features = np.array([
                    [student_data[sid]["grades"].get(subj, np.nan) for subj in all_subjects]
                    for sid in student_ids
                ])
                # Fill NaN with column means
                col_means = np.nanmean(features, axis=0)
                for i in range(features.shape[1]):
                    mask = np.isnan(features[:, i])
                    features[mask, i] = col_means[i]

        # ── K-Means clustering ────────────────────────────────────────────
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler
        from sklearn.decomposition import PCA

        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features)

        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(features_scaled)

        # ── PCA for 2D visualization ──────────────────────────────────────
        n_components = min(2, features_scaled.shape[1])
        if n_components < 2:
            # 1D feature → use grade as X, add jitter for Y
            coords = np.column_stack([
                features_scaled[:, 0],
                np.random.RandomState(42).normal(0, 0.3, size=len(features_scaled)),
            ])
        else:
            pca = PCA(n_components=2, random_state=42)
            coords = pca.fit_transform(features_scaled)

        # ── Build response clusters ───────────────────────────────────────
        clusters_map = defaultdict(list)
        for idx, sid in enumerate(student_ids):
            sd = student_data[sid]
            avg_grade = float(np.mean(list(sd["grades"].values())))
            clusters_map[int(labels[idx])].append({
                "student_id":     sd["student_id"],
                "student_name":   sd["student_name"],
                "student_number": sd["student_number"],
                "grade":          round(avg_grade, 2),
                "subject_name":   subject_name if subject_id else "Overall",
                "x":              round(float(coords[idx, 0]), 4),
                "y":              round(float(coords[idx, 1]), 4),
            })

        # Sort clusters by average grade (lowest first = cluster 0 = at-risk)
        sorted_clusters = sorted(
            clusters_map.items(),
            key=lambda kv: np.mean([s["grade"] for s in kv[1]]),
        )

        # ── AI interpretation ─────────────────────────────────────────────
        cluster_summary_lines = []
        clusters_response = []
        for new_id, (_, students) in enumerate(sorted_clusters):
            grades_list = [s["grade"] for s in students]
            summary = {
                "cluster_id":    new_id,
                "student_count": len(students),
                "avg_grade":     round(float(np.mean(grades_list)), 2),
                "min_grade":     round(float(np.min(grades_list)), 2),
                "max_grade":     round(float(np.max(grades_list)), 2),
            }
            cluster_summary_lines.append(
                f"Cluster {new_id}: {summary['student_count']} students, "
                f"avg={summary['avg_grade']}, range=[{summary['min_grade']}–{summary['max_grade']}]"
            )
            clusters_response.append({
                **summary,
                "label":   f"Cluster {new_id}",  # placeholder, overwritten by AI
                "color":   CLUSTER_COLORS[new_id % len(CLUSTER_COLORS)],
                "students": students,
            })

        meta = {
            "total_students": len(student_ids),
            "school_year":    school_year,
            "grading_period": "Overall (All Periods)" if is_overall_period else grading_period,
            "grade_level":    grade_level or "All Levels",
            "subject":        subject_name,
            "n_clusters":     n_clusters,
        }

        ai_result = _call_groq_for_interpretation(
            "\n".join(cluster_summary_lines), meta
        )

        # Apply AI-generated names
        names = ai_result.get("cluster_names", [])
        for i, c in enumerate(clusters_response):
            if i < len(names) and names[i]:
                c["label"] = names[i]

        return Response({
            "clusters":       clusters_response,
            "interpretation": ai_result.get("interpretation", ""),
            "meta":           meta,
        })