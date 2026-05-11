from django.contrib import admin
from django.urls import path, include
 
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("school_settings.urls")),
    path("api/", include("billing.urls")),
]