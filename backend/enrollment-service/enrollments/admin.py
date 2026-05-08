from django.contrib import admin
from .models import Enrollment


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = (
        "enrollment_id", "student_id", "school_year",
        "school_level", "grade_level", "section", "enrollment_status",
    )
    list_filter = ("school_level", "enrollment_status", "school_year")
    search_fields = ("student__lrn", "student__last_name", "section")
