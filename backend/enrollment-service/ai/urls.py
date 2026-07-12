from django.urls import path
from .views import GeminiInterpretView
from .analytics_views import ClusterAnalyticsView
from .risk_views import (
    RiskAssessmentRunView,
    RiskAssessmentLatestView,
    RiskAssessmentTrendView,
)

urlpatterns = [
    path("ai/interpret/", GeminiInterpretView.as_view(), name="ai-interpret"),
    path("ai/cluster/", ClusterAnalyticsView.as_view(), name="ai-cluster"),
    path("ai/risk-assessment/run/", RiskAssessmentRunView.as_view(), name="ai-risk-run"),
    path("ai/risk-assessment/latest/", RiskAssessmentLatestView.as_view(), name="ai-risk-latest"),
    path("ai/risk-assessment/trend/", RiskAssessmentTrendView.as_view(), name="ai-risk-trend"),
]
