from django.contrib import admin
from .models import Subject


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("subject_id", "subject_code", "subject_name", "school_level", "grade_level", "strand", "semester")
    list_filter = ("school_level", "strand", "semester")
    search_fields = ("subject_code", "subject_name")
