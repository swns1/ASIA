from django.contrib import admin
from .models import ScholarshipType, EnrollmentScholarship


@admin.register(ScholarshipType)
class ScholarshipTypeAdmin(admin.ModelAdmin):
    list_display = ("scholarship_type_id", "scholarship_code", "scholarship_name", "discount_mode", "discount_value", "is_active")
    list_filter = ("is_active", "discount_mode")
    search_fields = ("scholarship_code", "scholarship_name")


@admin.register(EnrollmentScholarship)
class EnrollmentScholarshipAdmin(admin.ModelAdmin):
    list_display = ("enrollment_scholarship_id", "enrollment_id", "scholarship_type", "approved_at")
    list_filter = ("scholarship_type",)
    search_fields = ("enrollment__enrollment_id", "scholarship_type__scholarship_code")
