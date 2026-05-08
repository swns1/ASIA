from rest_framework import serializers
from .models import Enrollment, Student


# ─── Lightweight student summary ────────────────────────────────────────────
class StudentSummarySerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

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
            "full_name",
            "sex",
            "status",
        )

    def get_full_name(self, obj):
        parts = [obj.first_name, obj.middle_name, obj.last_name, obj.suffix]
        return " ".join(p for p in parts if p)


# ─── Enrollment ─────────────────────────────────────────────────────────────
class EnrollmentSerializer(serializers.ModelSerializer):
    """
    On read: returns nested `student_detail` plus a `student_id` shortcut.
    On write: clients send `"student": 12` (the FK PK).
    """

    student_detail = StudentSummarySerializer(source="student", read_only=True)
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    student_id = serializers.IntegerField(source="student.student_id", read_only=True)

    class Meta:
        model = Enrollment
        fields = (
            "enrollment_id",
            "student",
            "student_id",
            "student_detail",
            "school_year",
            "school_level",
            "grade_level",
            "section",
            "strand",
            "semester",
            "enrollment_status",
        )
        read_only_fields = ("enrollment_id",)

    # ── Cross-field validation mirroring schema CHECK constraints ───────────
    def validate(self, attrs):
        school_level = attrs.get("school_level", getattr(self.instance, "school_level", None))
        semester = attrs.get("semester", getattr(self.instance, "semester", None))

        # Treat "" as None (frontend nulls empty strings, but be defensive)
        if semester == "":
            semester = None
            attrs["semester"] = None

        if school_level == "senior_highschool":
            if semester not in ("1st", "2nd"):
                raise serializers.ValidationError({
                    "semester": "Senior HS enrollments require semester '1st' or '2nd'."
                })
        else:
            if semester is not None:
                raise serializers.ValidationError({
                    "semester": f"Semester must be empty for {school_level} enrollments."
                })
            if attrs.get("strand") == "":
                attrs["strand"] = None

        # Mirrors uq_enrollments_student_sy partial unique index
        student = attrs.get("student", getattr(self.instance, "student", None))
        school_year = attrs.get("school_year", getattr(self.instance, "school_year", None))
        new_status = attrs.get(
            "enrollment_status",
            getattr(self.instance, "enrollment_status", "enrolled"),
        )
        if student and school_year and new_status in ("enrolled", "pending"):
            qs = Enrollment.objects.filter(
                student=student,
                school_year=school_year,
                enrollment_status__in=("enrolled", "pending"),
            )
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    "non_field_errors": [
                        f"This student already has an active or pending enrollment "
                        f"for school year {school_year}."
                    ]
                })

        return attrs
