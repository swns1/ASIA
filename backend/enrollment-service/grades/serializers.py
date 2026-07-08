from decimal import Decimal
from rest_framework import serializers

from enrollments.models import Enrollment
from subjects.models import Subject
from .models import Grade, NarrativeCategory, NarrativeReport


SHS_PERIODS     = {"1st_semester", "2nd_semester"}
NON_SHS_PERIODS = {"1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"}


class GradeSerializer(serializers.ModelSerializer):
    enrollment = serializers.PrimaryKeyRelatedField(queryset=Enrollment.objects.all())
    subject    = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())

    enrollment_detail = serializers.SerializerMethodField(read_only=True)
    subject_detail    = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Grade
        fields = (
            "grade_id", "enrollment", "subject",
            "enrollment_detail", "subject_detail",
            "grading_period", "numeric_grade", "remarks", "recorded_at",
        )
        read_only_fields = ("grade_id", "recorded_at")

    def get_enrollment_detail(self, obj):
        e = obj.enrollment
        return {
            "enrollment_id": e.enrollment_id, "student_id": e.student_id,
            "school_year": e.school_year, "school_level": e.school_level,
            "grade_level": e.grade_level, "section": e.section,
        }

    def get_subject_detail(self, obj):
        s = obj.subject
        return {"subject_id": s.subject_id, "subject_code": s.subject_code, "subject_name": s.subject_name}

    def validate_numeric_grade(self, value):
        if value is None:
            raise serializers.ValidationError("Required.")
        if value < Decimal("0") or value > Decimal("100"):
            raise serializers.ValidationError("Numeric grade must be between 0 and 100.")
        return value

    def validate(self, attrs):
        enrollment = attrs.get("enrollment", getattr(self.instance, "enrollment", None))
        period     = attrs.get("grading_period", getattr(self.instance, "grading_period", None))
        subject    = attrs.get("subject", getattr(self.instance, "subject", None))

        if enrollment is None:
            raise serializers.ValidationError({"enrollment": "Required."})
        if period is None:
            raise serializers.ValidationError({"grading_period": "Required."})

        if enrollment.school_level == "senior_highschool":
            if period not in SHS_PERIODS:
                raise serializers.ValidationError({"grading_period": "Senior HS enrollments only accept '1st_semester' or '2nd_semester'."})
        else:
            if period not in NON_SHS_PERIODS:
                raise serializers.ValidationError({"grading_period": f"{enrollment.school_level} enrollments only accept '1st_quarter' through '4th_quarter'."})

        if subject and subject.school_level != enrollment.school_level:
            raise serializers.ValidationError({"subject": f"Subject is for {subject.school_level} but enrollment is for {enrollment.school_level}."})

        qs = Grade.objects.filter(enrollment=enrollment, subject=subject, grading_period=period)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({"non_field_errors": ["A grade for this enrollment, subject, and period already exists."]})

        return attrs


class NarrativeCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model  = NarrativeCategory
        fields = ("category_id", "name", "description", "sort_order", "is_active")


class NarrativeReportSerializer(serializers.ModelSerializer):
    enrollment      = serializers.PrimaryKeyRelatedField(queryset=Enrollment.objects.all())
    category        = serializers.PrimaryKeyRelatedField(queryset=NarrativeCategory.objects.all())
    category_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model  = NarrativeReport
        fields = (
            "report_id", "enrollment", "category", "category_detail",
            "grading_period", "rating", "recorded_at",
        )
        read_only_fields = ("report_id", "recorded_at")

    def get_category_detail(self, obj):
        c = obj.category
        return {"category_id": c.category_id, "name": c.name, "sort_order": c.sort_order}

    def validate_rating(self, value):
        valid = {"outstanding", "satisfactory", "needs_improvement"}
        if value not in valid:
            raise serializers.ValidationError(f"Must be one of: {', '.join(sorted(valid))}.")
        return value

    def validate(self, attrs):
        enrollment = attrs.get("enrollment", getattr(self.instance, "enrollment", None))
        category   = attrs.get("category",   getattr(self.instance, "category",   None))
        period     = attrs.get("grading_period", getattr(self.instance, "grading_period", None))

        qs = NarrativeReport.objects.filter(enrollment=enrollment, category=category, grading_period=period)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({"non_field_errors": ["A narrative report for this enrollment, category, and period already exists."]})
        return attrs