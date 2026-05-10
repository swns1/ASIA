from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from enrollments.views import EnrollmentViewSet
from enrollments.email_views import send_enrollment_email

router = DefaultRouter()
router.register(r"enrollments", EnrollmentViewSet, basename="enrollment")

urlpatterns = [
    path("admin/", admin.site.urls),

    # Domain APIs — token verification only; identity-service issues tokens.
    path("api/", include("enrollments.urls")),
    path("api/", include("subjects.urls")),
    path("api/", include("scholarships.urls")),
    path("api/", include("grading.urls")),
    path("api/", include("grades.urls")),
    path("api/send-enrollment-email/", send_enrollment_email, name="send_enrollment_email")
]
