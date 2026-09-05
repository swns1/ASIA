"""
Read-only ORM mirrors of tables owned by enrollment-service.
All models here are managed=False -- student-service never runs migrations
for them. Used by teacher_student_ids() (accounts/permissions.py) to scope
a teacher's read access to students in their own section advisory, the same
way enrollment-service scopes grades/attendance/dashboard -- see
enrollment-service/accounts/permissions.py's teacher_student_ids for the
original.
"""
from django.db import models


class EnrollmentMirror(models.Model):
    enrollment_id = models.BigAutoField(primary_key=True)
    student_id = models.BigIntegerField()
    school_year = models.CharField(max_length=20)
    school_level = models.CharField(max_length=20)
    grade_level = models.CharField(max_length=20)
    section = models.CharField(max_length=50)
    strand = models.CharField(max_length=50, null=True, blank=True)
    enrollment_status = models.CharField(max_length=20)

    class Meta:
        managed = False
        db_table = "enrollments"


class SectionAdvisoryMirror(models.Model):
    advisory_id = models.BigAutoField(primary_key=True)
    teacher_user_id = models.BigIntegerField(db_index=True)
    school_year = models.CharField(max_length=20)
    school_level = models.CharField(max_length=20)
    grade_level = models.CharField(max_length=20)
    section = models.CharField(max_length=50)
    strand = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        managed = False
        db_table = "section_advisories"
