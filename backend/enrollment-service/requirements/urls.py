from rest_framework.routers import DefaultRouter
from .views import RequirementTypeViewSet, StudentRequirementSubmissionViewSet

router = DefaultRouter()
router.register(r"requirement-types", RequirementTypeViewSet, basename="requirement-type")
router.register(
    r"student-requirement-submissions",
    StudentRequirementSubmissionViewSet,
    basename="student-requirement-submission",
)

urlpatterns = router.urls