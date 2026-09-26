from rest_framework import serializers

from enrollments.serializers import SchoolYearField
from .models import CalendarEvent


class CalendarEventSerializer(serializers.ModelSerializer):
    # Same canonical "YYYY-YYYY" as every other school_year column; free text
    # here filed an event under a year no screen ever selects.
    school_year = SchoolYearField()

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
            "grading_period",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("event_id", "created_at", "updated_at")
        # The one-per-quarter rule is checked in validate() with a message a
        # person can act on; the model's constraint is the backstop.
        validators = []

    def validate(self, data):
        start = data.get("start_date") or getattr(self.instance, "start_date", None)
        end   = data.get("end_date")   or getattr(self.instance, "end_date",   None)
        if start and end and start > end:
            raise serializers.ValidationError("start_date must be on or before end_date.")

        event_type = data.get("event_type", getattr(self.instance, "event_type", None))
        if event_type != "grading_period":
            # A quarter only means something on a grading period; leaving a
            # stale one behind after a type change would still count for the
            # one-per-quarter rule.
            data["grading_period"] = None
            return data

        period = data.get("grading_period", getattr(self.instance, "grading_period", None))
        if not period:
            raise serializers.ValidationError({"grading_period": "Choose which quarter this is."})

        school_year = data.get("school_year", getattr(self.instance, "school_year", None))
        clash = CalendarEvent.objects.filter(school_year=school_year, grading_period=period)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            label = dict(CalendarEvent._meta.get_field("grading_period").choices)[period]
            raise serializers.ValidationError(
                {"grading_period": f"S.Y. {school_year} already has a {label}. Edit that one instead."}
            )
        data["grading_period"] = period
        return data
