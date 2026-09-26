from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0005_guardianresponse'),
    ]

    operations = [
        migrations.AddField(
            model_name='emaildeliveryfailure',
            name='resolved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
