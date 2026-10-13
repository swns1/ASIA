"""
Where each value goes in each DepEd template.

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


# ─── SF10: Learner's Permanent Academic Record ──────────────────────────────

@dataclass(frozen=True)
class GradeBlock:
    """One school year (one semester for senior high) on an SF10."""
    sheet: str
    header: dict                  # field -> cell
    subject_rows: tuple           # (first, last)
    label_col: str
    period_cols: tuple            # quarterly rating columns
    final_col: str
    remarks_col: str
    general_average_row: int
    # Fields DepEd printed as one "Label: ______" cell rather than a box.
    text_header: dict = field(default_factory=dict)  # cell -> template with {field} slots
    reserved_rows: int = 0        # DepEd's Madrasah rows at the bottom: used only on overflow
    type_col: str | None = None   # senior high: CORE / APPLIED / SPECIALIZED
    quarter_label_cells: tuple = ()
    adviser_cell: str | None = None
    # DepEd's file leaves some subject rows unmerged, which clips a centred
    # "PASSED" to "ASSED"; every subject row gets these.
    row_merges: tuple = ()


@dataclass(frozen=True)
class PermanentRecordMap:
    name: str
    template: str
    anchors: dict                 # (sheet, cell) -> label
    learner: dict                 # field -> (sheet, cell)
    eligibility: dict             # field -> (sheet, cell)
    blocks: tuple
    certification: dict           # field -> (sheet, cell)
    certification_merges: tuple = ()
    footer: dict = field(default_factory=dict)


def _es_box(row, side):
    """SF10-ES front blocks: (school row) + 1..3 for district, grade and adviser."""
    left = side == "left"
    return {
        "school": f"{'D' if left else 'X'}{row}",
        "school_id": f"{'S' if left else 'AW'}{row}",
        "district": f"{'D' if left else 'X'}{row + 1}",
        "division": f"{'I' if left else 'AD'}{row + 1}",
        "region": f"{'T' if left else 'AX'}{row + 1}",
        "grade": f"{'F' if left else 'Z'}{row + 2}",
        "section": f"{'J' if left else 'AE'}{row + 2}",
        "school_year": f"{'S' if left else 'AU'}{row + 2}",
        "adviser": f"{'H' if left else 'AC'}{row + 3}",
    }


def _es_front(row, subjects, side):
    left = side == "left"
    return GradeBlock(
        sheet="Front",
        header=_es_box(row, side),
        subject_rows=subjects,
        label_col="B" if left else "V",
        period_cols=("K", "L", "N", "O") if left else ("AJ", "AM", "AO", "AR"),
        final_col="P" if left else "AT",
        remarks_col="S" if left else "AW",
        general_average_row=subjects[1] + 1,
        reserved_rows=2,
        row_merges=("B:J", "L:M", "P:R", "S:T") if left
        else ("V:AI", "AJ:AL", "AM:AN", "AO:AQ", "AR:AS", "AT:AV", "AW:AX"),
    )


def _es_back(row, subjects, side):
    left = side == "left"
    text_col = "B" if left else "S"
    return GradeBlock(
        sheet="Back",
        header={
            "school_id": f"{'O' if left else 'AG'}{row}",
            "region": f"{'P' if left else 'AH'}{row + 1}",
            "school_year": f"{'O' if left else 'AG'}{row + 2}",
        },
        text_header={
            f"{text_col}{row}": "School: {school}",
            f"{text_col}{row + 1}": "District: {district}    Division: {division}",
            f"{text_col}{row + 2}": "Classified as Grade: {grade}    Section: {section}",
            f"{text_col}{row + 3}": "Name of Adviser/Teacher: {adviser}",
        },
        subject_rows=subjects,
        label_col="B" if left else "S",
        period_cols=("H", "I", "J", "K") if left else ("AB", "AD", "AE", "AF"),
        final_col="L" if left else "AG",
        remarks_col="O" if left else "AH",
        general_average_row=subjects[1] + 1,
        reserved_rows=2,
        row_merges=("B:G", "L:N", "O:Q") if left else ("S:AA", "AB:AC", "AH:AI"),
    )


SF10_ES = PermanentRecordMap(
    name="SF10-ES",
    template="lis-sf10-es-2025-03-26.xlsx",
    anchors={
        ("Front", "B1"): "SF10-ES",
        ("Front", "B9"): "LAST NAME:", ("Front", "N9"): "FIRST NAME:",
        ("Front", "AJ9"): "MIDDLE NAME:", ("Front", "B10"): "Learner Reference Number",
        ("Front", "L14"): "Kinder Progress Report", ("Front", "B15"): "Name of School:",
        ("Front", "B23"): "School:", ("Front", "V23"): "School:",
        ("Front", "B52"): "School:", ("Front", "V52"): "School:",
        ("Front", "B45"): "General Average", ("Front", "B75"): "General Average",
        ("Front", "B44"): "*Islamic Values Education",
        ("Back", "B3"): "School:", ("Back", "S3"): "School:",
        ("Back", "B32"): "School:", ("Back", "S32"): "School:",
        ("Back", "B25"): "General Average", ("Back", "B54"): "General Average",
        ("Back", "C61"): "CERTIFICATION",
        ("Back", "C62"): "I CERTIFY that this is a true record of",
    },
    learner={
        "last_name": ("Front", "E9"), "first_name": ("Front", "R9"),
        "suffix": ("Front", "AD9"), "middle_name": ("Front", "AQ9"),
        "lrn": ("Front", "J10"), "birth_date": ("Front", "V10"), "sex": ("Front", "AT10"),
    },
    eligibility={
        "kinder_check": ("Front", "K14"),
        "school_name": ("Front", "F15"), "school_id": ("Front", "T15"),
        "school_address": ("Front", "Z15"),
    },
    blocks=(
        _es_front(23, (30, 44), "left"),
        _es_front(23, (30, 44), "right"),
        _es_front(52, (60, 74), "left"),
        _es_front(52, (60, 74), "right"),
        _es_back(3, (10, 24), "left"),
        _es_back(3, (10, 24), "right"),
        _es_back(32, (39, 53), "left"),
        _es_back(32, (39, 53), "right"),
    ),
    certification={
        "name": ("Back", "H62"), "lrn": ("Back", "S62"), "next_grade": ("Back", "AH62"),
        "school_name": ("Back", "E63"), "school_id": ("Back", "L63"),
        "division": ("Back", "Q63"), "last_school_year": ("Back", "Z63"),
        "school_head": ("Back", "M65"),
    },
)


def _jhs_block(sheet, header_row, subjects):
    second = header_row + 1
    return GradeBlock(
        sheet=sheet,
        header={
            "school": f"E{header_row}", "school_id": f"U{header_row}",
            "district": f"AD{header_row}", "division": f"AP{header_row}",
            "region": f"BB{header_row}",
            "grade": f"I{second}", "section": f"N{second}",
            "school_year": f"V{second}", "adviser": f"AI{second}",
        },
        subject_rows=subjects,
        label_col="B",
        period_cols=("U", "Y", "AC", "AG"),
        final_col="AJ",
        remarks_col="AP",
        general_average_row=subjects[1] + 1,
        row_merges=("B:T", "U:X", "Y:AB", "AC:AF", "AG:AI", "AJ:AO", "AP:BC"),
    )


SF10_JHS = PermanentRecordMap(
    name="SF10-JHS",
    template="lis-sf10-jhs-2025-03-26.xlsx",
    anchors={
        ("Front", "B1"): "SF10-JHS",
        ("Front", "B7"): "LAST NAME:", ("Front", "R7"): "FIRST NAME:",
        ("Front", "AQ7"): "MIDDLE NAME:", ("Front", "B8"): "Learner Reference Number",
        ("Front", "D12"): "Elementary School Completer",
        ("Front", "B21"): "School:", ("Front", "B49"): "School:",
        ("Front", "U40"): "General Average", ("Front", "U68"): "General Average",
        ("Front", "B77"): "CERTIFICATION",
        ("Front", "B79"): "I CERTIFY that this is a true record of",
        ("Back", "B3"): "School:", ("Back", "B31"): "School:", ("Back", "B59"): "School:",
        ("Back", "U22"): "General Average", ("Back", "U50"): "General Average",
        ("Back", "U78"): "General Average",
    },
    learner={
        "last_name": ("Front", "G7"), "first_name": ("Front", "W7"),
        "suffix": ("Front", "AN7"), "middle_name": ("Front", "AX7"),
        "lrn": ("Front", "M8"), "birth_date": ("Front", "AH8"), "sex": ("Front", "AV8"),
    },
    eligibility={
        "completer_check": ("Front", "B12"), "general_average": ("Front", "AC12"),
        "school_name": ("Front", "M13"), "school_id": ("Front", "AH13"),
        "school_address": ("Front", "AR13"),
    },
    blocks=(
        _jhs_block("Front", 21, (26, 39)),
        _jhs_block("Front", 49, (54, 67)),
        _jhs_block("Back", 3, (8, 21)),
        _jhs_block("Back", 31, (36, 49)),
        _jhs_block("Back", 59, (64, 77)),
    ),
    certification={
        "name": ("Front", "O79"), "lrn": ("Front", "AF79"), "next_grade": ("Front", "BB79"),
        "school_name": ("Front", "H80"), "school_id": ("Front", "AC80"),
        "last_school_year": ("Front", "AS80"), "school_head": ("Front", "S81"),
    },
)


def _shs_block(sheet, header_row, quarter_row, subjects, signature_row):
    track_row = header_row + 2
    return GradeBlock(
        sheet=sheet,
        header={
            "school": f"E{header_row}", "school_id": f"AF{header_row}",
            "grade": f"AS{header_row}", "school_year": f"BA{header_row}",
            "semester": f"BK{header_row}",
            "track_strand": f"G{track_row}", "section": f"AS{track_row}",
        },
        subject_rows=subjects,
        label_col="I",
        period_cols=("AT", "AY"),
        final_col="BD",
        remarks_col="BI",
        general_average_row=subjects[1] + 1,
        type_col="A",
        quarter_label_cells=(f"AT{quarter_row}", f"AY{quarter_row}"),
        adviser_cell=f"A{signature_row}",
        row_merges=("A:H", "I:AS", "AT:AX", "AY:BC", "BD:BH", "BI:BO"),
    )


SF10_SHS = PermanentRecordMap(
    name="SF10-SHS",
    template="lis-sf10-shs.xlsx",
    anchors={
        ("FRONT", "BH1"): "SF10-SHS",
        ("FRONT", "A8"): "LAST NAME:", ("FRONT", "T8"): "FIRST NAME:",
        ("FRONT", "AS8"): "MIDDLE NAME:", ("FRONT", "A9"): "LRN:",
        ("FRONT", "T13"): "Junior High School Completer",
        ("FRONT", "A23"): "SCHOOL:", ("FRONT", "A66"): "SCHOOL:",
        ("FRONT", "A43"): "General Ave. for the Semester:",
        ("FRONT", "A86"): "General Ave. for the Semester:",
        ("FRONT", "A50"): "Signature of Adviser over Printed Name",
        ("BACK", "A4"): "SCHOOL:", ("BACK", "A46"): "SCHOOL:",
        ("BACK", "A23"): "General Ave. for the Semester:",
        ("BACK", "A66"): "General Ave. for the Semester:",
        ("BACK", "A90"): "Track/Strand Accomplished:",
        ("BACK", "BB90"): "SHS General Average:",
        ("BACK", "A97"): "Signature of School Head over Printed Name",
    },
    learner={
        "last_name": ("FRONT", "F8"), "first_name": ("FRONT", "Y8"),
        "middle_name": ("FRONT", "AZ8"), "lrn": ("FRONT", "C9"),
        "birth_date": ("FRONT", "AA9"), "sex": ("FRONT", "AN9"),
    },
    eligibility={
        "completer_check": ("FRONT", "S13"), "general_average": ("FRONT", "AH13"),
        "school_name": ("FRONT", "Z14"), "school_address": ("FRONT", "AW14"),
    },
    blocks=(
        _shs_block("FRONT", 23, 29, (31, 42), 49),
        _shs_block("FRONT", 66, 72, (74, 85), 92),
        _shs_block("BACK", 4, 9, (11, 22), 29),
        _shs_block("BACK", 46, 52, (54, 65), 72),
    ),
    certification={"school_head": ("BACK", "A94")},
    footer={"track_accomplished": ("BACK", "I90"), "general_average": ("BACK", "BK90")},
)

REGISTER_MAPS = (SF1, SF1_SHS)
ATTENDANCE_MAPS = (SF2, SF2_SHS)
PERMANENT_RECORD_MAPS = (SF10_ES, SF10_JHS, SF10_SHS)
