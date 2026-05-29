from django.db import models
from django.db.models import Q
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone


class Household(models.Model):
    household_id = models.BigAutoField(primary_key=True)
    parent_marital_status = models.CharField(
        max_length=30,
        choices=[
            ("married", "married"),
            ("separated", "separated"),
            ("annulled", "annulled"),
            ("single_parent", "single_parent"),
            ("widowed", "widowed"),
        ],
        null=True,
        blank=True,
    )
    living_arrangement = models.CharField(
        max_length=30,
        choices=[
            ("both_parents", "both_parents"),
            ("mother_only", "mother_only"),
            ("father_only", "father_only"),
            ("guardian", "guardian"),
            ("relative", "relative"),
            ("independent", "independent"),
            ("others", "others"),
        ],
        null=True,
        blank=True,
    )
    is_4ps_beneficiary = models.BooleanField(default=False)
    four_ps_id = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        db_table = "households"
        managed = False


class Student(models.Model):
    student_id = models.BigAutoField(primary_key=True)
    student_number = models.CharField(max_length=30, unique=True, null=True, blank=True)
    lrn = models.CharField(max_length=20, unique=True)
    first_name = models.CharField(max_length=50)
    middle_name = models.CharField(max_length=50, null=True, blank=True)
    last_name = models.CharField(max_length=50)
    suffix = models.CharField(max_length=10, null=True, blank=True)

    age = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(3), MaxValueValidator(100)],
    )
    sex = models.CharField(
        max_length=10,
        choices=[("male", "male"), ("female", "female")],
    )
    religion = models.CharField(max_length=50, null=True, blank=True)
    birth_date = models.DateField()

    email = models.EmailField(max_length=150, unique=True, null=True, blank=True)
    mobile_number = models.CharField(max_length=20, null=True, blank=True)

    status = models.CharField(
        max_length=20,
        default="active",
        choices=[
            ("active", "active"),
            ("inactive", "inactive"),
            ("transferred", "transferred"),
            ("graduated", "graduated"),
            ("dropped", "dropped"),
        ],
    )

    current_address = models.TextField()
    permanent_address = models.TextField()

    household = models.ForeignKey(
        Household, null=True, blank=True, on_delete=models.SET_NULL
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "students"
        managed = False
        indexes = [
            models.Index(fields=["lrn"]),
            models.Index(fields=["student_number"]),
            models.Index(fields=["last_name"]),
            models.Index(fields=["status"]),
        ]

    def _generate_student_number(self):
        from django.utils import timezone
        year = timezone.now().year
        prefix = f"{year}-"
        # Find the highest sequential number for this year's prefix
        last = (
            Student.objects.filter(student_number__startswith=prefix)
            .order_by("-student_number")
            .values_list("student_number", flat=True)
            .first()
        )
        if last:
            try:
                seq = int(last[len(prefix):]) + 1
            except ValueError:
                seq = 1
        else:
            seq = 1
        return f"{prefix}{seq:04d}"

    def save(self, *args, **kwargs):
        if not self.student_number:
            candidate = self._generate_student_number()
            # Walk forward until we find a free number (guards against races)
            from django.utils import timezone
            year = timezone.now().year
            prefix = f"{year}-"
            seq = int(candidate[len(prefix):])
            while Student.objects.filter(student_number=candidate).exists():
                seq += 1
                candidate = f"{prefix}{seq:04d}"
            self.student_number = candidate
        super().save(*args, **kwargs)


class Guardian(models.Model):
    guardian_id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    relationship = models.CharField(
        max_length=20,
        choices=[("mother", "mother"), ("father", "father"), ("guardian", "guardian")],
    )
    full_name = models.CharField(max_length=150)
    occupation = models.CharField(max_length=100, null=True, blank=True)
    email_address = models.EmailField(max_length=150, null=True, blank=True)
    mobile_number = models.CharField(max_length=20, null=True, blank=True)
    is_primary_contact = models.BooleanField(default=False)

    class Meta:
        db_table = "guardians"
        managed = False


class StudentSibling(models.Model):
    student_sibling_id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="siblings")
    sibling_student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="sibling_of")
    relationship_note = models.CharField(max_length=20, default="sibling")

    class Meta:
        db_table = "student_siblings"
        managed = False
        unique_together = ("student", "sibling_student")


class Sibling(models.Model):
    sibling_id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    full_name = models.CharField(max_length=150)
    age = models.IntegerField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)]
    )

    class Meta:
        db_table = "siblings"
        managed = False


class PreviousSchool(models.Model):
    previous_school_id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    school_name = models.CharField(max_length=150)
    school_address = models.TextField()

    class Meta:
        db_table = "previous_schools"
        managed = False


class RequirementType(models.Model):
    requirement_type_id = models.BigAutoField(primary_key=True)
    requirement_code = models.CharField(max_length=50, unique=True)
    requirement_name = models.CharField(max_length=150)
    description = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "requirement_types"
        managed = False


class StudentRequirementSubmission(models.Model):
    student_requirement_submission_id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    requirement_type = models.ForeignKey(RequirementType, on_delete=models.RESTRICT)
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
        unique_together = ("student", "requirement_type")
