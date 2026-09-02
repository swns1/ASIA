from django.contrib import admin
from .models import Enrollment, EmailDeliveryFailure, SectionAdvisory


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = (
        "enrollment_id", "student_id", "school_year",
        "school_level", "grade_level", "section", "enrollment_status",
    )
    list_filter = ("school_level", "enrollment_status", "school_year")
    search_fields = ("student__lrn", "student__last_name", "section")


@admin.register(SectionAdvisory)
class SectionAdvisoryAdmin(admin.ModelAdmin):
    list_display = (
        "advisory_id", "teacher_user_id", "school_year",
        "school_level", "grade_level", "section", "strand",
    )
    list_filter = ("school_level", "school_year")
    search_fields = ("section", "grade_level")


@admin.register(EmailDeliveryFailure)
class EmailDeliveryFailureAdmin(admin.ModelAdmin):
    list_display = ("to_email", "subject", "created_at")
    search_fields = ("to_email", "subject")
    readonly_fields = ("to_email", "subject", "context", "error_message", "created_at")
