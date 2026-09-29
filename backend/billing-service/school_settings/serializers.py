from rest_framework import serializers

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
        # The school year and its dates are managed on the School Years page
        # now (enrollment-service's school_years registry) and copied here
        # when a year is made current. Writable here too, they could be
        # changed without the registry knowing and the two would disagree.
        read_only_fields = (
            "setting_id", "updated_at",
            "current_school_year", "sy_start_date", "sy_end_date",
        )

    def validate_early_bird_days(self, value):
        if value is not None and not 0 <= value <= 365:
            raise serializers.ValidationError("Use a number of days from 0 to 365.")
        return value
