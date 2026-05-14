from django.urls import path
from .views import GeminiInterpretView
from .analytics_views import ClusterAnalyticsView

urlpatterns = [
    path("ai/interpret/", GeminiInterpretView.as_view(), name="ai-interpret"),
    path("ai/cluster/", ClusterAnalyticsView.as_view(), name="ai-cluster"),
]
