from django.urls import path, include
from enrollments.email_views import send_enrollment_email
from enrollments.report_views import report_card
from shared.health import health_check

# No Django admin: it was mounted at /admin/ but could never log anyone in --
# the accounts.User stub it authenticates against has no password check, so
# every login attempt answered 500. Same as the student and billing services.
urlpatterns = [
    path("health/", health_check, name="health-check"),

    path("api/enrollments/<int:enrollment_id>/report-card/", report_card, name="report_card"),
    path("api/", include("enrollments.urls")),
    path("api/", include("requirements.urls")),
    path("api/", include("subjects.urls")),
    path("api/", include("scholarships.urls")),
    path("api/", include("grading.urls")),
    path("api/", include("grades.urls")),
    path("api/", include("ai.urls")),
    path("api/", include("academic_calendar.urls")),
    path("api/", include("dashboard.urls")),
    path("api/send-enrollment-email/", send_enrollment_email, name="send_enrollment_email"),
    path("api/", include("attendance.urls")),
]

# No public static(MEDIA_URL, ...) route here on purpose. It used to serve
# every file under MEDIA_ROOT — including every uploaded student document —
# to anyone, unauthenticated, whenever DEBUG was on (which was always, since
# DEBUG was hardcoded True). Documents are served instead through the
# StudentRequirementSubmissionViewSet.file action, gated by a short-lived
# signed token (see backend/shared/uploads.py).