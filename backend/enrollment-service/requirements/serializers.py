from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from shared.uploads import download_url, file_kind_for, safe_save

from .models import RequirementType, StudentRequirementSubmission

# This service's router hyphenates the path (student-requirement-submissions);
# student-service's mirror uses underscores instead — see that service's
# serializers.py for its own copy of this constant.
DOWNLOAD_PREFIX = "/api/student-requirement-submissions/"


class RequirementTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequirementType
        fields = "__all__"


def _save_file(file):
    """Validates and stores the upload; returns the raw value to persist in
    the image_url column (a storage-relative path, not a public URL — the
    signed download URL is computed at serialization time, not storage
    time, so a token's TTL is measured from when it's read, not written)."""
    stored_value, _kind = safe_save(file, settings.MEDIA_ROOT)
    return stored_value


class StudentRequirementSubmissionSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True, required=False)
    image_url = serializers.SerializerMethodField()
    file_kind = serializers.SerializerMethodField()
    requirement_name = serializers.CharField(
        source="requirement_type.requirement_name", read_only=True
    )
    requirement_code = serializers.CharField(
        source="requirement_type.requirement_code", read_only=True
    )

    class Meta:
        model = StudentRequirementSubmission
        fields = [
            "student_requirement_submission_id",
            "student_id",
            "requirement_type",
            "requirement_name",
            "requirement_code",
            "is_submitted",
            "image_url",
            "file_kind",
            "remarks",
            "submitted_at",
            "verified_at",
            "created_at",
            "updated_at",
            "file",
        ]
        read_only_fields = [
            "student_requirement_submission_id",
            "is_submitted",
            "image_url",
            "submitted_at",
            "created_at",
            "updated_at",
        ]

    def get_image_url(self, obj):
        return download_url(
            DOWNLOAD_PREFIX, obj.student_requirement_submission_id, bool(obj.image_url)
        )

    def get_file_kind(self, obj):
        return file_kind_for(obj.image_url)

    def create(self, validated_data):
        file = validated_data.pop("file", None)
        if file:
            validated_data["image_url"] = _save_file(file)
            validated_data["is_submitted"] = True
            validated_data["submitted_at"] = timezone.now()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        file = validated_data.pop("file", None)
        if file:
            validated_data["image_url"] = _save_file(file)
            validated_data["is_submitted"] = True
            validated_data["submitted_at"] = instance.submitted_at or timezone.now()
        validated_data["updated_at"] = timezone.now()
        return super().update(instance, validated_data)
