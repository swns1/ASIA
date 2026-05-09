from django.db import models


class Subject(models.Model):
    SCHOOL_LEVEL_CHOICES = [
        ("nursery",           "Nursery"),
        ("kindergarten",      "Kindergarten"),
        ("elementary",        "Elementary"),
        ("junior_highschool", "Junior High School"),
        ("senior_highschool", "Senior High School"),
    ]

    SEMESTER_CHOICES = [
        ("1st", "1st Semester"),
        ("2nd", "2nd Semester"),
    ]

    subject_id    = models.BigAutoField(primary_key=True)
    subject_code  = models.CharField(max_length=30, unique=True)
    subject_name  = models.CharField(max_length=150)

    school_level  = models.CharField(max_length=20, choices=SCHOOL_LEVEL_CHOICES)
    grade_level   = models.CharField(max_length=20)
    strand        = models.CharField(max_length=50, null=True, blank=True)
    semester      = models.CharField(max_length=20, null=True, blank=True, choices=SEMESTER_CHOICES)

    grading_template = models.ForeignKey(
        "grading.GradingTemplate",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="subjects",
        db_column="grading_template_id",
    )

    class Meta:
        managed = False
        db_table = "subjects"
        ordering = ("school_level", "grade_level", "subject_name")

    def __str__(self):
        return f"{self.subject_code} — {self.subject_name}"