from django.db import models
from django.db.models import Q

EVENT_TYPES = [
    ("holiday",        "Holiday"),
    ("exam",           "Exam / Assessment"),
    ("enrollment",     "Enrollment Period"),
    ("quarter_break",  "Quarter Break"),
    ("school_day_off", "School Day Off"),
    ("event",          "Event"),
    ("grading_period", "Grading Period"),
    ("other",          "Other"),
]

# A grading_period event spans one quarter; its end_date is when that
# quarter's grades are due. Senior High grades by semester, so its periods are
# derived from these (Q1–Q2 = 1st semester, Q3–Q4 = 2nd) rather than entered
# separately — see dashboard/services.py.
GRADING_QUARTERS = [
    ("1st_quarter", "1st Quarter"),
    ("2nd_quarter", "2nd Quarter"),
    ("3rd_quarter", "3rd Quarter"),
    ("4th_quarter", "4th Quarter"),
]


class CalendarEvent(models.Model):
    event_id    = models.BigAutoField(primary_key=True)
    school_year = models.CharField(max_length=20)
    title       = models.CharField(max_length=150)
    event_type  = models.CharField(max_length=30, choices=EVENT_TYPES, default="other")
    start_date  = models.DateField()
    end_date    = models.DateField()
    description = models.TextField(null=True, blank=True)
    # Set only on grading_period events, which quarter the dates belong to.
    grading_period = models.CharField(max_length=20, choices=GRADING_QUARTERS, null=True, blank=True)
    # Whether the guardian portal shows it. The registrar decides per event;
    # a grading period is the teachers' grade deadline and is never shown
    # (the serializer forces it off).
    visible_to_guardians = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        managed = True
        db_table = "academic_calendar_events"
        ordering = ["start_date"]
        constraints = [
            # Two "2nd Quarter" events in one year would leave the dashboard
            # guessing which due date is real.
            models.UniqueConstraint(
                fields=["school_year", "grading_period"],
                condition=Q(grading_period__isnull=False),
                name="uniq_calendar_grading_period_per_year",
            ),
        ]

    def __str__(self):
        return f"{self.title} ({self.school_year})"


class PersonalEvent(models.Model):
    """
    One staff member's own calendar entry, shown on their Academic Calendar
    (with "My events" on) and on their home's Coming up. Private: only its
    owner reads or changes it -- no role, admins included, sees anyone
    else's (views.PersonalEventViewSet scopes every query to the caller).

    Not filed under a school year: a person's plans don't stop at a year's
    end, and an archived year doesn't lock them.
    """

    event_id      = models.BigAutoField(primary_key=True)
    # user_id from the identity-service JWT, as SectionAdvisory.teacher_user_id.
    owner_user_id = models.BigIntegerField()
    title         = models.CharField(max_length=150)
    start_date    = models.DateField()
    end_date      = models.DateField()
    description   = models.TextField(null=True, blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        managed = True
        db_table = "personal_calendar_events"
        ordering = ["start_date"]
        indexes = [models.Index(fields=["owner_user_id", "start_date"], name="personal_event_owner_start")]
        constraints = [
            models.CheckConstraint(
                condition=Q(start_date__lte=models.F("end_date")),
                name="personal_event_starts_before_it_ends",
            ),
        ]

    def __str__(self):
        return f"{self.title} (user #{self.owner_user_id})"
