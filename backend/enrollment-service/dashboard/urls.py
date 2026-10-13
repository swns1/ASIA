from django.urls import path

from .views import DashboardSummaryView, MyDayView, TeachersTodayView

urlpatterns = [
    path("dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("dashboard/teachers-today/", TeachersTodayView.as_view(), name="dashboard-teachers-today"),
    path("dashboard/my-day/", MyDayView.as_view(), name="dashboard-my-day"),
]
