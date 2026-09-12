"""Drops ApplicationInvite.mode.

The kiosk is a walk-in feature: a registrar hands a front-desk device to a
family that is physically at the school. The removed "remote" value meant
"the applicant opens the link on their own phone", and it was the default —
which left every kiosk behaviour (the hand-over confirm, the idle reset, the
success-screen countdown) switched off unless staff remembered to change a
dropdown. With one mode left there is nothing to store.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("intake", "0001_initial"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="applicationinvite",
            name="mode",
        ),
    ]
