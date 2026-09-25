"""
Shaping functions for the admin home's "Teachers today" card.

Same split as services.py: views.py runs the queries and hands plain rows to
these pure functions, which hold every decision worth testing (most models
here are `managed = False`, so there is no test database to query).

The card answers two questions per section:
  * has attendance been taken today, and
  * are this grading period's grades in?

**Which grading period is "this" one** comes from the Academic Calendar's
grading_period events: the latest quarter that has started. Between quarters
that is still the one that just ended, since its grades are what teachers are
finishing. If the school has not entered quarter dates yet, it falls back to
the latest quarter that has any grades, with no due date.

Senior High grades by semester (see GRADING_PERIODS_BY_LEVEL in the frontend),
so its sections are measured against the semester that contains the current
quarter, due when that semester's last quarter ends.
"""

QUARTERS = ["1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"]

PERIOD_LABELS = {
    "1st_quarter":  "1st Quarter",
    "2nd_quarter":  "2nd Quarter",
    "3rd_quarter":  "3rd Quarter",
    "4th_quarter":  "4th Quarter",
    "1st_semester": "1st Semester",
    "2nd_semester": "2nd Semester",
}

SEMESTER_OF_QUARTER = {
    "1st_quarter": "1st_semester",
    "2nd_quarter": "1st_semester",
    "3rd_quarter": "2nd_semester",
    "4th_quarter": "2nd_semester",
}
# The quarter whose end date closes each semester.
SEMESTER_LAST_QUARTER = {"1st_semester": "2nd_quarter", "2nd_semester": "4th_quarter"}
# Subject.semester stores "1st"/"2nd", not the grading-period key.
SUBJECT_SEMESTER = {"1st_semester": "1st", "2nd_semester": "2nd"}

SHS = "senior_highschool"

SCHOOL_LEVEL_ORDER = ["nursery", "kindergarten", "elementary", "junior_highschool", SHS]
SCHOOL_LEVEL_LABELS = {
    "nursery":           "Nursery",
    "kindergarten":      "Kindergarten",
    "elementary":        "Elementary",
    "junior_highschool": "Junior High",
    SHS:                 "Senior High",
}

# Calendar event types during which no attendance is expected.
NO_CLASS_EVENT_TYPES = {"holiday", "school_day_off", "quarter_break"}
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def section_key(school_level, grade_level, section, strand):
    """One section's identity. A missing strand is None on some rows and ""
    on others, so both collapse to "" or the same section splits in two."""
    return (school_level, grade_level, section, (strand or "").strip())


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def current_grading_period(quarter_events, today, graded_quarters=()):
    """
    quarter_events:  [{"grading_period": "1st_quarter", "start_date": date, "end_date": date}]
    graded_quarters: quarter keys that already have at least one grade this
                     school year; only consulted when there are no events.

    Returns the quarter plus the semester that contains it, each with its due
    date (None when unknown), and `source`: "calendar", "grades" or "default".
    """
    events = {
        e["grading_period"]: e for e in quarter_events
        if e.get("grading_period") in QUARTERS
    }

    if events:
        started = [q for q in events if events[q]["start_date"] <= today]
        pool = started or list(events)
        pick = max if started else min
        key = pick(pool, key=lambda q: events[q]["start_date"])
        due = events[key]["end_date"]
        source = "calendar"
    else:
        graded = [q for q in QUARTERS if q in set(graded_quarters)]
        key = graded[-1] if graded else QUARTERS[0]
        due = None
        source = "grades" if graded else "default"

    semester = SEMESTER_OF_QUARTER[key]
    closing = events.get(SEMESTER_LAST_QUARTER[semester])
    return {
        "key":               key,
        "label":             PERIOD_LABELS[key],
        "due_date":          _iso(due),
        "semester":          semester,
        "semester_label":    PERIOD_LABELS[semester],
        "semester_due_date": _iso(closing["end_date"]) if closing else None,
        "source":            source,
    }


def no_classes_today(today, events_today):
    """
    events_today: [{"event_type": "holiday", "title": "..."}] covering today.

    Returns {"label": ...} when no attendance is expected today, else None.
    A weekend wins over an event so the card says "Saturday", not the name of
    a long break that happens to span it.
    """
    if today.weekday() >= 5:
        return {"label": WEEKDAY_NAMES[today.weekday()]}
    for event in events_today:
        if event.get("event_type") in NO_CLASS_EVENT_TYPES:
            return {"label": event.get("title") or "No classes"}
    return None


def expected_subjects(school_level, grade_level, strand, subjects, semester):
    """
    The subject ids a section's students should each have a grade in.

    Below Senior High this is every subject for the level and grade — the same
    list the Grades page offers. Senior High subjects can also be tied to a
    strand and a semester; one tied to another strand or the other semester
    is not expected of this section now.
    """
    strand = (strand or "").strip().lower()
    wanted_sem = SUBJECT_SEMESTER.get(semester)
    ids = set()
    for s in subjects:
        if s["school_level"] != school_level or s["grade_level"] != grade_level:
            continue
        if school_level == SHS:
            if s.get("strand") and s["strand"].strip().lower() != strand:
                continue
            if s.get("semester") and s["semester"] != wanted_sem:
                continue
        ids.add(s["subject_id"])
    return ids


def _grade_sort_value(grade_level):
    digits = "".join(ch for ch in str(grade_level) if ch.isdigit())
    return int(digits) if digits else 0


def _section_sort_key(key):
    level, grade, section, strand = key
    level_rank = SCHOOL_LEVEL_ORDER.index(level) if level in SCHOOL_LEVEL_ORDER else len(SCHOOL_LEVEL_ORDER)
    return (level_rank, _grade_sort_value(grade), strand.lower(), section.lower())


def shape_teachers_today(sections, advisers, attendance_rows, subjects, graded, period, no_classes):
    """
    sections:        {key: [enrollment_id, ...]} — enrolled students per section
    advisers:        {key: ["Teacher name", ...]}
    attendance_rows: [{"key": key, "status": "P", "n": 30}] for today
    subjects:        [{"subject_id", "school_level", "grade_level", "strand", "semester"}]
    graded:          {"2nd_quarter": {(enrollment_id, subject_id), ...}, "1st_semester": {...}}
    period:          current_grading_period(...)
    no_classes:      no_classes_today(...)
    """
    taken = set()
    totals = {"P": 0, "A": 0, "L": 0, "E": 0}
    for row in attendance_rows:
        if row["key"] not in sections:
            continue
        taken.add(row["key"])
        if row["status"] in totals:
            totals[row["status"]] += row["n"]

    out = []
    for key in sorted(sections, key=_section_sort_key):
        level, grade, section, strand = key
        students = sections[key]
        if level == SHS:
            period_key, due = period["semester"], period["semester_due_date"]
        else:
            period_key, due = period["key"], period["due_date"]

        subject_ids = expected_subjects(level, grade, strand, subjects, period_key)
        if subject_ids:
            pairs = graded.get(period_key, set())
            done = sum(1 for eid in students for sid in subject_ids if (eid, sid) in pairs)
            expected = len(students) * len(subject_ids)
            grades = {
                "period":   period_key,
                "label":    PERIOD_LABELS[period_key],
                "due_date": due,
                "done":     done,
                "expected": expected,
                "complete": done >= expected,
            }
        else:
            # No subjects set up for this grade: nothing to measure, so it
            # counts toward neither side of "N of M sections complete".
            grades = None

        out.append({
            "school_level":     level,
            "level_label":      SCHOOL_LEVEL_LABELS.get(level, level),
            "grade_level":      grade,
            "section":          section,
            "strand":           strand or None,
            "students":         len(students),
            "advisers":         sorted(advisers.get(key, [])),
            "attendance_taken": key in taken,
            "grades":           grades,
        })

    countable = totals["P"] + totals["A"] + totals["L"]
    graded_sections = [s for s in out if s["grades"]]
    return {
        "no_classes":     no_classes,
        "grading_period": period,
        "attendance": {
            "sections_taken": len(taken),
            "sections_total": len(out),
            "present":        totals["P"],
            "late":           totals["L"],
            "absent":         totals["A"],
            "excused":        totals["E"],
            # Same definition as shape_attendance_series: late attended,
            # excused leaves the denominator.
            "rate": round((totals["P"] + totals["L"]) / countable, 4) if countable else None,
        },
        "grades": {
            "sections_complete": sum(1 for s in graded_sections if s["grades"]["complete"]),
            "sections_total":    len(graded_sections),
        },
        "sections": out,
    }
