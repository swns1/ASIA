"""
The COR with the school's Admissions Agreement: the edition each level gets,
what is written into its blanks and what is left for ink, the subjects, the
copy's label, the signers, the pages it takes, and the loader behind it
(over enrollments/fake_orm.py).

The PDF is read back here without a PDF library: each page's content stream
is inflated and the strings it shows are joined, which is enough to find
words on a page.
"""
import base64
import re
import zlib
from datetime import date
from types import SimpleNamespace as NS

import pytest
from reportlab.pdfbase import pdfmetrics

from school_forms import agreements, cor, data
from school_forms.records import Learner, RegistrationData, School, SectionInfo, Signatories, SubjectLine
from school_forms.test_data import enrollment, models, school_row, student

SY = "2026-2027"
ISSUED = date(2026, 10, 16)
SIGNATORIES = Signatories(
    records_officer="Regina T. Molidor, LPT", elementary_principal="Ana P. Reyes, LPT",
    jhs_principal="Erwin V. Bustamante, M. Div.", shs_principal="Jose M. Rizal, PhD",
    shs_department_head="Maria Carolina A. Laguerta, LPT",
)
SCHOOL = School(name="South Lakes Integrated School", address="607 Brgy. San Jose, San Pablo City, Laguna 4000",
                phone="+63998-979-1547", landline="049-560-3268", email="slis@example.com",
                head="Pedro D. Head", signatories=SIGNATORIES)
JHS_SUBJECTS = (SubjectLine("AP7", "Araling Panlipunan"), SubjectLine("ENG7", "English"),
                SubjectLine("MATH7", "Mathematics"))
SHS_SUBJECTS = (SubjectLine("OC11", "Oral Communication", "", "1st"),
                SubjectLine("PRECAL", "Pre-Calculus", "STEM", "1st"))
LEVELS = {
    "nursery": ("Nursery", ""), "kindergarten": ("Kindergarten", ""), "elementary": ("Grade 4", ""),
    "junior_highschool": ("Grade 7", ""), "senior_highschool": ("Grade 11", "STEM"),
}


def learner(status="enrolled", **kw):
    fields = dict(enrollment_id=1, student_id=5, lrn="109100000005", last_name="Dela Cruz", first_name="Juan",
                  middle_name="Santos", suffix="Jr.", status=status, student_number="2026-00005")
    return Learner(**{**fields, **kw})


def registration(level="junior_highschool", status="enrolled", subjects=None, school=SCHOOL, **learner_fields):
    grade, strand = LEVELS[level]
    semester = "1st" if level == "senior_highschool" else ""
    if subjects is None:
        subjects = SHS_SUBJECTS if level == "senior_highschool" else JHS_SUBJECTS
    return RegistrationData(
        school=school, learner=learner(status, **learner_fields),
        section=SectionInfo(SY, level, grade, "Rizal", strand, semester), subjects=tuple(subjects),
    )


def build(reg=None, copy="slis"):
    return cor.build(reg or registration(), copy=copy, issued=ISSUED)


# ── Reading the PDF back ────────────────────────────────────────────────────

def _string(token):
    def one(m):
        g = m.group(1)
        return bytes([int(g, 8)]) if g[:1].isdigit() else g
    return re.sub(rb"\\([0-7]{1,3}|.)", one, token).decode("cp1252")


def pages(pdf_bytes):
    """Each page's text, in drawing order, spaces collapsed."""
    out = []
    for ref in re.findall(rb"/Contents (\d+) 0 R", pdf_bytes):
        m = re.search(rb"(?<!\d)" + ref + rb" 0 obj\s*<<([^<>]*)>>\s*stream\r?\n", pdf_bytes)
        head = m.group(1)
        raw = pdf_bytes[m.end(): m.end() + int(re.search(rb"/Length (\d+)", head).group(1))]
        if b"ASCII85Decode" in head:
            raw = base64.a85decode(raw.strip(), adobe=True)
        if b"FlateDecode" in head:
            raw = zlib.decompress(raw)
        parts = [_string(t[1:-1]) if t.startswith(b"(") else " "
                 for t in re.findall(rb"\((?:\\.|[^\\)])*\)|T\*|ET", raw)]
        out.append(re.sub(r"\s+", " ", "".join(parts)).strip())
    return out


# ── The packet ──────────────────────────────────────────────────────────────

def test_the_cor_then_the_two_page_agreement_on_long_bond():
    body, warnings = build()
    text = pages(body)
    assert body.startswith(b"%PDF-") and warnings == []
    assert len(text) == 3
    assert len(re.findall(rb"/MediaBox \[ 0 0 612 936 \]", body)) == 3        # 8.5 x 13 in, every page
    assert "CERTIFICATE OF REGISTRATION" in text[0] and "ADMISSIONS AGREEMENT" not in text[0]
    assert text[1].startswith(f"{agreements.STAMP} South Lakes Integrated School")   # the edition's stamp, once
    assert agreements.STAMP not in text[2]
    # The signature block is whole on the agreement's second page: nothing spills onto a page of its own.
    assert "ACCEPTANCE" in text[2] and "Principal/School Academic Head" in text[2]
    for number, page in enumerate(text, 1):
        assert page.endswith(f"SLIS Copy Page {number} of 3")


@pytest.mark.parametrize("level, subtitle", [
    ("nursery", "(Preschool – Junior High School)"),
    ("kindergarten", "(Preschool – Junior High School)"),
    ("elementary", "(Preschool – Junior High School)"),
    ("junior_highschool", "(Preschool – Junior High School)"),
    ("senior_highschool", "(Senior High School)"),
])
def test_each_level_gets_its_edition(level, subtitle):
    assert agreements.edition_for(level).subtitle == subtitle
    text = pages(build(registration(level))[0])
    assert f"ADMISSIONS AGREEMENT {subtitle}" in text[1]


def test_the_agreement_is_the_schools_text():
    text = " ".join(pages(build()[0])[1:])
    for heading in ("Section 1. General Provisions", "Section 3. Discounts on Tuition Fees",
                    "Section 8. Outstanding Balance of Tuition and Other Fees"):
        assert heading in text
    assert "1.2 Enrollment is on a per school-year basis." in text
    assert "Before the start of classes 70% tuition fee only" in text
    shs = " ".join(pages(build(registration("senior_highschool"))[0])[1:])
    assert "1.2 Enrollment is on a per semester basis." in shs
    assert "Section 8." not in shs and "Section 7. Outstanding Balance" in shs
    assert "I also commit to attending Parent-Teacher Conference (PTC) activities" in shs


def test_the_blanks_hold_the_learner_and_the_year():
    page = pages(build()[0])[1]
    assert "SY 2026-2027" in page
    assert "enrollment of JUAN SANTOS DELA CRUZ JR. GRADE 7 NAME OF STUDENT GRADE/LEVEL" in page
    shs = pages(build(registration("senior_highschool"))[0])
    assert "First Semester, SY 2026-2027" in shs[1]
    assert "JUAN SANTOS DELA CRUZ JR. GRADE 11 – STEM NAME OF STUDENT LEVEL & STRAND" in shs[1]
    assert "GRADE 11 – STEM Student’s Printed Name Level & Strand" in shs[2]


def test_the_signers_own_lines_are_left_for_ink():
    page = pages(build()[0])[2]
    # Nothing is written between the captions: the parent prints their name, signs, dates and ticks a box.
    assert "Student’s Printed Name Level Printed Name of Parent/Guardian Date " + agreements.SIGN_IN_BOX in page
    assert "Relation of Signatory to Student: ( ) Father ( ) Mother ( ) Others, please specify" in page


def test_a_long_name_shrinks_to_its_line_and_the_agreement_stays_on_two_pages():
    reg = registration(first_name="Maria Clarissa Angelica Josefina", middle_name="Dimaculangan-Macaraeg",
                       last_name="De Los Santos-Villanueva", suffix="III")
    text = pages(build(reg)[0])
    assert len(text) == 3 and "Principal/School Academic Head" in text[2]


@pytest.mark.parametrize("copy, label", [("slis", "SLIS Copy"), ("parent", "Parent’s Copy")])
def test_the_copy_is_named_at_the_foot_of_every_page(copy, label):
    text = pages(build(copy=copy)[0])
    assert all(page.endswith(f"{label} Page {n} of 3") for n, page in enumerate(text, 1))


def test_the_peso_sign_comes_from_the_bundled_font():
    cor.register_fonts()
    for name in (cor.PESO_FONT, f"{cor.PESO_FONT}-Bold"):
        assert 0x20B1 in pdfmetrics.getFont(name).face.charToGlyph
    body = build()[0]
    assert b"DejaVuSerif" in body                    # embedded for the ₱ in 2.1 and 7.1
    assert "1,000.00 shall be required to secure a slot" in pages(body)[1]


# ── Page 1 ──────────────────────────────────────────────────────────────────

def test_the_cor_lists_the_learner_and_their_subjects():
    page = pages(build()[0])[0]
    assert "(Junior High School) SY 2026-2027" in page
    assert "Name of Student JUAN SANTOS DELA CRUZ JR." in page
    assert "LRN 109100000005 Student No. 2026-00005" in page
    assert "Grade Level Grade 7 Section Rizal" in page
    assert "No. Code Subject 1 AP7 Araling Panlipunan 2 ENG7 English 3 MATH7 Mathematics" in page


def test_senior_high_names_the_semester_strand_and_each_subjects_strand():
    page = pages(build(registration("senior_highschool"))[0])[0]
    assert "(Senior High School) First Semester, SY 2026-2027" in page
    assert "Semester 1st Semester" in page
    assert "No. Code Subject Strand Semester 1 OC11 Oral Communication — 1st Semester 2 PRECAL Pre-Calculus STEM" in page


def test_no_subjects_says_so_and_warns():
    body, warnings = build(registration(subjects=()))
    assert "No subjects on record for this enrollment." in pages(body)[0]
    assert warnings == ["No subjects are set up for Grade 7 in 2026-2027, so the COR's subject table is empty."]


@pytest.mark.parametrize("status, sentence", [
    ("enrolled", "This certifies that JUAN SANTOS DELA CRUZ JR. is officially enrolled in Grade 7, Section Rizal, "
                 "for School Year 2026-2027 at South Lakes Integrated School."),
    ("completed", "This certifies that JUAN SANTOS DELA CRUZ JR. was officially enrolled in Grade 7"),
    ("transferred_out", "was officially enrolled in Grade 7"),
])
def test_the_certification_follows_the_status(status, sentence):
    page = pages(build(registration(status=status))[0])[0]
    assert sentence in page
    assert "Certified by: REGINA T. MOLIDOR, LPT Registrar" in page and "Date issued: October 16, 2026" in page


def test_a_pending_enrollment_is_not_certified():
    body, warnings = build(registration(status="pending"))
    page = pages(body)[0]
    assert "Registration pending. JUAN SANTOS DELA CRUZ JR. is not yet officially enrolled for School Year 2026-2027." \
        in page
    assert "officially enrolled in" not in page and "Certified by:" not in page
    assert len(pages(body)) == 3                     # the agreement still prints, to be signed at the counter


def test_senior_high_certification_names_the_semester():
    page = pages(build(registration("senior_highschool"))[0])[0]
    assert "is officially enrolled in Grade 11 – STEM, Section Rizal, for the First Semester of School Year " \
           "2026-2027" in page


# ── Signers ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("level, name", [
    ("nursery", "ANA P. REYES, LPT"),
    ("kindergarten", "ANA P. REYES, LPT"),
    ("elementary", "ANA P. REYES, LPT"),
    ("junior_highschool", "ERWIN V. BUSTAMANTE, M. DIV."),
])
def test_the_levels_principal_approves(level, name):
    assert f"Approved by: {name} Principal/School Academic Head" in pages(build(registration(level))[0])[2]


def test_senior_high_is_noted_by_the_department_head_and_approved_by_its_principal():
    page = pages(build(registration("senior_highschool"))[0])[2]
    assert ("Noted by: MARIA CAROLINA A. LAGUERTA, LPT SHS Department Head "
            "Approved by: JOSE M. RIZAL, PHD Principal/School Academic Head") in page


def test_an_unset_principal_falls_back_to_the_school_head_then_a_bare_line():
    head_only = School(name="SLIS", head="Pedro D. Head", signatories=Signatories(records_officer="R. Officer"))
    body, warnings = build(registration(school=head_only))
    assert "Approved by: PEDRO D. HEAD Principal/School Academic Head" in pages(body)[2]
    assert warnings == []

    nobody = School(name="SLIS")
    body, warnings = build(registration(school=nobody))
    assert "Approved by: Principal/School Academic Head" in pages(body)[2]
    assert "Certified by: Registrar" in pages(body)[0]
    assert warnings == [
        "No Records Officer / Registrar is set under Billing Settings › School Forms, so the COR's registrar line "
        "prints without a name.",
        "No Junior High School Principal is set under Billing Settings › School Forms, so their signature line on "
        "the agreement prints without a name.",
    ]


# ── The loader ──────────────────────────────────────────────────────────────

def subject(i, name, grade="Grade 7", level="junior_highschool", strand=None, semester=None, sy=SY):
    return NS(subject_id=i, subject_code=f"S{i}", subject_name=name, school_level=level, grade_level=grade,
              strand=strand, semester=semester, school_year=sy)


def test_the_loader_takes_the_enrollments_subjects_by_name():
    st = student(5)
    rows = [enrollment(41, st, section="Rizal")]
    catalogue = [subject(1, "Science"), subject(2, "araling Panlipunan"), subject(3, "English"),
                 subject(4, "Filipino", grade="Grade 8"), subject(5, "Math", sy="2025-2026")]
    with models(Enrollment=rows, Subject=catalogue, SchoolIdentity=[school_row(records_officer_name="R. Officer")]):
        reg = data.load_registration(enrollment_id=41)
    assert [s.name for s in reg.subjects] == ["araling Panlipunan", "English", "Science"]
    assert reg.learner.student_number == "2019-0005" and reg.learner.status == "enrolled"
    assert reg.section == SectionInfo(SY, "junior_highschool", "Grade 7", "Rizal")
    assert reg.school.signatories.records_officer == "R. Officer"


def test_the_loader_gives_senior_high_the_core_and_its_strand_for_its_semester():
    st = student(6)
    rows = [enrollment(42, st, grade="Grade 11", level="senior_highschool", semester="1st", strand="STEM")]
    shs = dict(grade="Grade 11", level="senior_highschool")
    catalogue = [
        subject(1, "Oral Communication", semester="1st", **shs),
        subject(2, "Pre-Calculus", strand="STEM", semester="1st", **shs),
        subject(3, "Basic Calculus", strand="STEM", semester="2nd", **shs),
        subject(4, "Creative Writing", strand="HUMSS", semester="1st", **shs),
    ]
    with models(Enrollment=rows, Subject=catalogue, SchoolIdentity=[school_row()]):
        reg = data.load_registration(enrollment_id=42)
    assert [(s.name, s.strand, s.semester) for s in reg.subjects] == [
        ("Oral Communication", "", "1st"), ("Pre-Calculus", "STEM", "1st"),
    ]
    assert reg.section.strand == "STEM" and reg.section.semester == "1st"


def test_the_loader_refuses_an_unknown_enrollment():
    with models(SchoolIdentity=[school_row()]), pytest.raises(data.NothingToPrint, match="Enrollment not found."):
        data.load_registration(enrollment_id=999)
