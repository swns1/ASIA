from rest_framework import serializers
from .models import AttendanceRecord


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


class BulkAttendanceItemSerializer(serializers.Serializer):
    enrollment_id = serializers.IntegerField()
    status        = serializers.ChoiceField(choices=["P", "A", "L", "E"])
    remarks       = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class BulkAttendanceSerializer(serializers.Serializer):
    date    = serializers.DateField()
    records = BulkAttendanceItemSerializer(many=True)