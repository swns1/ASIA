"""SF1 School Register: what lands where, for both of DepEd's layouts."""
from datetime import date

from school_forms import sf1
from school_forms.records import Learner, RegisterData, School, SectionInfo, Transfer
from school_forms.workbook import top_left

SCHOOL = School(name="South Lakes Integrated School", school_id="401234", region="IV-A",
                division="Laguna", district="Cabuyao I", head="Maria Santos")


def learner(i, sex="male", **kw):
    fields = dict(
        enrollment_id=i, student_id=i, lrn=f"1091{i:08d}", last_name=f"Cruz{i:03d}",
        first_name="Juan" if sex == "male" else "Ana", middle_name="Reyes", sex=sex,
        birth_date=date(2013, 11, 5), religion="Roman Catholic", address="Blk 1, Brgy. Uno, Cabuyao",
        father="Pedro Cruz", mother="Rosa Reyes", contact="09171234567",
    )
    fields.update(kw)
    return Learner(**fields)


def register(learners, grade="Grade 7", level="junior_highschool", semester="", strand="", ended=False):
    return RegisterData(
        school=SCHOOL,
        section=SectionInfo("2026-2027", level, grade, "Rizal", strand=strand, semester=semester,
                            advisers=("Ms. Adviser",)),
        learners=tuple(learners), year_ended=ended,
    )


def cell(ws, ref):
    value = top_left(ws, ref).value
    # DepEd's labels carry stray spaces; values are compared as written.
    return " ".join(value.split()) if isinstance(value, str) else value


def test_header_and_a_learner_row():
    wb, warnings = sf1.build(register([learner(1)]))
    ws = wb.active
    assert warnings == []
    assert (cell(ws, "F4"), cell(ws, "J4"), cell(ws, "M4"), cell(ws, "S4")) == ("401234", "IV-A", "Laguna", "Cabuyao I")
    assert (cell(ws, "F6"), cell(ws, "O6"), cell(ws, "S6"), cell(ws, "V6")) == (
        "South Lakes Integrated School", "2026-2027", "Grade 7", "Rizal")
    assert cell(ws, "I8") == "AGE as of October 31"
    assert cell(ws, "B10") == "109100000001"
    assert cell(ws, "C10") == "Cruz001, Juan Reyes"
    assert cell(ws, "G10") == "M"
    assert cell(ws, "H10") == date(2013, 11, 5)
    # 31 October 2026, a week before the 13th birthday.
    assert cell(ws, "I10") == 12
    assert (cell(ws, "M10"), cell(ws, "N10")) == ("Roman Catholic", "Blk 1, Brgy. Uno, Cabuyao")
    assert (cell(ws, "R10"), cell(ws, "T10"), cell(ws, "X10")) == ("Pedro Cruz", "Rosa Reyes", "09171234567")
    # SLIS doesn't record these; they stay blank for the registrar.
    assert all(cell(ws, f"{c}10") in (None, "") for c in ("J", "K", "L", "O", "P", "Q"))


def test_males_come_first_then_females_each_a_to_z():
    wb, _ = sf1.build(register([learner(3, "female"), learner(2), learner(1, "female"), learner(4)]))
    ws = wb.active
    assert [cell(ws, f"C{r}").split(",")[0] for r in range(10, 14)] == ["Cruz002", "Cruz004", "Cruz001", "Cruz003"]
    assert [cell(ws, f"A{r}") for r in range(10, 14)] == [1, 2, 3, 4]


def test_a_class_bigger_than_the_form_pushes_the_footer_down():
    learners = [learner(i) for i in range(30)] + [learner(100 + i, "female") for i in range(30)]
    wb, _ = sf1.build(register(learners))
    ws = wb.active
    extra = 60 - 47
    assert cell(ws, f"C{10 + 59}").startswith("Cruz129")
    assert cell(ws, f"A{57 + extra}").startswith("List and code of Indicators")
    assert (cell(ws, f"R{59 + extra}"), cell(ws, f"R{60 + extra}"), cell(ws, f"R{61 + extra}")) == (30, 30, 60)
    assert cell(ws, f"U{59 + extra}") == "Ms. Adviser"
    assert cell(ws, f"X{59 + extra}") == "Maria Santos"


def test_remarks_and_the_beginning_of_year_count():
    learners = [
        learner(1, status="transferred_out",
                transfer_out=Transfer("transfer_out", date(2026, 9, 15), "Cabuyao NHS")),
        learner(2, transfer_in=Transfer("transfer_in", date(2026, 8, 3), "Sta. Rosa ES")),
        learner(3, student_status="dropped"),
        learner(4, "female"),
    ]
    wb, _ = sf1.build(register(learners))
    ws = wb.active
    remarks = {cell(ws, f"C{r}").split(",")[0]: cell(ws, f"Y{r}") for r in range(10, 14)}
    assert remarks["Cruz001"] == "T/O Cabuyao NHS, 09/15/2026"
    assert remarks["Cruz002"] == "T/I Sta. Rosa ES, 08/03/2026"
    assert remarks["Cruz003"] == "DRP"
    assert remarks["Cruz004"] in (None, "")
    # BoSY leaves out the learner who arrived mid-year.
    assert (cell(ws, "R59"), cell(ws, "R60"), cell(ws, "R61")) == (2, 1, 3)
    # EoSY waits for the year to end.
    assert cell(ws, "S61") in (None, "")


def test_end_of_year_counts_once_the_year_is_over():
    learners = [learner(1, status="completed"), learner(2, status="transferred_out"), learner(3, "female", status="completed")]
    ws = sf1.build(register(learners, ended=True))[0].active
    assert (cell(ws, "S59"), cell(ws, "S60"), cell(ws, "S61")) == (1, 1, 2)


def test_the_deped_wordmark_is_put_back():
    ws = sf1.build(register([learner(1)]))[0].active
    assert len(ws._images) == 2


def test_senior_high_uses_the_lis_sf1_shs_with_male_and_female_blocks():
    learners = [learner(i) for i in range(45)] + [learner(100 + i, "female") for i in range(3)]
    wb, _ = sf1.build(register(learners, grade="Grade 11", level="senior_highschool", semester="1st", strand="STEM"))
    ws = wb.active
    assert ws.title == "SHSF-1"
    assert (cell(ws, "F5"), cell(ws, "AC5"), cell(ws, "F7")) == ("1st Semester", "STEM", "Rizal")
    assert cell(ws, "A11") == "109100000000"
    # 45 males: five rows added to the block of 40, so the total moves down.
    assert cell(ws, "C56") == "<=== TOTAL MALE" and cell(ws, "A56") == 45
    assert cell(ws, "C97") == "<=== TOTAL FEMALE" and cell(ws, "A97") == 3
    assert cell(ws, "C98") == "<=== COMBINED" and cell(ws, "A98") == 48
    # The placeholders DepEd numbered 1-40 in the LRN column are gone.
    assert cell(ws, "A60") in (None, "")
    assert (cell(ws, "U101"), cell(ws, "U102"), cell(ws, "U104")) == (45, 3, 48)
