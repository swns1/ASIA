from django.urls import path, include
from shared.health import health_check

# No Django admin: it was mounted but could never log anyone in -- the
# accounts.User stub has no manager for natural-key lookups or password
# checks, so every attempt answered 500. Billing is managed in the SPA.
urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("api/", include("school_settings.urls")),
    path("api/", include("billing.urls")),
]