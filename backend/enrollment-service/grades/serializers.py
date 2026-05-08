from decimal import Decimal
from rest_framework import serializers

from enrollments.models import Enrollment
from subjects.models import Subject
from .models import Grade


SHS_PERIODS    = {"1st_semester", "2nd_semester"}
NON_SHS_PERIODS = {"1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"}


class GradeSerializer(serializers.ModelSerializer):
    """
    Mirrors the schema constraints AND the `trg_validate_grading_period`
    Postgres trigger so users get a clean 400 instead of a raw DB error.
    """

    enrollment = serializers.PrimaryKeyRelatedField(queryset=Enrollment.objects.all())
    subject    = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())

    # Lightweight read-only nested
    enrollment_detail = serializers.SerializerMethodField(read_only=True)
    subject_detail    = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Grade
        fields = (
            "grade_id",
            "enrollment",
            "subject",
            "enrollment_detail",
            "subject_detail",
            "grading_period",
            "numeric_grade",
            "remarks",
            "recorded_at",
        )
        read_only_fields = ("grade_id", "recorded_at")

    # ── Nested reads ────────────────────────────────────────────────────────
    def get_enrollment_detail(self, obj):
        e = obj.enrollment
        return {
            "enrollment_id":   e.enrollment_id,
            "student_id":      e.student_id,
            "school_year":     e.school_year,
            "school_level":    e.school_level,
            "grade_level":     e.grade_level,
            "section":         e.section,
        }

    def get_subject_detail(self, obj):
        s = obj.subject
        return {
            "subject_id":   s.subject_id,
            "subject_code": s.subject_code,
            "subject_name": s.subject_name,
        }

    # ── Validation ──────────────────────────────────────────────────────────
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

        # Mirror the trg_validate_grading_period trigger
        if enrollment.school_level == "senior_highschool":
            if period not in SHS_PERIODS:
                raise serializers.ValidationError({
                    "grading_period": (
                        "Senior HS enrollments only accept '1st_semester' or '2nd_semester'."
                    )
                })
        else:
            if period not in NON_SHS_PERIODS:
                raise serializers.ValidationError({
                    "grading_period": (
                        f"{enrollment.school_level} enrollments only accept "
                        f"'1st_quarter' through '4th_quarter'."
                    )
                })

        # Sanity: subject's level should match the enrollment's level
        if subject and subject.school_level != enrollment.school_level:
            raise serializers.ValidationError({
                "subject": (
                    f"Subject is for {subject.school_level} but enrollment is for "
                    f"{enrollment.school_level}."
                )
            })

        # Mirror the unique constraint (enrollment, subject, grading_period)
        qs = Grade.objects.filter(
            enrollment=enrollment, subject=subject, grading_period=period,
        )
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({
                "non_field_errors": [
                    "A grade for this enrollment, subject, and period already exists."
                ]
            })

        return attrs
