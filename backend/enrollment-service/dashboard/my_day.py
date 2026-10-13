"""
Shaping for the teacher's home ("my day"): per section a teacher advises in
a school year, what today and this grading period still ask of them.

Same split as teachers_today.py: views.py runs the queries and hands plain
rows here, where every decision worth testing lives (most models are
`managed = False`, so there is no test database to query). The grading
period, the expected subjects and the no-class rule are teachers_today.py's
own, so the admin's "Teachers today" card and a teacher's home can't
disagree about what is due.
"""

from .teachers_today import PERIOD_LABELS, SCHOOL_LEVEL_LABELS, SHS, expected_subjects


def _period_for(level, period):
    """The period a section grades by now, and its due date: Senior High's
    semester, everyone else's quarter."""
    if level == SHS:
        return period["semester"], period["semester_due_date"]
    return period["key"], period["due_date"]


def shape_my_day(advisories, rosters, attendance, subjects, graded, narratives, category_ids, period, no_classes):
    """
    advisories:   [{"advisory_id", "school_level", "grade_level", "section", "strand"}]
    rosters:      {advisory_id: [enrollment_id, ...]} -- enrolled learners
    attendance:   {advisory_id: {"P": n, "A": n, "L": n, "E": n}} -- today's saved marks
    subjects:     [{"subject_id", "subject_code", "subject_name", "school_level",
                    "grade_level", "strand", "semester"}] -- the year's
    graded:       {period_key: {(enrollment_id, subject_id), ...}}
    narratives:   {period_key: {(enrollment_id, category_id), ...}}
    category_ids: the active narrative categories
    period:       teachers_today.current_grading_period(...)
    no_classes:   teachers_today.no_classes_today(...)
    """
    by_id = {s["subject_id"]: s for s in subjects}
    out = []
    for a in advisories:
        level = a["school_level"]
        students = rosters.get(a["advisory_id"], [])
        marks = attendance.get(a["advisory_id"], {})
        marked = sum(marks.get(k, 0) for k in ("P", "A", "L", "E"))
        period_key, due = _period_for(level, period)

        subject_ids = expected_subjects(level, a["grade_level"], a.get("strand"), subjects, period_key)
        if subject_ids:
            pairs = graded.get(period_key, set())
            rows = []
            for sid in sorted(subject_ids, key=lambda i: (by_id[i].get("subject_name") or "", i)):
                done = sum(1 for eid in students if (eid, sid) in pairs)
                rows.append({
                    "subject_id":   sid,
                    "subject_code": by_id[sid].get("subject_code"),
                    "subject_name": by_id[sid].get("subject_name"),
                    "done":         done,
                    "expected":     len(students),
                    "complete":     done >= len(students),
                })
            done = sum(r["done"] for r in rows)
            expected = len(students) * len(rows)
            grades = {
                "period": period_key, "label": PERIOD_LABELS[period_key], "due_date": due,
                "done": done, "expected": expected, "complete": done >= expected,
                "subjects": rows,
            }
        else:
            # No subjects set up for this grade: nothing to measure.
            grades = None

        if category_ids:
            pairs = narratives.get(period_key, set())
            done = sum(1 for eid in students for cid in category_ids if (eid, cid) in pairs)
            expected = len(students) * len(category_ids)
            narrative = {
                "period": period_key, "label": PERIOD_LABELS[period_key],
                "done": done, "expected": expected, "complete": done >= expected,
            }
        else:
            narrative = None

        out.append({
            "advisory_id":  a["advisory_id"],
            "school_level": level,
            "level_label":  SCHOOL_LEVEL_LABELS.get(level, level),
            "grade_level":  a["grade_level"],
            "section":      a["section"],
            "strand":       a.get("strand") or None,
            "students":     len(students),
            "attendance": {
                # Taken once any mark is saved; `unmarked` says who is left.
                "taken":    marked > 0,
                "marked":   marked,
                "unmarked": max(len(students) - marked, 0),
                "present":  marks.get("P", 0),
                "late":     marks.get("L", 0),
                "absent":   marks.get("A", 0),
                "excused":  marks.get("E", 0),
            },
            "grades":    grades,
            "narrative": narrative,
        })

    return {"no_classes": no_classes, "grading_period": period, "sections": out}
