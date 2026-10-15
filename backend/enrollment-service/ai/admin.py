from django.contrib import admin

from .models import AiSummary, RiskAssessmentRun, StudentRiskScore


class StudentRiskScoreInline(admin.TabularInline):
    model = StudentRiskScore
    extra = 0
    readonly_fields = (
        "student_id", "enrollment_id", "grade_component",
        "attendance_component", "narrative_component", "risk_score", "risk_level",
    )
    can_delete = False


@admin.register(RiskAssessmentRun)
class RiskAssessmentRunAdmin(admin.ModelAdmin):
    list_display = ("run_id", "school_year", "grading_period", "school_level",
                     "grade_level", "created_at", "triggered_by")
    list_filter = ("school_year", "grading_period", "school_level")
    ordering = ("-created_at",)
    inlines = [StudentRiskScoreInline]


@admin.register(StudentRiskScore)
class StudentRiskScoreAdmin(admin.ModelAdmin):
    list_display = ("score_id", "run", "student_id", "risk_score", "risk_level")
    list_filter = ("risk_level",)
    ordering = ("-risk_score",)


@admin.register(AiSummary)
class AiSummaryAdmin(admin.ModelAdmin):
    """Where an archived summary can still be found: the pages never show one."""
    list_display = ("summary_id", "owner_user_id", "context_type", "subject_key",
                    "generated_at", "shared_at", "archived_at")
    list_filter = ("context_type",)
    search_fields = ("subject_key",)
    ordering = ("-generated_at",)
