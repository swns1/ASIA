from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from enrollments.views import EnrollmentViewSet
from enrollments.email_views import send_enrollment_email

router = DefaultRouter()
router.register(r"enrollments", EnrollmentViewSet, basename="enrollment")

urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/", include("enrollments.urls")),
    path("api/", include("requirements.urls")),
    path("api/", include("subjects.urls")),
    path("api/", include("scholarships.urls")),
    path("api/", include("grading.urls")),
    path("api/", include("grades.urls")),
    path("api/", include("ai.urls")),
    path("api/send-enrollment-email/", send_enrollment_email, name="send_enrollment_email"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)