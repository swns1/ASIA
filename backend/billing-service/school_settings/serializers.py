from rest_framework import serializers

from shared import school_year as school_year_rules

from .models import SchoolSetting


class SchoolSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolSetting
        fields = (
            "setting_id",
            "current_school_year",
            "sy_start_date",
            "sy_end_date",
            "early_bird_days",
            "school_name",
            "school_address",
            "contact_email",
            "contact_phone",
            "updated_at",
        )
        read_only_fields = ("setting_id", "updated_at")

    # Every service reads this row: the school year the whole app opens on,
    # and the calendar the installment schedule and Early Bird are measured
    # from. It used to accept anything -- "banana" as the school year, an end
    # date before the start.
    def validate_current_school_year(self, value):
        try:
            return school_year_rules.normalize(value)
        except school_year_rules.InvalidSchoolYear as exc:
            raise serializers.ValidationError(str(exc))

    def validate_early_bird_days(self, value):
        if value is not None and not 0 <= value <= 365:
            raise serializers.ValidationError("Use a number of days from 0 to 365.")
        return value

    def validate(self, attrs):
        start = attrs.get("sy_start_date", getattr(self.instance, "sy_start_date", None))
        end = attrs.get("sy_end_date", getattr(self.instance, "sy_end_date", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"sy_end_date": "The school year has to end after it starts."})
        return attrs