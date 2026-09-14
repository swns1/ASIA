"""
Guards the RequirementType mirror against drifting from its schema owner.

`requirement_types` and `student_requirement_submissions` are declared twice —
canonically in enrollment-service/requirements/models.py, and again here as
`managed = False` mirrors, because only student-service owns the `students`
table and can hang a real FK off it. Two hand-maintained copies of one table
is a standing risk in this design, and until now nothing checked they agreed:
a column added to one and forgotten in the other fails at runtime, on
whichever service read it, with a bare ProgrammingError.

Deliberately `_meta`-driven rather than a database round-trip — no test
database can be built in this service (see intake/test_invites.py), and the
question here is what the models *declare*, not what Postgres holds.
"""
from django.contrib.postgres.fields import ArrayField
from django.db import models

from .models import RequirementType, StudentRequirementSubmission

# The columns requirement_types actually has (schema.sql), and the Django
# field type each must be declared as. Update this when the table changes —
# in the same commit as the DDL and both models.
EXPECTED_REQUIREMENT_TYPE_FIELDS = {
    "requirement_type_id": models.BigAutoField,
    "requirement_code": models.CharField,
    "requirement_name": models.CharField,
    "description": models.TextField,
    "is_required": models.BooleanField,
    "applies_to_levels": ArrayField,
    "applies_to_entry_statuses": ArrayField,
    "is_active": models.BooleanField,
}


def test_mirror_declares_every_requirement_type_column():
    declared = {f.name: type(f) for f in RequirementType._meta.get_fields()}
    for name, field_type in EXPECTED_REQUIREMENT_TYPE_FIELDS.items():
        assert name in declared, (
            f"{name} is missing from student-service's RequirementType mirror. "
            f"If it was just added in enrollment-service, mirror it here too."
        )
        assert declared[name] is field_type, (
            f"{name} is declared as {declared[name].__name__}, expected "
            f"{field_type.__name__}."
        )


def test_mirror_declares_no_columns_the_table_lacks():
    """
    The other direction: a field invented here but never added to the table
    fails at query time, not import time, so nothing would otherwise catch it.
    """
    declared = {
        f.name for f in RequirementType._meta.get_fields()
        if not f.is_relation or f.concrete
    }
    unexpected = declared - set(EXPECTED_REQUIREMENT_TYPE_FIELDS) - {"submissions"}
    assert not unexpected, f"declared but not in requirement_types: {sorted(unexpected)}"


def test_applicability_arrays_hold_text():
    """
    ArrayField(CharField) — mirrors `text[]`. A mismatch here (say IntegerField)
    only surfaces when a row is read.
    """
    for name in ("applies_to_levels", "applies_to_entry_statuses"):
        field = RequirementType._meta.get_field(name)
        assert isinstance(field.base_field, models.CharField)


def test_both_models_stay_unmanaged():
    """
    If either flips to managed, `migrate` starts issuing DDL for a table this
    service does not own, and the two services fight over the schema.
    """
    assert RequirementType._meta.managed is False
    assert StudentRequirementSubmission._meta.managed is False


def test_submission_uniqueness_matches_the_table_constraint():
    """One submission per (student, requirement type), for all time —
    documents belong to the learner, not to a school year."""
    assert StudentRequirementSubmission._meta.unique_together == (
        ("student", "requirement_type"),
    )
