"""
SF9, the Learner's Progress Report Card, in the layout of DepEd's LIS card,
with the school's own letterhead on its cover.

DepEd's card is one landscape sheet, printed on both sides and folded down
the middle, so each page here is two panels:

    page 1, outside:  Report on Attendance and the parent's signatures | the cover
    page 2, inside:   Report on Learning Progress and Achievement     | Class Behavior

Printed both sides on long bond (flip on the short edge) and folded, the
cover is the front, the attendance the back, and the grades open out
inside. This is the quarter-based card LIS has carried since DO 8 s.2015:
the school still grades by quarter (by semester in senior high), and DO 15
s.2026's three-term card is only "encouraged" for private schools.

The cover puts the two identities together. The school's letterhead, as on
the COR, stands where DepEd's card names the school; DepEd's own lines
(form code, Republic of the Philippines, Region, Division, District, School
ID) follow it, then the card proper.

The grades are the SF10's (sf10.year_result): whole-number quarter grades
and final ratings, MAPEH from its parts, the general average as DepEd
computes it. The observed-values panel keeps DepEd's table, filled with the
school's class-behavior areas, which replaced the core values.

Drawn with reportlab's Platypus, like the COR: each panel is a frame, and
each panel's content shrinks to fit rather than spill into the next one.
"""
import io

from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate, Frame, FrameBreak, KeepInFrame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

from enrollments.promotion import UNGRADED_LEVELS
from grading.deped import DESCRIPTORS, PASSING_GRADE

from .cor import PRINCIPALS, letterhead, plain, signatory, style, value
from .pdf import printable
from .records import age_cutoff, age_on, grade_number, register_name
from .sf10 import GROUPS, _outcome, _promoted, next_grade, strand_name, year_result

PAGE = (13 * inch, 8.5 * inch)          # long bond, landscape
HALF = PAGE[0] / 2                      # the fold
EDGE = 0.45 * inch                      # the paper's edge to a panel's text
FOLD = 0.35 * inch                      # the fold to a panel's text
TOP = BOTTOM = 0.4 * inch
WIDTH = HALF - EDGE - FOLD              # 5.7 in
HEIGHT = PAGE[1] - TOP - BOTTOM         # 7.7 in
LETTERHEAD_SCALE = 0.8                  # the COR's letterhead, on a half sheet

SHS = "senior_highschool"
FORM_CODES = {"junior_highschool": "SF 9 – JHS", SHS: "SF 9 – SHS"}     # the rest are ES
QUARTERS = ("1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter")
SEMESTERS = (("1st", "First Semester", ("1", "2")), ("2nd", "Second Semester", ("3", "4")))
# DepEd's names for the senior high groups (the school's SF10 says
# "Contextualized" and "Specialization").
GROUP_TITLES = {"core": "Core Subjects", "applied": "Applied Subjects", "specialized": "Specialized Subjects"}
MARKINGS = (("AO", "Always Observed"), ("SO", "Sometimes Observed"), ("RO", "Rarely Observed"),
            ("NO", "Not Observed"))
SIGNATURE_WIDTH = 2.35 * inch

# ─── Type ───────────────────────────────────────────────────────────────────

PANEL_TITLE = style("sf9_panel_title", 11, bold=True, align=TA_CENTER, leading=13)
SUBTITLE = style("sf9_subtitle", 10, bold=True, leading=12)
CELL = style("sf9_cell", 8.5, leading=10)
CELL_BOLD = style("sf9_cell_bold", 8.5, bold=True, leading=10)
CELL_PART = style("sf9_cell_part", 8.5, leading=10, leftIndent=12)
CELL_CENTER = style("sf9_cell_center", 8.5, leading=10, align=TA_CENTER)
CELL_HEAD = style("sf9_cell_head", 8.5, bold=True, leading=10, align=TA_CENTER)
CELL_TOTAL = style("sf9_cell_total", 8.5, bold=True, leading=10, align=TA_RIGHT)
LABEL = style("sf9_label", 9.5, leading=11.5)
CODE = style("sf9_code", 8, bold=True, leading=9)
TEXT = style("sf9_text", 9.5, align=TA_JUSTIFY, leading=12, firstLineIndent=0.35 * inch)
NAME = style("sf9_name", 9, bold=True, align=TA_CENTER, leading=11)
ROLE = style("sf9_role", 8.5, align=TA_CENTER, leading=10)


def grid(rows, widths, extra=(), heights=None, align="CENTER"):
    table = Table(rows, colWidths=widths, rowHeights=heights, hAlign=align)
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, "black"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        *extra,
    ]))
    return table


def roomy(top, bottom, first=2):
    """More padding below a table's header rows, so a short table still fills its panel like DepEd's."""
    return [("TOPPADDING", (0, first), (-1, -1), top), ("BOTTOMPADDING", (0, first), (-1, -1), bottom)]


def cell(text, st=CELL):
    return Paragraph(value(text), st)


def fill(text, width, size=10, smallest=6.5):
    """A value on a fill-in line: bold, on one line, made smaller rather than wrapped."""
    text = printable(str(text or ""))
    while size > smallest and pdfmetrics.stringWidth(text, "Times-Bold", size) > width - 4:
        size -= 0.5
    return Paragraph(value(text), style(f"sf9_fill_{size}", size, bold=True, leading=size * 1.15, leftIndent=2))


def fill_line(pairs, width=WIDTH, gap=10, size=10):
    """
    'Label: value' pairs across one line, each value on its own rule.
    `pairs` is (label, text, share): a pair takes its share of the width.
    """
    total = sum(share for _, _, share in pairs)
    cells, widths, rules = [], [], []
    for i, (label, text, share) in enumerate(pairs):
        span = width * share / total - (gap if i < len(pairs) - 1 else 0)
        label_w = pdfmetrics.stringWidth(printable(label), "Times-Roman", 9.5) + 4
        column = len(cells)
        cells += [Paragraph(value(label), LABEL), fill(text, span - label_w, size)]
        widths += [label_w, span - label_w]
        rules.append(("LINEBELOW", (column + 1, 0), (column + 1, 0), 0.5, "black"))
        if i < len(pairs) - 1:
            cells.append("")
            widths.append(gap)
    return plain([cells], widths, extra=rules)


def signature(name, role, width=SIGNATURE_WIDTH):
    """A name on its line, the role under it."""
    return plain(
        [[Paragraph(value(name), NAME)], [Paragraph(value(role), ROLE)]],
        [width], heights=[24, None],
        extra=[("LINEBELOW", (0, 0), (0, 0), 0.75, "black"), ("BOTTOMPADDING", (0, 0), (0, 0), 2),
               ("TOPPADDING", (0, 1), (0, 1), 2)],
    )


def signature_pair(left, right, width=WIDTH):
    """Two signatures, one at each side of the panel."""
    return plain([[signature(*left), "", signature(*right)]],
                 [SIGNATURE_WIDTH, width - 2 * SIGNATURE_WIDTH, SIGNATURE_WIDTH])


def number(n):
    return "" if n is None else str(n)


# ─── Who signs, and what the year earned ────────────────────────────────────

def adviser(data):
    return next((y.adviser for y in reversed(data.years) if y.adviser), "")


def principal(data):
    """(name, title): the level's principal, else the school head."""
    field, title = PRINCIPALS.get(data.section.school_level, PRINCIPALS["elementary"])
    return signatory(data.school, field) or data.school.head, title


def admission(data, results):
    """
    The grade the year makes the learner eligible for, else None: on a
    passed year, as the SF10's "Promoted to"; senior high once the second
    semester is in and both passed. Nursery and Kindergarten are assessed
    without grades (enrollments/promotion.py), so a completed year is
    enough. Grade 12 has no next grade.
    """
    section = data.section
    if section.school_level == SHS:
        earned = _promoted(results)
    elif section.grade_level in UNGRADED_LEVELS:
        earned = any(y.completed for y in data.years) or bool(results and results[-1].passed)
    else:
        earned = bool(results) and results[-1].passed
    destination = next_grade(section.grade_level) if earned else None
    return None if destination == "College" else destination


# ─── Page 1, left: attendance (the back of the folded card) ─────────────────

def attendance_panel(data):
    months = data.months
    shs = data.section.school_level == SHS

    def row(label, attr):
        values = [getattr(m, attr) for m in months]
        shown = [v for v in values if v is not None]
        return ([Paragraph(label, CELL)] + [cell(number(v), CELL_CENTER) for v in values]
                + [cell(number(sum(shown)) if shown else "", CELL_HEAD)])

    label_w = 1.15 * inch
    column = (WIDTH - label_w) / (len(months) + 1)
    table = grid(
        [[""] + [cell(f"{m.month:%b}", CELL_HEAD) for m in months] + [cell("Total", CELL_HEAD)],
         row("No. of school days", "school_days"),
         row("No. of days present", "present"),
         row("No. of days absent", "absent")],
        [label_w] + [column] * (len(months) + 1),
        heights=[20, 26, 26, 26],
    )
    periods = [label for _, label, _ in SEMESTERS] if shs else QUARTERS
    signs = plain(
        [[Paragraph(label, LABEL), ""] for label in periods],
        [1.25 * inch, WIDTH - 1.25 * inch], heights=[0.45 * inch] * len(periods),
        extra=[("LINEBELOW", (1, 0), (1, -1), 0.5, "black")],
    )
    return [
        Paragraph("REPORT ON ATTENDANCE", PANEL_TITLE), Spacer(1, 8), table,
        Spacer(1, 40),
        Paragraph("PARENT / GUARDIAN’S SIGNATURE", PANEL_TITLE), Spacer(1, 4), signs,
    ]


# ─── Page 1, right: the cover ───────────────────────────────────────────────

def deped_lines(school):
    """DepEd's identification of the school, under its letterhead."""
    return [
        Paragraph("Republic of the Philippines", style("sf9_republic", 9, align=TA_CENTER, leading=10.5)),
        Paragraph("DEPARTMENT OF EDUCATION", style("sf9_deped", 10, bold=True, align=TA_CENTER, leading=12)),
        Spacer(1, 3),
        fill_line([("Region:", school.region, 1), ("Division:", school.division, 1)], size=9.5),
        Spacer(1, 3),
        fill_line([("District:", school.district, 1), ("School ID:", school.school_id, 1)], size=9.5),
    ]


def particulars(data):
    learner, section = data.learner, data.section
    age = age_on(learner.birth_date, age_cutoff(section.school_year))
    sex = {"male": "Male", "female": "Female"}.get((learner.sex or "").lower(), "")
    lines = [
        fill_line([("Name:", register_name(learner).upper(), 1)]),
        fill_line([("LRN:", learner.lrn, 1.3), ("Age:", number(age), 0.7), ("Sex:", sex, 0.9)]),
        fill_line([("Grade:", grade_number(section.grade_level), 1), ("Section:", section.section, 1.4)]),
    ]
    if section.school_level == SHS:
        lines.append(fill_line([("Track/Strand:", strand_name(section.strand), 1)]))
    out = []
    for line in lines:
        out += [line, Spacer(1, 5)]
    return out[:-1]


def dear_parent(learner):
    pronoun = {"male": "his", "female": "her"}.get((learner.sex or "").lower(), "his/her")
    return [
        Paragraph("Dear Parent:", style("sf9_dear", 10, bold=True, leading=12)),
        Spacer(1, 2),
        # DepEd's letter, which says "core values": this card reports class behavior instead.
        Paragraph("This report card shows the ability and progress your child has made in the different "
                  f"learning areas as well as {pronoun} class behavior.", TEXT),
        Paragraph("The school welcomes you should you desire to know more about your child’s progress.", TEXT),
    ]


def certificate(data, eligible, signers):
    """The Certificate of Transfer, filled in only for a year that earned the next grade."""
    section = data.section
    grade, admitted_section = (grade_number(section.grade_level), section.section) if eligible else ("", "")
    names = signers if eligible else (("", signers[0][1]), ("", signers[1][1]))
    return [
        Paragraph("Certificate of Transfer", style("sf9_cert", 10.5, bold=True, align=TA_CENTER, leading=13)),
        Spacer(1, 4),
        fill_line([("Admitted to Grade:", grade, 1), ("Section:", admitted_section, 1.3)]),
        Spacer(1, 5),
        fill_line([("Eligibility for Admission to Grade:", grade_number(eligible) if eligible else "", 1)]),
        Spacer(1, 6),
        Paragraph("Approved:", LABEL),
        Spacer(1, 2),
        signature_pair(*names),
    ]


def cancellation():
    """Filled in by the school that admits the learner next."""
    date_w = WIDTH - SIGNATURE_WIDTH - 0.4 * inch
    return [
        Paragraph("Cancellation of Eligibility to Transfer",
                  style("sf9_cancel", 10.5, bold=True, align=TA_CENTER, leading=13)),
        Spacer(1, 4),
        fill_line([("Admitted in:", "", 1)]),
        Spacer(1, 2),
        plain([[fill_line([("Date:", "", 1)], width=date_w), "", signature("", "Principal")]],
              [date_w, 0.4 * inch, SIGNATURE_WIDTH]),
    ]


def cover_panel(data, eligible):
    school, section = data.school, data.section
    signers = (adviser(data), "Class Adviser"), principal(data)
    return [
        Paragraph(FORM_CODES.get(section.school_level, "SF 9 – ES"), CODE),
        Spacer(1, 4),
        letterhead(school, WIDTH, scale=LETTERHEAD_SCALE),
        Spacer(1, 7),
        *deped_lines(school),
        Spacer(1, 11),
        Paragraph("LEARNER’S PROGRESS REPORT CARD",
                  style("sf9_title", 14, bold=True, align=TA_CENTER, leading=16.5)),
        Paragraph(f"School Year {value(section.school_year)}",
                  style("sf9_year", 10, bold=True, align=TA_CENTER, leading=12)),
        Spacer(1, 9),
        *particulars(data),
        Spacer(1, 11),
        *dear_parent(data.learner),
        Spacer(1, 14),
        signature_pair(*signers),
        Spacer(1, 13),
        *certificate(data, eligible, signers),
        Spacer(1, 12),
        *cancellation(),
    ]


# ─── Page 2, left: learning progress ────────────────────────────────────────

def grade(value_):
    return "" if value_ is None else str(value_)


def remark(word):
    return word.capitalize() if word else ""


def year_table(result):
    """Elementary and junior high (and Nursery, Kindergarten): the four quarters."""
    label_w, quarter_w, final_w = 2.3 * inch, 0.5 * inch, 0.75 * inch
    widths = [label_w] + [quarter_w] * 4 + [final_w, WIDTH - label_w - 4 * quarter_w - final_w]
    rows = [
        [cell("Learning Areas", CELL_HEAD), cell("Quarter", CELL_HEAD), "", "", "",
         cell("Final Rating", CELL_HEAD), cell("Remarks", CELL_HEAD)],
        ["", *[cell(str(q), CELL_HEAD) for q in range(1, 5)], "", ""],
    ]
    spans = [("SPAN", (0, 0), (0, 1)), ("SPAN", (1, 0), (4, 0)), ("SPAN", (5, 0), (5, 1)), ("SPAN", (6, 0), (6, 1))]
    lines = result.lines if result else []
    for line in lines:
        grades = (list(line.grades) + [None] * 4)[:4]
        rows.append([
            cell(line.label, CELL_PART if line.part else CELL),
            *[cell(grade(g), CELL_CENTER) for g in grades],
            cell("" if line.part else grade(line.final), CELL_HEAD),
            cell("" if line.part else remark(line.remark), CELL_CENTER),
        ])
    if not lines:
        rows.append([cell("No learning areas are on record for this school year.", CELL_CENTER)] + [""] * 6)
        spans.append(("SPAN", (0, 2), (-1, 2)))
    last = len(rows)
    average = result.average if result else None
    rows.append([cell("General Average", CELL_TOTAL), "", "", "", "",
                 cell(grade(average), CELL_HEAD), cell(_outcome(result, False) if result else "", CELL_HEAD)])
    spans.append(("SPAN", (0, last), (4, last)))
    return grid(rows, widths, extra=spans + roomy(3.5, 4.5) + [("ROWBACKGROUNDS", (0, 0), (-1, 1), ["#eeeeee"])])


def semester_table(title, quarters, result, enrolled):
    """One senior high semester: its subjects by group, and the semester's General Average."""
    label_w, quarter_w, final_w = 2.75 * inch, 0.5 * inch, 0.85 * inch
    widths = [label_w, quarter_w, quarter_w, final_w, WIDTH - label_w - 2 * quarter_w - final_w]
    rows = [
        [cell("Subjects", CELL_HEAD), cell("Quarter", CELL_HEAD), "", cell("Semester Final Grade", CELL_HEAD),
         cell("Remarks", CELL_HEAD)],
        ["", cell(quarters[0], CELL_HEAD), cell(quarters[1], CELL_HEAD), "", ""],
    ]
    spans = [("SPAN", (0, 0), (0, 1)), ("SPAN", (1, 0), (2, 0)), ("SPAN", (3, 0), (3, 1)), ("SPAN", (4, 0), (4, 1))]
    lines = result.lines if result else []
    for group in GROUPS:
        mine = [line for line in lines if line.group == group]
        if not mine:
            continue
        spans.append(("SPAN", (0, len(rows)), (-1, len(rows))))
        rows.append([cell(GROUP_TITLES[group], CELL_BOLD), "", "", "", ""])
        for line in mine:
            rows.append([cell(line.label, CELL_PART), "", "", cell(grade(line.final), CELL_HEAD),
                         cell(remark(line.remark), CELL_CENTER)])
    if not lines:
        note = "No subjects are on record for this semester." if enrolled else "Not yet enrolled for this semester."
        spans.append(("SPAN", (0, len(rows)), (-1, len(rows))))
        rows.append([cell(note, CELL_CENTER), "", "", "", ""])
    last = len(rows)
    rows.append([cell("General Average for the Semester", CELL_TOTAL), "", "",
                 cell(grade(result.average if result else None), CELL_HEAD),
                 cell(_outcome(result, True) if result else "", CELL_HEAD)])
    spans.append(("SPAN", (0, last), (2, last)))
    return [Paragraph(title.upper(), SUBTITLE), Spacer(1, 3),
            grid(rows, widths, extra=spans + roomy(2.5, 3) + [("ROWBACKGROUNDS", (0, 0), (-1, 1), ["#eeeeee"])])]


def descriptors_table():
    """DepEd's descriptors, from grading/deped.py."""
    rows = [[cell("Descriptors", CELL_HEAD), cell("Grading Scale", CELL_HEAD), cell("Remarks", CELL_HEAD)]]
    for i, (minimum, label) in enumerate(DESCRIPTORS):
        above = DESCRIPTORS[i - 1][0] if i else None
        if not minimum:
            scale = f"Below {above}"
        else:
            scale = f"{minimum}–{above - 1 if above else 100}"
        rows.append([cell(label), cell(scale, CELL_CENTER),
                     cell("Passed" if minimum >= PASSING_GRADE else "Failed", CELL_CENTER)])
    return grid(rows, [2.2 * inch, 1.3 * inch, 1.1 * inch],
                extra=roomy(2.5, 3.5, first=1) + [("ROWBACKGROUNDS", (0, 0), (-1, 0), ["#eeeeee"])])


def progress_panel(data, results):
    story = [Paragraph("REPORT ON LEARNING PROGRESS AND ACHIEVEMENT", PANEL_TITLE), Spacer(1, 8)]
    if data.section.school_level == SHS:
        by_semester = {r.year.semester: r for r in results}
        for i, (key, title, quarters) in enumerate(SEMESTERS):
            if i:
                story.append(Spacer(1, 12))
            story += semester_table(title, quarters, by_semester.get(key), key in by_semester)
        return story
    story += [year_table(results[-1] if results else None), Spacer(1, 16), descriptors_table()]
    return story


# ─── Page 2, right: class behavior ──────────────────────────────────────────

def behavior_panel(data):
    shs = data.section.school_level == SHS
    periods = data.behavior_periods
    labels = ["1st", "2nd"] if shs else [str(q) for q in range(1, len(periods) + 1)]
    name_w, period_w = 1.25 * inch, (0.7 if shs else 0.5) * inch
    widths = [name_w, WIDTH - name_w - period_w * len(periods)] + [period_w] * len(periods)
    rows = [
        [cell("Behavior", CELL_HEAD), cell("Behavior Statements", CELL_HEAD),
         cell("Semester" if shs else "Quarter", CELL_HEAD)] + [""] * (len(periods) - 1),
        ["", ""] + [cell(label, CELL_HEAD) for label in labels],
    ]
    spans = [("SPAN", (0, 0), (0, 1)), ("SPAN", (1, 0), (1, 1)), ("SPAN", (2, 0), (-1, 0))]
    for row in data.behavior:
        rows.append([cell(row.name, CELL_BOLD), cell(row.description)]
                    + [cell(row.marks.get(p, ""), CELL_HEAD) for p in periods])
    if not data.behavior:
        spans.append(("SPAN", (0, 2), (-1, 2)))
        rows.append([cell("No class behavior areas are set up.", CELL_CENTER)] + [""] * (len(periods) + 1))
    table = grid(rows, widths, extra=spans + roomy(6, 7) + [("ROWBACKGROUNDS", (0, 0), (-1, 1), ["#eeeeee"])])
    marking = grid(
        [[cell("Marking", CELL_HEAD), cell("Non-Numerical Rating", CELL_HEAD)]]
        + [[cell(mark, CELL_CENTER), cell(meaning)] for mark, meaning in MARKINGS],
        [1.0 * inch, 2.0 * inch], extra=roomy(2.5, 3.5, first=1) + [("ROWBACKGROUNDS", (0, 0), (-1, 0), ["#eeeeee"])],
    )
    story = [Paragraph("REPORT ON LEARNER’S CLASS BEHAVIOR", PANEL_TITLE), Spacer(1, 8), table,
             Spacer(1, 16), marking]
    if shs:
        # Both semesters fill the left panel, so DepEd's descriptors come here.
        story += [Spacer(1, 16), descriptors_table()]
    return story


# ─── What the card couldn't say ─────────────────────────────────────────────

def _warnings(data, results):
    out = [note for r in results for note in r.notes]
    section, school = data.section, data.school
    if section.school_level == SHS and data.years:
        out.append("SLIS records one grade per senior high semester, so the quarter columns are blank and "
                   "the Semester Final Grade is the semester's grade.")
    missing = [label for label, text in (("Region", school.region), ("Division", school.division),
                                         ("District", school.district), ("School ID", school.school_id))
               if not text]
    if missing:
        out.append(f"{', '.join(missing)} {'is' if len(missing) == 1 else 'are'} not set under Settings › "
                   "School Forms, so the cover leaves them blank.")
    name, title = principal(data)
    if not name:
        out.append(f"No {title} is set under Settings › School Forms, so the principal's lines print "
                   "without a name.")
    if not adviser(data):
        out.append(f"No adviser is assigned to {section.grade_level} – {section.section} for "
                   f"{section.school_year}, so the adviser's lines print without a name.")
    unmarked = [f"{m.month:%B}" for m in data.months if m.school_days and m.present is None]
    if unmarked:
        out.append(f"No attendance was taken in {', '.join(unmarked)}, so days present and absent are "
                   "left blank there.")
    return out


# ─── The document ───────────────────────────────────────────────────────────

def build(data):
    """Returns (pdf_bytes, warnings): the outside of the card, then the inside."""
    results = [year_result(y) for y in data.years]
    buffer = io.BytesIO()
    doc = BaseDocTemplate(
        buffer, pagesize=PAGE, leftMargin=0, rightMargin=0, topMargin=0, bottomMargin=0,
        title=f"Learner's Progress Report Card – {printable(register_name(data.learner))}",
        author=data.school.name, subject=f"SF9, School Year {data.section.school_year}",
    )
    panel = dict(width=WIDTH, height=HEIGHT, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="card", frames=[
        Frame(EDGE, BOTTOM, id="left", **panel),
        Frame(HALF + FOLD, BOTTOM, id="right", **panel),
    ])])
    panels = (
        attendance_panel(data),
        cover_panel(data, admission(data, results)),
        progress_panel(data, results),
        behavior_panel(data),
    )
    story = []
    for i, content in enumerate(panels):
        if i:
            story.append(FrameBreak())
        story.append(KeepInFrame(WIDTH, HEIGHT, content, mode="shrink"))
    doc.build(story)
    return buffer.getvalue(), _warnings(data, results)
