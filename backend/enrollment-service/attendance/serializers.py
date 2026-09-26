from django.utils import timezone
from rest_framework import serializers

from enrollments.rules import ATTENDED_STATUSES, date_outside_school_year
from .models import AttendanceRecord


def attendance_problem(enrollment, day):
    """
    Why attendance for `day` can't go on `enrollment`, or None.

    Nothing checked either: a day in 2031 went onto a 2026-2027 roster, and a
    cancelled application could collect a year of attendance.
    """
    if enrollment.enrollment_status not in ATTENDED_STATUSES:
        return (
            f"Attendance can only be recorded for a learner who attended; "
            f"this enrollment is {enrollment.enrollment_status}."
        )
    if day > timezone.localdate():
        return "Attendance can't be recorded for a day that hasn't happened yet."
    return date_outside_school_year(day, enrollment.school_year)


class StudentBriefSerializer(serializers.Serializer):
    student_id  = serializers.IntegerField()
    lrn         = serializers.CharField()
    first_name  = serializers.CharField()
    middle_name = serializers.CharField(allow_null=True)
    last_name   = serializers.CharField()
    suffix      = serializers.CharField(allow_null=True)
    sex         = serializers.CharField()


class EnrollmentBriefSerializer(serializers.Serializer):
    enrollment_id     = serializers.IntegerField()
    school_year       = serializers.CharField()
    grade_level       = serializers.CharField()
    section           = serializers.CharField()
    enrollment_status = serializers.CharField()
    student           = StudentBriefSerializer()


class AttendanceRecordSerializer(serializers.ModelSerializer):
    enrollment_detail = EnrollmentBriefSerializer(source="enrollment", read_only=True)

    class Meta:
        model  = AttendanceRecord
        fields = [
            "attendance_id",
            "enrollment",
            "enrollment_detail",
            "date",
            "status",
            "remarks",
            "recorded_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["attendance_id", "recorded_by", "created_at", "updated_at"]

    def validate(self, attrs):
        enrollment = attrs.get("enrollment", getattr(self.instance, "enrollment", None))
        day = attrs.get("date", getattr(self.instance, "date", None))
        if enrollment is not None and day is not None:
            problem = attendance_problem(enrollment, day)
            if problem:
                raise serializers.ValidationError({"date": problem})
        return attrs


class BulkAttendanceItemSerializer(serializers.Serializer):
    enrollment_id = serializers.IntegerField()
    status        = serializers.ChoiceField(choices=["P", "A", "L", "E"])
    remarks       = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class BulkAttendanceSerializer(serializers.Serializer):
    date    = serializers.DateField()
    records = BulkAttendanceItemSerializer(many=True)