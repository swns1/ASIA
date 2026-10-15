"""
Shaping functions for GET /api/dashboard/attendance-days/: each day's saved
attendance, for the Academic Calendar's day counts and the homes' day
stepper ("on Oct 9, 312 of 340 learners were present").

Same split as teachers_today.py, whose counting it shares (tally_marks,
summarize_attendance): views.py runs the queries and hands plain rows here.

"Present" is the school's usual definition: late learners attended. The
answer still carries late on its own, so a breakdown can show it.
"""
from datetime import timedelta

from .teachers_today import (
    SCHOOL_LEVEL_LABELS,
    no_classes_today,
    section_sort_key,
    section_taken,
    summarize_attendance,
    tally_marks,
)

# A calendar month with its spill-over weeks is at most 42 days; two months
# leaves room without letting one request read a whole year row by row.
MAX_DAYS = 62


def days_between(date_from, date_to, today):
    """Every date from date_from through date_to, none after today: no
    attendance can be saved for a day that hasn't come (the bulk endpoint
    refuses it), so a future day has nothing to count."""
    last = min(date_to, today)
    return [date_from + timedelta(days=i) for i in range((last - date_from).days + 1)]


def year_for_dates(date_from, date_to, years):
    """
    The registered school year the dates fall in, for a caller that asks by
    date (the Academic Calendar): its months don't line up with school years
    (it files June under the year ending, while the registry starts the next
    year on June 1), so the date decides, not the page's year.

    years: [{"label", "start_date", "end_date"}] from the registry.
    The latest-starting year that overlaps the dates, or None for a break
    between years.
    """
    overlapping = [y for y in years if y["start_date"] <= date_to and y["end_date"] >= date_from]
    return max(overlapping, key=lambda y: y["start_date"])["label"] if overlapping else None


def _no_classes_on(day, events):
    return no_classes_today(day, [e for e in events if e["start_date"] <= day <= e["end_date"]])


def _section(key, sections, counts, advisory_ids):
    level, grade, section, strand = key
    marks = counts.get(key, {})
    marked = sum(marks.values())
    students = len(sections[key])
    return {
        "advisory_id":  advisory_ids.get(key),
        "school_level": level,
        "level_label":  SCHOOL_LEVEL_LABELS.get(level, level),
        "grade_level":  grade,
        "section":      section,
        "strand":       strand or None,
        "students":     students,
        "marked":       marked,
        "unmarked":     max(students - marked, 0),
        "taken":        section_taken(key, sections, counts),
        "present":      marks.get("P", 0),
        "late":         marks.get("L", 0),
        "absent":       marks.get("A", 0),
        "excused":      marks.get("E", 0),
    }


def shape_attendance_days(dates, sections, attendance_rows, no_class_events, with_sections=False, advisory_ids=None):
    """
    dates:           [date, ...] -- days_between(...)
    sections:        {key: [enrollment_id, ...]} -- the learners the caller
                     may see, per section
    attendance_rows: [{"date": date, "key": key, "status": "P", "n": 30}]
    no_class_events: [{"event_type", "title", "start_date", "end_date"}]
                     holidays, days off and breaks overlapping the dates
    with_sections:   add each section's marks to every day (the calendar's
                     day panel asks for one day with them)
    advisory_ids:    {key: advisory_id} -- a teacher's own sections, so the
                     answer can link to My Sections

    One entry per date. `attended` is present plus late; `enrolled` is every
    learner in `sections`, so `unmarked` is who has no mark that day.
    """
    advisory_ids = advisory_ids or {}
    by_day = {}
    for row in attendance_rows:
        by_day.setdefault(row["date"], []).append(row)
    enrolled = sum(len(eids) for eids in sections.values())

    days = []
    for day in dates:
        counts = tally_marks(sections, by_day.get(day, []))
        summary = summarize_attendance(sections, counts)
        marked = sum(sum(c.values()) for c in counts.values())
        entry = {
            "date":       day.isoformat(),
            "no_classes": _no_classes_on(day, no_class_events),
            "enrolled":   enrolled,
            "marked":     marked,
            "unmarked":   max(enrolled - marked, 0),
            "attended":   summary["present"] + summary["late"],
            **summary,
        }
        if with_sections:
            entry["sections"] = [
                _section(key, sections, counts, advisory_ids)
                for key in sorted(sections, key=section_sort_key)
            ]
        days.append(entry)
    return days
