from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    StudentViewSet,
    HouseholdViewSet,
    GuardianViewSet,
    SiblingViewSet,
    PreviousSchoolViewSet,
    RequirementTypeViewSet,
    StudentRequirementSubmissionViewSet,
)
from .ocr.views import OCRScanView, ReconciledLedgerView

router = DefaultRouter()
router.register(r"students", StudentViewSet)
router.register(r"households", HouseholdViewSet)
router.register(r"guardians", GuardianViewSet)
# `student_siblings` deliberately has no route. Sibling-ness is derived from a
# shared household (see StudentViewSet.siblings / link_sibling); a second,
# separately-maintained student-to-student link is a competing answer to the
# same question that can disagree with the first. The table and model are left
# in place -- it holds no rows and dropping it is a schema change -- but
# nothing is served from it. `siblings` below is unrelated: free-text names
# and ages typed at intake for siblings who may not attend this school.
router.register(r"siblings", SiblingViewSet)
router.register(r"previous_schools", PreviousSchoolViewSet)
router.register(r"requirement_types", RequirementTypeViewSet)
router.register(r"student_requirement_submissions", StudentRequirementSubmissionViewSet)

urlpatterns = router.urls + [
    path("ocr/scan/", OCRScanView.as_view(), name="ocr-scan"),
    path("ocr/reconciled/", ReconciledLedgerView.as_view(), name="ocr-reconciled"),
]