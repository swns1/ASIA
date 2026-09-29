from django.db import migrations


class Migration(migrations.Migration):
    """
    Joins the two lines that branched after 0004: guardian responses and
    email-failure resolution (0005_guardianresponse, 0006_emaildeliveryfailure_resolved_at)
    and the school year registry (0005_schoolyear through 0007_section).
    Neither touches the other's tables, so there is nothing to reconcile.
    """

    dependencies = [
        ("enrollments", "0006_emaildeliveryfailure_resolved_at"),
        ("enrollments", "0007_section"),
    ]

    operations = []
