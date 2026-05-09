from django.db import models
from enrollments.models import Enrollment
from subjects.models import Subject


class GradingTemplate(models.Model):
    grading_template_id = models.BigAutoField(primary_key=True)
    template_name = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True, null=True)
    school_level = models.CharField(max_length=20)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = "grading_templates"

    def __str__(self):
        return self.template_name


class GradingComponent(models.Model):
    grading_component_id = models.BigAutoField(primary_key=True)
    grading_template = models.ForeignKey(
        GradingTemplate, on_delete=models.CASCADE,
        related_name="components", db_column="grading_template_id",
    )
    component_name = models.CharField(max_length=100)
    weight = models.DecimalField(max_digits=5, decimal_places=2)
    sort_order = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = "grading_components"
        ordering = ["sort_order"]

    def __str__(self):
        return f"{self.component_name} ({self.weight}%)"


class ScoreEntry(models.Model):
    score_entry_id = models.BigAutoField(primary_key=True)
    enrollment = models.ForeignKey(
        Enrollment, on_delete=models.CASCADE,
        related_name="score_entries", db_column="enrollment_id",
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.RESTRICT,
        related_name="score_entries", db_column="subject_id",
    )
    grading_component = models.ForeignKey(
        GradingComponent, on_delete=models.RESTRICT,
        related_name="score_entries", db_column="grading_component_id",
    )
    grading_period = models.CharField(max_length=20)
    label = models.CharField(max_length=100)
    score = models.DecimalField(max_digits=7, decimal_places=2)
    max_score = models.DecimalField(max_digits=7, decimal_places=2)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = "score_entries"

    def __str__(self):
        return f"{self.label}: {self.score}/{self.max_score}"