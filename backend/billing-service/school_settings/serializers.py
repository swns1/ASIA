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
        read_only_fields = ("setting_id", "updated_at")