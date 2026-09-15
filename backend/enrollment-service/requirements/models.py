from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.utils import timezone

# Canonical schema owner for requirement_types and student_requirement_submissions.
# The student-service has unmanaged mirror models pointing at the same tables.
# All schema changes (new columns, indexes) must originate here.

# Mirrors the CHECK constraints on requirement_types (see schema.sql). Kept as
# plain tuples rather than TextChoices because these are also the stored array
# element values, not a field's own choices.
SCHOOL_LEVELS = (
    "nursery", "kindergarten", "elementary",
    "junior_highschool", "senior_highschool",
)
ENTRY_STATUSES = ("new", "transferee", "continuing")


# The DB columns default to the full lists and CHECK cardinality > 0 (see
# schema.sql). `default=list` here contradicted both: a row created through the
# ORM without setting them inserted '{}' and raised IntegrityError — a 500,
# not a clean 400 — and if such a row ever did land, applies_to() reads an
# empty list as "applies to nobody" and the document silently stops being
# asked for. Matching the DB default keeps the model's own claim ("the
# defaults reproduce the old everyone-owes-everything behaviour") true.
def all_school_levels():
    return list(SCHOOL_LEVELS)


def all_entry_statuses():
    return list(ENTRY_STATUSES)


class RequirementType(models.Model):
    requirement_type_id = models.BigAutoField(primary_key=True)
    requirement_code = models.CharField(max_length=50, unique=True)
    requirement_name = models.CharField(max_length=150)
    description = models.TextField(null=True, blank=True)

    # Three separate questions, which this table used to conflate into one.
    #
    #   is_active   — is this document in our catalogue at all
    #   is_required — does a missing copy BLOCK activating an enrollment
    #   applies_to_* — who is even asked for it
    #
    # Before these existed, `is_active` doubled as the mandatory flag, so the
    # completeness gate in enrollments/serializers.py demanded every active
    # type from every learner: a Grade 1 new entrant was asked for a Form 137,
    # an NCAE result and an Alien Certificate of Registration.
    #
    # The column defaults deliberately reproduce that old behaviour, so the
    # schema change alone is a no-op; it is the seeded values that narrow it.
    is_required = models.BooleanField(default=True)
    applies_to_levels = ArrayField(
        models.CharField(max_length=20),
        default=all_school_levels,
        help_text="School levels this document is asked for.",
    )
    applies_to_entry_statuses = ArrayField(
        models.CharField(max_length=20),
        default=all_entry_statuses,
        help_text="new / transferee / continuing.",
    )
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