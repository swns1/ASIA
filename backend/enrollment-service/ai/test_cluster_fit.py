"""
K-Means on cohorts with few distinct points.

Students with identical grade, attendance and behavior are one point to
K-Means. A section where everyone was given the same grade used to answer 500
(silhouette_score raises on a single group), and a cohort with only two
distinct points asked for 3 groups was reported as 3 while drawing 2.

Pure functions plus the view with its data source patched out, so no
database -- see enrollment-service's test notes on managed=False models.
"""
from types import SimpleNamespace

import numpy as np
from rest_framework.test import APIRequestFactory, force_authenticate

from ai import analytics_views
from ai.analytics_views import ClusterAnalyticsView, _fit_candidate_ks


def _student(sid, grade, attendance=1.0, narrative=3.0):
    return {
        "student_id": sid,
        "enrollment_id": sid,
        "student_name": f"Learner {sid}",
        "student_number": f"S-{sid:04d}",
        "grades": {"Math": grade},
        "grade": grade,
        "attendance_rate": attendance,
        "avg_narrative": narrative,
        "narrative_ratings": [],
    }


def _call_view(monkeypatch, students, **params):
    monkeypatch.setattr(
        analytics_views, "build_student_features",
        lambda *args, **kwargs: ({s["student_id"]: s for s in students}, "Math"),
    )
    monkeypatch.setattr(analytics_views, "_call_groq_for_interpretation", lambda *a, **k: {})
    monkeypatch.setattr(ClusterAnalyticsView, "throttle_classes", [])

    query = {"school_year": "2026-2027", "grading_period": "1st_quarter", **params}
    request = APIRequestFactory().get("/api/ai/cluster/", query)
    force_authenticate(request, user=SimpleNamespace(role="admin", user_id=1, is_authenticated=True))
    return ClusterAnalyticsView.as_view()(request)


# ── _fit_candidate_ks ─────────────────────────────────────────────────────────

def test_identical_students_produce_no_fit():
    features = np.zeros((5, 3))
    fits, k_search = _fit_candidate_ks(features)
    assert fits == {}
    assert k_search == []


def test_two_distinct_points_allow_only_two_groups():
    features = np.array([[-1.0, 0.0, 0.0]] * 3 + [[1.0, 0.0, 0.0]] * 3)
    fits, k_search = _fit_candidate_ks(features)
    assert list(fits) == [2]
    assert [r["n_clusters"] for r in k_search] == [2]


def test_every_kept_fit_has_exactly_k_groups():
    rng = np.random.default_rng(0)
    centers = np.array([[-5.0, 0.0, 0.0], [0.0, 5.0, 0.0], [5.0, 0.0, 5.0]])
    features = np.vstack([c + rng.normal(scale=0.1, size=(4, 3)) for c in centers])
    fits, _ = _fit_candidate_ks(features)
    assert list(fits) == [2, 3, 4, 5, 6, 7]
    for k, (km, _score) in fits.items():
        assert len(set(km.labels_)) == k


# ── ClusterAnalyticsView ──────────────────────────────────────────────────────

def test_view_answers_400_not_500_when_everyone_is_identical(monkeypatch):
    response = _call_view(monkeypatch, [_student(i, 85.0) for i in range(1, 6)])
    assert response.status_code == 400
    assert "nothing to split" in response.data["error"]


def test_view_reports_the_groups_it_actually_drew(monkeypatch):
    students = [_student(i, 80.0) for i in range(1, 4)] + [_student(i, 92.0) for i in range(4, 7)]
    response = _call_view(monkeypatch, students, n_clusters="5")
    assert response.status_code == 200
    assert response.data["meta"]["n_clusters"] == 2
    assert len(response.data["clusters"]) == 2
