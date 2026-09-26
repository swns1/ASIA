from rest_framework.permissions import BasePermission, SAFE_METHODS

from shared.permissions import HasRole, IsAdminRegistrarOrReadOnly, WRITE_ROLES_DEFAULT

__all__ = [
    "HasRole",
    "IsAdminRegistrarOrReadOnly",
    "WRITE_ROLES_DEFAULT",
    "STAFF_FULL_WRITE_ROLES",
    "GRADE_READ_ROLES",
    "teacher_student_ids",
    "teacher_enrollment_ids",
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


def _teacher_roster(user):
    """(enrollment_id, student_id) for every `enrolled` row in the teacher's
    SectionAdvisory sections. Empty -- never raises -- for a teacher with no
    advisory yet: fail closed."""
    from enrollments.models import Enrollment, SectionAdvisory

    teacher_user_id = getattr(user, "user_id", None) or getattr(user, "id", None)
    if not teacher_user_id:
        return set()

    roster = set()
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
        roster.update(qs.values_list("enrollment_id", "student_id"))
    return roster


def teacher_student_ids(user):
    """
    Resolve a role=teacher user's `SectionAdvisory` assignment(s) into the set
    of student_ids they may READ. Only students currently `enrolled` count —
    once a student is dropped/transferred out of the section, their former
    teacher loses access to that student's records, matching the
    my-sections/section-grades scoping. Returns an empty set (never raises)
    when the teacher has no advisory assignment yet — fail closed.

    Writes are narrower: see teacher_enrollment_ids().
    """
    return {student_id for _enrollment_id, student_id in _teacher_roster(user)}


def teacher_enrollment_ids(user):
    """
    The enrollment rows a teacher may WRITE to: this year's rows of the
    learners in their own sections.

    Writes used to be checked by student, and a learner's student id also
    covers every other year they spent here -- so a teacher could change the
    final grades a colleague recorded for their learner last year, which is
    exactly what Promote and the report card read.
    """
    return {enrollment_id for enrollment_id, _student_id in _teacher_roster(user)}


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
            if request.method in SAFE_METHODS:
                return _resolve_student_id(view, obj) in teacher_student_ids(request.user)
            return getattr(obj, "enrollment_id", None) in teacher_enrollment_ids(request.user)
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


def assert_teacher_may_write_enrollment(user, enrollment):
    """
    Guard the CREATE path for records that hang off an Enrollment.

    DRF only calls `has_object_permission` for detail routes, so a plain
    `POST /api/grades/` or `POST /api/attendance/` never reached
    IsAdvisoryTeacherOrStaff's object check -- any teacher could post a grade
    or an attendance record for any student in the school. The `bulk`
    attendance action already guarded this (attendance/views.py); this is the
    same rule for the single-record paths.

    Also call it from perform_update with the row's destination: DRF checks
    has_object_permission against the record as it already exists, so a PATCH
    that moved a grade or attendance record onto another enrollment was only
    ever checked against the one it left.

    Checked by enrollment, not student -- see teacher_enrollment_ids().

    Staff roles pass through untouched. Raises PermissionDenied for a teacher
    writing outside their advisory roster, and fails closed on an unresolvable
    enrollment.
    """
    from rest_framework.exceptions import PermissionDenied

    if getattr(user, "role", None) != "teacher":
        return

    enrollment_id = getattr(enrollment, "enrollment_id", enrollment)
    if enrollment_id is None or enrollment_id not in teacher_enrollment_ids(user):
        raise PermissionDenied(
            "You can only record this for students in your own advisory section, "
            "for the current school year."
        )
