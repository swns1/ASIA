"""
URL configuration for student_service project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from shared.health import health_check

# No public static(MEDIA_URL, ...) route here on purpose. It used to serve
# every file under MEDIA_ROOT — including every uploaded student document —
# to anyone, unauthenticated, whenever DEBUG was on (which was always, since
# DEBUG was hardcoded True). Documents are served instead through the
# StudentRequirementSubmissionViewSet.file action, gated by a short-lived
# signed token (see backend/shared/uploads.py).
urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', health_check, name='health-check'),
    path('api/', include('students.urls')),
]
