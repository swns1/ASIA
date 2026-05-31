from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='CalendarEvent',
            fields=[
                ('event_id', models.BigAutoField(primary_key=True, serialize=False)),
                ('school_year', models.CharField(max_length=20)),
                ('title', models.CharField(max_length=150)),
                ('event_type', models.CharField(
                    choices=[
                        ('holiday',        'Holiday'),
                        ('exam',           'Exam / Assessment'),
                        ('enrollment',     'Enrollment Period'),
                        ('quarter_break',  'Quarter Break'),
                        ('school_day_off', 'School Day Off'),
                        ('other',          'Other'),
                    ],
                    default='other',
                    max_length=30,
                )),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('description', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'academic_calendar_events',
                'ordering': ['start_date'],
                'managed': True,
            },
        ),
    ]
