from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic_calendar', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='calendarevent',
            name='event_type',
            field=models.CharField(
                choices=[
                    ('holiday',        'Holiday'),
                    ('exam',           'Exam / Assessment'),
                    ('enrollment',     'Enrollment Period'),
                    ('quarter_break',  'Quarter Break'),
                    ('school_day_off', 'School Day Off'),
                    ('event',          'Event'),
                    ('other',          'Other'),
                ],
                default='other',
                max_length=30,
            ),
        ),
    ]
