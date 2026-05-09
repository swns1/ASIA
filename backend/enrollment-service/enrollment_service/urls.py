from django.contrib import admin
from django.urls import path, include


urlpatterns = [
    path("admin/", admin.site.urls),

    # Domain APIs — token verification only; identity-service issues tokens.
    path("api/", include("enrollments.urls")),
    path("api/", include("subjects.urls")),
    path("api/", include("scholarships.urls")),
    path("api/", include("grading.urls")),
]
