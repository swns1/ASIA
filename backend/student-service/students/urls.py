from rest_framework.routers import DefaultRouter
from .views import (
    StudentViewSet,
    HouseholdViewSet,
    GuardianViewSet,
    StudentSiblingViewSet,
    SiblingViewSet,
    PreviousSchoolViewSet,
    RequirementTypeViewSet,
    StudentRequirementSubmissionViewSet,
)

router = DefaultRouter()
router.register(r"students", StudentViewSet)
router.register(r"households", HouseholdViewSet)
router.register(r"guardians", GuardianViewSet)
router.register(r"student_siblings", StudentSiblingViewSet)
router.register(r"siblings", SiblingViewSet)
router.register(r"previous_schools", PreviousSchoolViewSet)
router.register(r"requirement_types", RequirementTypeViewSet)
router.register(r"student_requirement_submissions", StudentRequirementSubmissionViewSet)

urlpatterns = router.urls