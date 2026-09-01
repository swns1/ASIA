"""
Additive-only: three new columns on student_risk_scores backing the
recalibrated risk model (see ai/services.py).

- trend_component: the quarter-over-quarter grade trajectory signal, which
  did not exist when 0001 was written.
- reasons_json: the plain-language explanation of why a student was flagged,
  stored rather than regenerated on read so an old run still explains itself
  after the thresholds behind it are retuned.
- signals_present: how many of the four signals had data, so a score built
  from one signal isn't presented as confidently as one built from four.
- risk_assessment_runs.updated_at: a same-day re-run now updates its run in
  place instead of inserting a duplicate, so created_at alone would report a
  stale "computed at" time.

All three are nullable or defaulted, so existing rows stay valid and no
backfill is needed. Historical runs simply carry no reasons.
"""

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ai", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="riskassessmentrun",
            name="updated_at",
            field=models.DateTimeField(
                auto_now=True, default=django.utils.timezone.now,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="studentriskscore",
            name="trend_component",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="studentriskscore",
            name="reasons_json",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="studentriskscore",
            name="signals_present",
            field=models.IntegerField(default=0),
        ),
    ]
