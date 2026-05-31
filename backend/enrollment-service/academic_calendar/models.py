from django.db import models

EVENT_TYPES = [
    ("holiday",        "Holiday"),
    ("exam",           "Exam / Assessment"),
    ("enrollment",     "Enrollment Period"),
    ("quarter_break",  "Quarter Break"),
    ("school_day_off", "School Day Off"),
    ("event",          "Event"),
    ("other",          "Other"),
]


class CalendarEvent(models.Model):
    event_id    = models.BigAutoField(primary_key=True)
    school_year = models.CharField(max_length=20)
    title       = models.CharField(max_length=150)
    event_type  = models.CharField(max_length=30, choices=EVENT_TYPES, default="other")
    start_date  = models.DateField()
    end_date    = models.DateField()
    description = models.TextField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        managed = True
        db_table = "academic_calendar_events"
        ordering = ["start_date"]

    def __str__(self):
        return f"{self.title} ({self.school_year})"
