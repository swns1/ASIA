from django.db import models


class RiskAssessmentRun(models.Model):
    """
    One row per time an at-risk assessment is computed. Unlike the ephemeral
    K-means clustering in analytics_views.py (recomputed and discarded every
    request), a run's results are persisted so risk can be tracked over time.
    Genuinely new data owned by enrollment-service, so — unlike most models
    in this codebase — this one is Django-managed with a real migration.
    """

    run_id = models.BigAutoField(primary_key=True)

    school_year    = models.CharField(max_length=20)
    grading_period = models.CharField(max_length=20)  # a grading_period value, or "overall"
    school_level   = models.CharField(max_length=20, null=True, blank=True)
    grade_level    = models.CharField(max_length=20, null=True, blank=True)

    # Weights/thresholds actually used for this run — makes hyperparameters
    # inspectable per-run instead of silently hardcoded (see ai/services.py).
    weights_json = models.JSONField(default=dict)

    triggered_by = models.BigIntegerField(null=True, blank=True)  # user_id from identity-service JWT
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "risk_assessment_runs"
        ordering = ["-created_at"]

    def __str__(self):  # pragma: no cover
        return f"Run #{self.run_id} · {self.school_year} {self.grading_period} · {self.created_at:%Y-%m-%d}"


class StudentRiskScore(models.Model):
    """
    One row per student per RiskAssessmentRun. `enrollment_id` is kept (not
    just student_id) specifically so a future analysis can join this history
    against Enrollment.enrollment_status once real dropped/withdrawn outcome
    data exists — see ai/services.py for why this is a rule-based composite
    score today rather than a trained classifier.
    """

    RISK_LEVEL_CHOICES = [
        ("low",      "Low"),
        ("moderate", "Moderate"),
        ("high",     "High"),
        ("critical", "Critical"),
    ]

    score_id = models.BigAutoField(primary_key=True)
    run = models.ForeignKey(
        RiskAssessmentRun, on_delete=models.CASCADE, related_name="scores",
    )
    student_id    = models.BigIntegerField(db_index=True)
    enrollment_id = models.BigIntegerField(db_index=True)

    grade_component      = models.FloatField(null=True, blank=True)
    attendance_component = models.FloatField(null=True, blank=True)
    narrative_component  = models.FloatField(null=True, blank=True)

    risk_score = models.FloatField()  # 0-100, higher = more at-risk
    risk_level = models.CharField(max_length=20, choices=RISK_LEVEL_CHOICES)

    class Meta:
        db_table = "student_risk_scores"
        unique_together = (("run", "student_id"),)
        ordering = ["-risk_score"]

    def __str__(self):  # pragma: no cover
        return f"Student #{self.student_id} · run #{self.run_id} · {self.risk_level} ({self.risk_score})"
