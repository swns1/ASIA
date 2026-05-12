from django.urls import path
from .views import AuditLogListView, LoginView, RefreshView, LogoutView

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("audit-logs/", AuditLogListView.as_view(), name="audit-logs"),
]