from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ApplicationInviteViewSet,
    ApplyDraftView,
    ApplySubmitView,
    ApplyVerifyView,
    StudentApplicationViewSet,
)

router = DefaultRouter()
router.register(r"application-invites", ApplicationInviteViewSet, basename="application-invite")
router.register(r"student-applications", StudentApplicationViewSet, basename="student-application")

urlpatterns = router.urls + [
    path("apply/<uuid:invite_id>/verify/", ApplyVerifyView.as_view(), name="apply-verify"),
    path("apply/<uuid:invite_id>/draft/", ApplyDraftView.as_view(), name="apply-draft"),
    path("apply/<uuid:invite_id>/submit/", ApplySubmitView.as_view(), name="apply-submit"),
]
