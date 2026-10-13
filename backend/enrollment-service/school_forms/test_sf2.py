"""SF2 Daily Attendance: day columns, marks, totals and DepEd's summary box."""
from datetime import date, timedelta

import pytest

from school_forms import cells, sf2
from school_forms.records import AttendanceData, Learner, School, SectionInfo, Transfer
from school_forms.workbook import top_left

SCHOOL = School(name="South Lakes Integrated School", school_id="401234", head="Maria Santos")
SEPTEMBER = date(2026, 9, 1)
# Tuesday 1 September 2026; the 4th is a holiday.
CLASS_DAYS = tuple(
    d for d in (SEPTEMBER + timedelta(n) for n in range(30))
    if d.weekday() < 5 and d != date(2026, 9, 4)
)


def learner(i, sex="male", **kw):
    return Learner(enrollment_id=i, student_id=i, lrn=str(i), last_name=f"Cruz{i:03d}",
                   first_name="Juan" if sex == "male" else "Ana", sex=sex, **kw)


def data(learners, marks, level="junior_highschool", grade="Grade 7", semester="", listed=None, left_off=()):
    return AttendanceData(
        school=SCHOOL,
        section=SectionInfo("2026-2027", level, grade, "Rizal", semester=semester, advisers=("Ms. Adviser",)),
        month=SEPTEMBER, class_days=CLASS_DAYS, roster=tuple(learners),
        listed=tuple(listed if listed is not None else learners), marks=marks, left_off=tuple(left_off),
    )


def all_present(learners, days=CLASS_DAYS):
    return {(l.enrollment_id, d): "P" for l in learners for d in days}


def cell(ws, ref):
    value = top_left(ws, ref).value
    # DepEd's labels carry stray spaces; values are compared as written.
    return " ".join(value.split()) if isinstance(value, str) else value


def test_class_days_fill_the_day_columns_in_order():
    m = cells.SF2
    slots, overflow = sf2.day_slots(m, SEPTEMBER, list(CLASS_DAYS))
    assert overflow == []
    assert slots[date(2026, 9, 1)] == "D" and slots[date(2026, 9, 3)] == "F"
    assert slots[date(2026, 9, 7)] == "G"  # the holiday took no column


def test_senior_high_days_go_under_deped_printed_weekdays():
    m = cells.SF2_SHS
    slots, overflow = sf2.day_slots(m, SEPTEMBER, list(CLASS_DAYS))
    assert overflow == []
    assert slots[date(2026, 9, 1)] == "H"      # Tuesday, week 1
    assert slots[date(2026, 9, 7)] == "M"      # Monday, week 2
    assert slots[date(2026, 9, 30)] == "AM"    # Wednesday, week 5


def test_marks_totals_and_the_header():
    boys = [learner(1), learner(2)]
    girls = [learner(3, "female")]
    marks = all_present(boys + girls)
    marks[(1, date(2026, 9, 2))] = "A"
    marks[(1, date(2026, 9, 3))] = "E"
    marks[(2, date(2026, 9, 2))] = "L"
    wb, warnings = sf2.build(data(boys + girls, marks))
    ws = wb.active
    assert warnings == []
    assert (cell(ws, "C6"), cell(ws, "K6"), cell(ws, "X6")) == ("401234", "2026-2027", "September 2026")
    assert (cell(ws, "D11"), cell(ws, "D12"), cell(ws, "E12")) == (1, "T", "W")
    assert cell(ws, "B14") == "Cruz001, Juan"
    assert (cell(ws, "E14"), cell(ws, "F14"), cell(ws, "E15")) == ("x", "x", "◤")
    assert cell(ws, "D14") in (None, "")       # present is blank, as DepEd's legend says
    assert (cell(ws, "AC14"), cell(ws, "AD15")) == (2, 1)
    # Per-day totals count who was present (tardy included).
    assert (cell(ws, "D35"), cell(ws, "E35"), cell(ws, "F35")) == (2, 1, 1)
    assert cell(ws, "B36") == "Cruz003, Ana"
    assert (cell(ws, "D61"), cell(ws, "D62")) == (1, 3)
    assert (cell(ws, "AC35"), cell(ws, "AD35"), cell(ws, "AC62")) == (2, 1, 2)
    assert cell(ws, "AD64") == "September" and cell(ws, "AG64") == len(CLASS_DAYS)
    assert cell(ws, "AD88") == "Ms. Adviser" and cell(ws, "AD92") == "Maria Santos"


def test_summary_box():
    out = learner(1, status="transferred_out", transfer_out=Transfer("transfer_out", date(2026, 9, 15), "X"))
    arrived = learner(2, transfer_in=Transfer("transfer_in", date(2026, 9, 10), "Y"))
    stayed = learner(3)
    girl = learner(4, "female")
    marks = all_present([stayed, girl])
    marks.update(all_present([out], [d for d in CLASS_DAYS if d < date(2026, 9, 15)]))
    marks.update(all_present([arrived], [d for d in CLASS_DAYS if d >= date(2026, 9, 10)]))
    for d in CLASS_DAYS[:5]:
        marks[(4, d)] = "A"                    # five days running
    figures = sf2.summary(data([out, arrived, stayed, girl], marks))
    assert figures["enrolment"] == (2, 1, 3)               # the transferee came later
    assert figures["registered"] == (2, 1, 3)              # one left, one came
    assert figures["percent_enrolment"] == (1.0, 1.0, 1.0)
    assert figures["five_consecutive_absences"] == (0, 1, 1)
    assert figures["transferred_out"] == (1, 0, 1)
    assert figures["transferred_in"] == (1, 0, 1)
    days = len(CLASS_DAYS)
    before_arrival = sum(1 for d in CLASS_DAYS if d < date(2026, 9, 10))
    before_leaving = sum(1 for d in CLASS_DAYS if d < date(2026, 9, 15))
    male_present = days + (days - before_arrival) + before_leaving
    assert figures["average_daily_attendance"][0] == round(male_present / days, 2)
    # The girl: present on every day but her five absences, out of one registered.
    assert figures["percent_attendance"][1] == pytest.approx(round((days - 5) / days, 2) / 1)


def test_warnings_for_gaps_in_the_record():
    a, b = learner(1), learner(2)
    marks = all_present([a, b], [d for d in CLASS_DAYS if d != date(2026, 9, 21)])
    del marks[(2, date(2026, 9, 8))]
    wb, warnings = sf2.build(data([a, b], marks, left_off=[learner(9)]))
    text = " ".join(warnings)
    assert "No attendance was recorded on 1 class day(s): 09/21/2026" in text
    assert "1 learner-day(s) have no attendance record" in text
    assert "1 learner(s) on the roster have no attendance this month" in text
    # A day nobody took attendance gets no daily total.
    col = sf2.day_slots(cells.SF2, SEPTEMBER, list(CLASS_DAYS))[0][date(2026, 9, 21)]
    assert top_left(wb.active, f"{col}35").value in (None, "")


def test_a_big_class_grows_both_blocks():
    boys = [learner(i) for i in range(25)]
    girls = [learner(100 + i, "female") for i in range(30)]
    ws = sf2.build(data(boys + girls, all_present(boys + girls)))[0].active
    # 25 boys in a block of 21: four more rows, the total at 39.
    assert cell(ws, "A39") == "MALE | TOTAL Per Day"
    assert cell(ws, "D39") == 25
    # 30 girls in a block of 25, after those four: five more.
    assert cell(ws, "A70") == "FEMALE | TOTAL Per Day"
    assert cell(ws, "A71") == "Combined TOTAL PER DAY"
    assert cell(ws, "D71") == 55
    assert cell(ws, f"AH{66 + 9}") == 25        # enrolment row, moved down nine


def test_senior_high_layout():
    boys = [learner(1)]
    marks = all_present(boys)
    ws = sf2.build(data(boys, marks, level="senior_highschool", grade="Grade 11", semester="1st"))[0].active
    assert ws.title == "SHSF-2"
    assert (cell(ws, "F5"), cell(ws, "AV7")) == ("1st Semester", "September 2026")
    assert (cell(ws, "H10"), cell(ws, "M10")) == (1, 7)
    assert cell(ws, "C12") == "Cruz001, Juan"
    assert cell(ws, "A13") in (None, "")       # DepEd's pre-printed numbers cleared
    assert cell(ws, "AR61") == "September"
    assert (cell(ws, "AW62"), cell(ws, "AY62")) == (1, 1)
