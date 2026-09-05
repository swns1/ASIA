from shared.permissions import HasRole, IsAdminRegistrarOrReadOnly, WRITE_ROLES_DEFAULT

__all__ = ["HasRole", "IsAdminRegistrarOrReadOnly", "WRITE_ROLES_DEFAULT", "teacher_student_ids"]


def teacher_student_ids(user):
    """
    Resolve a role=teacher user's `SectionAdvisory` assignment(s) into the
    set of student_ids they're allowed to read student-service records for.
    Only students currently `enrolled` count -- matches
    enrollment-service's teacher_student_ids (accounts/permissions.py
    there), which this mirrors via read-only ORM copies of enrollment-service's
    tables (accounts/enrollment_mirror.py) since student-service doesn't own
    SectionAdvisory/Enrollment itself. Returns an empty set (never raises)
    when the teacher has no advisory assignment yet -- fail closed.
    """
    from .enrollment_mirror import EnrollmentMirror, SectionAdvisoryMirror

    teacher_user_id = getattr(user, "user_id", None) or getattr(user, "id", None)
    if not teacher_user_id:
        return set()

    student_ids = set()
    for advisory in SectionAdvisoryMirror.objects.filter(teacher_user_id=teacher_user_id):
        qs = EnrollmentMirror.objects.filter(
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
