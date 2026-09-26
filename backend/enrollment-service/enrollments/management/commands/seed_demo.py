"""
python manage.py seed_demo

Academic history for the learners created by student-service's
`seed_demo_students`: subjects, calendar, enrollments, attendance, grades and
observed-values reports, across three school years.

Why three years
---------------
Two features need history, not volume. The risk model's trend signal compares a
period against the one before it, and any retrospective classifier needs a
time-based split -- train on earlier years, test on the current one. One year of
data makes both impossible no matter how many learners it holds.

Why the signals are correlated
------------------------------
Each learner gets latent `ability` and `engagement` traits, and every figure
generated here descends from them: engagement drives absence, absence drags
grades down within the year, and ability sets the baseline. Drawing the columns
independently would be faster and would quietly destroy the point -- K-means
would find nothing but noise, and a classifier trained on it would score at
chance no matter how well it was built. The correlation is what makes this data
something the ML can actually be evaluated against.

The traits are derived from `(seed, student_id)` rather than stored, so this
command and billing-service's agree without sharing state, and a rerun with the
same seed reproduces the same school exactly.

Quarter breaks
--------------
This seeds `quarter_break` calendar events, which the database previously had
none of. `ai.services.resolve_period_window` derives quarter boundaries from
them and falls back to the whole school year when they are missing -- and
`_school_year_bounds` returns Jan 1 of the opening year to Dec 31 of the closing
one, a 24-month window. So every "1st quarter" attendance rate behind a risk
score was silently computed over two calendar years. Seeding the breaks is what
makes the already-written quarter logic actually run; `resolve_period_window`
reporting `source: "calendar"` instead of `"full_year"` is the proof.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from academic_calendar.models import CalendarEvent
from attendance.models import AttendanceRecord
from enrollments.models import Enrollment, Student
from grades.models import Grade, NarrativeCategory, NarrativeReport
from grading.deped import PASSING_GRADE, transmute
from grading.models import GradingTemplate
from shared.school_year import normalize as normalize_school_year
from subjects.models import Subject

SEED_LRN_PREFIX = "9900"

# ── Curriculum ───────────────────────────────────────────────────────────────
# Learning areas per level. Kept close to the DepEd K-12 offering so a printed
# SF9 lists subjects a registrar recognises, without pretending to be the
# complete official curriculum guide.
CORE_ELEM_LOWER = [
    "Mother Tongue", "Filipino", "English", "Mathematics",
    "Araling Panlipunan", "MAPEH", "Edukasyon sa Pagpapakatao",
]
CORE_ELEM_UPPER = [
    "Filipino", "English", "Mathematics", "Science",
    "Araling Panlipunan", "MAPEH", "Edukasyong Pantahanan at Pangkabuhayan",
    "Edukasyon sa Pagpapakatao",
]
CORE_JHS = [
    "Filipino", "English", "Mathematics", "Science",
    "Araling Panlipunan", "MAPEH", "Technology and Livelihood Education",
    "Edukasyon sa Pagpapakatao",
]
CORE_SHS = [
    "Oral Communication", "General Mathematics", "Earth and Life Science",
    "Understanding Culture, Society and Politics", "Personal Development",
    "Physical Education and Health",
]
# Senior high takes each learning area in one semester, and enrolls each
# semester as its own row. These were seeded with no semester at all -- which
# the subjects CHECK lets through, since it compares NULL -- and the Subjects
# page then refused to edit them.
SHS_SEMESTER = {name: ("1st" if i < 3 else "2nd") for i, name in enumerate(CORE_SHS)}

# The demo teacher account seed_data.sql creates, given sections of the year in
# progress so My Sections, grade entry and attendance have learners in them.
DEMO_TEACHER_EMAIL = "teacher@slis.test"
EARLY_YEARS = [
    "Language, Literacy and Communication", "Mathematics",
    "Physical Health and Motor Development", "Socio-Emotional Development",
]

LADDER = [
    ("Nursery", "nursery"), ("Kindergarten", "kindergarten"),
    ("Grade 1", "elementary"), ("Grade 2", "elementary"), ("Grade 3", "elementary"),
    ("Grade 4", "elementary"), ("Grade 5", "elementary"), ("Grade 6", "elementary"),
    ("Grade 7", "junior_highschool"), ("Grade 8", "junior_highschool"),
    ("Grade 9", "junior_highschool"), ("Grade 10", "junior_highschool"),
    ("Grade 11", "senior_highschool"), ("Grade 12", "senior_highschool"),
]
LADDER_AGES = {
    "Nursery": 4, "Kindergarten": 5, "Grade 1": 6, "Grade 2": 7, "Grade 3": 8,
    "Grade 4": 9, "Grade 5": 10, "Grade 6": 11, "Grade 7": 12, "Grade 8": 13,
    "Grade 9": 14, "Grade 10": 15, "Grade 11": 16, "Grade 12": 17,
}
AGE_TO_INDEX = {age: i for i, (g, _) in enumerate(LADDER)
                for age in [LADDER_AGES[g]]}

SECTIONS = ["Mabini", "Rizal", "Bonifacio", "Luna", "Silang", "Aguinaldo"]
STRANDS = ["STEM", "ABM", "HUMSS"]

QUARTERS = ["1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"]
SEMESTERS = ["1st_semester", "2nd_semester"]

# Philippine regular holidays that fall inside a June-March school year.
# (month, day, title) -- fixed-date ones only; movable feasts are approximated
# by the Holy Week block added per year below.
FIXED_HOLIDAYS = [
    (6, 12, "Independence Day"), (8, 21, "Ninoy Aquino Day"),
    (8, 26, "National Heroes Day"), (11, 1, "All Saints' Day"),
    (11, 2, "All Souls' Day"), (11, 30, "Bonifacio Day"),
    (12, 8, "Feast of the Immaculate Conception"), (12, 25, "Christmas Day"),
    (12, 30, "Rizal Day"), (12, 31, "Last Day of the Year"),
    (1, 1, "New Year's Day"), (2, 25, "EDSA People Power Anniversary"),
]


def age_during(student, start_year):
    """The age a learner reaches during the school year opening in `start_year`.

    Grade placement follows from this rather than the other way round, which is
    what keeps a roster believable: the learner seeded as a nine-year-old is in
    Grade 4 this year and was in Grade 2 two years ago, without either command
    storing a "grade" anywhere.
    """
    if not student.birth_date:
        return None
    return start_year - student.birth_date.year


def latent_traits(seed, student_id):
    """Stable per-learner ability and engagement in roughly [-2.5, 2.5].

    Derived from the seed and the learner's own id rather than stored, so
    billing-service reaches the same numbers without this command handing
    anything over, and a rerun reproduces the same school.
    """
    rng = random.Random(f"{seed}:{student_id}")
    ability = rng.gauss(0, 1)
    # Engagement correlates with ability (~0.5) but is not the same thing --
    # a capable learner can still stop showing up, which is the case the
    # at-risk model exists to catch.
    engagement = 0.5 * ability + 0.87 * rng.gauss(0, 1)
    return ability, engagement


class Command(BaseCommand):
    help = "Seed enrollments, attendance, grades and narratives for demo learners."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, default=20260923)
        parser.add_argument("--years", type=int, default=3,
                            help="How many school years of history (default 3).")
        parser.add_argument("--sy-start-year", type=int, default=None,
                            help="Opening year of the CURRENT school year. "
                                 "Defaults to the year --as-of falls in (July cutoff).")
        parser.add_argument("--as-of", default=None,
                            help="Treat this ISO date as 'today' (default: today). "
                                 "The current school year is seeded only up to it, "
                                 "so the demo shows a year in progress.")
        parser.add_argument("--wipe", action="store_true",
                            help="Delete existing enrollments for seeded learners first.")

    def handle(self, *args, **opts):
        self.seed = opts["seed"]
        rng = random.Random(opts["seed"])
        years = opts["years"]

        self.as_of = (
            date.fromisoformat(opts["as_of"]) if opts["as_of"]
            else timezone.localdate()
        )
        # A school year that has already ended makes a poor demonstration: every
        # "this year" screen shows a closed year, and an early-warning model has
        # nothing left to warn about. Default to the year `as_of` actually falls
        # in, on the same July cutoff shared/school_year uses.
        sy_year = opts["sy_start_year"]
        if sy_year is None:
            sy_year = self.as_of.year if self.as_of.month >= 7 else self.as_of.year - 1

        students = list(
            Student.objects.filter(lrn__startswith=SEED_LRN_PREFIX).order_by("student_id")
        )
        if not students:
            raise CommandError(
                "No seeded learners found. Run student-service's "
                "`manage.py seed_demo_students` first."
            )

        with transaction.atomic():
            if opts["wipe"]:
                n, _ = Enrollment.objects.filter(student__in=students).delete()
                self.stdout.write(f"  wiped {n} enrollment rows (and their cascades)")

            school_years = [
                normalize_school_year(f"{sy_year - offset}-{sy_year - offset + 1}")
                for offset in reversed(range(years))
            ]

            subjects = self._ensure_subjects()
            self._ensure_calendar(school_years)
            categories = list(NarrativeCategory.objects.filter(is_active=True))

            totals = {"enrollments": 0, "attendance": 0, "grades": 0, "narratives": 0}
            for offset, sy in enumerate(school_years):
                is_current = offset == len(school_years) - 1
                counts = self._seed_year(
                    rng, students, sy, sy_year - (len(school_years) - 1 - offset),
                    subjects, categories, is_current,
                )
                for k, v in counts.items():
                    totals[k] += v
                self.stdout.write(
                    f"  {sy}: {counts['enrollments']} enrollments, "
                    f"{counts['attendance']} attendance, {counts['grades']} grades"
                )

            self._ensure_demo_advisories(school_years[-1], students, wipe=opts["wipe"])

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {totals['enrollments']} enrollments, {totals['attendance']} "
            f"attendance records, {totals['grades']} grades, "
            f"{totals['narratives']} observed-values reports."
        ))
        self.stdout.write("Next: billing-service `manage.py seed_demo_billing`.")

    # ── reference data ──────────────────────────────────────────────────────

    def _subject_names(self, grade, level):
        if level in ("nursery", "kindergarten"):
            return EARLY_YEARS
        if level == "elementary":
            return CORE_ELEM_LOWER if grade in ("Grade 1", "Grade 2", "Grade 3") else CORE_ELEM_UPPER
        if level == "junior_highschool":
            return CORE_JHS
        return CORE_SHS

    @staticmethod
    def _subject_code(grade, name, taken):
        """A short, unique, readable code for a learning area.

        `subject_code` is unique school-wide, so initials alone are not enough:
        within one grade, "Mathematics" and "MAPEH" both reduce to M. Four
        letters of the compacted name disambiguate those, and the numeric
        suffix is the backstop for anything that still collides -- including
        codes a registrar entered by hand, which is why the set this checks
        against is seeded from the existing catalogue.
        """
        slug = grade.replace("Grade ", "G").replace(" ", "")
        letters = "".join(ch for ch in name.upper() if ch.isalpha())[:4] or "SUB"
        base = f"{slug}-{letters}"[:30]
        if base not in taken:
            return base
        n = 2
        while f"{base}{n}"[:30] in taken:
            n += 1
        return f"{base}{n}"[:30]

    def _ensure_subjects(self):
        """Top the subject catalogue up to a full offering per grade.

        The catalogue held one to four subjects per grade, so a report card had
        three rows where a registrar expects nine. Existing rows are left alone
        and matched by (school_level, grade_level, subject_name) -- this adds
        what is missing rather than replacing what someone entered.
        """
        template = GradingTemplate.objects.order_by("grading_template_id").first()
        existing = {
            (s.school_level, s.grade_level, s.subject_name): s
            for s in Subject.objects.all()
        }
        taken_codes = set(Subject.objects.values_list("subject_code", flat=True))
        by_grade, created = {}, 0

        for grade, level in LADDER:
            names = self._subject_names(grade, level)
            bucket = []
            for name in names:
                key = (level, grade, name)
                subject = existing.get(key)
                semester = SHS_SEMESTER.get(name, "1st") if level == "senior_highschool" else None
                if subject is None:
                    code = self._subject_code(grade, name, taken_codes)
                    taken_codes.add(code)
                    subject = Subject.objects.create(
                        subject_code=code,
                        subject_name=name,
                        school_level=level,
                        grade_level=grade,
                        semester=semester,
                        grading_template=template,
                    )
                    created += 1
                else:
                    changed = []
                    if subject.grading_template_id is None and template:
                        # A subject with no template answers 400 from
                        # compute_grade for every learner taking it.
                        subject.grading_template = template
                        changed.append("grading_template")
                    if semester and not subject.semester:
                        subject.semester = semester
                        changed.append("semester")
                    # Core subjects are every strand's. seed_data.sql used to
                    # tag three of them STEM, and this command grades learners
                    # of every strand in them -- which the grade rules refuse
                    # for a strand subject outside the learner's strand.
                    if level == "senior_highschool" and name in SHS_SEMESTER and subject.strand:
                        subject.strand = None
                        changed.append("strand")
                    if changed:
                        subject.save(update_fields=changed)
                bucket.append(subject)
            by_grade[grade] = bucket

        self.stdout.write(f"  subjects: {created} created, catalogue complete")
        return by_grade

    def _ensure_calendar(self, school_years):
        """Holidays and -- the point of this -- three quarter breaks per year.

        Three breaks delimit four quarters, which is the shape
        `ai.services.resolve_period_window` expects. Without them it silently
        widens every quarter to a two-calendar-year window.
        """
        made = 0
        for sy in school_years:
            start_year = int(sy[:4])
            existing_types = set(
                CalendarEvent.objects.filter(school_year=sy)
                .values_list("event_type", flat=True)
            )

            if "holiday" not in existing_types:
                for month, day, title in FIXED_HOLIDAYS:
                    year = start_year if month >= 6 else start_year + 1
                    CalendarEvent.objects.create(
                        school_year=sy, title=title, event_type="holiday",
                        start_date=date(year, month, day),
                        end_date=date(year, month, day),
                    )
                    made += 1

            if "quarter_break" not in existing_types:
                # Quarters run roughly Jun-Aug, Sep-Nov, Dec-Jan, Feb-Mar.
                # Each break closes the quarter before it.
                for title, (y, m, d), length in [
                    ("End of 1st Quarter Break", (start_year, 8, 25), 3),
                    ("Semestral Break", (start_year, 11, 24), 5),
                    ("End of 3rd Quarter Break", (start_year + 1, 1, 26), 3),
                ]:
                    begin = date(y, m, d)
                    CalendarEvent.objects.create(
                        school_year=sy, title=title, event_type="quarter_break",
                        start_date=begin, end_date=begin + timedelta(days=length - 1),
                    )
                    made += 1
        self.stdout.write(f"  calendar: {made} events created")

    def _ensure_demo_advisories(self, current_sy, students, *, wipe):
        """
        Give the demo teacher three sections of the year in progress: the
        largest elementary, junior high and senior high class.

        seed_data.sql assigns this teacher sections of 2025-2026 -- the current
        year when it was written -- and this command assigned none, so in the
        year actually in progress the teacher's My Sections, grade entry and
        attendance pages had no learners at all.
        """
        from django.db.models import Count

        from accounts.models import User
        from enrollments.models import SectionAdvisory

        teacher = User.objects.filter(email=DEMO_TEACHER_EMAIL, role="teacher").first()
        if teacher is None:
            self.stdout.write(f"  advisories: skipped, no {DEMO_TEACHER_EMAIL} account")
            return

        if wipe:
            SectionAdvisory.objects.filter(
                teacher_user_id=teacher.user_id, section__in=SECTIONS,
            ).delete()

        classes = (
            Enrollment.objects.filter(
                school_year=current_sy, student__in=students, enrollment_status="enrolled",
            )
            .values("school_level", "grade_level", "section")
            .annotate(n=Count("pk"))
            .order_by("-n", "grade_level", "section")
        )
        largest = {}
        for c in classes:
            largest.setdefault(c["school_level"], c)

        made = 0
        for level in ("elementary", "junior_highschool", "senior_highschool"):
            c = largest.get(level)
            if c is None:
                continue
            _, created = SectionAdvisory.objects.get_or_create(
                teacher_user_id=teacher.user_id, school_year=current_sy,
                school_level=level, grade_level=c["grade_level"],
                section=c["section"], strand=None,
            )
            made += created
        self.stdout.write(f"  advisories: {made} created for {DEMO_TEACHER_EMAIL} in {current_sy}")

    # ── per-year seeding ────────────────────────────────────────────────────

    def _school_days(self, sy_start, sy_end, blocked):
        """Every weekday between the two dates that is not a holiday or break."""
        days, cursor = [], sy_start
        while cursor <= sy_end:
            if cursor.weekday() < 5 and cursor not in blocked:
                days.append(cursor)
            cursor += timedelta(days=1)
        return days

    def _blocked_dates(self, sy):
        blocked = set()
        for ev in CalendarEvent.objects.filter(
            school_year=sy, event_type__in=("holiday", "quarter_break", "school_day_off")
        ):
            cursor = ev.start_date
            while cursor <= ev.end_date:
                blocked.add(cursor)
                cursor += timedelta(days=1)
        return blocked

    def _periods_started(self, sy, through):
        """Which grading periods have begun by `through`.

        Derived from the same `quarter_break` events the risk model reads, so
        the seeded data and `resolve_period_window` agree about where the
        quarter boundaries are rather than each assuming their own.
        """
        breaks = list(
            CalendarEvent.objects
            .filter(school_year=sy, event_type="quarter_break")
            .order_by("start_date")
            .values_list("end_date", flat=True)
        )
        started = set()
        for i, period in enumerate(QUARTERS):
            # Quarter i opens when break i-1 ENDS -- the same boundary
            # resolve_period_window uses. The first opens with the year itself.
            opens = breaks[i - 1] if i and i - 1 < len(breaks) else None
            if opens is None or opens <= through:
                started.add(period)
        # Semesters split the same run in two.
        started.add(SEMESTERS[0])
        if len(breaks) >= 2 and breaks[1] <= through:
            started.add(SEMESTERS[1])
        return started

    def _second_semester_opens(self, sy):
        """The day the 2nd semester starts: the end of the semestral break
        (the second quarter break), as `_periods_started` counts it. None
        when the calendar has no such break."""
        breaks = list(
            CalendarEvent.objects
            .filter(school_year=sy, event_type="quarter_break")
            .order_by("start_date")
            .values_list("end_date", flat=True)
        )
        return breaks[1] if len(breaks) >= 2 else None

    def _seed_year(self, rng, students, sy, start_year, subjects_by_grade,
                   categories, is_current):
        sy_start = date(start_year, 6, 1)
        sy_end = date(start_year + 1, 3, 31)
        # The year in progress stops at `as_of`. Seeding a full year for a year
        # that has not finished would show completed grades for quarters the
        # school has not reached, and would leave the at-risk model nothing to
        # be early about -- which is the one thing it is for.
        if is_current and self.as_of < sy_end:
            sy_end = max(sy_start, self.as_of)
        school_days = self._school_days(sy_start, sy_end, self._blocked_dates(sy))
        open_periods = self._periods_started(sy, sy_end)
        # Senior high enrolls each semester as its own row (the enrollments
        # CHECK and every progression rule assume it), so a learner's year is
        # two rows split at the semestral break: grades, attendance and
        # observed values each land on the semester they belong to. One "1st"
        # row carrying both semesters' grades left Promote with no
        # 2nd-semester row to read and eligibility saying "Grade 11 2nd" for
        # learners already in Grade 12.
        second_semester_opens = self._second_semester_opens(sy)
        second_semester_open = SEMESTERS[1] in open_periods

        # Past years are closed; the current one is live. A handful of the
        # current year's rows carry the other statuses so the Enrollments
        # filters, the promotion screen and the transfer-out flow all have
        # something real to act on.
        enrollments, plans = [], []
        for student in students:
            age_then = age_during(student, start_year)
            index = AGE_TO_INDEX.get(age_then)
            if index is None:
                continue  # outside the ladder that year (too young, or graduated)

            grade, level = LADDER[index]
            ability, engagement = latent_traits(self.seed, student.student_id)

            if is_current:
                roll = rng.random()
                status = ("pending" if roll < 0.06 else
                          "cancelled" if roll < 0.09 else
                          "transferred_out" if roll < 0.11 else "enrolled")
            else:
                status = "completed"

            section = SECTIONS[student.student_id % 2 + (0 if level != "senior_highschool" else 2)]
            strand = (STRANDS[student.student_id % len(STRANDS)]
                      if level == "senior_highschool" else None)

            if level != "senior_highschool":
                rows = [(None, status)]
            elif not is_current:
                rows = [("1st", "completed"), ("2nd", "completed")]
            elif second_semester_open:
                # Only one row per school year may be active, so the 1st
                # semester is closed by the time the 2nd is under way.
                rows = [("1st", "completed"), ("2nd", status)]
            else:
                rows = [("1st", status)]

            for semester, row_status in rows:
                enrollments.append(Enrollment(
                    student=student, school_year=sy, school_level=level,
                    grade_level=grade, section=section, strand=strand,
                    semester=semester, enrollment_status=row_status,
                ))
                plans.append((student, grade, level, ability, engagement, row_status, semester))

        Enrollment.objects.bulk_create(enrollments, batch_size=200)
        # bulk_create against an unmanaged table does not reliably populate
        # PKs, so read them back keyed by student and semester.
        saved = {
            (e.student_id, e.semester): e
            for e in Enrollment.objects.filter(school_year=sy, student__in=students)
        }

        att_rows, grade_rows, narr_rows = [], [], []
        for student, grade, level, ability, engagement, status, semester in plans:
            enrollment = saved.get((student.student_id, semester))
            if enrollment is None or status in ("cancelled", "pending"):
                # A cancelled or not-yet-approved enrollment has no academic
                # record, which is the whole reason those statuses exist.
                continue

            # The 2nd-semester row draws its own numbers; everything else keeps
            # the stream it always had, so a rerun reproduces the same school.
            suffix = ":2nd" if semester == "2nd" else ""
            srng = random.Random(f"{self.seed}:{student.student_id}:{sy}{suffix}")
            days = school_days
            subjects = subjects_by_grade[grade]
            all_periods = QUARTERS
            if semester and second_semester_opens:
                days = [d for d in school_days
                        if (d >= second_semester_opens) == (semester == "2nd")]
            if semester:
                subjects = [s for s in subjects if (s.semester or "1st") == semester]
                all_periods = [f"{semester}_semester"]
            if status == "transferred_out":
                days = days[: int(len(days) * srng.uniform(0.25, 0.6))]

            absence_rate = self._absence_rate(engagement, srng)
            att_rows.extend(self._attendance_for(enrollment, days, absence_rate, srng))

            periods = [p for p in all_periods if p in open_periods] or all_periods[:1]
            if status == "transferred_out":
                periods = periods[: max(1, len(periods) // 2)]

            grade_rows.extend(self._grades_for(
                enrollment, subjects, periods,
                ability, engagement, absence_rate, srng,
            ))
            narr_rows.extend(self._narratives_for(
                enrollment, categories, periods, engagement, srng
            ))

        AttendanceRecord.objects.bulk_create(att_rows, batch_size=2000)
        Grade.objects.bulk_create(grade_rows, batch_size=1000)
        NarrativeReport.objects.bulk_create(narr_rows, batch_size=1000)

        return {
            "enrollments": len(enrollments),
            "attendance": len(att_rows),
            "grades": len(grade_rows),
            "narratives": len(narr_rows),
        }

    # ── signal generation ───────────────────────────────────────────────────

    def _absence_rate(self, engagement, rng):
        """Absence share for the year, driven by engagement.

        Centred near 4% for a typical learner and reaching the 20%+ band that
        DepEd Order 8 treats as non-promotion territory for the least engaged,
        so the at-risk model's anchors have something on both sides of them.
        """
        base = 0.055 - 0.028 * engagement
        return min(0.32, max(0.005, base + rng.gauss(0, 0.015)))

    def _attendance_for(self, enrollment, days, absence_rate, rng):
        rows = []
        for day in days:
            roll = rng.random()
            if roll < absence_rate * 0.72:
                status = "A"
            elif roll < absence_rate:
                status = "E"          # the rest of the absence is approved leave
            elif roll < absence_rate + 0.05:
                status = "L"
            else:
                status = "P"
            rows.append(AttendanceRecord(
                enrollment=enrollment, date=day, status=status,
            ))
        return rows

    def _grades_for(self, enrollment, subjects, periods, ability, engagement,
                    absence_rate, rng):
        """One grade per subject per period, transmuted per DO 8.

        The value is built as an Initial Grade and then run through
        `grading.deped.transmute`, the same function the grading calculator
        uses. That is what guarantees every row satisfies the 60-100 floor the
        serializer now enforces -- generating the final number directly would
        produce values no teacher could have arrived at.
        """
        rows = []
        # Absence costs marks, and the cost grows through the year -- which is
        # the relationship the trend signal and any classifier are meant to find.
        drag = 26.0 * max(0.0, absence_rate - 0.05)
        for subject in subjects:
            # A learner is better at some subjects than others, consistently
            # across the year.
            affinity = rng.gauss(0, 3.2)
            for i, period in enumerate(periods):
                progression = (i / max(1, len(periods) - 1)) if len(periods) > 1 else 0
                initial = (
                    78.0
                    + 7.5 * ability
                    + affinity
                    - drag * progression
                    + rng.gauss(0, 2.6)
                )
                initial = max(0.0, min(100.0, initial))
                final = transmute(Decimal(str(round(initial, 2))))
                rows.append(Grade(
                    enrollment=enrollment, subject=subject, grading_period=period,
                    numeric_grade=Decimal(final),
                    remarks="passed" if final >= PASSING_GRADE else "failed",
                ))
        return rows

    def _narratives_for(self, enrollment, categories, periods, engagement, rng):
        """Observed Values marks, in the DepEd AO/SO/RO/NO vocabulary.

        The older outstanding/satisfactory/needs_improvement vocabulary is still
        accepted by the model, but SF9 prints these marks under a legend that
        spells out AO/SO/RO/NO -- so seeding the generic words would reproduce
        the mismatch the report card already has.
        """
        rows = []
        for category in categories:
            for period in periods:
                roll = rng.gauss(engagement, 0.8)
                mark = ("AO" if roll > 0.9 else
                        "SO" if roll > -0.2 else
                        "RO" if roll > -1.2 else "NO")
                rows.append(NarrativeReport(
                    enrollment=enrollment, category=category,
                    grading_period=period, rating=mark,
                ))
        return rows
