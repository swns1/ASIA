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


STAFF_FULL_WRITE_ROLES = {"super_admin", "admin"}
GRADE_READ_ROLES = {"super_admin", "admin", "registrar", "teacher"}


def teacher_student_ids(user):
    """
    Resolve a role=teacher user's `SectionAdvisory` assignment(s) into the set
    of student_ids they're allowed to touch. Returns an empty set (never
    raises) when the teacher has no advisory assignment yet — fail closed.
    """
    from enrollments.models import Enrollment, SectionAdvisory

    teacher_user_id = getattr(user, "user_id", None) or getattr(user, "id", None)
    if not teacher_user_id:
        return set()

    student_ids = set()
    for advisory in SectionAdvisory.objects.filter(teacher_user_id=teacher_user_id):
        qs = Enrollment.objects.filter(
            school_year=advisory.school_year,
            school_level=advisory.school_level,
            grade_level=advisory.grade_level,
            section=advisory.section,
        )
        if advisory.strand:
            qs = qs.filter(strand=advisory.strand)
        student_ids.update(qs.values_list("student_id", flat=True))
    return student_ids


class IsAdvisoryTeacherOrStaff(BasePermission):
    """
    For grades / attendance / narrative-report viewsets:
      - super_admin/admin: full read+write, any student.
      - registrar: read-only, any student (registrar doesn't teach).
      - teacher: read+write, but restricted to students in their own
        SectionAdvisory assignment(s) — see `teacher_student_ids()`.
      - accounting/guardian: no access.

    Must be paired with a `get_queryset()` override in the viewset that
    filters by `teacher_student_ids()` for role=teacher — object-level checks
    alone don't filter list results. `owner_student_id_field` on the view
    (default "enrollment__student_id") tells `has_object_permission` how to
    resolve a student id off the object.
    """

    message = "You do not have access to this record."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        role = getattr(request.user, "role", None)
        if role not in GRADE_READ_ROLES:
            return False
        if request.method in SAFE_METHODS:
            return True
        return role in STAFF_FULL_WRITE_ROLES or role == "teacher"

    def has_object_permission(self, request, view, obj):
        role = getattr(request.user, "role", None)
        if role in STAFF_FULL_WRITE_ROLES:
            return True
        if role == "registrar":
            return request.method in SAFE_METHODS
        if role == "teacher":
            field_path = getattr(view, "owner_student_id_field", "enrollment__student_id")
            value = obj
            for part in field_path.split("__"):
                value = getattr(value, part, None)
                if value is None:
                    break
            return value in teacher_student_ids(request.user)
        return False
