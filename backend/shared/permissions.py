from rest_framework.permissions import BasePermission, SAFE_METHODS


WRITE_ROLES_DEFAULT = {"super_admin", "admin", "registrar"}


class IsAdminRegistrarOrReadOnly(BasePermission):
    """
    Anyone authenticated (staff) can read. Only super_admin, admin, or
    registrar can write (create/update/delete).

    Guardians are denied entirely — they are not staff and must never reach a
    generic staff endpoint. Guardian access goes through the service's own
    guardian-scoped permission classes instead, so denying here keeps
    everything else fail-closed.
    """

    message = "Only admins or registrars can perform this action."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if getattr(request.user, "role", None) == "guardian":
            return False
        if request.method in SAFE_METHODS:
            return True
        role = getattr(request.user, "role", None)
        return role in WRITE_ROLES_DEFAULT


class HasRole(BasePermission):
    """
    Reusable: configure `required_roles` on the view.

        class MyView(APIView):
            permission_classes = [HasRole]
            required_roles = {"super_admin", "accounting"}

    Fails closed if `required_roles` isn't set. It didn't used to -- a view
    that forgot the line was readable by any authenticated user, guardians
    included, since this class is DEFAULT_PERMISSION_CLASSES in every
    service (see settings.py). No current view in this codebase relied on
    that (verified: every HasRole view sets required_roles), so this has no
    behavior change for real endpoints -- it only removes the trap for
    future ones. A view that genuinely wants "any authenticated user, any
    role" must say so with ALLOW_ANY_AUTHENTICATED_ROLE = True rather than
    by omission.
    """

    message = "Your role does not have access to this action."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        required = getattr(view, "required_roles", None)
        if required:
            return getattr(request.user, "role", None) in required
        return bool(getattr(view, "ALLOW_ANY_AUTHENTICATED_ROLE", False))
