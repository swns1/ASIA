from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("enrollments", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="AttendanceRecord",
            fields=[
                ("attendance_id", models.BigAutoField(primary_key=True, serialize=False)),
                (
                    "enrollment",
                    models.ForeignKey(
                        db_column="enrollment_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attendance_records",
                        to="enrollments.enrollment",
                    ),
                ),
                ("date",        models.DateField()),
                ("status",      models.CharField(choices=[("P", "Present"), ("A", "Absent"), ("L", "Late"), ("E", "Excused")], default="P", max_length=1)),
                ("remarks",     models.TextField(blank=True, null=True)),
                ("recorded_by", models.IntegerField(blank=True, null=True)),
                ("created_at",  models.DateTimeField(auto_now_add=True)),
                ("updated_at",  models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "attendance_records",
                "ordering": ["-date", "enrollment__student__last_name"],
                "managed": True,
            },
        ),
        migrations.AlterUniqueTogether(
            name="attendancerecord",
            unique_together={("enrollment", "date")},
        ),
    ]