from rest_framework.permissions import BasePermission, SAFE_METHODS


WRITE_ROLES_DEFAULT = {"super_admin", "admin", "registrar"}


class IsAdminRegistrarOrReadOnly(BasePermission):
    """
    Anyone authenticated (staff) can read. Only super_admin, admin, or
    registrar can write (create/update/delete).

    Guardians are denied entirely — they are not staff and must never reach a
    student-service endpoint (student/household/guardian records are all
    sensitive PII). The guardian portal gets everything it needs from
    enrollment-service (which embeds the child's name) and billing-service, so
    denying here keeps student-service fail-closed for guardians.
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
    """

    message = "Your role does not have access to this action."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        required = getattr(view, "required_roles", None)
        if not required:
            return True
        return getattr(request.user, "role", None) in required
