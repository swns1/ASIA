"""The DepEd school-form header fields on school settings (scripts/2026-10-school-identity.sql)."""
import pytest
from rest_framework.exceptions import ValidationError

from school_settings.serializers import SchoolSettingSerializer

DEPED_FIELDS = ("deped_school_id", "region", "division", "district", "school_head_name")


def test_the_deped_fields_are_editable():
    meta = SchoolSettingSerializer.Meta
    assert set(DEPED_FIELDS) <= set(meta.fields)
    assert not set(DEPED_FIELDS) & set(meta.read_only_fields)


@pytest.mark.parametrize("value, expected", [("401234", "401234"), (" 401234 ", "401234"), ("", None), (None, None)])
def test_a_school_id_is_six_digits_or_nothing(value, expected):
    assert SchoolSettingSerializer().validate_deped_school_id(value) == expected


@pytest.mark.parametrize("value", ["40123", "4012345", "40-123", "abcdef"])
def test_anything_else_is_refused(value):
    with pytest.raises(ValidationError):
        SchoolSettingSerializer().validate_deped_school_id(value)


def test_blank_text_fields_are_stored_as_null():
    s = SchoolSettingSerializer()
    assert s.validate_region("  ") is None
    assert s.validate_division(" Laguna ") == "Laguna"
    assert s.validate_district("") is None
    assert s.validate_school_head_name(" Maria Santos ") == "Maria Santos"
