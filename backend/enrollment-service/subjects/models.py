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

    # The heading a senior high subject sits under on the school's SF10.
    # "applied" is DepEd's word; the school's record says "Contextualized".
    SUBJECT_GROUP_CHOICES = [
        ("core",        "Core"),
        ("applied",     "Contextualized"),
        ("specialized", "Specialization"),
    ]

    subject_id    = models.BigAutoField(primary_key=True)
    # Each year has its own curriculum (subjects/migrations/0002): a code is
    # unique within a year, and a grade only ever uses its enrollment's
    # year's subjects. A plain label, held to school_years by foreign key in
    # SQL, like every other year column.
    school_year   = models.CharField(max_length=20)
    subject_code  = models.CharField(max_length=30)
    subject_name  = models.CharField(max_length=150)

    school_level  = models.CharField(max_length=20, choices=SCHOOL_LEVEL_CHOICES)
    grade_level   = models.CharField(max_length=20)
    strand        = models.CharField(max_length=50, null=True, blank=True)
    semester      = models.CharField(max_length=20, null=True, blank=True, choices=SEMESTER_CHOICES)
    # Senior high only; empty means automatic, from the name and strand
    # (school_forms.sf10.subject_group). subjects/migrations/0003.
    subject_group = models.CharField(max_length=20, null=True, blank=True, choices=SUBJECT_GROUP_CHOICES)

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
        unique_together = (("school_year", "subject_code"),)
        ordering = ("school_level", "grade_level", "subject_name")

    def __str__(self):
        return f"{self.subject_code} — {self.subject_name}"