from django.db import models


def run_scope(school_level=None, grade_level=None):
    """
    Filter kwargs for the runs that covered exactly this scope.

    A run made with no level or grade filter stores both as null, so "all
    levels" has to match null. Leaving the filter off instead matched every
    run, and whichever check was pressed last came back as the whole
    school's -- a Grade 7-only check would fill the "All levels" view and
    the dashboard with Grade 7's numbers alone.
    """
    return {"school_level": school_level or None, "grade_level": grade_level or None}


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
    # Re-running the same filters on the same day updates that run in place
    # rather than inserting a duplicate (see RiskAssessmentRunView), so
    # created_at alone would report a stale "computed at" time.
    updated_at   = models.DateTimeField(auto_now=True)

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
    trend_component      = models.FloatField(null=True, blank=True)
    narrative_component  = models.FloatField(null=True, blank=True)

    risk_score = models.FloatField()  # 0-100, higher = more at-risk
    risk_level = models.CharField(max_length=20, choices=RISK_LEVEL_CHOICES)

    # Why this student was flagged, in plain sentences a teacher can act on
    # ([{code, text, severity}] — see ai/services.py). Stored rather than
    # regenerated on read so a historical run still explains itself after the
    # thresholds behind it have been retuned.
    reasons_json = models.JSONField(default=list, blank=True)

    # How many of the four signals actually had data for this student. The
    # weight renormalization in score_students() hides this otherwise, so a
    # score built from one signal looks as confident as one built from four.
    signals_present = models.IntegerField(default=0)

    # The raw figures behind the score, snapshotted at run time. The
    # components above are risk contributions (higher = worse) and several
    # are not invertible — grade_component is max(average, failing-count), so
    # an 88 average and a 95 average with one failed subject both land on 65.
    # A teacher reading the list needs the actual grade and the actual
    # attendance percentage, so they are stored rather than reconstructed.
    average_grade         = models.FloatField(null=True, blank=True)
    attendance_rate       = models.FloatField(null=True, blank=True)  # 0-1
    grade_delta           = models.FloatField(null=True, blank=True)  # vs preceding period
    failing_subject_count = models.IntegerField(default=0)

    class Meta:
        db_table = "student_risk_scores"
        unique_together = (("run", "student_id"),)
        ordering = ["-risk_score"]

    def __str__(self):  # pragma: no cover
        return f"Student #{self.student_id} · run #{self.run_id} · {self.risk_level} ({self.risk_score})"


class AiSummary(models.Model):
    """
    One person's saved AI summary of one thing: a student's grade report (an
    enrollment) or one Analytics grouping (its filters). Latest only: making it
    again replaces the text in place, so there is one live row per person per
    subject. The interpret endpoint used to hand the text back and forget it,
    so leaving the page lost it and every revisit paid for another AI call.

    Private to its owner until they publish it: `shared_text` is a snapshot of
    the version they chose to share, so later private edits never leak into
    what others read until it is published again.

    Never deleted. Archiving sets `archived_at`; a summary whose owner was
    deactivated or whose enrollment no longer exists is treated as archived
    when read (see ai/summaries.py), so identity-service never has to write
    here. The live-row uniqueness is partial, which lets an archived row stay
    beside a newer live one.
    """

    summary_id = models.BigAutoField(primary_key=True)

    owner_user_id = models.BigIntegerField()  # user_id from identity-service JWT
    context_type  = models.CharField(max_length=40)   # a key of ai.views.PROMPTS
    # What the summary is about, built by the server, never taken from the
    # client as-is: "enrollment:42" or "cluster:<year>|<period>|<grade>|<subject>".
    subject_key   = models.CharField(max_length=200)
    subject_meta  = models.JSONField(default=dict)

    ai_text          = models.TextField()
    provider         = models.CharField(max_length=20, blank=True, default="")
    # sha256 of the data the AI was given. A different hash for today's data
    # means the grades moved on since: shown with a warning, not hidden.
    data_fingerprint = models.CharField(max_length=64)
    generated_at     = models.DateTimeField()

    # The owner's own version of the text. Empty = they kept the AI's.
    edited_text = models.TextField(blank=True, default="")
    edited_at   = models.DateTimeField(null=True, blank=True)

    # The published copy other staff read. Empty = not shared.
    shared_text        = models.TextField(blank=True, default="")
    shared_fingerprint = models.CharField(max_length=64, blank=True, default="")
    shared_at          = models.DateTimeField(null=True, blank=True)

    archived_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ai_summaries"
        constraints = [
            models.UniqueConstraint(
                fields=["owner_user_id", "context_type", "subject_key"],
                condition=models.Q(archived_at__isnull=True),
                name="ai_summary_one_live_per_owner_subject",
            ),
        ]
        indexes = [
            # The shared-with-me lookup: everyone's live summaries of one subject.
            models.Index(fields=["context_type", "subject_key"], name="ai_summary_subject_idx"),
        ]

    def __str__(self):  # pragma: no cover
        return f"Summary #{self.summary_id} · {self.subject_key} · user {self.owner_user_id}"

    @property
    def current_text(self):
        """What the owner sees: their edit if they made one, else the AI's."""
        return self.edited_text or self.ai_text
