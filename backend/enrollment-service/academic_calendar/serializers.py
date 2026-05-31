from rest_framework import serializers
from .models import CalendarEvent


class CalendarEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalendarEvent
        fields = (
            "event_id",
            "school_year",
            "title",
            "event_type",
            "start_date",
            "end_date",
            "description",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("event_id", "created_at", "updated_at")

    def validate(self, data):
        start = data.get("start_date") or getattr(self.instance, "start_date", None)
        end   = data.get("end_date")   or getattr(self.instance, "end_date",   None)
        if start and end and start > end:
            raise serializers.ValidationError("start_date must be on or before end_date.")
        return data
