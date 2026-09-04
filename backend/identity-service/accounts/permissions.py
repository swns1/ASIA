from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import BasePermission

from .audit import resolve_user_from_request


class HasRole(BasePermission):
    """
    Reusable: configure `required_roles` on the view. A view that genuinely
    wants "any authenticated user, any role" (e.g. logout, or a
    self-service profile endpoint that does its own ownership/admin checks
    in-method) must say so explicitly with
    ALLOW_ANY_AUTHENTICATED_ROLE = True rather than by omission -- omitting
    required_roles now denies, it doesn't silently allow. It used to allow:
    this class is DEFAULT_PERMISSION_CLASSES for the whole service, so a
    view that simply forgot required_roles was reachable by any logged-in
    account. Every current view was audited when this was tightened; the
    two that actually need the open behavior (LogoutView, UserDetailView)
    now say so explicitly.

        class MyView(APIView):
            permission_classes = [HasRole]
            required_roles = {"super_admin", "accounting"}

    identity-service has no AUTH_USER_MODEL pointing at accounts.User (see
    settings.py), so JWTAuthentication can't populate request.user here the
    way it does in the other 3 services -- every view instead sets
    authentication_classes = [] and resolves the caller by hand via
    resolve_user_from_request(). This class does the same, and -- because
    authentication_classes = [] means DRF's automatic 401-vs-403 selection
    in APIView.permission_denied() never kicks in (it depends on
    request.authenticators, which is empty here) -- it raises
    NotAuthenticated/PermissionDenied itself to reproduce that same split.
    That distinction matters: apiClient.js's response interceptor only
    attempts a silent token refresh on 401, not 403.
    """

    message = "Your role does not have access to this action."

    def has_permission(self, request, view):
        user = resolve_user_from_request(request)
        request.resolved_user = user  # avoid a second DB lookup in the view
        if not user:
            raise NotAuthenticated("Authentication required.")
        required = getattr(view, "required_roles", None)
        if required:
            if getattr(user, "role", None) not in required:
                raise PermissionDenied(self.message)
            return True
        if getattr(view, "ALLOW_ANY_AUTHENTICATED_ROLE", False):
            return True
        raise PermissionDenied(self.message)
