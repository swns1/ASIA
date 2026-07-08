from django.db import models

from enrollments.models import Enrollment
from subjects.models import Subject


class Grade(models.Model):

    GRADING_PERIOD_CHOICES = [
        ("1st_quarter",  "1st Quarter"),
        ("2nd_quarter",  "2nd Quarter"),
        ("3rd_quarter",  "3rd Quarter"),
        ("4th_quarter",  "4th Quarter"),
        ("1st_semester", "1st Semester"),
        ("2nd_semester", "2nd Semester"),
    ]

    REMARKS_CHOICES = [
        ("passed",     "Passed"),
        ("failed",     "Failed"),
        ("incomplete", "Incomplete"),
        ("dropped",    "Dropped"),
    ]

    grade_id = models.BigAutoField(primary_key=True)

    enrollment = models.ForeignKey(
        Enrollment,
        on_delete=models.CASCADE,
        db_column="enrollment_id",
        related_name="grade_records",
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.RESTRICT,
        db_column="subject_id",
        related_name="grade_records",
    )

    grading_period = models.CharField(max_length=20, choices=GRADING_PERIOD_CHOICES)
    numeric_grade  = models.DecimalField(max_digits=5, decimal_places=2)
    remarks        = models.CharField(max_length=20, null=True, blank=True, choices=REMARKS_CHOICES)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = "grades"
        unique_together = (("enrollment", "subject", "grading_period"),)
        ordering = ("enrollment_id", "subject__subject_name", "grading_period")

    def __str__(self):  # pragma: no cover
        return f"E#{self.enrollment_id} {self.subject_id} {self.grading_period}: {self.numeric_grade}"


class NarrativeCategory(models.Model):
    category_id = models.BigAutoField(primary_key=True)
    name        = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)
    sort_order  = models.IntegerField(default=0)
    is_active   = models.BooleanField(default=True)

    class Meta:
        managed  = False
        db_table = "narrative_categories"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class NarrativeReport(models.Model):
    RATING_CHOICES = [
        ("outstanding",       "Outstanding"),
        ("satisfactory",      "Satisfactory"),
        ("needs_improvement", "Needs Improvement"),
    ]

    report_id = models.BigAutoField(primary_key=True)
    enrollment = models.ForeignKey(
        Enrollment,
        on_delete=models.CASCADE,
        db_column="enrollment_id",
        related_name="narrative_reports",
    )
    category = models.ForeignKey(
        NarrativeCategory,
        on_delete=models.RESTRICT,
        db_column="category_id",
        related_name="reports",
    )
    grading_period = models.CharField(max_length=20)
    rating         = models.CharField(max_length=20, choices=RATING_CHOICES)
    recorded_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed  = False
        db_table = "narrative_reports"
        unique_together = [("enrollment", "category", "grading_period")]
        ordering = ["category__sort_order", "category__name"]

    def __str__(self):
        return f"E#{self.enrollment_id} {self.category_id} {self.grading_period}: {self.rating}"