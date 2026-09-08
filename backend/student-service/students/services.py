"""
Extracted from StudentViewSet.bulk_create so the counter-form intake path
and the applicant-approval path (intake/services.py::approve_application)
run the exact same household -> student -> guardians sequence, including
the household-link ordering and the one-primary-contact guard. Duplicating
this instead of sharing it is how those two paths would eventually
disagree — e.g. a student created without its household link because one
call site forgot to set `student_data["household"]` before creating the
student.

Callers own the transaction (`with transaction.atomic():`) — this function
does not open one itself, so it can be composed with the extra writes
`approve_application` needs to make (siblings, previous_schools) inside a
single atomic block.
"""
from rest_framework import serializers

from .models import Guardian, Household, Student


def create_student_bundle(validated_data):
    """`validated_data` is StudentBulkCreateSerializer's (or an equivalent
    payload's) validated output: {"student": {...}, "household": {...}|None,
    "guardians": [{...}, ...]}. Returns (student, household, guardians)."""
    household_data = validated_data.get("household")
    household = Household.objects.create(**household_data) if household_data else None

    student_data = dict(validated_data["student"])
    if household:
        student_data["household"] = household
    student = Student.objects.create(**student_data)

    guardians = []
    primary_assigned = False
    for guardian_data in validated_data.get("guardians", []):
        is_primary = guardian_data.get("is_primary_contact", False)
        if is_primary:
            if primary_assigned:
                raise serializers.ValidationError(
                    {"guardians": "Only one primary guardian is allowed per student."}
                )
            primary_assigned = True
        guardians.append(Guardian.objects.create(student=student, **guardian_data))

    return student, household, guardians
