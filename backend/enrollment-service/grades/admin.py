from django.contrib import admin
from .models import Grade


@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ("grade_id", "enrollment_id", "subject", "grading_period", "numeric_grade", "remarks", "recorded_at")
    list_filter = ("grading_period", "remarks")
    search_fields = ("enrollment__enrollment_id", "subject__subject_code")
