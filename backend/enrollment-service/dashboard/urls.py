from django.urls import path

from .views import DashboardSummaryView, TeachersTodayView

urlpatterns = [
    path("dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("dashboard/teachers-today/", TeachersTodayView.as_view(), name="dashboard-teachers-today"),
]
