"""
The plain data the form builders take, and the formatting DepEd's forms share.

data.py fills these from the database; sf1.py, sf2.py and sf10.py turn them
into workbooks. Nothing here touches the ORM, so the builders are tested with
hand-made records.
"""
from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class School:
    name: str = ""
    address: str = ""
    school_id: str = ""
    region: str = ""
    division: str = ""
    district: str = ""
    head: str = ""


@dataclass(frozen=True)
class Transfer:
    kind: str               # "transfer_in" or "transfer_out"
    effective_date: date
    school: str = ""        # where the learner came from, or went


@dataclass(frozen=True)
class Learner:
    enrollment_id: int
    student_id: int
    lrn: str
    last_name: str
    first_name: str
    middle_name: str = ""
    suffix: str = ""
    sex: str = ""           # "male" or "female"
    birth_date: date | None = None
    religion: str = ""
    address: str = ""
    father: str = ""
    mother: str = ""
    guardian: str = ""
    contact: str = ""
    status: str = "enrolled"        # the enrollment's
    student_status: str = "active"  # the student's
    transfer_in: Transfer | None = None
    transfer_out: Transfer | None = None


@dataclass(frozen=True)
class SectionInfo:
    school_year: str
    school_level: str
    grade_level: str
    section: str
    strand: str = ""
    semester: str = ""      # "1st" or "2nd", senior high only
    advisers: tuple = ()


@dataclass(frozen=True)
class RegisterData:
    """SF1."""
    school: School
    section: SectionInfo
    learners: tuple
    year_ended: bool = False


@dataclass(frozen=True)
class AttendanceData:
    """SF2 for one month."""
    school: School
    section: SectionInfo
    month: date                     # the 1st of the month
    class_days: tuple               # dates, ascending
    roster: tuple                   # every learner of the section this year
    listed: tuple                   # those in class at some point this month, in print order
    marks: dict = field(default_factory=dict)  # (enrollment_id, date) -> P / A / L / E
    left_off: tuple = ()            # on the roster, but no attendance at all this month


@dataclass(frozen=True)
class SubjectRecord:
    name: str
    grades: dict                    # grading period -> numeric grade
    recorded_remarks: tuple = ()    # the teacher's per-period remarks
    core: bool = False              # senior high: tied to no strand


@dataclass(frozen=True)
class YearRecord:
    """One enrollment on an SF10: a school year, or a senior high semester."""
    school_year: str
    grade_level: str
    section: str
    periods: tuple                  # the grading periods this level uses
    subjects: tuple
    strand: str = ""
    semester: str = ""
    adviser: str = ""


@dataclass(frozen=True)
class Eligibility:
    """What got the learner into this level, when it was earned here."""
    completed_here: bool = False
    general_average: int | None = None


@dataclass(frozen=True)
class PermanentRecordData:
    """SF10 for one level."""
    school: School
    level: str                      # elementary / junior_highschool / senior_highschool
    learner: Learner
    years: tuple
    eligibility: Eligibility = Eligibility()


# ─── Formatting DepEd's forms share ─────────────────────────────────────────

def _join(*parts):
    return " ".join(p.strip() for p in parts if p and p.strip())


def register_name(learner):
    """'DELA CRUZ, Juan Santos Jr.': the surname, then the rest, as the app prints names."""
    given = _join(learner.first_name, learner.middle_name, learner.suffix)
    return ", ".join(p for p in (learner.last_name.strip(), given) if p)


def natural_name(learner):
    """'Juan Santos Dela Cruz Jr.', for the SF10 certification sentence."""
    return _join(learner.first_name, learner.middle_name, learner.last_name, learner.suffix)


def sex_letter(sex):
    return {"male": "M", "female": "F"}.get((sex or "").lower(), "")


def age_on(birth_date, on):
    """Whole years on `on`, as of the last birthday."""
    if not birth_date:
        return None
    years = on.year - birth_date.year
    if (on.month, on.day) < (birth_date.month, birth_date.day):
        years -= 1
    return years if years >= 0 else None


def age_cutoff(school_year):
    """DepEd's age cut-off since the 2022 LIS update: 31 October of the opening year."""
    return date(int(school_year[:4]), 10, 31)


def grade_number(grade_level):
    """'Grade 7' -> '7'; anything without a number comes back as it was."""
    digits = "".join(ch for ch in str(grade_level) if ch.isdigit())
    return digits or str(grade_level)


def semester_label(semester):
    return {"1st": "1st Semester", "2nd": "2nd Semester"}.get(semester, semester or "")


def short_date(value):
    """mm/dd/yyyy, the format DepEd's forms ask for."""
    return f"{value.month:02d}/{value.day:02d}/{value.year}" if value else ""


def by_sex_then_name(learner):
    """DepEd lists males first, then females, each A to Z."""
    rank = {"male": 0, "female": 1}.get((learner.sex or "").lower(), 2)
    return (rank, learner.last_name.lower(), learner.first_name.lower(), learner.enrollment_id)
