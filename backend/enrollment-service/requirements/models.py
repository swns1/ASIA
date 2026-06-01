from django.db import models
from django.utils import timezone

# Canonical schema owner for requirement_types and student_requirement_submissions.
# The student-service has unmanaged mirror models pointing at the same tables.
# All schema changes (new columns, indexes) must originate here.

class RequirementType(models.Model):
    requirement_type_id = models.BigAutoField(primary_key=True)
    requirement_code = models.CharField(max_length=50, unique=True)
    requirement_name = models.CharField(max_length=150)
    description = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "requirement_types"
        managed = False
        ordering = ("requirement_name",)


class StudentRequirementSubmission(models.Model):
    student_requirement_submission_id = models.BigAutoField(primary_key=True)
    student_id = models.BigIntegerField(db_index=True)
    requirement_type = models.ForeignKey(
        RequirementType,
        on_delete=models.RESTRICT,
        db_column="requirement_type_id",
        related_name="submissions",
    )
    is_submitted = models.BooleanField(default=False)
    image_url = models.TextField(null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "student_requirement_submissions"
        managed = False
        unique_together = (("student_id", "requirement_type"),)
        ordering = ("requirement_type__requirement_name",)