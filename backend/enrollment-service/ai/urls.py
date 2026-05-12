from django.urls import path
from .views import GeminiInterpretView

urlpatterns = [
    path("ai/interpret/", GeminiInterpretView.as_view(), name="ai-interpret"),
]
