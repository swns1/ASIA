"""SF10 Permanent Record: grade rules, block filling and certification, per level."""
from datetime import date
from decimal import Decimal

from school_forms import sf10
from school_forms.records import (
    Eligibility, Learner, PermanentRecordData, School, SubjectRecord, YearRecord,
)
from school_forms.workbook import top_left

SCHOOL = School(name="South Lakes Integrated School", address="Cabuyao, Laguna", school_id="401234",
                region="IV-A", division="Laguna", district="Cabuyao I", head="Maria Santos")
LEARNER = Learner(enrollment_id=0, student_id=5, lrn="109100000005", last_name="Dela Cruz",
                  first_name="Juan", middle_name="Reyes", suffix="Jr.", sex="male",
                  birth_date=date(2013, 11, 5))
Q = ("1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter")


def subject(name, grades, core=False, remarks=()):
    return SubjectRecord(name=name, grades=dict(zip(Q, grades)), core=core, recorded_remarks=tuple(remarks))


def year(grade, sy, subjects, section="Rizal", adviser="Ms. Adviser"):
    return YearRecord(school_year=sy, grade_level=grade, section=section, periods=Q,
                      subjects=tuple(subjects), adviser=adviser)


def cell(wb, sheet, ref):
    return top_left(wb[sheet], ref).value


def test_final_rating_rounds_half_up_like_deped():
    # 74, 75, 74, 75 average 74.5: DepEd's whole-number final is 75, passed.
    grades, final, remark = sf10.subject_result(subject("Math", [74, 75, 74, 75]), Q)
    assert grades == [74, 75, 74, 75] and final == 75 and remark == "passed"


def test_no_final_rating_until_every_quarter_is_in():
    grades, final, remark = sf10.subject_result(subject("Math", [90, 91]), Q)
    assert grades == [90, 91, None, None] and final is None and remark is None


def test_a_teachers_dropped_mark_wins_over_the_numbers():
    _, final, remark = sf10.subject_result(subject("Math", [90, 90, 90, 90], remarks=["dropped"]), Q)
    assert final == 90 and remark == "dropped"


def test_general_average_only_for_a_complete_year():
    complete = year("Grade 4", "2023-2024", [subject("A", [80] * 4), subject("B", [91] * 4)])
    rows, average, failed = sf10.year_result(complete)
    assert average == 86 and failed == 0     # (80 + 91) / 2 = 85.5, half up
    partial = year("Grade 4", "2023-2024", [subject("A", [80] * 4), subject("B", [91, 90])])
    assert sf10.year_result(partial)[1] is None


def test_deped_order_of_learning_areas():
    names = ["Computer", "MAPEH", "Science", "Filipino", "GMRC", "Mathematics", "English", "Araling Panlipunan"]
    ranked = sorted((subject(n, []) for n in names), key=lambda s: sf10.subject_rank("elementary", s))
    assert [s.name for s in ranked] == [
        "Filipino", "English", "Mathematics", "Science", "GMRC", "Araling Panlipunan", "MAPEH", "Computer",
    ]


def test_elementary_record():
    years = [
        year("Grade 1", "2020-2021", [subject("Mathematics", [85, 86, 87, 88]), subject("Filipino", [90] * 4)],
             adviser="Teacher One"),
        year("Grade 2", "2021-2022", [subject("Science", [70, 72, 71, 70]), subject("English", [88] * 4)]),
    ]
    data = PermanentRecordData(school=SCHOOL, level="elementary", learner=LEARNER, years=tuple(years),
                               eligibility=Eligibility(completed_here=True))
    wb, warnings = sf10.build(data)
    assert warnings == []
    assert (cell(wb, "Front", "E9"), cell(wb, "Front", "R9"), cell(wb, "Front", "AD9"), cell(wb, "Front", "AQ9")) == (
        "Dela Cruz", "Juan", "Jr.", "Reyes")
    assert cell(wb, "Front", "J10") == "109100000005" and cell(wb, "Front", "AT10") == "Male"
    assert cell(wb, "Front", "K14") == "✓" and cell(wb, "Front", "F15") == "South Lakes Integrated School"
    # Grade 1, the first block: header, then subjects in DepEd's order.
    assert (cell(wb, "Front", "D23"), cell(wb, "Front", "S23"), cell(wb, "Front", "F25")) == (
        "South Lakes Integrated School", "401234", "1")
    assert (cell(wb, "Front", "S25"), cell(wb, "Front", "H26")) == ("2020-2021", "Teacher One")
    assert (cell(wb, "Front", "B30"), cell(wb, "Front", "B31")) == ("Filipino", "Mathematics")
    assert [cell(wb, "Front", f"{c}31") for c in ("K", "L", "N", "O", "P", "S")] == [85, 86, 87, 88, 87, "PASSED"]
    # DepEd's other default names for that grade are gone; the Madrasah rows stay.
    assert cell(wb, "Front", "B32") in (None, "")
    assert cell(wb, "Front", "B43") == "*Arabic Language"
    # Finals 87 (86.5 half up) and 90: (87 + 90) / 2 = 88.5, half up again.
    assert (cell(wb, "Front", "P45"), cell(wb, "Front", "S45")) == (89, "PROMOTED")
    # Grade 2 failed Science: remedial, not promoted, and no admission line.
    assert cell(wb, "Front", "AW30") == "PASSED" and cell(wb, "Front", "AW31") == "FAILED"
    assert cell(wb, "Front", "AW45") == "REMEDIAL"
    assert cell(wb, "Back", "H62") == "Juan Reyes Dela Cruz Jr."
    assert (cell(wb, "Back", "Z63"), cell(wb, "Back", "AH62")) == ("2021-2022", None)
    assert cell(wb, "Back", "M65") == "Maria Santos"


def test_the_back_page_blocks_print_their_header_as_text():
    years = [year(f"Grade {g}", f"{2019 + g}-{2020 + g}", [subject("Filipino", [90] * 4)]) for g in range(1, 6)]
    data = PermanentRecordData(school=SCHOOL, level="elementary", learner=LEARNER, years=tuple(years))
    wb, _ = sf10.build(data)
    assert cell(wb, "Back", "B3") == "School: South Lakes Integrated School"
    assert cell(wb, "Back", "B5") == "Classified as Grade: 5    Section: Rizal"
    assert cell(wb, "Back", "O5") == "2024-2025"
    # Grade 5 passed, so the certificate admits the learner to Grade 6.
    assert cell(wb, "Back", "AH62") == "6"


def test_more_years_than_the_form_holds_warns():
    years = [year("Grade 3", f"{2010 + i}-{2011 + i}", [subject("Filipino", [90] * 4)]) for i in range(9)]
    data = PermanentRecordData(school=SCHOOL, level="elementary", learner=LEARNER, years=tuple(years))
    _, warnings = sf10.build(data)
    assert any("room for 8" in w for w in warnings)


def test_junior_high_record_and_eligibility():
    years = [year("Grade 7", "2022-2023", [subject("English", [90] * 4)])]
    data = PermanentRecordData(school=SCHOOL, level="junior_highschool", learner=LEARNER, years=tuple(years),
                               eligibility=Eligibility(completed_here=True, general_average=91))
    wb, _ = sf10.build(data)
    assert (cell(wb, "Front", "B12"), cell(wb, "Front", "AC12"), cell(wb, "Front", "M13")) == (
        "✓", 91, "South Lakes Integrated School")
    assert (cell(wb, "Front", "E21"), cell(wb, "Front", "I22"), cell(wb, "Front", "V22")) == (
        "South Lakes Integrated School", "7", "2022-2023")
    assert [cell(wb, "Front", f"{c}26") for c in ("B", "U", "AJ", "AP")] == ["English", 90, 90, "PASSED"]
    assert (cell(wb, "Front", "AJ40"), cell(wb, "Front", "AP40")) == (90, "PROMOTED")
    assert cell(wb, "Front", "BB79") == "8"


def test_senior_high_semesters():
    def sem(grade, sy, semester, grades):
        key = f"{semester}_semester"
        subjects = (
            SubjectRecord(name="Oral Communication", grades={key: Decimal(grades[0])}, core=True),
            SubjectRecord(name="Pre-Calculus", grades={key: Decimal(grades[1])}),
        )
        return YearRecord(school_year=sy, grade_level=grade, section="Einstein", periods=(key,),
                          subjects=subjects, strand="STEM", semester=semester, adviser=f"{grade} {semester}")

    years = [sem("Grade 11", "2024-2025", "1st", ("88.40", "90")), sem("Grade 11", "2024-2025", "2nd", ("92", "73"))]
    data = PermanentRecordData(school=SCHOOL, level="senior_highschool", learner=LEARNER, years=tuple(years))
    wb, _ = sf10.build(data)
    assert cell(wb, "FRONT", "Y8") == "Juan Jr."          # no extension box on SF10-SHS
    assert (cell(wb, "FRONT", "BK23"), cell(wb, "FRONT", "G25"), cell(wb, "FRONT", "AS23")) == ("1ST", "STEM", "11")
    assert (cell(wb, "FRONT", "AT29"), cell(wb, "FRONT", "AY29")) == ("1ST", "2ND")
    assert (cell(wb, "FRONT", "A31"), cell(wb, "FRONT", "I31"), cell(wb, "FRONT", "BD31"), cell(wb, "FRONT", "BI31")) == (
        "CORE", "Oral Communication", 88, "PASSED")
    assert cell(wb, "FRONT", "A32") in (None, "")          # not tied to "no strand": not CORE
    assert (cell(wb, "FRONT", "BD43"), cell(wb, "FRONT", "BI43")) == (89, "PASSED")
    assert cell(wb, "FRONT", "A49") == "Grade 11 1st"
    # The second semester's quarters are the year's third and fourth.
    assert (cell(wb, "FRONT", "AT72"), cell(wb, "FRONT", "AY72")) == ("3RD", "4TH")
    assert (cell(wb, "FRONT", "BI75"), cell(wb, "FRONT", "BD86")) == ("FAILED", 83)
    # Two semesters are not the four the SHS General Average needs.
    assert str(cell(wb, "BACK", "BK90") or "").startswith("=")
    assert cell(wb, "BACK", "A94") == "Maria Santos"
