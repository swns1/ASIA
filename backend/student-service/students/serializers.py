from rest_framework import serializers
from django.db.models import Q
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from shared.uploads import download_url, file_kind_for, safe_save
from .validators import LrnFormatMixin
from .models import (
    Student,
    Household,
    Guardian,
    StudentSibling,
    Sibling,
    PreviousSchool,
    RequirementType,
    StudentRequirementSubmission,
)


class HouseholdSerializer(serializers.ModelSerializer):
    class Meta:
        model = Household
        fields = "__all__"

    def validate(self, attrs):
        if attrs.get("four_ps_id") == "":
            attrs["four_ps_id"] = None

        is_4ps = attrs.get("is_4ps_beneficiary", getattr(self.instance, "is_4ps_beneficiary", False))
        four_ps_id = attrs.get("four_ps_id", getattr(self.instance, "four_ps_id", None))

        if is_4ps and (not four_ps_id or not str(four_ps_id).strip()):
            raise serializers.ValidationError("four_ps_id is required when is_4ps_beneficiary is True.")
        if not is_4ps and four_ps_id:
            raise serializers.ValidationError("four_ps_id must be empty when is_4ps_beneficiary is False.")
        return attrs


class StudentSerializer(LrnFormatMixin, serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = "__all__"
        # updated_at is managed by the DB / auto_now — clients shouldn't be
        # able to write it. We still READ it from initial_data for the
        # optimistic-locking check below.
        read_only_fields = ("updated_at",)

    def validate(self, attrs):
        if self.instance:
            client_updated_at_raw = self.initial_data.get("updated_at")
            # If the client didn't send updated_at, skip the optimistic-lock
            # check rather than failing — otherwise legitimate updates from
            # clients that don't track this field will always fail.
            if client_updated_at_raw:
                client_dt = parse_datetime(str(client_updated_at_raw))
                if client_dt is None:
                    raise serializers.ValidationError(
                        "Invalid updated_at format."
                    )

                instance_dt = self.instance.updated_at

                # Both datetimes must be timezone-aware to subtract safely.
                # If either is naive, fall back to a string compare.
                try:
                    delta = abs((instance_dt - client_dt).total_seconds())
                except TypeError:
                    delta = None

                # Allow up to 1 second of drift to absorb microsecond
                # truncation differences between DB backends and JSON
                # round-tripping.
                if delta is None or delta > 1:
                    raise serializers.ValidationError(
                        "This record was updated by another user. Please refresh and try again."
                    )
        return attrs


class StudentBillingSummarySerializer(serializers.ModelSerializer):
    """
    Reduced-field view of Student for the accounting role: enough to look
    up and identify a student for invoicing (name, LRN/student number,
    enrollment status, linked household for 4Ps/discount eligibility), but
    excluding demographic PII this role has no billing-relevant need for --
    religion, sex, birth_date, and exact home/mailing addresses. See
    StudentViewSet.get_serializer_class.
    """

    class Meta:
        model = Student
        fields = (
            "student_id",
            "student_number",
            "lrn",
            "first_name",
            "middle_name",
            "last_name",
            "suffix",
            "status",
            "household",
        )
        read_only_fields = fields


class GuardianSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = Guardian
        fields = "__all__"
        # `user_id` is the ONLY key guardian-portal scoping uses: every service
        # resolves a login account to the students it may see via
        # guardians.user_id (guardian_student_ids() in enrollment-, billing-
        # and student-service). Left inside "__all__" it was plainly writable,
        # so anyone with write access here could point an arbitrary
        # users.user_id at an arbitrary student and hand that account the
        # child's grades, attendance, invoices and uploaded documents.
        # Linking an account is a privileged operation and belongs to
        # accounts/guardian_provisioning.py, which validates the target -- not
        # to a plain PATCH of this column.
        read_only_fields = ("user_id",)

    def get_student_name(self, obj):
        s = obj.student
        if not s:
            return None
        parts = [s.first_name, s.middle_name, s.last_name, s.suffix]
        return " ".join(p for p in parts if p)

    def validate(self, attrs):
        if attrs.get("is_primary_contact"):
            # A PATCH need not carry `student`, and attrs.get("student") was
            # then None -- so this filtered on student=None, matched nothing,
            # and let a second primary contact through on any partial update.
            # Fall back to the row being edited.
            student = attrs.get("student") or getattr(self.instance, "student", None)
            existing = Guardian.objects.filter(
                student=student,
                is_primary_contact=True
            )
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError("Only one primary guardian is allowed per student.")
        return attrs


class BulkGuardianSerializer(serializers.ModelSerializer):
    """Used only inside bulk-create — student is injected server-side after creation."""
    class Meta:
        model = Guardian
        exclude = ["student"]

    def validate(self, attrs):
        # Primary-contact uniqueness check is deferred to the view
        # since the student doesn't exist yet at this point
        return attrs


class StudentSiblingSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentSibling
        fields = "__all__"

    def validate(self, attrs):
        student = attrs.get("student")
        sibling_student = attrs.get("sibling_student")

        if student == sibling_student:
            raise serializers.ValidationError("A student cannot be their own sibling.")

        exists = StudentSibling.objects.filter(
            Q(student=student, sibling_student=sibling_student) |
            Q(student=sibling_student, sibling_student=student)
        )
        if self.instance:
            exists = exists.exclude(pk=self.instance.pk)
        if exists.exists():
            raise serializers.ValidationError("Sibling relationship already exists.")
        return attrs


class SiblingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sibling
        fields = "__all__"


class PreviousSchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = PreviousSchool
        fields = "__all__"


class RequirementTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequirementType
        fields = "__all__"


# This service's own router uses underscores (student_requirement_submissions);
# enrollment-service's mirror hyphenates its path instead — see that
# service's requirements/serializers.py for its own copy of this constant.
# Frontend doesn't call this service's copy of the endpoint today (it talks
# to enrollment-service's), but this stays correct for defense in depth and
# any direct API caller.
DOWNLOAD_PREFIX = "/api/student_requirement_submissions/"


class StudentRequirementSubmissionSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True, required=False)
    image_url = serializers.SerializerMethodField()
    file_kind = serializers.SerializerMethodField()

    class Meta:
        model = StudentRequirementSubmission
        fields = "__all__"
        # Mirrors enrollment-service's twin of this serializer
        # (requirements/serializers.py). Both write the SAME table, but this
        # copy had no read_only_fields at all -- so a client could POST
        # {"student": N, "requirement_type": M, "is_submitted": true} with no
        # file at all and satisfy the enrollment completeness gate, which
        # tests is_submitted alone. These are set by create()/update() below,
        # and only once a validated file has actually been stored.
        read_only_fields = (
            "student_requirement_submission_id",
            "is_submitted",
            "image_url",
            "submitted_at",
            "created_at",
            "updated_at",
        )

    def get_image_url(self, obj):
        return download_url(DOWNLOAD_PREFIX, obj.student_requirement_submission_id, bool(obj.image_url))

    def get_file_kind(self, obj):
        return file_kind_for(obj.image_url)

    def _save_file(self, upload):
        """Validates and stores the upload; returns the raw value to persist
        in the image_url column (a storage-relative path, not a public URL —
        the signed download URL is computed at serialization time)."""
        stored_value, _kind = safe_save(upload, settings.MEDIA_ROOT)
        return stored_value

    def create(self, validated_data):
        upload = validated_data.pop("file", None)
        if upload:
            validated_data["image_url"] = self._save_file(upload)
            validated_data["is_submitted"] = True
            validated_data["submitted_at"] = timezone.now()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        upload = validated_data.pop("file", None)
        if upload:
            validated_data["image_url"] = self._save_file(upload)
            validated_data["is_submitted"] = True
            validated_data["submitted_at"] = timezone.now()
        return super().update(instance, validated_data)


class BulkStudentSerializer(LrnFormatMixin, serializers.ModelSerializer):
    """Used only inside bulk-create — student_id, household FK, and updated_at are managed server-side."""
    class Meta:
        model = Student
        exclude = ["student_id", "household", "updated_at"]


class BulkHouseholdSerializer(serializers.ModelSerializer):
    """Used only inside bulk-create — household_id is auto-generated server-side."""
    class Meta:
        model = Household
        exclude = ["household_id"]


# `student` is set by the view from the row it just created, so these two omit
# it -- a nested payload cannot name a student that does not exist yet. Mirrors
# intake/serializers.py's ApplicantSibling/PreviousSchool pair, which exist for
# the same reason on the approval path.
class BulkSiblingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sibling
        fields = ("full_name", "age")


class BulkPreviousSchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = PreviousSchool
        fields = ("school_name", "school_address")


class StudentBulkCreateSerializer(serializers.Serializer):
    student   = BulkStudentSerializer()
    household = BulkHouseholdSerializer(required=False, allow_null=True)
    guardians = BulkGuardianSerializer(many=True, required=False, default=list)
    # Siblings and previous schools used to be created by the client, one HTTP
    # call each, after this endpoint returned. A failure partway through left a
    # student saved with its siblings lost -- and because `lrn` is UNIQUE, the
    # retry could never succeed, so the form became unusable with no way back.
    # They belong in the same transaction as the student, which is what the
    # approval path (intake/services.py::approve_application) already did.
    siblings         = BulkSiblingSerializer(many=True, required=False, default=list)
    previous_schools = BulkPreviousSchoolSerializer(many=True, required=False, default=list)


class StudentBulkCreateResponseSerializer(serializers.Serializer):
    student   = StudentSerializer()
    household = HouseholdSerializer(allow_null=True)
    guardians = GuardianSerializer(many=True)
    siblings         = SiblingSerializer(many=True)
    previous_schools = PreviousSchoolSerializer(many=True)