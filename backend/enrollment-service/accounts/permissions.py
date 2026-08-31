from rest_framework.permissions import BasePermission, SAFE_METHODS

from shared.permissions import HasRole, IsAdminRegistrarOrReadOnly, WRITE_ROLES_DEFAULT

__all__ = [
    "HasRole",
    "IsAdminRegistrarOrReadOnly",
    "WRITE_ROLES_DEFAULT",
    "STAFF_FULL_WRITE_ROLES",
    "GRADE_READ_ROLES",
    "teacher_student_ids",
    "guardian_student_ids",
    "IsAdvisoryTeacherOrStaff",
    "IsStaffOrOwnerGuardianReadOnly",
]


def _resolve_student_id(view, obj, default_field="enrollment__student_id"):
    """Walk `view.owner_student_id_field` (a `__`-joined attr path) off obj
    to pull out the student_id it belongs to (e.g. "enrollment__student_id"
    or just "student_id")."""
    field_path = getattr(view, "owner_student_id_field", default_field)
    value = obj
    for part in field_path.split("__"):
        value = getattr(value, part, None)
        if value is None:
            break
    return value


STAFF_FULL_WRITE_ROLES = {"super_admin", "admin"}
GRADE_READ_ROLES = {"super_admin", "admin", "registrar", "teacher"}


def teacher_student_ids(user):
    """
    Resolve a role=teacher user's `SectionAdvisory` assignment(s) into the set
    of student_ids they're allowed to touch. Only students currently
    `enrolled` count — once a student is dropped/transferred out of the
    section, their former teacher loses access to that student's records,
    matching the my-sections/section-grades scoping. Returns an empty set
    (never raises) when the teacher has no advisory assignment yet — fail
    closed.
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
            enrollment_status="enrolled",
        )
        if advisory.strand:
            qs = qs.filter(strand=advisory.strand)
        student_ids.update(qs.values_list("student_id", flat=True))
    return student_ids


def guardian_student_ids(user):
    """
    Resolve a role=guardian user's linked student_id(s) via the guardians
    table mirror (guardians.user_id → student_id). Returns an empty set
    (never raises, never falls open) when the guardian account isn't linked
    to any Guardian row yet — fail closed, so an unlinked guardian sees
    nothing rather than everything. One user_id may map to several rows
    (siblings), so a guardian can be linked to multiple students.
    """
    from .guardian_mirror import GuardianMirror

    guardian_user_id = getattr(user, "user_id", None) or getattr(user, "id", None)
    if not guardian_user_id:
        return set()
    return set(
        GuardianMirror.objects.filter(user_id=guardian_user_id)
        .values_list("student_id", flat=True)
    )


class IsAdvisoryTeacherOrStaff(BasePermission):
    """
    For grades / attendance / narrative-report / score-entry viewsets:
      - super_admin/admin: full read+write, any student.
      - registrar: read-only, any student (registrar doesn't teach).
      - teacher: read+write, but restricted to students in their own
        SectionAdvisory assignment(s) — see `teacher_student_ids()`.
      - guardian: read-only, restricted to their own child(ren) — see
        `guardian_student_ids()`.
      - accounting: no access.

    Must be paired with a `get_queryset()` override in the viewset that
    filters by `teacher_student_ids()` / `guardian_student_ids()` — object-
    level checks alone don't filter list results. `owner_student_id_field` on
    the view (default "enrollment__student_id") tells `has_object_permission`
    how to resolve a student id off the object.
    """

    message = "You do not have access to this record."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        role = getattr(request.user, "role", None)
        if role == "guardian":
            return request.method in SAFE_METHODS  # read-only, scoped below
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
            return _resolve_student_id(view, obj) in teacher_student_ids(request.user)
        if role == "guardian":
            return (
                request.method in SAFE_METHODS
                and _resolve_student_id(view, obj) in guardian_student_ids(request.user)
            )
        return False


class IsStaffOrOwnerGuardianReadOnly(BasePermission):
    """
    For staff-CRUD resources a guardian is also allowed to READ, scoped to
    their own child(ren) — currently the EnrollmentViewSet:
      - super_admin/admin/registrar/accounting: full write (staff roles) or
        read-only (accounting), any student (existing "any authenticated
        staff read" behavior).
      - teacher: read-only, scoped to their own SectionAdvisory roster via
        `teacher_student_ids()` — matches how grades/attendance are already
        scoped under IsAdvisoryTeacherOrStaff, so a teacher can't browse
        enrollment records for students outside their own section(s).
      - guardian: read-only, scoped to their own child(ren) by the view's
        get_queryset() (list) and has_object_permission() (detail).

    Set `owner_student_id_field = "student_id"` on the view when the object is
    the Enrollment itself (default assumes a nested "enrollment__student_id").
    """

    message = "You do not have access to this record."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        # writes: staff only — guardians/teachers/accounting cannot write.
        return getattr(request.user, "role", None) in WRITE_ROLES_DEFAULT

    def has_object_permission(self, request, view, obj):
        role = getattr(request.user, "role", None)
        if role == "guardian":
            return (
                request.method in SAFE_METHODS
                and _resolve_student_id(view, obj) in guardian_student_ids(request.user)
            )
        if role == "teacher":
            return (
                request.method in SAFE_METHODS
                and _resolve_student_id(view, obj) in teacher_student_ids(request.user)
            )
        return True
