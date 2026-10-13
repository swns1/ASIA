"""
The four narrative categories become class behavior.

They were the DepEd core values (Maka-Diyos, Makatao, Makakalikasan,
Makabansa) of DO 8 s.2015's Report on Learner's Observed Values. DO 15
s.2026 repealed that order and its report cards drop the section, and the
school wanted the rating to say how a learner studies in class.

Renamed in place: the IDs stay, so ratings already recorded read as the
behavior on their row, and the AO / SO / RO / NO marks feed the risk score
as before. Each UPDATE only touches a row that still has its old name, so a
category renamed in the portal (Grading Settings > Narrative Categories) is
left alone and running this twice changes nothing.

A fresh install fakes this migration (setup-db.ps1) and gets the new names
from scripts/reference_data.sql. On Railway it runs before each deploy:
deploy/railway/start-backend.sh predeploy.
"""
from django.db import migrations

# (category_id, core value, its description, behavior, its description)
RENAMES = [
    (900, "Maka-Diyos", "Expresses spiritual beliefs while respecting the beliefs of others.",
     "Attentiveness", "Pays attention and stays focused during lessons."),
    (901, "Makatao", "Is sensitive to individual, social and cultural differences.",
     "Listening", "Listens to the teacher and classmates and follows instructions."),
    (902, "Makakalikasan", "Cares for the environment and utilises resources wisely and responsibly.",
     "Participation", "Answers questions, joins class discussions and takes part in group work."),
    (903, "Makabansa", "Demonstrates pride in being a Filipino; exercises the rights and "
     "responsibilities of a Filipino citizen.",
     "Task completion", "Finishes classwork and homework and hands them in on time."),
]

RENAME = (
    "UPDATE narrative_categories SET name = %s, description = %s "
    "WHERE category_id = %s AND name = %s"
)


class Migration(migrations.Migration):

    dependencies = [
        ("grades", "0003_alter_narrativereport_options"),
    ]

    operations = [
        migrations.RunSQL(
            sql=[(RENAME, [new, new_desc, cid, old]) for cid, old, _, new, new_desc in RENAMES],
            reverse_sql=[(RENAME, [old, old_desc, cid, new]) for cid, old, old_desc, new, _ in RENAMES],
        ),
    ]
