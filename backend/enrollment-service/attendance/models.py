from django.db import models
from enrollments.models import Enrollment


class AttendanceRecord(models.Model):

    STATUS_CHOICES = [
        ("P", "Present"),
        ("A", "Absent"),
        ("L", "Late"),
        ("E", "Excused"),
    ]

    attendance_id = models.BigAutoField(primary_key=True)

    enrollment = models.ForeignKey(
        Enrollment,
        on_delete=models.CASCADE,
        db_column="enrollment_id",
        related_name="attendance_records",
    )

    date     = models.DateField()
    status   = models.CharField(max_length=1, choices=STATUS_CHOICES, default="P")
    remarks  = models.TextField(null=True, blank=True)

    recorded_by = models.IntegerField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        managed = True
        db_table = "attendance_records"
        unique_together = [("enrollment", "date")]
        ordering = ["-date", "enrollment__student__last_name"]

    def __str__(self):
        return f"E#{self.enrollment_id} {self.date} → {self.status}"