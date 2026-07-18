from rest_framework.permissions import BasePermission, SAFE_METHODS


WRITE_ROLES_DEFAULT = {"super_admin", "admin", "registrar"}


class IsAdminRegistrarOrReadOnly(BasePermission):
    """
    Anyone authenticated can read. Only super_admin, admin, or registrar
    can write (create/update/delete).

    Used by: subjects (per the spec — "only admin/registrar/super_admin").
    """

    message = "Only admins or registrars can perform this action."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
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


BILLING_ROLES = {"super_admin", "admin", "accounting", "registrar"}


def guardian_student_ids(user):
    """
    Resolve a role=guardian user's linked student_id(s) via the guardians
    table mirror (guardians.user_id → student_id). Empty set when unlinked —
    fail closed.
    """
    from billing.guardian_mirror import GuardianMirror

    guardian_user_id = getattr(user, "user_id", None) or getattr(user, "id", None)
    if not guardian_user_id:
        return set()
    return set(
        GuardianMirror.objects.filter(user_id=guardian_user_id)
        .values_list("student_id", flat=True)
    )


def guardian_enrollment_ids(user):
    """
    Resolve a guardian's linked students to the set of enrollment_ids that
    invoices/installments hang off of (guardian → student_ids → enrollment_ids
    via the enrollment mirror). Empty set when unlinked — fail closed.
    """
    from billing.enrollment_mirror import EnrollmentMirror

    student_ids = guardian_student_ids(user)
    if not student_ids:
        return set()
    return set(
        EnrollmentMirror.objects.filter(student_id__in=student_ids)
        .values_list("enrollment_id", flat=True)
    )


class IsBillingStaffOrOwnerGuardianReadOnly(BasePermission):
    """
    For invoice / installment viewsets a guardian may READ, scoped to their
    own child(ren):
      - super_admin/admin/accounting/registrar: full access (billing staff).
      - guardian: read-only, scoped by the view's get_queryset() (list) and
        has_object_permission() (detail), keyed on enrollment_id.
      - everyone else (teacher): no access.

    Set `owner_enrollment_id_field` on the view to the `__`-path from the
    object to its enrollment_id (default "enrollment_id" for StudentInvoice;
    "invoice__enrollment_id" for InvoiceInstallment).
    """

    message = "You do not have access to this record."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        role = getattr(request.user, "role", None)
        if role == "guardian":
            return request.method in SAFE_METHODS
        return role in BILLING_ROLES

    def has_object_permission(self, request, view, obj):
        if getattr(request.user, "role", None) != "guardian":
            return True
        if request.method not in SAFE_METHODS:
            return False
        field_path = getattr(view, "owner_enrollment_id_field", "enrollment_id")
        value = obj
        for part in field_path.split("__"):
            value = getattr(value, part, None)
            if value is None:
                break
        return value in guardian_enrollment_ids(request.user)
