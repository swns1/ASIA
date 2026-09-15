"""
Regression tests for the atomic registration payload (QA audit finding).

Siblings and previous schools used to be created by the client, one HTTP call
each, AFTER /students/bulk-create/ returned. A failure partway through left a
student saved with its siblings lost -- and because `students.lrn` is UNIQUE,
pressing Save again could never get past the student row, so the counter form
became unusable with no way to recover the half-finished registration.

They are now part of the one validated payload the endpoint writes inside a
single transaction, the same way intake/services.py::approve_application has
always written them.

No @pytest.mark.django_db -- see intake/test_invites.py for why this service's
test database cannot be built here. That rules out validating a whole bundle:
BulkStudentSerializer maps `lrn` from a unique=True column, so DRF attaches a
UniqueValidator that queries the database during is_valid(). (Unlike
intake's ApplicantStudentSerializer, this one SHOULD keep that check -- it is
an authenticated staff endpoint, not a public enumeration oracle.) So these
assert on the two nested serializers, which touch no database, plus the field
declarations on the bundle itself.
"""
from .serializers import (
    BulkPreviousSchoolSerializer,
    BulkSiblingSerializer,
    StudentBulkCreateSerializer,
)


class TestBulkCreatePayload:
    def test_the_bundle_declares_both_lists_and_defaults_them_to_empty(self):
        """Omitting them must stay valid rather than becoming required -- the
        counter form is not the only caller shape."""
        fields = StudentBulkCreateSerializer().fields
        for name in ("siblings", "previous_schools"):
            assert name in fields, f"{name} missing from the bulk payload"
            assert not fields[name].required
            assert fields[name].get_default() == []

    def test_siblings_are_accepted_and_shaped(self):
        ser = BulkSiblingSerializer(data=[{"full_name": "Maria Dela Cruz", "age": 8}], many=True)
        assert ser.is_valid(), ser.errors
        assert ser.validated_data == [{"full_name": "Maria Dela Cruz", "age": 8}]

    def test_previous_schools_are_accepted_and_shaped(self):
        ser = BulkPreviousSchoolSerializer(
            data=[{"school_name": "Lakeside Elementary", "school_address": "Tanay, Rizal"}],
            many=True,
        )
        assert ser.is_valid(), ser.errors
        assert ser.validated_data == [
            {"school_name": "Lakeside Elementary", "school_address": "Tanay, Rizal"},
        ]

    def test_a_client_cannot_aim_a_sibling_at_another_student(self):
        """`student` is set by the view from the row it just created. If the
        nested serializer accepted it, a caller could attach siblings or a
        previous school to someone else's record."""
        sib = BulkSiblingSerializer(data={"full_name": "Maria", "age": 8, "student": 9999})
        assert sib.is_valid(), sib.errors
        assert "student" not in sib.validated_data

        sch = BulkPreviousSchoolSerializer(
            data={"school_name": "Lakeside", "school_address": "Tanay", "student": 9999}
        )
        assert sch.is_valid(), sch.errors
        assert "student" not in sch.validated_data

    def test_an_invalid_sibling_is_rejected(self):
        """The point of moving these into one call is that it is all-or-nothing:
        a bad sibling must stop the student being created, not be discovered
        afterwards by a follow-up request that fails on its own."""
        ser = BulkSiblingSerializer(data={"age": 8})  # no full_name
        assert not ser.is_valid()
        assert "full_name" in ser.errors

    def test_an_out_of_range_sibling_age_is_rejected(self):
        """The model's MinValueValidator/MaxValueValidator have to survive the
        move off the standalone endpoint."""
        ser = BulkSiblingSerializer(data={"full_name": "Maria", "age": 250})
        assert not ser.is_valid()
        assert "age" in ser.errors
