from rest_framework.routers import DefaultRouter
from .views import GradingTemplateViewSet, GradingComponentViewSet, ScoreEntryViewSet

router = DefaultRouter()
router.register(r"grading-templates", GradingTemplateViewSet)
router.register(r"grading-components", GradingComponentViewSet)
router.register(r"score-entries", ScoreEntryViewSet)

urlpatterns = router.urls