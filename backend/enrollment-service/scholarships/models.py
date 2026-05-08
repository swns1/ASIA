from django.db import models

from enrollments.models import Enrollment


class ScholarshipType(models.Model):
    DISCOUNT_MODE_CHOICES = [
        ("percentage",   "Percentage"),
        ("fixed_amount", "Fixed amount"),
    ]

    scholarship_type_id = models.BigAutoField(primary_key=True)
    scholarship_code    = models.CharField(max_length=50, unique=True)
    scholarship_name    = models.CharField(max_length=150)
    description         = models.TextField(null=True, blank=True)
    discount_mode       = models.CharField(max_length=20, choices=DISCOUNT_MODE_CHOICES)
    discount_value      = models.DecimalField(max_digits=12, decimal_places=2)
    is_active           = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = "scholarship_types"
        ordering = ("scholarship_name",)

    def __str__(self):  # pragma: no cover
        return self.scholarship_name


class EnrollmentScholarship(models.Model):
    enrollment_scholarship_id = models.BigAutoField(primary_key=True)

    enrollment = models.ForeignKey(
        Enrollment,
        on_delete=models.CASCADE,
        db_column="enrollment_id",
        related_name="scholarships",
    )
    scholarship_type = models.ForeignKey(
        ScholarshipType,
        on_delete=models.RESTRICT,
        db_column="scholarship_type_id",
        related_name="enrollment_links",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    notes       = models.TextField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "enrollment_scholarships"
        unique_together = (("enrollment", "scholarship_type"),)

    def __str__(self):  # pragma: no cover
        return f"E#{self.enrollment_id} ↔ {self.scholarship_type_id}"
