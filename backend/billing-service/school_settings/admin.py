from django.contrib import admin
from .models import SchoolSetting


@admin.register(SchoolSetting)
class SchoolSettingAdmin(admin.ModelAdmin):
    list_display = ("school_name", "current_school_year", "sy_start_date", "sy_end_date", "early_bird_days")