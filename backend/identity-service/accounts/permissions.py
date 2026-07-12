from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import BasePermission

from .audit import resolve_user_from_request


class HasRole(BasePermission):
    """
    Reusable: configure `required_roles` on the view (omit it to just require
    any authenticated user, e.g. logout).

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
        if required and getattr(user, "role", None) not in required:
            raise PermissionDenied(self.message)
        return True
