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

    A view may also set `read_roles` to widen *reads* only, keeping
    `required_roles` as the write set:

        class MyView(APIView):
            permission_classes = [HasRole]
            required_roles = {"super_admin", "admin"}   # writes
            read_roles = required_roles | {"registrar"} # reads

    This exists because `required_roles` alone is all-or-nothing per view,
    which silently under-served reference data: school settings were
    admin/accounting-only, yet the registrar and teacher printing a DepEd
    form both read them for the letterhead and SchoolYearContext reads
    `current_school_year` on every page load. Both callers swallow the error,
    so the 403 surfaced as a blank school address and a school year derived
    from the calendar instead of the configured one.

    Omitting `read_roles` leaves behaviour exactly as before. The read/write
    split itself mirrors IsAdminRegistrarOrReadOnly above.
    """

    message = "Your role does not have access to this action."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        role = getattr(request.user, "role", None)
        if request.method in SAFE_METHODS:
            read_roles = getattr(view, "read_roles", None)
            if read_roles:
                return role in read_roles
        required = getattr(view, "required_roles", None)
        if required:
            return role in required
        return bool(getattr(view, "ALLOW_ANY_AUTHENTICATED_ROLE", False))
