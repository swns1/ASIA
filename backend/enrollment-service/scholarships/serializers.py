from decimal import Decimal
from rest_framework import serializers
from enrollments.models import Enrollment
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
    enrollment_detail       = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = EnrollmentScholarship
        fields = (
            "enrollment_scholarship_id",
            "enrollment",
            "enrollment_detail",
            "scholarship_type",
            "scholarship_type_detail",
            "approved_at",
            "notes",
        )
        read_only_fields = ("enrollment_scholarship_id",)

    def get_enrollment_detail(self, obj):
        en = obj.enrollment
        if not en:
            return None
        student = en.student
        student_name = None
        if student:
            parts = [student.first_name, student.middle_name, student.last_name, student.suffix]
            student_name = " ".join(p for p in parts if p)
        return {
            "enrollment_id":   en.enrollment_id,
            "student_id":      en.student_id,
            "student_name":    student_name,
            "school_year":     en.school_year,
            "school_level":    en.school_level,
            "grade_level":     en.grade_level,
            "section":         en.section,
            "enrollment_status": en.enrollment_status,
        }

    def validate(self, attrs):
        enrollment = attrs.get("enrollment", getattr(self.instance, "enrollment", None))
        sc_type    = attrs.get("scholarship_type", getattr(self.instance, "scholarship_type", None))

        # Checked when an award is made or moved, not on every later edit: an
        # award on last year's (now completed) enrollment keeps its notes
        # editable, and a scholarship retired since still shows who had it.
        awarding = self.instance is None or "enrollment" in attrs or "scholarship_type" in attrs
        if awarding and enrollment is not None and enrollment.enrollment_status not in ("pending", "enrolled"):
            raise serializers.ValidationError({
                "enrollment": (
                    f"A scholarship is awarded on a pending or enrolled enrollment; "
                    f"this one is {enrollment.enrollment_status}."
                )
            })
        if awarding and sc_type is not None and not sc_type.is_active and (
            self.instance is None or sc_type != self.instance.scholarship_type
        ):
            raise serializers.ValidationError({
                "scholarship_type": "This scholarship has been deactivated and can't be awarded.",
            })

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