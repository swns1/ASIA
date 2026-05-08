"""
All models in this app are `managed = False`. Schema lives in pgAdmin /
the SLIS SQL file. Django will never alter these tables.
"""
from django.db import models


# ─── unmanaged Student reference ────────────────────────────────────────────
class Student(models.Model):
    """
    Read-only mirror of the `students` table from student-service.
    Includes the new `updated_at` column you added.
    """

    student_id = models.BigAutoField(primary_key=True)
    student_number = models.CharField(max_length=30, unique=True)
    lrn = models.CharField(max_length=20, unique=True)

    first_name = models.CharField(max_length=50)
    middle_name = models.CharField(max_length=50, null=True, blank=True)
    last_name = models.CharField(max_length=50)
    suffix = models.CharField(max_length=10, null=True, blank=True)

    sex = models.CharField(max_length=10)
    birth_date = models.DateField()

    email = models.EmailField(max_length=150, null=True, blank=True)
    mobile_number = models.CharField(max_length=20, null=True, blank=True)

    status = models.CharField(max_length=20, default="active")

    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "students"

    def __str__(self):  # pragma: no cover
        return f"{self.last_name}, {self.first_name} ({self.lrn})"


# ─── Enrollment ─────────────────────────────────────────────────────────────
class Enrollment(models.Model):

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

    STATUS_CHOICES = [
        ("enrolled",  "Enrolled"),
        ("pending",   "Pending"),
        ("cancelled", "Cancelled"),
        ("completed", "Completed"),
    ]

    enrollment_id = models.BigAutoField(primary_key=True)

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        db_column="student_id",
        related_name="enrollments",
    )

    school_year  = models.CharField(max_length=20)
    school_level = models.CharField(max_length=20, choices=SCHOOL_LEVEL_CHOICES)
    grade_level  = models.CharField(max_length=20)
    section      = models.CharField(max_length=50)
    strand       = models.CharField(max_length=50, null=True, blank=True)
    semester     = models.CharField(max_length=20, null=True, blank=True, choices=SEMESTER_CHOICES)

    enrollment_status = models.CharField(
        max_length=20, default="enrolled", choices=STATUS_CHOICES,
    )

    class Meta:
        managed = False
        db_table = "enrollments"
        ordering = ["-enrollment_id"]

    def __str__(self):  # pragma: no cover
        return f"#{self.enrollment_id} · student={self.student_id} · SY {self.school_year}"
