"""
The SF9 report card: DepEd's folded card with the school's letterhead on
its cover. What each of its four panels prints, what a year earns on the
Certificate of Transfer, and what the card warns about. The PDF is read back
with test_cor.pages(); the grades are test_sf10's, from the school's own
records.
"""
import re
from dataclasses import replace
from datetime import date, timedelta
from decimal import Decimal

from school_forms import sf9, sf10
from school_forms.records import (
    BehaviorRow, MonthAttendance, ReportCardData, School, SectionInfo, SubjectRecord,
)
from school_forms.test_cor import pages
from school_forms.test_sf10 import GRADE_5, HUMSS, LEARNER, Q, SCHOOL, subject, year

SEMESTERS = ("1st_semester", "2nd_semester")
SCHOOL_WITH_DEPED = replace(SCHOOL, region="Region IV-A (CALABARZON)", district="San Pablo City District I")
BEHAVIOR = (
    BehaviorRow("Attentiveness", "Pays attention and stays focused during lessons.",
                {"1st_quarter": "AO", "2nd_quarter": "SO"}),
    BehaviorRow("Task completion", "Finishes classwork and homework and hands them in on time.",
                {"1st_quarter": "RO"}),
)


def months(*counts, start=date(2024, 6, 1)):
    """MonthAttendance from (school days, present, absent) per month; None for a blank month."""
    out, month = [], start
    for c in counts:
        out.append(MonthAttendance(month, *c) if c else MonthAttendance(month))
        month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)
    return tuple(out)


def card(years=(GRADE_5,), level="elementary", grade="Grade 5", section="Naujan Lake", strand="",
         school=SCHOOL_WITH_DEPED, learner=LEARNER, status="completed", attendance=None, behavior=BEHAVIOR,
         sy="2024-2025", adviser="Rosa L. Santos"):
    periods = SEMESTERS if level == "senior_highschool" else Q
    return ReportCardData(
        school=school, learner=replace(learner, status=status),
        section=SectionInfo(sy, level, grade, section, strand),
        years=tuple(replace(y, adviser=adviser) for y in years),
        months=attendance if attendance is not None else months((20, 19, 1), (21, 21, 0), None),
        behavior_periods=periods, behavior=behavior,
    )


def text_of(data):
    body, warnings = sf9.build(data)
    return body, pages(body), warnings


# ── The card ────────────────────────────────────────────────────────────────

def test_one_landscape_long_bond_sheet_outside_then_inside():
    body, (outside, inside), warnings = text_of(card())
    assert body.startswith(b"%PDF-") and warnings == []
    assert len(re.findall(rb"/MediaBox \[ 0 0 936 612 \]", body)) == 2      # 13 x 8.5 in, both sides
    # The outside: the back (attendance) left of the fold, the cover right of it.
    assert outside.startswith("REPORT ON ATTENDANCE")
    assert outside.index("PARENT / GUARDIAN’S SIGNATURE") < outside.index("SF 9 – ES South Lakes Integrated School")
    # The inside: the grades, then class behavior.
    assert inside.startswith("REPORT ON LEARNING PROGRESS AND ACHIEVEMENT")
    assert inside.index("General Average") < inside.index("REPORT ON LEARNER’S CLASS BEHAVIOR")


def test_the_cover_is_the_schools_letterhead_then_depeds_lines():
    _, (outside, _), _ = text_of(card())
    cover = outside[outside.index("SF 9 – ES"):]
    assert cover.startswith(
        "SF 9 – ES South Lakes Integrated School 21st Century Challenge-Based Learning "
        "607 Brgy. San Jose, San Pablo City, Laguna 4000 Mobile: +63998-979-1547 | Landline: (049) 560-3268 "
        "Email: southlakesintegratedschool@yahoo.com.ph "
        "Republic of the Philippines DEPARTMENT OF EDUCATION Region: Region IV-A (CALABARZON) "
        "Division: San Pablo City District: San Pablo City District I School ID: 428023 "
        "LEARNER’S PROGRESS REPORT CARD School Year 2024-2025"
    )


def test_the_learner_as_deped_asks_for_them():
    _, (outside, _), _ = text_of(card())
    # Age as of 31 October of the school year, as on the SF1.
    assert ("Name: DELA CRUZ, MARIA SANTOS LRN: 109100000005 Age: 10 Sex: Female Grade: 5 "
            "Section: Naujan Lake Dear Parent:") in outside
    assert "as well as her class behavior." in outside
    assert "as well as his class behavior." in pages(sf9.build(card(learner=replace(LEARNER, sex="male")))[0])[0]


def test_the_form_code_follows_the_level():
    assert "SF 9 – JHS" in pages(sf9.build(card(level="junior_highschool", grade="Grade 7"))[0])[0]
    assert "SF 9 – ES" in pages(sf9.build(card(level="kindergarten", grade="Kindergarten"))[0])[0]


def test_the_adviser_and_the_levels_principal_sign_the_cover():
    _, (outside, _), _ = text_of(card())
    assert ("Rosa L. Santos Class Adviser Maria Carolina A. Laguerta, LPT Elementary School Principal "
            "Certificate of Transfer") in outside


# ── Attendance ──────────────────────────────────────────────────────────────

def test_attendance_by_month_with_totals_and_blank_months_left_blank():
    _, (outside, _), _ = text_of(card())
    assert outside.startswith(
        "REPORT ON ATTENDANCE Jun Jul Aug Total "
        "No. of school days 20 21 41 No. of days present 19 21 40 No. of days absent 1 0 1 "
        "PARENT / GUARDIAN’S SIGNATURE 1st Quarter 2nd Quarter 3rd Quarter 4th Quarter"
    )


def test_a_month_without_attendance_taken_is_left_blank_and_said_so():
    _, (outside, _), warnings = text_of(card(attendance=months((20, None, None), (21, 20, 1))))
    assert "No. of school days 20 21 41 No. of days present 20 20 No. of days absent 1 1" in outside
    assert warnings == ["No attendance was taken in June, so days present and absent are left blank there."]


# ── Grades: elementary and junior high ──────────────────────────────────────

def test_the_grades_are_the_sf10s_whole_numbers_with_mapeh_from_its_parts():
    _, (_, inside), _ = text_of(card())
    result = sf10.year_result(GRADE_5)
    assert result.average == 87
    assert ("Learning Areas Quarter Final Rating Remarks 1 2 3 4 "
            "English 83 87 88 88 87 Passed Math 87 88 91 91 89 Passed") in inside
    # The school's Grade 5 MAPEH: 88 from its parts' unrounded means.
    assert "MAPEH 88 89 87 90 88 Passed Music 87 89 87 90 Arts 84 86 85 89 P.E. 90 90 85 90 Health 89 90 90 92" in inside
    assert "HELE 85 85 87 88 86 Passed General Average 87 Passed" in inside


def test_a_year_still_running_shows_its_quarters_and_waits_for_the_rest():
    running = year("Grade 5", "2024-2025", [subject("English", [83, 87, None, None]),
                                            subject("Math", [87, 88, None, None])], completed=False)
    _, (outside, inside), _ = text_of(card(years=(running,), status="enrolled"))
    assert "English 83 87 Math 87 88 General Average Descriptors" in inside
    # Nothing earned yet: the Certificate of Transfer is left for ink.
    assert "Admitted to Grade: Section: Eligibility for Admission to Grade: Approved: Class Adviser" in outside


def test_the_descriptors_come_from_depeds_scale():
    _, (_, inside), _ = text_of(card())
    assert ("Descriptors Grading Scale Remarks Outstanding 90–100 Passed Very Satisfactory 85–89 Passed "
            "Satisfactory 80–84 Passed Fairly Satisfactory 75–79 Passed Did Not Meet Expectations Below 75 Failed"
            ) in inside


def test_no_learning_areas_says_so():
    empty = year("Grade 5", "2024-2025", [], completed=False)
    _, (_, inside), _ = text_of(card(years=(empty,), status="enrolled"))
    assert "No learning areas are on record for this school year. General Average" in inside


# ── The Certificate of Transfer ─────────────────────────────────────────────

def test_a_passed_year_is_eligible_for_the_next_grade():
    _, (outside, _), _ = text_of(card())
    assert ("Certificate of Transfer Admitted to Grade: 5 Section: Naujan Lake "
            "Eligibility for Admission to Grade: 6 Approved: Rosa L. Santos Class Adviser") in outside


def test_a_failed_year_leaves_the_certificate_blank():
    failed = year("Grade 5", "2024-2025", [subject("English", [70, 72, 71, 73]), subject("Math", [80, 81, 82, 83])])
    _, (outside, inside), _ = text_of(card(years=(failed,)))
    assert "Admitted to Grade: Section: Eligibility for Admission to Grade: Approved:" in outside
    assert "English 70 72 71 73 72 Failed" in inside
    assert "General Average 77 Remedial" in inside


def test_a_completed_kindergarten_year_is_eligible_for_grade_1_without_grades():
    kinder = year("Kindergarten", "2024-2025", [])
    _, (outside, _), _ = text_of(card(years=(kinder,), level="kindergarten", grade="Kindergarten",
                                      section="Daisy"))
    assert "Eligibility for Admission to Grade: 1 Approved:" in outside


def test_grade_12_has_no_next_grade():
    grade_12 = [replace(s, adviser="") for s in HUMSS[2:]]
    _, (outside, _), _ = text_of(card(years=grade_12, level="senior_highschool", grade="Grade 12",
                                      section="Buhi Lake", strand="HUMSS", sy="2025-2026"))
    assert "Eligibility for Admission to Grade: Approved:" in outside


# ── Senior high ─────────────────────────────────────────────────────────────

def shs_card(years=tuple(HUMSS[:2]), **kw):
    return card(years=years, level="senior_highschool", grade="Grade 11", section="Kayangan Lake",
                strand="HUMSS", **kw)


def test_senior_high_reports_each_semester_by_group():
    _, (outside, inside), warnings = text_of(shs_card(behavior=(
        BehaviorRow("Participation", "Takes part.", {"1st_semester": "AO", "2nd_semester": "SO"}),)))
    assert "Track/Strand: Humanities and Social Sciences (HUMSS)" in outside
    assert "PARENT / GUARDIAN’S SIGNATURE First Semester Second Semester" in outside
    assert inside.startswith(
        "REPORT ON LEARNING PROGRESS AND ACHIEVEMENT FIRST SEMESTER "
        "Subjects Quarter Semester Final Grade Remarks 1 2 Core Subjects Oral Communication in Context 93 Passed"
    )
    assert "Applied Subjects Research in Daily Life 1 92 Passed Empowerment Technologies 89 Passed" in inside
    assert "SECOND SEMESTER Subjects Quarter Semester Final Grade Remarks 3 4 Core Subjects" in inside
    assert "Specialized Subjects Philippine Politics and Governance 94 Passed General Average for the Semester" in inside
    # Its class behavior by semester, and DepEd's descriptors on this side.
    assert "Behavior Behavior Statements Semester 1st 2nd Participation Takes part. AO SO" in inside
    assert inside.endswith("Did Not Meet Expectations Below 75 Failed")
    # Both semesters passed: on to Grade 12.
    assert "Eligibility for Admission to Grade: 12" in outside
    assert warnings == ["SLIS records one grade per senior high semester, so the quarter columns are blank and "
                        "the Semester Final Grade is the semester's grade."]


def test_a_semester_not_yet_enrolled_says_so_and_earns_nothing_yet():
    _, (outside, inside), _ = text_of(shs_card(years=(HUMSS[0],), status="enrolled"))
    assert "SECOND SEMESTER Subjects Quarter Semester Final Grade Remarks 3 4 Not yet enrolled for this semester." in inside
    assert "Eligibility for Admission to Grade: Approved:" in outside


# ── Class behavior ──────────────────────────────────────────────────────────

def test_class_behavior_in_depeds_observed_values_table():
    _, (_, inside), _ = text_of(card())
    assert ("REPORT ON LEARNER’S CLASS BEHAVIOR Behavior Behavior Statements Quarter 1 2 3 4 "
            "Attentiveness Pays attention and stays focused during lessons. AO SO "
            "Task completion Finishes classwork and homework and hands them in on time. RO "
            "Marking Non-Numerical Rating AO Always Observed SO Sometimes Observed RO Rarely Observed "
            "NO Not Observed") in inside


def test_no_class_behavior_areas_says_so():
    _, (_, inside), _ = text_of(card(behavior=()))
    assert "Quarter 1 2 3 4 No class behavior areas are set up. Marking" in inside


# ── What the card warns about ───────────────────────────────────────────────

def test_missing_names_and_deped_details_are_warned_about_and_print_blank():
    bare = School(name="South Lakes Integrated School")
    _, (outside, _), warnings = text_of(card(school=bare, adviser=""))
    assert warnings == [
        "Region, Division, District, School ID are not set under Settings › School Forms, so the cover leaves "
        "them blank.",
        "No Elementary School Principal is set under Settings › School Forms, so the principal's lines print "
        "without a name.",
        "No adviser is assigned to Grade 5 – Naujan Lake for 2024-2025, so the adviser's lines print without a name.",
    ]
    assert "Region: Division: District: School ID: LEARNER’S PROGRESS REPORT CARD" in outside


def test_the_school_head_signs_when_no_principal_is_named():
    head_only = School(name="South Lakes Integrated School", head="Pedro D. Head", region="NCR",
                       division="Marikina", district="I", school_id="401234")
    _, (outside, _), warnings = text_of(card(school=head_only))
    assert "Pedro D. Head Elementary School Principal" in outside
    assert warnings == []


def test_mapeh_without_its_parts_is_noted():
    no_parts = year("Grade 5", "2024-2025", [subject("MAPEH", [88, 89, 90, 91]), subject("English", [85, 85, 85, 85])])
    _, _, warnings = text_of(card(years=(no_parts,)))
    assert any("MAPEH's parts" in w for w in warnings)


def test_a_very_long_year_still_fits_two_pages():
    many = year("Grade 5", "2024-2025", [subject(f"Elective {i}", [85, 86, 87, 88]) for i in range(40)])
    body, text, _ = text_of(card(years=(many,)))
    assert len(text) == 2
    assert "Elective 39 85 86 87 88 87 Passed General Average 87 Passed" in text[1]


def test_text_from_the_database_is_safe_markup():
    odd = replace(LEARNER, last_name="Santos & <Reyes>", first_name="Ñora")
    _, (outside, _), _ = text_of(card(learner=odd))
    assert "Name: SANTOS & <REYES>, ÑORA SANTOS" in outside


def test_grades_are_whole_numbers_even_from_decimals():
    precise = year("Grade 5", "2024-2025", [
        SubjectRecord("English", {p: Decimal(g) for p, g in zip(Q, ("84.50", "85.49", "86.5", "87"))})])
    _, (_, inside), _ = text_of(card(years=(precise,)))
    assert "English 85 85 87 87 86 Passed" in inside


def test_an_unrecorded_semester_year_record_is_not_needed_for_attendance():
    """A YearRecord-less card (nothing recorded yet) still prints its attendance and cover."""
    blank = card(years=(), status="enrolled", adviser="")
    _, (outside, inside), warnings = text_of(blank)
    assert "REPORT ON ATTENDANCE" in outside and "No learning areas are on record" in inside
    assert any("No adviser" in w for w in warnings)
