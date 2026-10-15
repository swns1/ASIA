"""
The loaders, over in-memory querysets (enrollments/fake_orm.py): who makes
it onto each form, the contact number chosen, the class days, and the SF10
years and the level before them.
"""
from contextlib import ExitStack
from datetime import date
from decimal import Decimal
from types import SimpleNamespace as NS
from unittest.mock import patch

import pytest
from django.db import DatabaseError

from enrollments.fake_orm import FakeQuerySet
from school_forms import data
from school_forms.records import PriorLevel

SY = "2026-2027"
SY_DATES = (date(2026, 6, 8), date(2027, 4, 8))


def student(i, sex="male", status="active", **kw):
    fields = dict(pk=i, student_id=i, student_number=f"2019-000{i}", lrn=f"10910000000{i}", last_name=f"Cruz{i}",
                  first_name="Juan", middle_name="", suffix="", sex=sex, birth_date=date(2013, 1, 1),
                  religion="Catholic", current_address="Brgy. Uno", permanent_address="",
                  mobile_number="0900000000" + str(i), status=status)
    return NS(**{**fields, **kw})


def enrollment(i, st, status="enrolled", grade="Grade 7", level="junior_highschool", section="Rizal",
               sy=SY, semester=None, strand=None):
    return NS(enrollment_id=i, student_id=st.student_id, student=st, enrollment_status=status,
              grade_level=grade, school_level=level, section=section, school_year=sy,
              semester=semester, strand=strand)


def models(**querysets):
    """Patch each named model's manager in school_forms.data with a fake queryset."""
    stack = ExitStack()
    defaults = dict(
        Enrollment=[], GuardianMirror=[], EnrollmentTransfer=[], SectionAdvisory=[], User=[],
        Section=[], SchoolIdentity=[], CalendarEvent=[], AttendanceRecord=[], Grade=[], Subject=[], Student=[],
    )
    defaults.update(querysets)
    for name, rows in defaults.items():
        stack.enter_context(patch(f"school_forms.data.{name}.objects", FakeQuerySet(rows)))
    stack.enter_context(patch("school_forms.data.configured_dates", return_value=SY_DATES))
    return stack


def school_row(**kw):
    """school_settings' single row, every column the forms read."""
    columns = [c for group in data.SCHOOL_FIELDS for c in group]
    return NS(setting_id=1, **{**{c: "" for c in columns}, "school_name": "SLIS", **kw})


# ── Guardians and the contact number ────────────────────────────────────────

def guardian(gid, sid, relationship, name, mobile=None, primary=False):
    return NS(guardian_id=gid, student_id=sid, relationship=relationship, full_name=name,
              mobile_number=mobile, is_primary_contact=primary)


def test_the_primary_contacts_number_wins_then_father_mother_guardian():
    rows = [
        guardian(1, 1, "mother", "Rosa", "0917-MOTHER"),
        guardian(2, 1, "father", "Pedro", "0917-FATHER"),
        guardian(3, 2, "father", "Jose", "0918-FATHER"),
        guardian(4, 2, "guardian", "Lola", "0918-GUARDIAN", primary=True),
        guardian(5, 3, "mother", "Ana"),
    ]
    with models(GuardianMirror=rows):
        out = data._guardians({1, 2, 3})
    assert out[1] == {"father": "Pedro", "mother": "Rosa", "guardian": "", "contact": "0917-FATHER"}
    assert out[2]["contact"] == "0918-GUARDIAN"
    assert out[3]["contact"] == ""            # the learner's own number fills in later


# ── SF1 ─────────────────────────────────────────────────────────────────────

def test_register_lists_attended_rows_with_transfers_and_advisers():
    a, b, c = student(1), student(2, "female"), student(3)
    rows = [
        enrollment(1, a),
        enrollment(2, b, status="transferred_out"),
        enrollment(3, c, status="cancelled"),     # an application that never became a place
        enrollment(4, student(4), section="Bonifacio"),
    ]
    transfers = [NS(transfer_id=1, enrollment_id=2, transfer_type="transfer_out", effective_date=date(2026, 9, 1),
                    origin_school_name=None, destination_school_name="Cabuyao NHS")]
    with models(Enrollment=rows, EnrollmentTransfer=transfers,
                SectionAdvisory=[NS(school_year=SY, grade_level="Grade 7", section="Rizal", teacher_user_id=9)],
                User=[NS(user_id=9, name="Ms. Reyes")],
                SchoolIdentity=[school_row(school_address="Laguna", deped_school_id="401234", region="IV-A",
                                           division="Laguna", district="Cabuyao I", school_head_name="Maria")]):
        register = data.load_register(school_year=SY, grade_level="Grade 7", section="Rizal")
    assert [l.enrollment_id for l in register.learners] == [1, 2]
    assert register.learners[1].transfer_out.school == "Cabuyao NHS"
    assert register.learners[0].contact == "09000000001"   # no guardian number: the learner's own
    assert register.section.advisers == ("Ms. Reyes",)
    assert register.section.school_level == "junior_highschool"
    assert register.school.school_id == "401234" and register.school.head == "Maria"
    assert register.year_ended is False


def test_register_of_an_empty_section_says_so():
    with models(), pytest.raises(data.NothingToPrint, match="No learners in Grade 7 – Rizal for 2026-2027"):
        data.load_register(school_year=SY, grade_level="Grade 7", section="Rizal")


def test_senior_high_register_is_one_semester_and_takes_the_sections_strand():
    a = student(1)
    rows = [enrollment(1, a, grade="Grade 11", level="senior_highschool", semester="1st", strand="STEM"),
            enrollment(2, a, grade="Grade 11", level="senior_highschool", semester="2nd", strand="STEM")]
    with models(Enrollment=rows, Section=[NS(school_year_id=SY, grade_level="Grade 11", name="Rizal", strand="STEM")]):
        register = data.load_register(school_year=SY, grade_level="Grade 11", section="Rizal", semester="2nd")
    assert [l.enrollment_id for l in register.learners] == [2]
    assert register.section.strand == "STEM" and register.section.semester == "2nd"


def test_school_identity_falls_back_before_the_migrations():
    class Missing:
        """A database that has had the 2026-10 identity script but not the SF10 one."""
        asked = []

        def order_by(self, *a):
            return self

        def values(self, *fields):
            Missing.asked.append(fields)
            if "records_officer_name" in fields:
                raise DatabaseError("column school_settings.records_officer_name does not exist")
            return [{"school_name": "SLIS", "deped_school_id": "401234", "contact_phone": "0917"}]

    with patch("school_forms.data.SchoolIdentity.objects", Missing()):
        school = data.load_school()
    assert (school.name, school.school_id, school.phone, school.signatories.records_officer) == (
        "SLIS", "401234", "0917", "")
    assert len(Missing.asked) == 2


def test_school_identity_carries_the_sf10_letterhead_and_signatories():
    with models(SchoolIdentity=[school_row(contact_landline="(049) 560-3268", contact_email="a@b.ph",
                                           records_officer_name="Regina", shs_department_head_name="Erwin")]):
        school = data.load_school()
    assert (school.landline, school.email) == ("(049) 560-3268", "a@b.ph")
    assert school.signatories.records_officer == "Regina" and school.signatories.shs_department_head == "Erwin"


# ── SF2 ─────────────────────────────────────────────────────────────────────

def test_class_days_skip_weekends_breaks_and_days_outside_the_year():
    events = [NS(school_year=SY, event_type="holiday", start_date=date(2026, 9, 4), end_date=date(2026, 9, 4)),
              NS(school_year=SY, event_type="quarter_break", start_date=date(2026, 9, 28), end_date=date(2026, 10, 2)),
              NS(school_year=SY, event_type="exam", start_date=date(2026, 9, 7), end_date=date(2026, 9, 7))]
    with models(CalendarEvent=events):
        days = data.class_days(SY, date(2026, 9, 1), date(2026, 9, 30), saturdays={date(2026, 9, 12)})
    assert date(2026, 9, 4) not in days and date(2026, 9, 28) not in days and date(2026, 9, 30) not in days
    assert date(2026, 9, 7) in days                  # an exam day is a class day
    assert date(2026, 9, 12) in days                 # a Saturday someone took attendance on
    assert date(2026, 9, 5) not in days and date(2026, 9, 6) not in days
    with models():
        june = data.class_days(SY, date(2026, 6, 1), date(2026, 6, 30))
    assert june[0] == date(2026, 6, 8)               # the year opens on the 8th


def test_attendance_lists_who_was_in_class_that_month():
    learners = {i: student(i) for i in range(1, 6)}
    rows = [enrollment(i, learners[i], status="transferred_out" if i == 2 else "enrolled") for i in learners]
    transfers = [
        NS(transfer_id=1, enrollment_id=2, transfer_type="transfer_out", effective_date=date(2026, 8, 20),
           origin_school_name=None, destination_school_name="X"),   # left before September
        NS(transfer_id=2, enrollment_id=3, transfer_type="transfer_in", effective_date=date(2026, 10, 5),
           origin_school_name="Y", destination_school_name=None),   # arrives in October
    ]
    marks = [NS(enrollment_id=1, date=date(2026, 9, 1), status="P"),
             NS(enrollment_id=5, date=date(2026, 9, 2), status="A")]
    with models(Enrollment=rows, EnrollmentTransfer=transfers, AttendanceRecord=marks):
        result = data.load_attendance(school_year=SY, grade_level="Grade 7", section="Rizal", month=date(2026, 9, 1))
    assert [l.enrollment_id for l in result.listed] == [1, 5]
    assert [l.enrollment_id for l in result.left_off] == [4]      # on the roster, no record all month
    assert len(result.roster) == 5
    assert result.marks == {(1, date(2026, 9, 1)): "P", (5, date(2026, 9, 2)): "A"}


def test_a_month_with_no_attendance_at_all_still_lists_the_class():
    rows = [enrollment(1, student(1)), enrollment(2, student(2))]
    with models(Enrollment=rows):
        result = data.load_attendance(school_year=SY, grade_level="Grade 7", section="Rizal", month=date(2026, 9, 1))
    assert len(result.listed) == 2 and result.left_off == ()


# ── SF10 ────────────────────────────────────────────────────────────────────

QUARTERS = ("1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter")


def grade(enrollment_id, subject_id, name, period, value, strand=None, remarks=None):
    return NS(enrollment_id=enrollment_id, subject_id=subject_id, grading_period=period,
              numeric_grade=Decimal(value), remarks=remarks,
              subject=NS(subject_name=name, strand=strand, subject_group=None))


def subject_row(sid, name, grade_level, sy, level="elementary", strand=None, semester=None, group=None):
    return NS(subject_id=sid, subject_name=name, grade_level=grade_level, school_year=sy,
              school_level=level, strand=strand, semester=semester, subject_group=group)


def test_elementary_record_starts_with_kindergarten():
    st = student(1, permanent_address="Brgy. San Jose, San Pablo City")
    rows = [
        enrollment(10, st, status="completed", grade="Kindergarten", level="kindergarten", sy="2019-2020"),
        enrollment(11, st, status="completed", grade="Grade 1", level="elementary", sy="2020-2021"),
        enrollment(12, st, status="enrolled", grade="Grade 2", level="elementary", sy="2021-2022"),
        enrollment(13, st, status="cancelled", grade="Grade 3", level="elementary", sy="2022-2023"),
    ]
    subjects = [subject_row(1, "Mathematics", "Grade 1", "2020-2021"),
                subject_row(2, "Filipino", "Grade 1", "2020-2021"),
                subject_row(3, "Science", "Grade 2", "2021-2022")]
    grades = [grade(11, 1, "Mathematics", "1st_quarter", "88.00")]
    family = [guardian(1, 1, "father", "Pedro Cruz"), guardian(2, 1, "mother", "Rosa Cruz")]
    with models(Student=[st], Enrollment=rows, Subject=subjects, Grade=grades, GuardianMirror=family,
                SchoolIdentity=[school_row()]):
        record = data.load_permanent_record(student_id=1, level="elementary")
    assert [(y.grade_level, y.completed) for y in record.years] == [("Grade 1", True), ("Grade 2", False)]
    first = record.years[0]
    assert sorted(s.name for s in first.subjects) == ["Filipino", "Mathematics"]   # expected, even ungraded
    maths = next(s for s in first.subjects if s.name == "Mathematics")
    assert (maths.grades, maths.order, maths.group) == ({"1st_quarter": Decimal("88.00")}, 1, "")
    assert record.prior == PriorLevel(level="KINDER", school_year="2019-2020", school="SLIS",
                                      final_rating="-", remarks="Grade 1 Ready")
    learner = record.learner
    assert (learner.lrn, learner.student_number, learner.father, learner.mother) == (
        "109100000001", "2019-0001", "Pedro Cruz", "Rosa Cruz")
    assert learner.address == "Brgy. San Jose, San Pablo City"           # the permanent address first


def test_kindergarten_alone_is_enough_for_an_elementary_record():
    st = student(1)
    rows = [enrollment(10, st, status="enrolled", grade="Kindergarten", level="kindergarten", sy="2026-2027")]
    with models(Student=[st], Enrollment=rows):
        record = data.load_permanent_record(student_id=1, level="elementary")
    assert record.years == ()
    assert (record.prior.school_year, record.prior.remarks) == ("2026-2027", "")   # not completed yet
    assert record.learner.address == "Brgy. Uno"                                   # no permanent address


def test_senior_high_subjects_carry_their_group():
    st = student(1)
    rows = [enrollment(20, st, status="completed", grade="Grade 11", level="senior_highschool",
                       sy="2024-2025", semester="1st", strand="STEM")]
    shs = {"level": "senior_highschool", "semester": "1st"}
    subjects = [
        subject_row(1, "Oral Communication", "Grade 11", "2024-2025", **shs),
        subject_row(2, "Pre-Calculus", "Grade 11", "2024-2025", strand="STEM", **shs),
        subject_row(3, "Fundamentals of ABM", "Grade 11", "2024-2025", strand="ABM", **shs),
        subject_row(4, "Statistics", "Grade 11", "2024-2025", level="senior_highschool", semester="2nd"),
        subject_row(5, "Empowerment Technologies", "Grade 11", "2024-2025", **shs),
        subject_row(6, "General Biology 1", "Grade 11", "2024-2025", group="specialized", **shs),
    ]
    with models(Student=[st], Enrollment=rows, Subject=subjects):
        record = data.load_permanent_record(student_id=1, level="senior_highschool")
    (year,) = record.years
    assert year.periods == ("1st_semester",)
    assert {s.name: s.group for s in year.subjects} == {
        "Oral Communication": "core", "Pre-Calculus": "specialized",
        "Empowerment Technologies": "applied", "General Biology 1": "specialized",   # the registrar's choice
    }
    assert record.prior == PriorLevel(level="GRADE 10")                             # Grade 10 not taken here


def test_junior_high_starts_with_the_grade_6_general_average():
    st = student(1)
    rows = [enrollment(30, st, status="completed", grade="Grade 6", level="elementary", sy="2021-2022"),
            enrollment(31, st, status="enrolled", grade="Grade 7", level="junior_highschool", sy="2022-2023")]
    subjects = [subject_row(1, "English", "Grade 6", "2021-2022")]
    grades = [grade(30, 1, "English", p, "95") for p in QUARTERS]
    with models(Student=[st], Enrollment=rows, Subject=subjects, Grade=grades):
        record = data.load_permanent_record(student_id=1, level="junior_highschool")
    assert (record.prior.level, record.prior.final_rating, record.prior.remarks) == ("GRADE 6", "95", "PROMOTED")


def test_permanent_record_for_a_level_never_attended_here():
    st = student(1)
    with models(Student=[st], Enrollment=[enrollment(1, st, grade="Grade 7")]), \
         pytest.raises(data.NothingToPrint):
        data.load_permanent_record(student_id=1, level="senior_highschool")
    with models(), pytest.raises(data.NothingToPrint, match="Learner not found"):
        data.load_permanent_record(student_id=99, level="elementary")
