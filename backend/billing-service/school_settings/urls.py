from rest_framework.routers import DefaultRouter
from .views import SchoolSettingViewSet

router = DefaultRouter()
router.register(r"school-settings", SchoolSettingViewSet, basename="school-setting")

urlpatterns = router.urls