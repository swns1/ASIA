from rest_framework.routers import DefaultRouter
from .views import EnrollmentViewSet, SectionAdvisoryViewSet

router = DefaultRouter()
router.register(r"enrollments", EnrollmentViewSet, basename="enrollment")
router.register(r"section-advisories", SectionAdvisoryViewSet, basename="section-advisory")

urlpatterns = router.urls
