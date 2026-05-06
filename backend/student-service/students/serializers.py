from rest_framework import serializers
from django.db.models import Q
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.utils import timezone
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

    def validate(self, attrs):
        if self.instance:
            client_updated_at = self.initial_data.get("updated_at")
            if client_updated_at and str(self.instance.updated_at) != client_updated_at:
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
    student = StudentSerializer()
    household = HouseholdSerializer(required=False, allow_null=True)
    guardians = GuardianSerializer(many=True, required=False)


class StudentBulkCreateResponseSerializer(serializers.Serializer):
    student = StudentSerializer()
    household = HouseholdSerializer(allow_null=True)
    guardians = GuardianSerializer(many=True)