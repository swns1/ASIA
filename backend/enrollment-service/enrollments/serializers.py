from rest_framework import serializers
from .models import Enrollment, Student


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


class EnrollmentSerializer(serializers.ModelSerializer):
    student_detail = StudentSummarySerializer(source="student", read_only=True)
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    student_id = serializers.IntegerField(source="student.student_id", read_only=True)
    student_name = serializers.SerializerMethodField()  

    class Meta:
        model = Enrollment
        fields = (
            "enrollment_id",
            "student",
            "student_id",
            "student_name",       
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

    def get_student_name(self, obj):   
        s = obj.student
        if not s:
            return None
        parts = [s.first_name, s.middle_name, s.last_name, s.suffix]
        return " ".join(p for p in parts if p)

    def validate(self, attrs):
        school_level = attrs.get("school_level", getattr(self.instance, "school_level", None))
        semester = attrs.get("semester", getattr(self.instance, "semester", None))

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