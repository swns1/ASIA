"""
Student Performance Clustering Analytics
=========================================
GET /api/ai/cluster/
    ?school_year=2024-2025         (required)
    &grading_period=1st_quarter    (required)
    &subject_id=5                  (optional — omit for overall across all subjects)
    &n_clusters=3                  (optional, default 3)

Features used for clustering:
  - Grade: each student's own average across whatever subjects they have
    data for (or the single subject's grade if subject_id is given) — one
    feature, not one column per subject; see "Design notes" below for why.
  - Attendance rate for the full school year  (non-absent / total days)
  - Average narrative report score            (1=Needs Improvement, 2=Satisfactory, 3=Outstanding)
    averaged across all rated categories for the selected grading period
    (or all periods when grading_period="overall")

Missing attendance / narrative values are imputed with the column mean so
clustering still works when records are partially absent.

Design notes (methodological limitations, deliberate not accidental):
  - Grades always collapse to ONE averaged feature per student, even in
    "overall" mode across many subjects — never one column per subject.
    A student taking 8 subjects would otherwise contribute 8 grade
    dimensions vs. 1 attendance + 1 narrative dimension, letting grades
    dominate the Euclidean distance the clustering is based on even after
    StandardScaler. This keeps grades / attendance / behavior weighted as
    three roughly equal signals, trading away per-subject granularity
    (use `subject_id` for that) to do it.
  - Narrative ratings are ordinal categories (Needs Improvement /
    Satisfactory / Outstanding) mapped to 1/2/3 and averaged as if
    continuous — the same simplification GPA makes. `avg_narrative` is
    the averaged score; `narrative_distribution` on each cluster exposes
    the raw category counts so the average doesn't hide the underlying
    spread.
  - `n_clusters` is not auto-selected — it's a user-chosen (or default)
    parameter, clamped to [2, 7]. `silhouette_score` / `k_search` /
    `suggested_n_clusters` in `meta` give the chosen k a quality metric
    and a data-driven alternative to compare against, without forcing it.
  - No PCA-projected coordinates are returned. Each student's own `grade`
    and `attendance_rate` (both already below) are directly plottable on a
    2D chart, so the frontend plots those instead of an abstract PCA
    projection that isn't meaningful to a non-technical viewer.

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
      "avg_attendance": 0.82,
      "avg_narrative": 1.9,
      "narrative_distribution": {"outstanding": 2, "satisfactory": 7, "needs_improvement": 3},
      "students": [
        {
          "student_id": 1,
          "student_name": "Dela Cruz, Juan M.",
          "student_number": "2024-00001",
          "grade": 72.5,
          "attendance_rate": 0.87,
          "avg_narrative": 2.0,
          "subject_name": "Mathematics 7"
        }, ...
      ]
    }, ...
  ],
  "interpretation": "AI-generated narrative ...",
  "meta": {
    ...,
    "silhouette_score": 0.42,
    "k_search": [{"n_clusters": 2, "silhouette_score": 0.38}, ...],
    "suggested_n_clusters": 4
  }
}
"""

import json
import logging
import os
from collections import defaultdict

import numpy as np
import requests
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from accounts.permissions import HasRole
from attendance.models import AttendanceRecord
from enrollments.models import Enrollment, Student
from grades.models import Grade, NarrativeReport
from subjects.models import Subject

logger = logging.getLogger(__name__)

NARRATIVE_SCORE = {
    "outstanding":       3.0,
    "satisfactory":      2.0,
    "needs_improvement": 1.0,
}

CLUSTER_COLORS = [
    "#ef4444",
    "#3b82f6",
    "#22c55e",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
]

CLUSTER_INTERPRETATION_PROMPT = """
You are an academic analytics assistant for a Philippine basic education school (DepEd K–12 system).
You are given the results of a K-Means clustering analysis on student performance data that includes
grades, attendance rates, and behavioral narrative ratings.

Your tasks:
1. Give each cluster a SHORT, descriptive name (2-4 words max).
   Example names: "High Achievers", "At-Risk Learners", "Steady Performers", "Needs Intervention"
2. Write a concise narrative interpretation (3-5 sentences) covering:
   - Overall patterns and what the clustering reveals across grades, attendance, and behavior
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
- DepEd grade scale: 90-100 Outstanding, 85-89 Very Satisfactory, 80-84 Satisfactory,
  75-79 Fairly Satisfactory, Below 75 Did Not Meet Expectations
- Attendance rate: proportion of school days attended (1.00 = perfect, 0.00 = never attended)
- Narrative score: 1=Needs Improvement, 2=Satisfactory, 3=Outstanding (averaged across all rated categories)
- Cluster separation quality (silhouette score, -1 to 1, higher = better separated): {silhouette_score}
"""


class ClusterRateThrottle(UserRateThrottle):
    scope = "cluster"

    def get_cache_key(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return None
        uid = getattr(user, "user_id", None) or getattr(user, "pk", None)
        if not uid:
            return None
        return self.cache_format % {"scope": self.scope, "ident": uid}


def _call_groq_for_interpretation(cluster_summary: str, meta: dict) -> dict:
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
        silhouette_score=meta.get("silhouette_score", "N/A"),
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


def _impute_col_mean(arr: np.ndarray) -> None:
    """Fill NaN values in each column with that column's mean in-place."""
    for i in range(arr.shape[1]):
        col = arr[:, i]
        mask = np.isnan(col)
        if mask.all():
            arr[mask, i] = 0.0
        elif mask.any():
            arr[mask, i] = float(np.nanmean(col))


class ClusterAnalyticsView(APIView):
    """
    GET /api/ai/cluster/

    Performs K-Means clustering on student grades, attendance, and
    narrative report ratings. Each student's own grade and attendance
    rate are returned directly (no PCA projection) so the frontend can
    plot a chart with meaningful, directly-labelled axes.
    """

    permission_classes = [HasRole]
    required_roles     = {"super_admin", "admin", "registrar"}
    throttle_classes   = [ClusterRateThrottle]

    def get(self, request):
        # ── Parse params ──────────────────────────────────────────────────
        school_year    = request.query_params.get("school_year")
        grading_period = request.query_params.get("grading_period")
        subject_id     = request.query_params.get("subject_id")
        school_level   = request.query_params.get("school_level")
        grade_level    = request.query_params.get("grade_level")
        n_clusters     = int(request.query_params.get("n_clusters", 3))

        if not school_year:
            return Response({"error": "school_year is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not grading_period:
            return Response({"error": "grading_period is required."}, status=status.HTTP_400_BAD_REQUEST)

        n_clusters = max(2, min(n_clusters, 7))
        is_overall_period = grading_period == "overall"

        # ── Fetch grades ──────────────────────────────────────────────────
        grades_qs = Grade.objects.select_related(
            "enrollment", "enrollment__student", "subject"
        ).filter(
            enrollment__school_year=school_year,
            enrollment__enrollment_status="enrolled",
        )

        if not is_overall_period:
            grades_qs = grades_qs.filter(grading_period=grading_period)
        if school_level:
            grades_qs = grades_qs.filter(enrollment__school_level=school_level)
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

        # ── Build per-student grade data ──────────────────────────────────
        # Accumulate into lists so multiple periods (overall mode) are
        # averaged rather than the last-seen value silently overwriting.
        student_data = {}  # student_id → dict

        for g in grades_qs:
            sid = g.enrollment.student_id
            if sid not in student_data:
                s = g.enrollment.student
                student_data[sid] = {
                    "student_id":    s.student_id,
                    "enrollment_id": g.enrollment.enrollment_id,
                    "student_name":  f"{s.last_name}, {s.first_name}"
                                     + (f" {s.middle_name[0]}." if s.middle_name else ""),
                    "student_number": s.student_number,
                    "grade_accum":   defaultdict(list),
                }
            student_data[sid]["grade_accum"][g.subject.subject_name].append(float(g.numeric_grade))

        # Resolve accumulated lists → per-subject mean
        for sd in student_data.values():
            sd["grades"] = {
                subj: float(np.mean(vals))
                for subj, vals in sd["grade_accum"].items()
            }

        if len(student_data) < n_clusters:
            return Response(
                {
                    "error": (
                        f"Not enough students ({len(student_data)}) for {n_clusters} clusters. "
                        f"Need at least {n_clusters} students with grades."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        enrollment_ids = [sd["enrollment_id"] for sd in student_data.values()]

        # ── Fetch attendance (full school year) ───────────────────────────
        att_qs = (
            AttendanceRecord.objects
            .filter(
                enrollment_id__in=enrollment_ids,
                enrollment__school_year=school_year,
            )
            .values("enrollment_id")
            .annotate(
                total=Count("attendance_id"),
                absent=Count("attendance_id", filter=Q(status="A")),
            )
        )
        att_map = {row["enrollment_id"]: row for row in att_qs}

        # ── Fetch narrative reports ───────────────────────────────────────
        narrative_qs = NarrativeReport.objects.filter(enrollment_id__in=enrollment_ids)
        if not is_overall_period:
            narrative_qs = narrative_qs.filter(grading_period=grading_period)

        narrative_map = defaultdict(list)
        narrative_ratings_map = defaultdict(list)
        for nr in narrative_qs:
            score = NARRATIVE_SCORE.get(nr.rating)
            if score is not None:
                narrative_map[nr.enrollment_id].append(score)
                narrative_ratings_map[nr.enrollment_id].append(nr.rating)

        # ── Attach attendance_rate and avg_narrative ───────────────────────
        for sd in student_data.values():
            eid = sd["enrollment_id"]

            att = att_map.get(eid)
            if att and att["total"] > 0:
                sd["attendance_rate"] = (att["total"] - att["absent"]) / att["total"]
            else:
                sd["attendance_rate"] = np.nan

            scores = narrative_map.get(eid, [])
            sd["avg_narrative"] = float(np.mean(scores)) if scores else np.nan
            sd["narrative_ratings"] = narrative_ratings_map.get(eid, [])

        # ── Build grade feature matrix ────────────────────────────────────
        # Always a single averaged-grade column (same as the subject_id
        # case), never one column per subject. A student taking 8 subjects
        # would otherwise contribute 8 grade dimensions vs. 1 attendance +
        # 1 narrative dimension, letting grades dominate the distance metric
        # even after scaling. This trades away per-subject granularity to
        # keep the three signal types (grades, attendance, behavior) balanced.
        student_ids = list(student_data.keys())

        grade_features = np.array([
            [np.mean(list(student_data[sid]["grades"].values()))]
            for sid in student_ids
        ])

        # ── Append attendance + narrative features ────────────────────────
        extra_features = np.array([
            [student_data[sid]["attendance_rate"], student_data[sid]["avg_narrative"]]
            for sid in student_ids
        ], dtype=float)
        _impute_col_mean(extra_features)

        features = np.hstack([grade_features, extra_features])

        # ── K-Means ───────────────────────────────────────────────────────
        from sklearn.cluster import KMeans
        from sklearn.metrics import silhouette_score
        from sklearn.preprocessing import StandardScaler

        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features)

        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(features_scaled)

        # ── Cluster quality (silhouette) ────────────────────────────────
        # Reported for the chosen k, plus a cheap search across nearby k
        # values, so the choice of k has a defensible quality metric
        # attached instead of being an arbitrary default. Does not change
        # n_clusters itself — purely informational for the UI/response.
        chosen_silhouette = float(silhouette_score(features_scaled, labels))

        k_search = []
        max_k = min(7, len(features_scaled) - 1)
        for k in range(2, max_k + 1):
            if k == n_clusters:
                k_search.append({"n_clusters": k, "silhouette_score": round(chosen_silhouette, 4)})
                continue
            km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(features_scaled)
            k_search.append({
                "n_clusters": k,
                "silhouette_score": round(float(silhouette_score(features_scaled, km.labels_)), 4),
            })
        suggested_k = (
            max(k_search, key=lambda r: r["silhouette_score"])["n_clusters"] if k_search else None
        )

        # ── Build cluster response ────────────────────────────────────────
        # No PCA projection — the chart plots grade vs. attendance directly
        # (both already below), which is meaningful to a non-technical
        # viewer in a way "PCA Component 1/2" never was. Nothing else in
        # this codebase consumed the old x/y PCA coordinates.
        clusters_map = defaultdict(list)
        narrative_dist_map = defaultdict(lambda: defaultdict(int))
        for idx, sid in enumerate(student_ids):
            sd = student_data[sid]
            avg_grade = float(np.mean(list(sd["grades"].values())))
            att_rate  = sd["attendance_rate"]
            avg_narr  = sd["avg_narrative"]
            cluster_id = int(labels[idx])
            clusters_map[cluster_id].append({
                "student_id":      sd["student_id"],
                "student_name":    sd["student_name"],
                "student_number":  sd["student_number"],
                "grade":           round(avg_grade, 2),
                "attendance_rate": None if np.isnan(att_rate) else round(float(att_rate), 4),
                "avg_narrative":   None if np.isnan(avg_narr) else round(float(avg_narr), 2),
                "subject_name":    subject_name if subject_id else "Overall",
            })
            for rating in sd["narrative_ratings"]:
                narrative_dist_map[cluster_id][rating] += 1

        # Sort by average grade ascending (cluster 0 = at-risk)
        sorted_clusters = sorted(
            clusters_map.items(),
            key=lambda kv: np.mean([s["grade"] for s in kv[1]]),
        )

        # ── AI interpretation ─────────────────────────────────────────────
        cluster_summary_lines = []
        clusters_response     = []

        for new_id, (old_cluster_id, students) in enumerate(sorted_clusters):
            grades_list = [s["grade"] for s in students]
            att_list    = [s["attendance_rate"] for s in students if s["attendance_rate"] is not None]
            narr_list   = [s["avg_narrative"]   for s in students if s["avg_narrative"]   is not None]

            avg_att  = round(float(np.mean(att_list)),  4) if att_list  else None
            avg_narr = round(float(np.mean(narr_list)), 2) if narr_list else None

            att_str  = f"{avg_att:.0%}"  if avg_att  is not None else "N/A"
            narr_str = f"{avg_narr:.2f}" if avg_narr is not None else "N/A"

            # Raw rating counts behind avg_narrative. Narrative ratings are
            # ordinal categories (Needs Improvement/Satisfactory/Outstanding)
            # averaged into a 1-3 score as a deliberate, bounded
            # simplification (the same convention GPA uses) — this exposes
            # the underlying distribution so the averaged number doesn't
            # hide it.
            raw_dist = narrative_dist_map.get(old_cluster_id, {})
            narrative_distribution = {
                "outstanding":       raw_dist.get("outstanding", 0),
                "satisfactory":      raw_dist.get("satisfactory", 0),
                "needs_improvement": raw_dist.get("needs_improvement", 0),
            }

            summary = {
                "cluster_id":     new_id,
                "student_count":  len(students),
                "avg_grade":      round(float(np.mean(grades_list)), 2),
                "min_grade":      round(float(np.min(grades_list)),  2),
                "max_grade":      round(float(np.max(grades_list)),  2),
                "avg_attendance": avg_att,
                "avg_narrative":  avg_narr,
                "narrative_distribution": narrative_distribution,
            }
            cluster_summary_lines.append(
                f"Cluster {new_id}: {summary['student_count']} students, "
                f"avg_grade={summary['avg_grade']}, range=[{summary['min_grade']}–{summary['max_grade']}], "
                f"avg_attendance={att_str}, avg_narrative_score={narr_str}/3"
            )
            clusters_response.append({
                **summary,
                "label":    f"Cluster {new_id}",
                "color":    CLUSTER_COLORS[new_id % len(CLUSTER_COLORS)],
                "students": students,
            })

        meta = {
            "total_students": len(student_ids),
            "school_year":    school_year,
            "grading_period": "Overall (All Periods)" if is_overall_period else grading_period,
            "school_level":   school_level or "All Levels",
            "grade_level":    grade_level or "All Levels",
            "subject":        subject_name,
            "n_clusters":     n_clusters,
            "silhouette_score":     round(chosen_silhouette, 4),
            "k_search":             k_search,
            "suggested_n_clusters": suggested_k,
        }

        ai_result = _call_groq_for_interpretation("\n".join(cluster_summary_lines), meta)

        names = ai_result.get("cluster_names", [])
        for i, c in enumerate(clusters_response):
            if i < len(names) and names[i]:
                c["label"] = names[i]

        return Response({
            "clusters":       clusters_response,
            "interpretation": ai_result.get("interpretation", ""),
            "meta":           meta,
        })