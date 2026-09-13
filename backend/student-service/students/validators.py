"""
Field-format rules shared by every path that can write a Student.

These live here rather than inline on one serializer because a student can be
created three ways -- the staff counter form (StudentSerializer), the
staff bulk/counter bundle (BulkStudentSerializer), and the public applicant
intake (intake.serializers.ApplicantStudentSerializer) -- and a rule enforced
on only some of them is not a rule.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import RegexValidator
from rest_framework import serializers

# An LRN is exactly 12 digits.
#
# This is not a new rule: students/ocr/groq_vision.py already keeps an OCR'd
# LRN only when it reduces to exactly 12 digits, and the public applicant form
# already refused anything else client-side. It simply was not enforced
# anywhere a human could type one -- `students.lrn` is varchar(20) with no
# CHECK constraint and the model field carried no validator, so a staff member
# using the counter form, or any direct API call, could store a malformed
# national learner identifier. That then propagates into SF1/SF9/SF10 and
# DepEd submission, where it is no longer cheap to fix.
#
# Absence is a separate question from format and is deliberately not handled
# here: `students.lrn` is NOT NULL, but a nursery applicant genuinely has no
# LRN yet, so the intake serializer keeps the field optional and the registrar
# supplies it at approval (see ApplicationApproveSerializer).
validate_lrn_format = RegexValidator(
    regex=r"^\d{12}$",
    message="LRN must be exactly 12 digits.",
)


class LrnFormatMixin:
    """Applies `validate_lrn_format` to a serializer's `lrn` field.

    For serializers whose `lrn` is mapped from the model, which is why this is
    a mixin rather than a `validators=[...]` argument.
    """

    def validate_lrn(self, value):
        # Blank/None are the intake path's concern, not this rule's -- a
        # required field rejects them before this runs.
        if value in (None, ""):
            return value
        # RegexValidator raises Django's ValidationError. DRF's
        # to_internal_value happens to catch that too, but translating it
        # here keeps the mixin's contract explicit rather than resting on
        # that: a `validate_<field>` hook is expected to raise DRF's error,
        # and this way it always does.
        try:
            validate_lrn_format(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return value
