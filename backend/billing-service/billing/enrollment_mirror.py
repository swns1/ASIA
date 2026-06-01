"""
Read-only ORM mirrors of tables owned by enrollment-service.
All models here are managed=False — billing-service never runs migrations for them.
Used to replace raw SQL cross-service lookups with proper Django ORM queries.
"""
from django.db import models


class EnrollmentMirror(models.Model):
    enrollment_id     = models.BigAutoField(primary_key=True)
    student_id        = models.BigIntegerField()
    school_level      = models.CharField(max_length=30)
    grade_level       = models.CharField(max_length=50)
    school_year       = models.CharField(max_length=20)
    enrollment_status = models.CharField(max_length=20)

    class Meta:
        managed  = False
        db_table = "enrollments"


class ScholarshipTypeMirror(models.Model):
    scholarship_type_id = models.BigAutoField(primary_key=True)
    scholarship_name    = models.CharField(max_length=150)
    discount_mode       = models.CharField(max_length=20)
    discount_value      = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        managed  = False
        db_table = "scholarship_types"


class EnrollmentScholarshipMirror(models.Model):
    enrollment_scholarship_id = models.BigAutoField(primary_key=True)
    enrollment_id             = models.BigIntegerField()
    scholarship_type          = models.ForeignKey(
        ScholarshipTypeMirror,
        on_delete=models.DO_NOTHING,
        db_column="scholarship_type_id",
    )

    class Meta:
        managed  = False
        db_table = "enrollment_scholarships"
