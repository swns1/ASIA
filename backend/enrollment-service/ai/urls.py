from django.urls import path
from .views import GeminiInterpretView
from .analytics_views import ClusterAnalyticsView
from .risk_views import (
    RiskAssessmentRunView,
    RiskAssessmentLatestView,
    RiskAssessmentTrendView,
)
from .summary_views import (
    SummaryArchiveView,
    SummaryDetailView,
    SummaryDocxView,
    SummaryLookupView,
    SummaryShareView,
)

urlpatterns = [
    path("ai/interpret/", GeminiInterpretView.as_view(), name="ai-interpret"),
    path("ai/summaries/lookup/", SummaryLookupView.as_view(), name="ai-summary-lookup"),
    path("ai/summaries/<int:summary_id>/", SummaryDetailView.as_view(), name="ai-summary-detail"),
    path("ai/summaries/<int:summary_id>/share/", SummaryShareView.as_view(), name="ai-summary-share"),
    path("ai/summaries/<int:summary_id>/archive/", SummaryArchiveView.as_view(), name="ai-summary-archive"),
    path("ai/summaries/<int:summary_id>/docx/", SummaryDocxView.as_view(), name="ai-summary-docx"),
    path("ai/cluster/", ClusterAnalyticsView.as_view(), name="ai-cluster"),
    path("ai/risk-assessment/run/", RiskAssessmentRunView.as_view(), name="ai-risk-run"),
    path("ai/risk-assessment/latest/", RiskAssessmentLatestView.as_view(), name="ai-risk-latest"),
    path("ai/risk-assessment/trend/", RiskAssessmentTrendView.as_view(), name="ai-risk-trend"),
]
