from django.contrib import admin
from django.urls import path, include
from shared.health import health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_check, name="health-check"),
    path("api/", include("school_settings.urls")),
    path("api/", include("billing.urls")),
]