"""
Where each value goes in each DepEd template (SF1 and SF2; the SF10 is the
school's own format, drawn by sf10.py).

Every map names its template file and sheet, and carries `anchors`: labels
DepEd printed at fixed cells. test_cells.py opens every template and checks
them, so a newer DepEd file that moved its cells fails a test instead of
quietly filing a learner's birthday under Mother Tongue.

Rows and columns are the template's own, before any learner rows are
inserted. The builders shift whatever sits below an insert.
"""
from dataclasses import dataclass, field

DO4_WORKBOOK = "deped-school-forms-do4-2014.xlsx"
SHS_WORKBOOK = "lis-senior-high-school-forms.xlsx"


@dataclass(frozen=True)
class Picture:
    """Where DepEd's file had a picture openpyxl drops, in EMU from (col, row), counted from 0."""
    col: int
    row: int
    col_off: int
    row_off: int
    cx: int
    cy: int


@dataclass(frozen=True)
class Group:
    """A block of learner rows, and the row under it that totals them (if any)."""
    first_row: int
    last_row: int
    total_row: int | None = None

    @property
    def capacity(self):
        return self.last_row - self.first_row + 1


# ─── SF1: School Register ───────────────────────────────────────────────────

@dataclass(frozen=True)
class RegisterMap:
    name: str
    template: str
    sheet: str
    anchors: dict
    header: dict
    # One group (Nursery–Grade 10, males then females) or two (senior high:
    # male, female), each with its own capacity.
    groups: tuple
    combined_row: int | None
    count_col: str | None          # where a group's headcount goes on its total row
    columns: dict                  # field -> column letter
    row_merges: tuple              # column spans every learner row should have merged
    birth_date_format: str | None  # None keeps the template's format
    footer: dict                   # field -> cell
    footer_merges: tuple = ()
    relabel: dict = field(default_factory=dict)
    clear_columns: tuple = ()      # placeholders DepEd printed in empty rows
    picture: Picture | None = None


SF1 = RegisterMap(
    name="SF1",
    template=DO4_WORKBOOK,
    sheet="School Form 1 (SF1)",
    anchors={
        "A1": "School Form 1 (SF 1) School Register",
        "D4": "School ID", "H4": "Region", "K4": "Division", "Q4": "District",
        "C6": "School Name", "L6": "School Year", "Q6": "Grade Level", "U6": "Section",
        "B8": "LRN", "G8": "Sex (M/F)", "M8": "RELIGION", "X8": "Contact Number",
        "Y8": "REMARK/S",
        "A57": "List and code of Indicators under REMARK column",
        "Q59": "MALE", "Q60": "FEMALE", "Q61": "TOTAL",
        "R58": "BoSY", "S58": "EoSY",
        "U57": "Prepared by:", "X57": "Certified Correct:",
    },
    header={
        "school_id": "F4", "region": "J4", "division": "M4", "district": "S4",
        "school_name": "F6", "school_year": "O6", "grade_level": "S6", "section": "V6",
    },
    groups=(Group(10, 56),),
    combined_row=None,
    count_col=None,
    columns={
        "number": "A", "lrn": "B", "name": "C", "sex": "G", "birth_date": "H", "age": "I",
        "birth_place": "J", "mother_tongue": "K", "ip": "L", "religion": "M",
        "street": "N", "barangay": "O", "municipality": "P", "province": "Q",
        "father": "R", "mother": "T", "guardian": "V", "guardian_relationship": "W",
        "contact": "X", "remarks": "Y",
    },
    row_merges=("C:F", "R:S", "T:U"),
    birth_date_format=None,
    footer={
        "bosy_male": "R59", "bosy_female": "R60", "bosy_total": "R61",
        "eosy_male": "S59", "eosy_female": "S60", "eosy_total": "S61",
        "adviser": "U59", "school_head": "X59",
    },
    footer_merges=("U59:V59", "X59:Y59"),
    # DepEd's 2022 LIS update moved the age cut-off.
    relabel={"I8": "AGE as of October 31"},
    picture=Picture(col=22, row=0, col_off=372700, row_off=0, cx=3975637, cy=1615108),
)

SF1_SHS = RegisterMap(
    name="SF1-SHS",
    template=SHS_WORKBOOK,
    sheet="SHSF-1",
    anchors={
        "A1": "School Form 1 School Register for Senior High School",
        "B3": "School Name", "K3": "School ID", "S3": "District", "Y3": "Division",
        "AE3": "Region", "D5": "Semester", "L5": "School Year", "U5": "Grade Level",
        "Z5": "Track and Strand", "A7": "Section",
        "A9": "LRN", "G9": "Sex (M/F)", "L9": "Religious Affiliation",
        "C51": "<=== TOTAL MALE", "C92": "<=== TOTAL FEMALE", "C93": "<=== COMBINED",
        "R95": "REGISTERED", "Y95": "Prepared By:",
    },
    header={
        "school_name": "F3", "school_id": "M3", "district": "U3", "division": "Z3",
        "region": "AF3", "semester": "F5", "school_year": "M5", "grade_level": "W5",
        "track_strand": "AC5", "section": "F7",
    },
    groups=(Group(11, 50, total_row=51), Group(52, 91, total_row=92)),
    combined_row=93,
    count_col="A",
    columns={
        "lrn": "A", "name": "C", "sex": "G", "birth_date": "H", "age": "J",
        "religion": "L", "street": "M", "barangay": "N", "municipality": "R",
        "province": "U", "father": "W", "mother": "X", "guardian": "Z",
        "guardian_relationship": "AC", "contact": "AD", "remarks": "AE",
    },
    # DepEd's file merges these on some rows and not others; every learner
    # row gets the same set so dates and names never get cut off.
    row_merges=("A:B", "C:F", "H:I", "J:K", "N:Q", "R:T", "U:V", "X:Y", "Z:AB", "AE:AF"),
    birth_date_format="mm/dd/yyyy",
    footer={
        "bosy_male": "U96", "bosy_female": "U97", "bosy_total": "U99",
        "eosy_male": "W96", "eosy_female": "W97", "eosy_total": "W99",
        "adviser": "Y96",
    },
    # The LRN column arrives numbered 1-40 as placeholders.
    clear_columns=("A",),
)


# ─── SF2: Daily Attendance Report ───────────────────────────────────────────

@dataclass(frozen=True)
class AttendanceMap:
    name: str
    template: str
    sheet: str
    anchors: dict
    header: dict
    groups: tuple                 # (male, female)
    combined_row: int
    count_col: str | None
    columns: dict                 # number, name, absent, tardy, remarks
    row_merges: tuple
    day_columns: tuple            # one column per day slot
    date_row: int
    day_row: int | None           # None when DepEd pre-printed the weekdays
    days_per_week: int | None     # weekday-aligned slots per week; None = consecutive class days
    summary_columns: tuple        # (male, female, total)
    summary_rows: dict            # field -> row
    month_cell: str
    class_days_cell: str
    signatures: dict              # adviser / school_head -> cell
    signature_merges: tuple = ()
    header_merges: tuple = ()     # boxes DepEd drew without merging
    picture: Picture | None = None


SF2 = AttendanceMap(
    name="SF2",
    template=DO4_WORKBOOK,
    sheet="School Form 2 (SF2)",
    anchors={
        "A2": "School Form 2 (SF2) Daily Attendance Report of Learners",
        "B6": "School ID", "H6": "School Year", "Q6": "Report for the Month of",
        "B8": "Name of School", "T8": "Grade Level", "Z8": "Section",
        "A10": "LEARNER'S NAME", "AC12": "ABSENT", "AD12": "TARDY",
        "A35": "MALE | TOTAL Per Day", "A61": "FEMALE | TOTAL Per Day",
        "A62": "Combined TOTAL PER DAY",
        "AB64": "Month:", "AH65": "M", "AI65": "F", "AJ65": "TOTAL",
        "AB66": "* Enrolment as of", "AB70": "Registered Learner as of end of the month",
        "AB74": "Average Daily Attendance", "AB79": "Drop out",
        "AB81": "Transferred out", "AB83": "Transferred in",
    },
    header={
        "school_id": "C6", "school_year": "K6", "month": "X6",
        "school_name": "C8", "grade_level": "X8", "section": "AC8",
    },
    groups=(Group(14, 34, total_row=35), Group(36, 60, total_row=61)),
    combined_row=62,
    count_col=None,
    columns={"number": "A", "name": "B", "absent": "AC", "tardy": "AD", "remarks": "AE"},
    row_merges=("B:C", "AE:AJ"),
    day_columns=(
        "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P",
        "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB",
    ),
    date_row=11,
    day_row=12,
    days_per_week=None,
    summary_columns=("AH", "AI", "AJ"),
    summary_rows={
        "enrolment": 66, "late_enrolment": 68, "registered": 70,
        "percent_enrolment": 72, "average_daily_attendance": 74,
        "percent_attendance": 75, "five_consecutive_absences": 77,
        "dropped": 79, "transferred_out": 81, "transferred_in": 83,
    },
    # AD, not AC: "Month:" in AB needs AC empty to print in full.
    month_cell="AD64",
    class_days_cell="AG64",
    signatures={"adviser": "AD88", "school_head": "AD92"},
    signature_merges=("AD88:AI88", "AD92:AI92"),
    header_merges=("C8:O8",),
    picture=Picture(col=29, row=0, col_off=452477, row_off=47642, cx=2712554, cy=1262046),
)

SF2_SHS = AttendanceMap(
    name="SF2-SHS",
    template=SHS_WORKBOOK,
    sheet="SHSF-2",
    anchors={
        "A1": "School Form 2 Daily Attendance Report of Learners for Senior High School",
        "A3": "School Name", "R3": "School ID", "AC3": "District", "AM3": "Division",
        "AW3": "Region", "E5": "Semester", "Q5": "School Year", "AC5": "Grade Level",
        "AN5": "Track and Strand", "E7": "Section", "AS7": "Month of",
        "A9": "No.", "C9": "NAME", "F9": "DATE",
        "F11": "M", "L11": "S", "AJ11": "M", "AQ11": "S",
        "AR11": "ABSENT", "AT11": "TARDY",
        "C29": "<=== MALE | TOTAL Per Day", "C57": "<=== FEMALE | TOTAL Per Day",
        "C58": "Combined TOTAL Per Day",
        "AR60": "Month:", "AW61": "M", "AX61": "F", "AY61": "TOTAL",
        "AR64": "Registered Learners as of end of the month",
        "AR66": "Average Daily Attendance", "AR70": "No Longer in School (NLS)",
        "AR71": "Transferred Out", "AR72": "Transferred In",
    },
    header={
        "school_name": "F3", "school_id": "V3", "district": "AF3", "division": "AR3",
        "region": "AX3", "semester": "F5", "school_year": "V5", "grade_level": "AH5",
        "track_strand": "AV5", "section": "F7", "month": "AV7",
    },
    groups=(Group(12, 28, total_row=29), Group(30, 56, total_row=57)),
    combined_row=58,
    count_col=None,
    columns={"number": "A", "name": "C", "absent": "AR", "tardy": "AT", "remarks": "AV"},
    row_merges=(
        "A:B", "C:E", "F:G", "M:N", "T:U", "X:Y", "Z:AA", "AC:AD", "AK:AL", "AO:AP",
        "AR:AS", "AT:AU", "AV:AY",
    ),
    # Five weeks of Monday to Saturday, as DepEd printed them in row 11.
    day_columns=(
        "F", "H", "I", "J", "K", "L",
        "M", "O", "P", "Q", "R", "S",
        "T", "V", "W", "X", "Z", "AB",
        "AC", "AE", "AF", "AG", "AH", "AI",
        "AJ", "AK", "AM", "AN", "AO", "AQ",
    ),
    date_row=10,
    day_row=None,
    days_per_week=6,
    summary_columns=("AW", "AX", "AY"),
    summary_rows={
        "enrolment": 62, "late_enrolment": 63, "registered": 64,
        "percent_enrolment": 65, "average_daily_attendance": 66,
        "percent_attendance": 67, "five_consecutive_absences": 68,
        "dropped": 70, "transferred_out": 71, "transferred_in": 72,
    },
    month_cell="AR61",
    class_days_cell="AU61",
    signatures={"adviser": "AS79", "school_head": "AS84"},
    signature_merges=("AS79:AY79",),
)


REGISTER_MAPS = (SF1, SF1_SHS)
ATTENDANCE_MAPS = (SF2, SF2_SHS)
