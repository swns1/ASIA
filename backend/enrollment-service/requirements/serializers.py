from django.core.files.storage import FileSystemStorage
from django.conf import settings
from django.utils import timezone
from rest_framework import serializers
from .models import RequirementType, StudentRequirementSubmission


class RequirementTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequirementType
        fields = "__all__"


def _save_file(file):
    import os
    location = os.path.join(settings.MEDIA_ROOT, "requirements")
    fs = FileSystemStorage(location=location)
    filename = fs.save(file.name, file)
    return f"{settings.MEDIA_URL}requirements/{filename}"


class StudentRequirementSubmissionSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True, required=False)
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