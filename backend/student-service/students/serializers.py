from rest_framework import serializers
from django.db.models import Q
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.utils import timezone
from django.utils.dateparse import parse_datetime
import os
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


class StudentSerializer(serializers.ModelSerializer):
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


class GuardianSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guardian
        fields = "__all__"

    def validate(self, attrs):
        if attrs.get("is_primary_contact"):
            existing = Guardian.objects.filter(
                student=attrs.get("student"),
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


class StudentRequirementSubmissionSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True, required=False)
    image_url = serializers.CharField(read_only=True)

    class Meta:
        model = StudentRequirementSubmission
        fields = "__all__"

    def _save_file(self, upload):
        requirements_path = os.path.join(settings.MEDIA_ROOT, "requirements")
        os.makedirs(requirements_path, exist_ok=True)

        fs = FileSystemStorage(location=requirements_path)
        filename = fs.save(upload.name, upload)
        return f"{settings.MEDIA_URL}requirements/{filename}"

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


class StudentBulkCreateSerializer(serializers.Serializer):
    student   = StudentSerializer()
    household = HouseholdSerializer(required=False, allow_null=True)
    guardians = BulkGuardianSerializer(many=True, required=False, default=list)


class StudentBulkCreateResponseSerializer(serializers.Serializer):
    student   = StudentSerializer()
    household = HouseholdSerializer(allow_null=True)
    guardians = GuardianSerializer(many=True)