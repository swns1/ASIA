"""
SF10, the learner's permanent record, in South Lakes' own format.

The school doesn't issue DepEd's LIS form. Its own record has the school's
letterhead and crest, the learner's details, a row for the level before this
one, a table for every school year (every semester in senior high), and a
certification its principal signs. One layout per Word template the school
keeps (the 2026 templates):

- SF10-ES: Kindergarten, on its one row, and Grades 1-6.
- SF10-JHS: Grades 7-10.
- SF10-SHS: Grades 11-12. STEM and HUMSS share it; the strand changes only
  each table's title and its subjects, both from SLIS.

Drawn in code (sf10_sheet.py) rather than filled into a fixed file, so each
table is as long as that year's subjects and none splits across two pages.
"""
import re
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

import openpyxl

from enrollments.rules import GRADE_ORDER
from grading.deped import general_average, quantize, subject_remarks

from .records import PriorLevel, SubjectRecord, grade_number, initials, long_date, natural_name, register_name
from .sf10_sheet import GRID, LETTERHEAD, RULE, Sheet, edges, ordinal_runs, rich, run

ASSETS = Path(__file__).resolve().parent / "assets"
LOGO = ASSETS / "slis-logo.png"
PHOTO_BOX = ASSETS / "photo-box.png"

TAGLINE = "21st Century Challenge-Based Learning"

# Row heights in points, each a whole number of Excel's pixels (0.75 pt):
# Excel rounds any other height, and the page breaks add these up.
SUBJECT_ROW = 9.75         # 8 pt text, as dense as the Word templates' tables
HEADER_ROW = 11.25
AVERAGE_ROW = 13.5
TEXT_ROW = 13.5            # 10 pt text
POINTS_PER_COLUMN = 9      # a column is an eighth of an inch
BLANK = "_" * 28
INDENT = " " * 12          # the templates' first-line indent, about half an inch
NOTE = "Note: This record is not valid without the school seal and when with erasure or alteration in GRADES."

# ─── The three layouts ──────────────────────────────────────────────────────
# Widths are in eighths of an inch (the sheet's columns), read off the Word
# templates' tables and rounded; each row of a table adds up to 58 (7.25 in).


@dataclass(frozen=True)
class Layout:
    code: str
    level_name: str
    title: str
    prior_title: str
    prior_level: str              # what the previous-level row's Level column says
    progress_title: str
    learner_cols: tuple           # Name | Sex | Date of Birth label | date | Division | value | School | value
    prior_cols: tuple             # School Year | School Attended | Level | Final Rating | Remarks
    block_cols: tuple
    block_label: str
    signatories: tuple            # (Signatories field, title printed under the name)
    signature_spans: tuple        # (first column, end column) of each one's line;
                                  # "Certified True and Correct:" starts over the first
    prepared_span: tuple          # the records officer's line, under "Prepared by:"
    records_officer_title: str
    prior_remark: str = ""        # what a previous level completed here says
    sex_in_words: bool = False    # "FEMALE" rather than "F"
    prior_head_size: int = 8
    semesters: bool = False
    title_end: int = 58           # the title centres left of this column, clear of the photo box


LAYOUTS = {
    "elementary": Layout(
        code="SF10-ES", level_name="Elementary School", title="ELEMENTARY SCHOOL PERMANENT RECORD",
        prior_title="KINDERGARTEN PROGRESS", prior_level="KINDER", progress_title="ELEMENTARY PROGRESS",
        learner_cols=(5, 5, 8, 11, 5, 13, 5, 6),
        prior_cols=(7, 27, 7, 7, 10), prior_head_size=9,
        # SUBJECTS | Periodic Rating 1-4 | Final Rating | Credits Earned | Remarks
        block_cols=(13, 4, 4, 4, 4, 6, 6, 7),
        block_label="Grade & Section",
        signatories=(("elementary_principal", "Elementary School Principal"),),
        signature_spans=((34, 58),), prepared_span=(0, 24),
        records_officer_title="Records Officer", prior_remark="Grade 1 Ready",
    ),
    "junior_highschool": Layout(
        code="SF10-JHS", level_name="Junior High School", title="JUNIOR HIGH SCHOOL PERMANENT RECORD",
        prior_title="ELEMENTARY PROGRESS", prior_level="GRADE 6", progress_title="JUNIOR HIGH SCHOOL PROGRESS",
        learner_cols=(5, 4, 8, 12, 5, 12, 5, 7),
        prior_cols=(7, 30, 6, 7, 8),
        block_cols=(10, 5, 5, 5, 5, 5, 6, 7),
        block_label="Grade/Year Level",
        signatories=(("jhs_principal", "Junior High School Principal/Administrator"),),
        signature_spans=((34, 58),), prepared_span=(0, 24),
        records_officer_title="Records Officer", prior_remark="PROMOTED",
    ),
    "senior_highschool": Layout(
        code="SF10-SHS", level_name="Senior High School", title="SENIOR HIGH SCHOOL STUDENT PERMANENT RECORD",
        prior_title="JUNIOR HIGH SCHOOL PROGRESS", prior_level="GRADE 10", progress_title="SENIOR HIGH SCHOOL PROGRESS",
        learner_cols=(5, 7, 8, 11, 5, 12, 5, 5),
        prior_cols=(7, 29, 7, 7, 8),
        # Grade/Year Level | rest of SUBJECTS | 1st | 2nd Quarter | Final Rating | No. of Hours | Action Taken
        block_cols=(12, 13, 6, 7, 6, 7, 7),
        block_label="Grade/Year Level",
        signatories=(("shs_department_head", "Senior High School Department Head"),
                     ("shs_principal", "Senior High School Principal")),
        signature_spans=((20, 38), (40, 58)), prepared_span=(0, 18),
        records_officer_title="Records Officer/Registrar", prior_remark="PASSED",
        sex_in_words=True, semesters=True, title_end=54,
    ),
}

# "Promoted to:" beside an elementary or junior high table.
PROMOTED_COLUMNS = (49, 58)

# DepEd's strand names, as the senior high table titles them.
STRAND_NAMES = {
    "STEM": "Science, Technology, Engineering, and Mathematics (STEM)",
    "HUMSS": "Humanities and Social Sciences (HUMSS)",
    "ABM": "Accountancy, Business and Management (ABM)",
    "GAS": "General Academic Strand (GAS)",
    "TVL-ICT": "Technical-Vocational-Livelihood – Information and Communications Technology (TVL-ICT)",
    "TVL-HE": "Technical-Vocational-Livelihood – Home Economics (TVL-HE)",
    "TVL-IA": "Technical-Vocational-Livelihood – Industrial Arts (TVL-IA)",
    "TVL-AFA": "Technical-Vocational-Livelihood – Agri-Fishery Arts (TVL-AFA)",
    "ARTS AND DESIGN": "Arts and Design Track",
    "SPORTS": "Sports Track",
}

SEMESTER_TITLES = {"1st": "FIRST SEMESTER", "2nd": "SECOND SEMESTER"}


def strand_name(strand):
    strand = (strand or "").strip()
    return STRAND_NAMES.get(strand.upper(), strand)


# ─── Senior high groups and hours ───────────────────────────────────────────

GROUPS = ("core", "applied", "specialized")
GROUP_TITLES = {"core": "Core Subjects", "applied": "Contextualized Subjects",
                "specialized": "Specialization Subjects"}

# DepEd's applied subjects, under the names DepEd and the school give them.
APPLIED_NAMES = (
    "english for academic", "eapp", "practical research", "research in daily life",
    "piling larangan", "empowerment technolog", "entrepreneurship",
    "inquiries, investigations", "inquiries investigations", "3is", "3 is",
)
# Specialized in every track, whether or not they were tied to a strand.
SPECIALIZED_NAMES = ("work immersion", "culminating activity", "capstone")


def subject_group(name, strand, stored=None):
    """
    Where a senior high subject goes on the SF10: "core", "applied" (the
    school's "Contextualized") or "specialized". A registrar's choice on the
    Subjects page wins; otherwise DepEd's applied subjects by name, then
    anything tied to a strand is a specialization, and the rest is core.
    """
    if stored in GROUPS:
        return stored
    low = " ".join((name or "").lower().split())
    if any(word in low for word in APPLIED_NAMES):
        return "applied"
    if any(word in low for word in SPECIALIZED_NAMES) or (strand or "").strip():
        return "specialized"
    return "core"


def _is_pe_and_health(name):
    return bool(re.search(r"physical education and health|\bp\.?e\.? and health\b|\bpeh\b", name.lower()))


def subject_hours(name):
    """DepEd's senior high load: 80 hours a semester, PE and Health 20."""
    return 20 if _is_pe_and_health(name) else 80


# ─── Grades ─────────────────────────────────────────────────────────────────

def whole(value):
    """Round half up to a whole number, as DepEd's grade sheets do."""
    return None if value is None else int(quantize(Decimal(str(value)), "1"))


def subject_result(subject, periods, completed=False):
    """
    (period grades as whole numbers, final rating, remark) for one learning area.

    The final is the mean of the periods, rounded half up. A year still
    running waits for every period. On a completed year, a subject graded in
    only some (a one-semester elective, say) takes its final from those, and
    the others print "-".
    """
    raw = [subject.grades.get(p) for p in periods]
    grades = [whole(g) for g in raw]
    have = [Decimal(str(g)) for g in raw if g is not None]
    final = None
    if have and (len(have) == len(periods) or completed):
        final = whole(sum(have) / len(have))
    if completed and have:
        grades = ["-" if g is None else g for g in grades]
    return grades, final, subject_remarks(set(subject.recorded_remarks), final)


@dataclass
class Line:
    """One row of a grade table."""
    label: str
    grades: list                    # whole numbers; None not in yet; "-" not taken that period
    final: int | None = None
    remark: str | None = None       # passed / failed / incomplete / dropped
    part: bool = False              # one of MAPEH's four parts: indented, period grades only
    group: str = ""                 # senior high
    hours: int | None = None        # senior high
    order: int = 0


@dataclass
class YearResult:
    year: object
    lines: list                     # in print order
    period_averages: list           # each period's general average
    average: int | None             # the year's (or the semester's) general average
    failed: int                     # learning areas failed, incomplete or dropped
    hours: int | None = None
    notes: list = field(default_factory=list)

    @property
    def passed(self):
        return self.average is not None and not self.failed


# The school's order of learning areas, matched on the start of the name.
# Anything else follows in the order it was entered.
_ORDER = (
    ("english",), ("math",), ("science",), ("filipino",), ("mother tongue",),
    ("araling panlipunan", "social studies", "makabansa"),
    ("mapeh",),
    ("values", "gmrc", "good manners", "edukasyon sa pagpapakatao", "esp"),
    ("tle", "epp", "technology and livelihood", "edukasyong pantahanan", "computer", "ict", "hele"),
)

MAPEH_PARTS = (
    ("Music", ("music",)),
    ("Arts", ("arts", "art")),
    ("P.E.", ("physical education", "p.e.", "pe")),
    ("Health", ("health",)),
)


def display_name(name, grade_level):
    """'English 7' in Grade 7 prints 'English', as the school writes it; MAPEH's long name prints 'MAPEH'."""
    name = " ".join((name or "").split())
    number = grade_number(grade_level)
    if number.isdigit():
        name = re.sub(rf"\s+{number}$", "", name)
    return "MAPEH" if _is_mapeh(name) else name


def _is_mapeh(name):
    low = name.lower()
    return bool(re.search(r"\bmapeh\b", low)) or ("music" in low and "health" in low)


def _mapeh_part(name):
    low = re.sub(r"[^a-z. ]", "", name.lower()).strip()
    return next((label for label, names in MAPEH_PARTS if low in names), None)


def _rank(line):
    name = line.label.lower()
    for i, starts in enumerate(_ORDER):
        if any(name.startswith(s) for s in starts):
            return (i, line.order, name)
    return (len(_ORDER), line.order, name)


def _mapeh(parent, parts, year):
    """
    MAPEH's line and its four parts'. MAPEH's period grade is its own, else
    the mean of its parts. That mean stays unrounded into the final, which is
    how the school's own records come out (Grade 5's 87.5, 88.75, 86.75 and
    90.25 make 88, where the rounded 88, 89, 87, 90 would make 89).
    """
    periods = year.periods
    part_lines = []
    for label, _ in MAPEH_PARTS:
        sub = parts.get(label)
        grades = [whole(sub.grades.get(p)) if sub else None for p in periods]
        part_lines.append(Line(label=label, grades=grades, part=True))
    own = parent.grades if parent else {}
    mapeh_grades = {}
    for p in periods:
        if own.get(p) is not None:
            mapeh_grades[p] = own[p]
            continue
        values = [sub.grades.get(p) for sub in parts.values()]
        if len(parts) == len(MAPEH_PARTS) and all(v is not None for v in values):
            mapeh_grades[p] = sum(Decimal(str(v)) for v in values) / len(values)
    remarks = tuple(parent.recorded_remarks) if parent else ()
    for sub in parts.values():
        remarks += tuple(sub.recorded_remarks)
    grades, final, remark = subject_result(
        SubjectRecord(name="MAPEH", grades=mapeh_grades, recorded_remarks=remarks), periods, year.completed)
    order = parent.order if parent else min(s.order for s in parts.values())
    return Line(label="MAPEH", grades=grades, final=final, remark=remark, order=order), part_lines


def year_result(year):
    """One year's (or semester's) table: its lines in print order, averages and failed count."""
    if len(year.periods) == 1:
        return _semester_result(year)
    parent, parts, others, notes = None, {}, [], []
    for s in year.subjects:
        name = display_name(s.name, year.grade_level)
        if name == "MAPEH":
            parent = parent or s
        elif (label := _mapeh_part(name)) and label not in parts:
            parts[label] = s
        else:
            others.append(s)
    # A lone "Health" with no MAPEH is a subject of its own, not a part.
    if not parent and len(parts) < len(MAPEH_PARTS):
        others.extend(parts.values())
        parts = {}
    areas = []
    for s in others:
        grades, final, remark = subject_result(s, year.periods, year.completed)
        areas.append(Line(label=display_name(s.name, year.grade_level), grades=grades, final=final,
                          remark=remark, order=s.order))
    mapeh = part_lines = None
    if parent or parts:
        mapeh, part_lines = _mapeh(parent, parts, year)
        areas.append(mapeh)
        if not parts:
            notes.append(
                f"{year.grade_level} {year.school_year}: MAPEH's parts (Music, Arts, P.E., Health) "
                "aren't recorded as separate subjects, so their rows are blank."
            )
    areas.sort(key=_rank)
    lines = []
    for line in areas:
        lines.append(line)
        if line is mapeh:
            lines.extend(part_lines)
    return _totals(year, areas, lines, notes)


def _semester_result(year):
    lines = []
    for s in year.subjects:
        _, final, remark = subject_result(s, year.periods, year.completed)
        lines.append(Line(label=" ".join(s.name.split()), grades=[None, None], final=final, remark=remark,
                          group=s.group or "core", hours=subject_hours(s.name), order=s.order))
    lines.sort(key=lambda l: (GROUPS.index(l.group) if l.group in GROUPS else 0,
                              l.group == "core" and _is_pe_and_health(l.label), l.order, l.label.lower()))
    result = _totals(year, lines, lines, [])
    result.hours = sum(l.hours for l in lines) if lines else None
    return result


def _totals(year, areas, lines, notes):
    periods = len(year.periods) if len(year.periods) > 1 else 2
    period_averages = []
    for i in range(periods):
        values = [l.grades[i] for l in areas if i < len(l.grades) and isinstance(l.grades[i], int)]
        waiting = any(i < len(l.grades) and l.grades[i] is None for l in areas)
        period_averages.append(general_average(values) if values and (year.completed or not waiting) else None)
    finals = [l.final for l in areas]
    average = general_average(finals) if areas and all(f is not None for f in finals) else None
    ungraded = [l.label for l in areas if l.final is None]
    if year.completed and ungraded:
        notes.append(
            f"{year.grade_level} {year.school_year}: no grades for {', '.join(ungraded)}, "
            "so the general average is left blank."
        )
    failed = sum(1 for l in areas if l.remark in ("failed", "incomplete", "dropped"))
    return YearResult(year=year, lines=lines, period_averages=period_averages, average=average,
                      failed=failed, notes=notes)


def _label_rows(label, columns, bold):
    """
    1, or 2 for a subject name too long for its column, which then wraps
    as Word would wrap it. Measured roughly: 8 pt Times averages about half
    its size a character, bold a little more.
    """
    width = len(label) * (4.1 if bold else 3.7)
    return 2 if width > columns * POINTS_PER_COLUMN * (1.0 if bold else 1.12) else 1


def _word(remark):
    return remark.capitalize() if remark else None


def _outcome(result, semesters):
    """The General Average row's remark."""
    if result.average is None:
        return None
    if not result.failed:
        return "Passed"
    if semesters:
        return "Failed"
    return "Remedial" if result.failed <= 2 else "Retained"


def next_grade(grade_level):
    """'Grade 6' -> 'Grade 7'; Grade 12 -> 'College'; None off the ladder."""
    if grade_level == "Grade 12":
        return "College"
    if grade_level in GRADE_ORDER and GRADE_ORDER.index(grade_level) + 1 < len(GRADE_ORDER):
        return GRADE_ORDER[GRADE_ORDER.index(grade_level) + 1]
    return None


def _grade_years(results):
    """Senior high semesters grouped by grade and school year, in order."""
    groups = []
    for r in results:
        key = (r.year.grade_level, r.year.school_year)
        if groups and groups[-1][0] == key:
            groups[-1][1].append(r)
        else:
            groups.append((key, [r]))
    return [g for _, g in groups]


def _promoted(semesters):
    """A grade's semesters earn promotion when its second is in and every one passed."""
    return any(r.year.semester == "2nd" for r in semesters) and all(r.passed for r in semesters)


# ─── Building the file ──────────────────────────────────────────────────────

def build(data):
    """Returns (workbook, warnings)."""
    layout = LAYOUTS[data.level]
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = layout.code
    sheet = Sheet(ws)
    results = [year_result(y) for y in data.years]
    warnings = [note for r in results for note in r.notes]

    with sheet.block():
        _letterhead(sheet, layout, data)
        _learner_box(sheet, layout, data)
        _prior_level(sheet, layout, data.prior)
        if data.years:              # a Kindergarten-only record has no grade tables yet
            sheet.gap(7.5)
            sheet.text(sheet.row(18), 0, 58, layout.progress_title, size=12, bold=True, h="center")
            sheet.gap(3)

    if layout.semesters:
        admission = _semester_blocks(sheet, layout, data, results)
    else:
        admission = _year_blocks(sheet, layout, data, results)

    with sheet.block():
        _certification(sheet, layout, data, admission)
    sheet.finish()

    warnings.extend(_warnings(layout, data))
    return wb, warnings


def _warnings(layout, data):
    out = []
    prior = data.prior
    if prior is None or not prior.school:
        level = {"KINDER": "Kindergarten"}.get(layout.prior_level, layout.prior_level.title())
        out.append(f"{level} wasn't taken here, so the {layout.prior_title.title()} row has only its level; "
                   "fill in the rest from the learner's earlier records.")
    if layout.semesters and data.years:
        out.append("SLIS records one grade per senior high semester, so the quarter columns are blank "
                   "and Final Rating is the semester grade.")
    names = data.school.signatories
    for attr, title in (*layout.signatories, ("records_officer", layout.records_officer_title)):
        if not getattr(names, attr):
            out.append(f"No name is set for the {title} under Settings › School Forms, "
                       "so that signature line prints blank.")
    return out


def _letterhead(sheet, layout, data):
    school, learner = data.school, data.learner
    short = initials(school.name)
    top = sheet.row(12)
    sheet.text(top, 0, 40, f"{short} {layout.code} – Learner Permanent Record for {layout.level_name}",
               size=9, bold=True)
    sheet.text(top, 40, 58, rich(run("Student No: ", 9, True), run(learner.student_number, 9, True)),
               size=9, bold=True, h="right")
    second = sheet.row(12)
    sheet.text(second, 0, 40, f"School ID: {school.school_id}".strip(), size=9, bold=True)
    sheet.text(second, 40, 58, rich(run("LRN: ", 9, True), run(learner.lrn, 9, True)), size=9, bold=True, h="right")
    sheet.gap(3)

    name = sheet.row(28.5)
    sheet.text(name, 3, 58, school.name, size=22, bold=True, h="center", name=LETTERHEAD)
    tagline = sheet.row(16.5)
    sheet.text(tagline, 0, 58, rich(*ordinal_runs(TAGLINE, 12, True, LETTERHEAD)), size=12, bold=True,
               h="center", name=LETTERHEAD)
    phones = " | ".join(p for p in (
        f"Mobile: {school.phone}" if school.phone else "",
        f"Landline: {school.landline}" if school.landline else "",
    ) if p)
    for line in (school.address, phones):
        sheet.text(sheet.row(12), 0, 58, line, size=9, bold=True, h="center", name=LETTERHEAD)
    email = sheet.row(12)
    if school.email:
        sheet.text(email, 0, 58, rich(run("Email: ", 9, True, name=LETTERHEAD),
                                      run(school.email, 9, True, underline=True, name=LETTERHEAD)),
                   size=9, bold=True, h="center", name=LETTERHEAD)
    sheet.picture(LOGO, name, x=0.59, width=0.65, height=0.95)      # the crest, left of the school's name

    sheet.gap(6)
    sheet.text(sheet.row(21), 0, layout.title_end, layout.title, size=14, bold=True, h="center")
    sheet.gap(3)
    # The photo box at the right margin, ending a little above the learner
    # box: Excel prints the rows shorter than it shows them, so a box that
    # reached right down to the table ran into it on paper.
    box = 1.01 * 72
    above_table = sheet.height(name, sheet.next_row - 1)
    sheet.picture(PHOTO_BOX, name, x=6.24, width=1.0, height=1.01, y=above_table - box - 6)


def _learner_box(sheet, layout, data):
    learner, school = data.learner, data.school
    x = edges(layout.learner_cols)
    label = {"size": 10, "bold": True, "border": GRID}
    value = {"size": 10, "border": GRID}
    first, second, third = sheet.row(15), sheet.row(15), sheet.row(25.5)
    sex = (learner.sex or "").lower()
    sex = (sex.upper() if layout.sex_in_words else sex[:1].upper()) if sex in ("male", "female") else ""
    parents = " / ".join(n for n in (learner.father, learner.mother) if n) or learner.guardian

    sheet.text(first, x[0], x[1], "Name", **label)
    sheet.text(first, x[1], x[4], register_name(learner).upper(), **value, shrink=True)
    sheet.text(first, x[4], x[5], "Division", **label, h="center", rows=2)
    sheet.text(first, x[5], x[6], school.division.upper(), **value, h="center", wrap=True, rows=2)
    sheet.text(first, x[6], x[7], "School", **label, h="center", rows=2)
    sheet.text(first, x[7], x[8], initials(school.name), **value, h="center", rows=2)
    sheet.text(second, x[0], x[1], "Sex", **label)
    sheet.text(second, x[1], x[2], sex, **value, h="center")
    sheet.text(second, x[2], x[3], "Date of Birth", **label, shrink=True)
    sheet.text(second, x[3], x[4], long_date(learner.birth_date).upper(), **value)
    sheet.text(third, x[0], x[1], "Parents", **label)
    sheet.text(third, x[1], x[4], (parents or "").upper(), **value, wrap=True)
    sheet.text(third, x[4], x[5], "Address", **label, h="center")
    sheet.text(third, x[5], x[8], (learner.address or "").upper(), **value, wrap=True)


def _prior_level(sheet, layout, prior):
    prior = prior or PriorLevel(level=layout.prior_level)
    sheet.gap(7.5)
    sheet.text(sheet.row(18), 0, 58, layout.prior_title, size=12, bold=True, h="center")
    sheet.gap(2.25)
    x = edges(layout.prior_cols)
    head, body = sheet.row(13.5), sheet.row(15)
    labels = ("School Year", "School Attended", "Level", "Final Rating", "Remarks")
    values = (prior.school_year, prior.school.upper(), prior.level, prior.final_rating, prior.remarks)
    for i, (label, value) in enumerate(zip(labels, values)):
        sheet.text(head, x[i], x[i + 1], label, size=layout.prior_head_size, bold=True, h="center", border=GRID)
        if isinstance(value, str) and value.isdigit():
            value = int(value)        # a rating, kept a number in Excel
        sheet.text(body, x[i], x[i + 1], value, size=8, h="center", border=GRID, shrink=True)


def _year_blocks(sheet, layout, data, results):
    """Elementary and junior high: a table per school year. Returns the grade the record admits to."""
    for result in results:
        promoted = next_grade(result.year.grade_level) if result.passed else None
        with sheet.block():
            _year_block(sheet, layout, data, result, (promoted or "").upper())
            sheet.gap(7.5)
    if results:
        last = results[-1]
        return next_grade(last.year.grade_level) if last.passed else None
    prior = data.prior
    return "Grade 1" if prior and prior.remarks == layout.prior_remark and layout.prior_level == "KINDER" else None


def _year_block(sheet, layout, data, result, promoted_to):
    year, school = result.year, data.school
    L, Q1, Q2, Q3, Q4, F, C, R, END = edges(layout.block_cols)
    quarters = ((Q1, Q2), (Q2, Q3), (Q3, Q4), (Q4, F))
    cell = {"size": 8, "border": GRID}

    first, second = sheet.row(HEADER_ROW), sheet.row(HEADER_ROW)
    sheet.text(first, L, Q1, layout.block_label, **cell)
    sheet.text(first, Q1, C, f"{grade_number(year.grade_level)} – {year.section.upper()}", **cell,
               h="center", shrink=True)
    sheet.text(first, C, R, f"School ID: {school.school_id}".strip(), **cell, h="center", wrap=True, rows=2)
    sheet.text(first, R, END, f"SY {year.school_year}", **cell, h="center", wrap=True, rows=2)
    sheet.text(second, L, Q1, "School", **cell)
    sheet.text(second, Q1, C, school.name.upper(), **cell, h="center", shrink=True)
    start, end = PROMOTED_COLUMNS
    sheet.text(first, start, end, "Promoted to:", size=9)
    sheet.text(second, start, end, promoted_to, size=9, h="center", border=RULE)

    head, numbers = sheet.row(SUBJECT_ROW), sheet.row(SUBJECT_ROW)
    sheet.text(head, L, Q1, "SUBJECTS", **cell, h="center", rows=2)
    sheet.text(head, Q1, F, "Periodic Rating", **cell, h="center")
    for i, (a, b) in enumerate(quarters):
        sheet.text(numbers, a, b, i + 1, **cell, h="center")
    sheet.text(head, F, C, "Final Rating", **cell, h="center", wrap=True, rows=2)
    sheet.text(head, C, R, "Credits Earned", **cell, h="center", wrap=True, rows=2)
    sheet.text(head, R, END, "Remarks", **cell, h="center", rows=2)

    for line in result.lines:
        lines = _label_rows(line.label, Q1 - L, bold=True)
        row = sheet.row(SUBJECT_ROW * lines)
        sheet.text(row, L, Q1, line.label, **cell, bold=True, wrap=lines > 1, shrink=lines == 1,
                   indent=2 if line.part else 0)
        for i, (a, b) in enumerate(quarters):
            sheet.text(row, a, b, line.grades[i] if i < len(line.grades) else None, **cell, h="center")
        sheet.text(row, F, C, None if line.part else line.final, **cell, h="center", fmt="0.00")
        sheet.text(row, C, R, None, **cell)
        sheet.text(row, R, END, None if line.part else _word(line.remark), **cell, h="center")

    average = sheet.row(AVERAGE_ROW)
    sheet.text(average, L, Q1, "General Average", **cell, bold=True, h="right")
    for i, (a, b) in enumerate(quarters):
        sheet.text(average, a, b, result.period_averages[i], **cell, h="center")
    sheet.text(average, F, C, result.average, **cell, bold=True, h="center", fmt="0.00")
    sheet.text(average, C, R, None, **cell)
    sheet.text(average, R, END, _outcome(result, False), **cell, bold=True, h="center")


def _semester_blocks(sheet, layout, data, results):
    """Senior high: a table per semester, "Promoted to" under each grade's second. Returns the admission."""
    admission = None
    for semesters in _grade_years(results):
        promoted = _promoted(semesters)
        for i, result in enumerate(semesters):
            last = i == len(semesters) - 1
            with sheet.block():
                _semester_block(sheet, layout, data, result)
                if last and any(r.year.semester == "2nd" for r in semesters):
                    destination = next_grade(result.year.grade_level) if promoted else None
                    _promoted_line(sheet, (destination or "").upper())
                    if destination == "College":
                        _graduation_lines(sheet, data.issue, result.year)
                sheet.gap(10.5)
        admission = next_grade(semesters[-1].year.grade_level) if promoted else None
    return admission


def _semester_block(sheet, layout, data, result):
    year, school = result.year, data.school
    L, S, Q1, Q2, F, H, A, END = edges(layout.block_cols)
    cell = {"size": 8, "border": GRID}

    first, second, third = sheet.row(HEADER_ROW), sheet.row(HEADER_ROW), sheet.row(HEADER_ROW)
    sheet.text(first, L, S, layout.block_label, **cell)
    sheet.text(first, S, H, f"{grade_number(year.grade_level)} – {year.section.upper()}", **cell,
               h="center", shrink=True)
    sheet.text(first, H, A, f"School ID: {school.school_id}".strip(), **cell, h="center", wrap=True, rows=2)
    sheet.text(first, A, END, f"SY {year.school_year}", **cell, h="center", wrap=True, rows=2)
    sheet.text(second, L, S, "School", **cell)
    sheet.text(second, S, H, school.name.upper(), **cell, h="center", shrink=True)
    sheet.text(third, L, S, SEMESTER_TITLES.get(year.semester, ""), **cell, bold=True)
    sheet.text(third, S, END, strand_name(year.strand), **cell, bold=True, h="center", shrink=True)

    head = sheet.row(19.5)
    quarter_labels = ("3rd Quarter", "4th Quarter") if year.semester == "2nd" else ("1st Quarter", "2nd Quarter")
    sheet.text(head, L, Q1, "SUBJECTS", **cell, bold=True, h="center")
    sheet.text(head, Q1, Q2, rich(*ordinal_runs(quarter_labels[0])), **cell, h="center", wrap=True)
    sheet.text(head, Q2, F, rich(*ordinal_runs(quarter_labels[1])), **cell, h="center", wrap=True)
    sheet.text(head, F, H, "Final Rating", **cell, h="center", wrap=True)
    sheet.text(head, H, A, "No. of Hours", **cell, h="center", wrap=True)
    sheet.text(head, A, END, "Action Taken", **cell, h="center", wrap=True)
    spans = ((Q1, Q2), (Q2, F), (F, H), (H, A), (A, END))

    for group in GROUPS:
        lines = [l for l in result.lines if l.group == group]
        if not lines:
            continue
        row = sheet.row(SUBJECT_ROW)
        sheet.text(row, L, Q1, GROUP_TITLES[group], **cell, bold=True)
        for a, b in spans:
            sheet.text(row, a, b, None, **cell)
        for line in lines:
            wrapped = _label_rows(line.label, Q1 - L, bold=False)
            row = sheet.row(SUBJECT_ROW * wrapped)
            sheet.text(row, L, Q1, line.label, **cell, wrap=wrapped > 1, shrink=wrapped == 1)
            sheet.text(row, Q1, Q2, None, **cell, h="center")
            sheet.text(row, Q2, F, None, **cell, h="center")
            sheet.text(row, F, H, line.final, **cell, h="center", fmt="0.00")
            sheet.text(row, H, A, line.hours, **cell, h="center", fmt='0" hours"')
            sheet.text(row, A, END, _word(line.remark), **cell, h="center")

    average = sheet.row(AVERAGE_ROW)
    sheet.text(average, L, Q1, "General Average for the Semester", **cell, bold=True, h="right")
    sheet.text(average, Q1, Q2, result.period_averages[0], **cell, h="center")
    sheet.text(average, Q2, F, result.period_averages[1], **cell, h="center")
    sheet.text(average, F, H, result.average, **cell, bold=True, h="center", fmt="0.00")
    sheet.text(average, H, A, result.hours, **cell, bold=True, h="center", fmt='0" hours"')
    sheet.text(average, A, END, _outcome(result, True), **cell, bold=True, h="center")


def _promoted_line(sheet, destination):
    sheet.gap(3)
    row = sheet.row(13.5)
    sheet.text(row, 0, 9, "Promoted to:", size=9, bold=True)
    sheet.text(row, 9, 22, destination, size=9, bold=True, h="center", border=RULE)


def _graduation_lines(sheet, issue, year):
    when = long_date(issue.graduation_date)
    series = str(issue.graduation_date.year) if issue.graduation_date else year.school_year[-4:]
    sheet.gap(12)
    sheet.text(sheet.row(12), 0, 40, rich(
        run("Date of Graduation: ", 9),
        run(when or "_" * 22, 9, True, underline=bool(when)),
    ), size=9)
    sheet.text(sheet.row(12), 0, 40, rich(
        run("Special Order (A) No. ", 9, True),
        run(issue.special_order or "_" * 6, 9, True, underline=bool(issue.special_order)),
        run(", s. ", 9, True),
        run(series, 9, True, underline=True),
    ), size=9)


def _paragraph_height(text, per_line=105, line=12.75):
    """Rows for a wrapped paragraph: Excel doesn't grow a merged cell to fit."""
    return max(1, -(-len(str(text)) // per_line)) * line


def _certification(sheet, layout, data, admission):
    learner, school, issue = data.learner, data.school, data.issue
    pronoun = {"female": "she", "male": "he"}.get((learner.sex or "").lower(), "he/she")
    copy_for = issue.copy_for.strip()

    sheet.gap(12)
    sheet.text(sheet.row(19.5), 0, 58, "C E R T I F I C A T I O N", size=14, bold=True, h="center")
    sheet.gap(6)
    record_of = rich(
        run(INDENT + "I hereby certify that this is a true record of ", 10),
        run(natural_name(learner).upper(), 10, True, underline=True),
        run(". I further certify that based on the information contained herein, "
            f"{pronoun} is eligible for admission to ", 10),
        run(admission or BLANK, 10, True),
        run(".", 10),
    )
    sheet.text(sheet.row(_paragraph_height(record_of)), 0, 58, record_of, size=10, v="top", wrap=True)
    sheet.gap(6)
    issued = rich(
        run(INDENT + "This record is being issued upon the request of the above-named person for ", 10),
        run((issue.purpose or "").strip().upper() or BLANK, 10, True),
        run(" to ", 10),
        run(copy_for or BLANK, 10, True),
        run(" only.", 10),
    )
    sheet.text(sheet.row(_paragraph_height(issued)), 0, 58, issued, size=10, v="top", wrap=True)

    # Every signature in one row: the records officer's under "Prepared by:",
    # then the principal's (and in senior high the department head's).
    sheet.gap(12)
    labels = sheet.row(TEXT_ROW)
    sheet.text(labels, *layout.prepared_span, "Prepared by:", size=10)
    sheet.text(labels, layout.signature_spans[0][0], 58, "Certified True and Correct:", size=10)
    sheet.gap(21)
    line, name, title = sheet.row(TEXT_ROW), sheet.row(TEXT_ROW), sheet.row(TEXT_ROW)
    signatures = (("records_officer", layout.records_officer_title), *layout.signatories)
    for (attr, role), (start, end) in zip(signatures, (layout.prepared_span, *layout.signature_spans)):
        sheet.text(line, start, end, None, border=RULE)
        sheet.text(name, start, end, getattr(school.signatories, attr), size=10, bold=True, h="center", shrink=True)
        sheet.text(title, start, end, role, size=10, h="center", shrink=True)
    sheet.gap(6)
    date = sheet.row(TEXT_ROW)
    start, end = layout.prepared_span
    sheet.text(date, start, start + 4, "Date:", size=10)
    sheet.text(date, start + 4, end, None, border=RULE)
    sheet.gap(12)
    sheet.text(sheet.row(TEXT_ROW), 0, 58, NOTE, size=10, italic=True, h="center", shrink=True)
    sheet.gap(6)
    sheet.text(sheet.row(TEXT_ROW), 0, 58, rich(run("Copy for ", 10, True, True), run(copy_for or BLANK, 10, True, True)),
               size=10, bold=True, italic=True, h="center")
