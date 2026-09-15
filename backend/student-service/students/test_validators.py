"""
The 12-digit LRN rule, and proof that every staff-facing write path actually
applies it.

No DB here on purpose: Student is managed=False, so calling is_valid() on a
ModelSerializer built from it would fire the auto-attached UniqueValidator
against a `students` table that doesn't exist in a fresh pytest-django DB.
The rule itself and the wiring are both testable without one.
"""
import pytest
from django.core.exceptions import ValidationError
from rest_framework import serializers

from students.serializers import BulkStudentSerializer, StudentSerializer
from students.validators import LrnFormatMixin, validate_lrn_format


VALID = "136789012345"

MALFORMED = [
    "13678",            # too short
    "1367890123456",    # too long
    "1367-8901-2345",   # the shape a human types it in
    "13678901234X",     # right length, not all digits
    " 136789012345",    # leading space
    "136789012345 ",    # trailing space
    "SEED00000100",     # the placeholder the seed data used to ship
]


class TestValidateLrnFormat:
    def test_accepts_exactly_twelve_digits(self):
        assert validate_lrn_format(VALID) is None

    @pytest.mark.parametrize("bad", MALFORMED)
    def test_rejects_anything_else(self, bad):
        with pytest.raises(ValidationError):
            validate_lrn_format(bad)

    def test_message_names_the_rule(self):
        with pytest.raises(ValidationError) as exc:
            validate_lrn_format("13678")
        assert "12 digits" in str(exc.value)


class TestLrnFormatMixin:
    class _S(LrnFormatMixin, serializers.Serializer):
        pass

    def test_passes_a_valid_lrn_through_unchanged(self):
        assert self._S().validate_lrn(VALID) == VALID

    @pytest.mark.parametrize("bad", MALFORMED)
    def test_raises_a_drf_error_so_it_surfaces_as_a_400(self, bad):
        with pytest.raises(serializers.ValidationError):
            self._S().validate_lrn(bad)

    @pytest.mark.parametrize("empty", ["", None])
    def test_leaves_absence_to_the_field_definition(self, empty):
        """Whether an LRN is *required* differs per path — the staff form
        requires one, applicant intake doesn't. This rule is about shape."""
        assert self._S().validate_lrn(empty) == empty


class TestEveryStudentWritePathIsCovered:
    """
    Regression guard. The rule previously existed only in the public
    applicant form's client-side validate(), so the staff counter form and
    any direct API call could store a malformed LRN. If a new
    Student-writing serializer is added without the mixin, this is the test
    that should start looking incomplete.
    """

    @pytest.mark.parametrize("serializer_cls", [StudentSerializer, BulkStudentSerializer])
    def test_staff_serializers_apply_the_rule(self, serializer_cls):
        assert issubclass(serializer_cls, LrnFormatMixin)
        with pytest.raises(serializers.ValidationError):
            serializer_cls().validate_lrn("13678")

    def test_applicant_intake_applies_the_rule_via_field_validators(self):
        # Intake overrides `lrn` to a plain CharField (to keep the public
        # endpoint from becoming a uniqueness oracle), so it can't inherit
        # the model field's validators and carries them explicitly instead.
        from intake.serializers import ApplicantStudentSerializer

        field = ApplicantStudentSerializer().fields["lrn"]
        assert validate_lrn_format in field.validators
        assert field.allow_blank is True
