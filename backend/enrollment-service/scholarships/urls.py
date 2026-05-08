from rest_framework.routers import DefaultRouter
from .views import ScholarshipTypeViewSet, EnrollmentScholarshipViewSet

router = DefaultRouter()
router.register(r"scholarship-types",       ScholarshipTypeViewSet,       basename="scholarship-type")
router.register(r"enrollment-scholarships", EnrollmentScholarshipViewSet, basename="enrollment-scholarship")

urlpatterns = router.urls
