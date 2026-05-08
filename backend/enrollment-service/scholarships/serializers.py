from decimal import Decimal
from rest_framework import serializers

from .models import ScholarshipType, EnrollmentScholarship


class ScholarshipTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScholarshipType
        fields = (
            "scholarship_type_id",
            "scholarship_code",
            "scholarship_name",
            "description",
            "discount_mode",
            "discount_value",
            "is_active",
        )
        read_only_fields = ("scholarship_type_id",)

    def validate(self, attrs):
        mode  = attrs.get("discount_mode",  getattr(self.instance, "discount_mode",  None))
        value = attrs.get("discount_value", getattr(self.instance, "discount_value", None))

        if value is None:
            return attrs

        if value < Decimal("0"):
            raise serializers.ValidationError({"discount_value": "Cannot be negative."})
        if mode == "percentage" and value > Decimal("100"):
            raise serializers.ValidationError({
                "discount_value": "Percentage discounts cannot exceed 100."
            })

        return attrs


class EnrollmentScholarshipSerializer(serializers.ModelSerializer):
    scholarship_type_detail = ScholarshipTypeSerializer(source="scholarship_type", read_only=True)

    class Meta:
        model = EnrollmentScholarship
        fields = (
            "enrollment_scholarship_id",
            "enrollment",
            "scholarship_type",
            "scholarship_type_detail",
            "approved_at",
            "notes",
        )
        read_only_fields = ("enrollment_scholarship_id",)

    def validate(self, attrs):
        enrollment = attrs.get("enrollment", getattr(self.instance, "enrollment", None))
        sc_type    = attrs.get("scholarship_type", getattr(self.instance, "scholarship_type", None))

        if enrollment and sc_type:
            qs = EnrollmentScholarship.objects.filter(
                enrollment=enrollment, scholarship_type=sc_type
            )
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    "non_field_errors": [
                        "This scholarship is already attached to this enrollment."
                    ]
                })

        return attrs
