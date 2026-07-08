from rest_framework.routers import DefaultRouter
from .views import GradeViewSet, NarrativeCategoryViewSet, NarrativeReportViewSet

router = DefaultRouter()
router.register(r"grades",               GradeViewSet,             basename="grade")
router.register(r"narrative-categories", NarrativeCategoryViewSet, basename="narrative-category")
router.register(r"narrative-reports",    NarrativeReportViewSet,   basename="narrative-report")

urlpatterns = router.urls