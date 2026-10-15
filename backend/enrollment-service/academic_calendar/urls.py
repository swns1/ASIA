from rest_framework.routers import DefaultRouter
from .views import CalendarEventViewSet, GuardianCalendarEventViewSet, PersonalEventViewSet

router = DefaultRouter()
router.register(r"calendar-events", CalendarEventViewSet, basename="calendar-event")
router.register(r"guardian/calendar-events", GuardianCalendarEventViewSet, basename="guardian-calendar-event")
router.register(r"personal-events", PersonalEventViewSet, basename="personal-event")

urlpatterns = router.urls
