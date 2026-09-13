from django.urls import path
from .views import (
    AuditLogListView, AuditLogFacetsView, LoginView, RefreshView, LogoutView,
    UserListView, UserDetailView,
)

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("audit-logs/", AuditLogListView.as_view(), name="audit-logs"),
    path("audit-logs/facets/", AuditLogFacetsView.as_view(), name="audit-log-facets"),
    path("users/", UserListView.as_view(), name="user-list"),
    path("users/<int:user_id>/", UserDetailView.as_view(), name="user-detail"),
]