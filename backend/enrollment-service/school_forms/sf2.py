"""
SF2 Daily Attendance Report of Learners for one month, written into DepEd's
own sheet.

Nursery to Grade 10 use the SF2 from DepEd's DO 4, s. 2014 workbook, whose 25
day columns are filled with the month's class days in order, date above and
weekday below, as its own instruction says. Senior high uses the LIS SF2-SHS,
which prints the weekdays itself (five weeks of Monday to Saturday), so each
class day goes under its weekday.

DepEd's legend: a blank cell is present, "x" is absent, and a tardy is the
cell's upper half shaded, written here as ◤.
"""
from datetime import timedelta

from . import cells
from .records import by_sex_then_name, register_name, short_date
from .workbook import (
    TEMPLATE_DIR, add_picture, ensure_merged, insert_rows, load_template, merge_rows, put,
    shift_ref,
)

PRESENT = ("P", "L")
ABSENT = ("A", "E")   # DepEd's grid has no "excused"; an absence is an absence.
MARKS = {"A": "x", "E": "x", "L": "◤"}
WEEKDAY = ("M", "T", "W", "TH", "F", "S", "SU")
STREAK = 5            # DepEd asks for learners absent five days in a row.


def month_end(month):
    nxt = (month.replace(day=28) + timedelta(days=4)).replace(day=1)
    return nxt - timedelta(days=1)


def day_slots(m, month, class_days):
    """{date: column} for the days that fit, and the days that don't."""
    slots, overflow = {}, []
    if m.days_per_week is None:
        for i, day in enumerate(class_days):
            if i < len(m.day_columns):
                slots[day] = m.day_columns[i]
            else:
                overflow.append(day)
        return slots, overflow
    if not class_days:
        return slots, overflow
    week_start = class_days[0] - timedelta(days=class_days[0].weekday())
    for day in class_days:
        week = (day - week_start).days // 7
        index = week * m.days_per_week + day.weekday()
        if day.weekday() < m.days_per_week and index < len(m.day_columns):
            slots[day] = m.day_columns[index]
        else:
            overflow.append(day)
    return slots, overflow


def tally(learner, days, marks):
    """(present, absent, tardy, longest run of absences) over `days`."""
    present = absent = tardy = run = longest = 0
    for day in days:
        status = marks.get((learner.enrollment_id, day))
        if status in PRESENT:
            present += 1
        if status == "L":
            tardy += 1
        if status in ABSENT:
            absent += 1
            run += 1
            longest = max(longest, run)
        else:
            run = 0
    return present, absent, tardy, longest


def in_class_at_month_end(learner, last_day):
    """Still registered on the last day of the month."""
    if learner.transfer_in and learner.transfer_in.effective_date > last_day:
        return False
    if learner.transfer_out and learner.transfer_out.effective_date <= last_day:
        return False
    if learner.status == "transferred_out" and not learner.transfer_out:
        return False
    return not (learner.student_status == "dropped" and learner.status == "enrolled")


def summary(data):
    """The month's summary box, as {field: (male, female, total)}."""
    first, last = data.month, month_end(data.month)
    days = list(data.class_days)

    def by_sex(learners, value=lambda l: 1):
        male = sum(value(l) for l in learners if (l.sex or "").lower() == "male")
        female = sum(value(l) for l in learners if (l.sex or "").lower() == "female")
        return male, female, male + female

    enrolment = by_sex([l for l in data.roster if l.transfer_in is None])
    registered = by_sex([l for l in data.roster if in_class_at_month_end(l, last)])
    present = by_sex(data.listed, lambda l: tally(l, days, data.marks)[0])

    def ratio(a, b):
        return a / b if b else None

    ada = tuple(round(p / len(days), 2) if days else None for p in present)
    out = {
        "enrolment": enrolment,
        "registered": registered,
        "percent_enrolment": tuple(ratio(r, e) for r, e in zip(registered, enrolment)),
        "average_daily_attendance": ada,
        "percent_attendance": tuple(
            ratio(a, r) if a is not None else None for a, r in zip(ada, registered)
        ),
        "five_consecutive_absences": by_sex(
            [l for l in data.listed if tally(l, days, data.marks)[3] >= STREAK]
        ),
        "transferred_out": by_sex([
            l for l in data.roster
            if l.transfer_out and first <= l.transfer_out.effective_date <= last
        ]),
        "transferred_in": by_sex([
            l for l in data.roster
            if l.transfer_in and first <= l.transfer_in.effective_date <= last
        ]),
    }
    return out


def remarks(learner, first, last):
    notes = []
    t_in, t_out = learner.transfer_in, learner.transfer_out
    if t_in and first <= t_in.effective_date <= last:
        notes.append(f"Transferred in from {t_in.school or 'another school'} ({short_date(t_in.effective_date)})")
    if t_out and first <= t_out.effective_date <= last:
        notes.append(f"Transferred out to {t_out.school or 'another school'} ({short_date(t_out.effective_date)})")
    if learner.student_status == "dropped" and learner.status == "enrolled":
        notes.append("Dropped")
    return "; ".join(notes)


def build(data):
    """Returns (workbook, warnings)."""
    shs = data.section.school_level == "senior_highschool"
    m = cells.SF2_SHS if shs else cells.SF2
    wb = load_template(m.template, [m.sheet])
    ws = wb[m.sheet]
    warnings = []
    first, last = data.month, month_end(data.month)
    month_text = f"{data.month:%B} {data.month.year}"

    school, section = data.school, data.section
    header = {
        "school_id": school.school_id, "school_name": school.name, "region": school.region,
        "division": school.division, "district": school.district,
        "school_year": section.school_year, "grade_level": section.grade_level,
        "section": section.section, "track_strand": section.strand,
        "semester": {"1st": "1st Semester", "2nd": "2nd Semester"}.get(section.semester, ""),
        "month": month_text,
    }
    for span in m.header_merges:
        ensure_merged(ws, span)
    for name, ref in m.header.items():
        put(ws, ref, header.get(name) or "")

    slots, overflow = day_slots(m, data.month, data.class_days)
    if overflow:
        warnings.append(
            f"{len(overflow)} class day(s) did not fit DepEd's day columns and were left off: "
            + ", ".join(short_date(d) for d in overflow) + "."
        )
    days = [d for d in data.class_days if d in slots]
    for day, col in slots.items():
        put(ws, f"{col}{m.date_row}", day.day)
        if m.day_row:
            put(ws, f"{col}{m.day_row}", WEEKDAY[day.weekday()])

    recorded_days = {day for (_, day) in data.marks}
    unrecorded = [d for d in days if d not in recorded_days]
    missing = sum(
        1 for l in data.listed for d in days
        if d in recorded_days and (l.enrollment_id, d) not in data.marks
        and _was_in_class(l, d)
    )
    if unrecorded:
        warnings.append(
            f"No attendance was recorded on {len(unrecorded)} class day(s): "
            + ", ".join(short_date(d) for d in unrecorded)
            + ". Those columns are left empty with no daily total."
        )
    if missing:
        warnings.append(
            f"{missing} learner-day(s) have no attendance record. DepEd reads a blank cell as present."
        )
    if data.left_off:
        # A count, not names: warnings travel in a response header.
        warnings.append(
            f"{len(data.left_off)} learner(s) on the roster have no attendance this month "
            "and were left off the form."
        )

    ordered = sorted(data.listed, key=by_sex_then_name)
    lists = [
        [l for l in ordered if (l.sex or "").lower() != "female"],
        [l for l in ordered if (l.sex or "").lower() == "female"],
    ]
    c = m.columns
    offset = 0
    totals = []
    for group, learners in zip(m.groups, lists):
        first_row = group.first_row + offset
        last_row = group.last_row + offset
        extra = max(0, len(learners) - group.capacity)
        insert_rows(ws, last_row + 1, extra, style_row=last_row)
        merge_rows(ws, range(first_row, last_row + extra + 1), m.row_merges)
        for row in range(first_row, last_row + extra + 1):
            put(ws, f"{c['number']}{row}", None)  # SF2-SHS arrives pre-numbered
        group_absent = group_tardy = 0
        for i, learner in enumerate(learners):
            row = first_row + i
            put(ws, f"{c['number']}{row}", i + 1)
            put(ws, f"{c['name']}{row}", register_name(learner))
            for day, col in slots.items():
                mark = MARKS.get(data.marks.get((learner.enrollment_id, day)))
                if mark:
                    put(ws, f"{col}{row}", mark)
            _, absent, tardy, _ = tally(learner, days, data.marks)
            group_absent += absent
            group_tardy += tardy
            if absent:
                put(ws, f"{c['absent']}{row}", absent)
            if tardy:
                put(ws, f"{c['tardy']}{row}", tardy)
            note = remarks(learner, first, last)
            if note:
                put(ws, f"{c['remarks']}{row}", note)
        offset += extra
        total_row = group.total_row + offset
        _write_day_totals(ws, total_row, slots, learners, data.marks, recorded_days)
        put(ws, f"{c['absent']}{total_row}", group_absent, number_format="0", shrink=True)
        put(ws, f"{c['tardy']}{total_row}", group_tardy, number_format="0", shrink=True)
        totals.append((group_absent, group_tardy))
    combined = m.combined_row + offset
    _write_day_totals(ws, combined, slots, ordered, data.marks, recorded_days)
    put(ws, f"{c['absent']}{combined}", sum(t[0] for t in totals), number_format="0", shrink=True)
    put(ws, f"{c['tardy']}{combined}", sum(t[1] for t in totals), number_format="0", shrink=True)

    # The box beside "Month:" is narrow; the year is in the header already.
    put(ws, shift_ref(m.month_cell, offset), f"{data.month:%B}", shrink=True)
    put(ws, shift_ref(m.class_days_cell, offset), len(days), number_format="0", shrink=True)
    figures = summary(data)
    # DepEd's own formats for the box: whole percentages, ADA to two places.
    formats = {
        "percent_enrolment": "0%", "percent_attendance": "0%",
        "average_daily_attendance": "0.00",
    }
    for name, row in m.summary_rows.items():
        values = figures.get(name)
        if values is None:
            continue   # late enrolment and drop-outs: SLIS records no date for them
        for col, value in zip(m.summary_columns, values):
            if value is not None:
                put(ws, f"{col}{row + offset}", value, number_format=formats.get(name, "0"), shrink=True)

    for span in m.signature_merges:
        a, _, b = span.partition(":")
        ensure_merged(ws, f"{shift_ref(a, offset)}:{shift_ref(b, offset)}")
    put(ws, shift_ref(m.signatures["adviser"], offset), ", ".join(section.advisers))
    put(ws, shift_ref(m.signatures["school_head"], offset), school.head)

    if m.picture:
        p = m.picture
        add_picture(
            ws, TEMPLATE_DIR / "deped-wordmark.png",
            col=p.col, row=p.row, col_off=p.col_off, row_off=p.row_off, cx=p.cx, cy=p.cy,
        )
    if not ordered:
        warnings.append("No learners were in this section during the month.")
    return wb, warnings


def _was_in_class(learner, day):
    if learner.transfer_in and day < learner.transfer_in.effective_date:
        return False
    if learner.transfer_out and day >= learner.transfer_out.effective_date:
        return False
    return True


def _write_day_totals(ws, row, slots, learners, marks, recorded_days):
    """Learners present each day; nothing on a day no attendance was taken."""
    for day, col in slots.items():
        if day not in recorded_days:
            continue
        present = sum(1 for l in learners if marks.get((l.enrollment_id, day)) in PRESENT)
        put(ws, f"{col}{row}", present, number_format="0", shrink=True)
