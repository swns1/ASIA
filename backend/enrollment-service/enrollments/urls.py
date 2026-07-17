from rest_framework.routers import DefaultRouter
from .views import EnrollmentTransferViewSet, EnrollmentViewSet, SectionAdvisoryViewSet

router = DefaultRouter()
router.register(r"enrollments", EnrollmentViewSet, basename="enrollment")
router.register(r"section-advisories", SectionAdvisoryViewSet, basename="section-advisory")
router.register(r"enrollment-transfers", EnrollmentTransferViewSet, basename="enrollment-transfer")

urlpatterns = router.urls
