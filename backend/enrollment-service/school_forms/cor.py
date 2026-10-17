"""
The Certificate of Registration (COR) with the school's Admissions Agreement,
as one PDF on long bond paper (8.5 x 13 in, like the agreement's Word file).

Page 1 is the COR: the learner, their section, and the subjects they take,
as the COR page always listed them. The Admissions Agreement for their level
follows, word for word as the school wrote it (agreements.py). Its blanks are
filled from the record: the school year (and senior high's semester), the
learner's name, and their level. The signer's own lines are left for ink:
the parent's printed name, the box they sign in, the date and the relation.
The system can't know who will sign at the counter. The agreement's
signature block is kept on one page; the school's own PDF of it spilled the
principal's title onto a page of its own.

Everything is set in the agreement's look: its letterhead, Times standing in
for its Century Schoolbook (as on the SF10's PDF), and "SLIS Copy" (or
"Parent's Copy") with "Page X of Y" at the foot. Only the peso sign comes
from a bundled font, DejaVu Serif: the built-in fonts have no ₱.

Drawn with reportlab's Platypus rather than pdf.py: pdf.py prints Excel
grids, and two pages of justified clauses need text that flows.
"""
import io
import re
from pathlib import Path
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from . import agreements
from .agreements import Clause, Columns, Heading, Item, Lead, Note
from .pdf import printable
from .records import long_date, natural_name, semester_label
from .sf10 import LOGO, TAGLINE, strand_name

PAGE = (8.5 * inch, 13 * inch)
TOP_MARGIN = 567 / 1440 * inch          # the Word file's
BOTTOM_MARGIN = 0.62 * inch             # room for the footer under the text
FOOTER_Y = 0.32 * inch

COPIES = {"slis": "SLIS Copy", "parent": "Parent’s Copy"}

LEVEL_NAMES = {
    "nursery": "Nursery",
    "kindergarten": "Kindergarten",
    "elementary": "Elementary",
    "junior_highschool": "Junior High School",
    "senior_highschool": "Senior High School",
}

# Whose name goes over "Principal/School Academic Head", per level, with the
# label it has under Billing Settings › School Forms. Nursery and Kindergarten
# are the elementary principal's, as the SF10 puts Kindergarten on SF10-ES.
PRINCIPALS = {
    "nursery": ("elementary_principal", "Elementary School Principal"),
    "kindergarten": ("elementary_principal", "Elementary School Principal"),
    "elementary": ("elementary_principal", "Elementary School Principal"),
    "junior_highschool": ("jhs_principal", "Junior High School Principal"),
    "senior_highschool": ("shs_principal", "Senior High School Principal"),
}
DEPARTMENT_HEAD = ("shs_department_head", "Senior High School Department Head")
SEMESTER_WORDS = {"1st": "First", "2nd": "Second"}

# ─── Type ───────────────────────────────────────────────────────────────────

FONTS = Path(__file__).resolve().parent / "assets" / "fonts"
PESO_FONT = "DejaVuSerif"


def register_fonts():
    """DejaVu Serif, for the peso sign only (once per process)."""
    if PESO_FONT in pdfmetrics.getRegisteredFontNames():
        return
    pdfmetrics.registerFont(TTFont(PESO_FONT, str(FONTS / "DejaVuSerif.ttf")))
    pdfmetrics.registerFont(TTFont(f"{PESO_FONT}-Bold", str(FONTS / "DejaVuSerif-Bold.ttf")))
    pdfmetrics.registerFontFamily(PESO_FONT, normal=PESO_FONT, bold=f"{PESO_FONT}-Bold",
                                  italic=PESO_FONT, boldItalic=f"{PESO_FONT}-Bold")


def peso(markup):
    """₱ set in DejaVu Serif, bold where the text around it is."""
    return markup.replace("₱", f'<font name="{PESO_FONT}">₱</font>')


def value(text):
    """A value from the database, safe inside paragraph markup and the built-in fonts."""
    return escape(printable(str(text or "")))


def style(name, size=9, bold=False, italic=False, align=TA_LEFT, leading=None, **kw):
    font = "Times-" + {(False, False): "Roman", (True, False): "Bold",
                       (False, True): "Italic", (True, True): "BoldItalic"}[(bold, italic)]
    return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading or size * 1.2,
                          alignment=align, **kw)


NUMBER_AT = 260 / 1440 * inch           # where a clause's number sits, as in the Word file
TEXT_AT = 851 / 1440 * inch             # where its text starts
ITEM_AT = TEXT_AT + 0.27 * inch

# Times at 10 pt for the Word file's 9 pt Century Schoolbook: Century is the
# larger face, and at 10 pt the agreement fills its two pages as it does there.
SIZE = 10
BODY = style("body", SIZE, align=TA_JUSTIFY, leading=11.4)
CLAUSE = ParagraphStyle("clause", BODY, leftIndent=TEXT_AT, bulletIndent=NUMBER_AT, bulletFontName="Times-Roman",
                        bulletFontSize=SIZE)
ITEM = ParagraphStyle("item", CLAUSE, leftIndent=ITEM_AT, bulletIndent=TEXT_AT)
NOTE = ParagraphStyle("note", BODY, leftIndent=TEXT_AT)
LEAD = ParagraphStyle("lead", BODY, leftIndent=NUMBER_AT)
HEADING = style("heading", SIZE, bold=True, spaceBefore=7, spaceAfter=1, keepWithNext=1)
CELL = style("cell", SIZE, leading=11.6)
CELL_CENTER = style("cell_center", SIZE, leading=11.6, align=TA_CENTER)
CELL_HEAD = style("cell_head", SIZE, bold=True, leading=11.6, align=TA_CENTER)

SCHOOL_NAME = style("school", 22, bold=True, align=TA_CENTER, leading=25)
TAGLINE_STYLE = style("tagline", 12, bold=True, align=TA_CENTER, leading=14)
CONTACT = style("contact", 9, bold=True, align=TA_CENTER, leading=10.5)
STAMP = style("stamp", 5, italic=True, align=TA_RIGHT, leading=6)
TITLE = style("title", 16, bold=True, align=TA_CENTER, leading=19, spaceBefore=10)
SUBTITLE = style("subtitle", 12, bold=True, italic=True, align=TA_CENTER, leading=15)
YEAR = style("year", 14, bold=True, align=TA_CENTER, leading=17, spaceAfter=10)
TEXT = style("text", 10, align=TA_JUSTIFY, leading=13, firstLineIndent=0.41 * inch)
LABEL = style("label", 9, leading=11)
FILLED = style("filled", 10, bold=True, leading=12)
CAPTION = style("caption", 10, bold=True, align=TA_CENTER, leading=12)
BIG_CAPTION = style("big_caption", 12, bold=True, align=TA_CENTER, leading=14)
ACCEPTANCE_HEAD = style("acceptance_head", 12, bold=True, align=TA_CENTER, leading=15, spaceBefore=10, spaceAfter=6)
SIGN_NOTE = style("sign_note", 10, bold=True, italic=True, align=TA_CENTER, leading=12)
SIGNER_CAPTION = style("signer_caption", 10, bold=True, italic=True, leading=12)

PLAIN = TableStyle([
    ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
])


def plain(rows, widths, extra=(), heights=None):
    table = Table(rows, colWidths=widths, rowHeights=heights, hAlign="LEFT")
    table.setStyle(PLAIN)
    if extra:
        table.setStyle(TableStyle(list(extra)))
    return table


# ─── The record, in words ───────────────────────────────────────────────────

def learner_name(data):
    """'JUAN SANTOS DELA CRUZ JR.', as plain text."""
    return natural_name(data.learner).upper()


def level_text(data):
    """'GRADE 7'; senior high adds the strand: 'GRADE 11 – STEM'. Plain text."""
    section = data.section
    if section.school_level == "senior_highschool" and section.strand:
        return f"{section.grade_level} – {section.strand}".upper()
    return section.grade_level.upper()


def filled(text, width, size=10, smallest=7):
    """
    A value written into a blank: bold, centred, on one line, made smaller
    rather than wrapped. A long name wrapping onto a second line would push
    the agreement's signature block onto a page of its own.
    """
    text = printable(str(text or ""))
    while size > smallest and pdfmetrics.stringWidth(text, "Times-Bold", size) > width:
        size -= 0.5
    return Paragraph(escape(text), style(f"filled_{size}", size, bold=True, align=TA_CENTER))


def term_text(data):
    """'School Year 2026-2027', or 'the First Semester of School Year 2026-2027'."""
    section = data.section
    year = f"School Year <b>{value(section.school_year)}</b>"
    if section.semester:
        return f"the <b>{SEMESTER_WORDS.get(section.semester, value(section.semester))} Semester</b> of {year}"
    return year


def signatory(school, field):
    return getattr(school.signatories, field, "") or ""


def approver(data, role, warnings):
    """The name over a signer's line: the level's principal (else the school head), or the SHS department head."""
    school = data.school
    if role == "department_head":
        field, label = DEPARTMENT_HEAD
        name = signatory(school, field)
    else:
        field, label = PRINCIPALS.get(data.section.school_level, PRINCIPALS["elementary"])
        name = signatory(school, field) or school.head
    if not name:
        warnings.append(f"No {label} is set under Billing Settings › School Forms, so their signature line "
                        "on the agreement prints without a name.")
    return name


# ─── Shared parts ───────────────────────────────────────────────────────────

def letterhead(school, width, scale=1):
    """
    The crest at the left, the school's name and contacts centred on the
    page. `scale` sizes the whole of it down for a narrower page: the SF9's
    panels are half a landscape sheet.
    """
    def sized(base):
        if scale == 1:
            return base
        return ParagraphStyle(f"{base.name}_{scale}", base, fontSize=base.fontSize * scale,
                              leading=base.leading * scale)

    phones = " | ".join(p for p in (
        f"Mobile: {value(school.phone)}" if school.phone else "",
        f"Landline: {value(school.landline)}" if school.landline else "",
    ) if p)
    tagline = re.sub(r"\b(\d+)(st|nd|rd|th)\b", r"\1<super>\2</super>", escape(TAGLINE), count=1)
    contact = sized(CONTACT)
    lines = [Paragraph(value(school.name), sized(SCHOOL_NAME)), Paragraph(tagline, sized(TAGLINE_STYLE))]
    lines += [Paragraph(text, contact) for text in (value(school.address), phones) if text]
    if school.email:
        lines.append(Paragraph(f"Email: <u>{value(school.email)}</u>", contact))
    gutter = 0.95 * inch * scale
    crest = Image(str(LOGO), width=0.65 * inch * scale, height=0.95 * inch * scale)
    return plain([[crest, lines, ""]], [gutter, width - 2 * gutter, gutter], extra=[
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (0, 0), "LEFT"),
    ])


def signature_line(caption, name, title, width):
    """'Approved by:', room to sign, the line, the name under it (if known), the title."""
    rows = [[Paragraph(caption, SIGNER_CAPTION)], [""]]
    if name:
        rows.append([Paragraph(value(name).upper(), CAPTION)])
    rows.append([Paragraph(title, CAPTION)])
    first_under_line = 2
    return plain(rows, [width], heights=[None, 26] + [None] * (len(rows) - 2), extra=[
        ("LINEABOVE", (0, first_under_line), (0, first_under_line), 0.75, "black"),
        ("TOPPADDING", (0, first_under_line), (0, -1), 2),
    ])


# ─── Page 1: the COR ────────────────────────────────────────────────────────

def particulars(data, width):
    learner, section = data.learner, data.section
    shs = section.school_level == "senior_highschool"
    label_w, gap = 1.05 * inch, 0.25 * inch
    value_w = (width - 2 * label_w - gap) / 2

    def pair(label, text):
        return [Paragraph(label, LABEL), Paragraph(text, FILLED)]

    rows = [
        [*pair("Name of Student", value(learner_name(data))), "", "", ""],
        [*pair("LRN", value(learner.lrn)), "", *pair("Student No.", value(learner.student_number))],
        [*pair("Grade Level", value(section.grade_level)), "", *pair("Section", value(section.section))],
    ]
    if shs:
        rows.append([*pair("Strand", value(strand_name(section.strand))), "",
                     *pair("Semester", value(semester_label(section.semester)))])
    lines = []
    for r in range(len(rows)):
        lines.append(("LINEBELOW", (1, r), (1, r), 0.5, "black"))
        if r:
            lines.append(("LINEBELOW", (4, r), (4, r), 0.5, "black"))
    lines.append(("SPAN", (1, 0), (4, 0)))
    lines.append(("LINEBELOW", (1, 0), (4, 0), 0.5, "black"))
    lines.append(("BOTTOMPADDING", (0, 0), (-1, -1), 2))
    lines.append(("TOPPADDING", (0, 0), (-1, -1), 6))
    return plain(rows, [label_w, value_w, gap, label_w, value_w], extra=lines)


def subject_table(data, width, warnings):
    shs = data.section.school_level == "senior_highschool"
    head = ["No.", "Code", "Subject"] + (["Strand", "Semester"] if shs else [])
    widths = [0.45 * inch, 1.5 * inch]          # room for codes like G11-ABM-ORGMAN
    widths += ([width - sum(widths) - 2.05 * inch, 1.0 * inch, 1.05 * inch] if shs else [width - sum(widths)])
    rows = [[Paragraph(h, CELL_HEAD) for h in head]]
    for number, subject in enumerate(data.subjects, 1):
        row = [Paragraph(str(number), CELL_CENTER), Paragraph(value(subject.code), CELL_CENTER),
               Paragraph(value(subject.name), CELL)]
        if shs:
            row += [Paragraph(value(subject.strand) or "—", CELL_CENTER),
                    Paragraph(value(semester_label(subject.semester)) or "—", CELL_CENTER)]
        rows.append(row)
    extra = []
    if not data.subjects:
        section = data.section
        what = f"{section.grade_level}" + (f" {section.strand}" if section.strand else "")
        warnings.append(f"No subjects are set up for {what} in {section.school_year}"
                        + (f" ({semester_label(section.semester)})" if section.semester else "")
                        + ", so the COR's subject table is empty.")
        rows.append([Paragraph("No subjects on record for this enrollment.", CELL_CENTER)] + [""] * (len(head) - 1))
        extra.append(("SPAN", (0, 1), (-1, 1)))
    table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, "black"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        *extra,
    ]))
    return table


def certification(data):
    status = data.learner.status
    name, school = value(learner_name(data)), value(data.school.name)
    section = data.section
    placed = f"<b>{value(section.grade_level)}</b>"
    if section.school_level == "senior_highschool" and section.strand:
        placed += f" – <b>{value(section.strand)}</b>"
    if section.section:
        placed += f", Section <b>{value(section.section)}</b>"
    if status == "pending":
        return Paragraph(
            f"<b>Registration pending.</b> <b>{name}</b> is not yet officially enrolled for {term_text(data)}. "
            "Enrollment becomes official once the general admission and accounting requirements of the school "
            "are met (Admissions Agreement, Section 1.1).", TEXT)
    verb = "is" if status == "enrolled" else "was"
    return Paragraph(f"This certifies that <b>{name}</b> {verb} officially enrolled in {placed}, for "
                     f"{term_text(data)} at <b>{school}</b>.", TEXT)


def cor_page(data, edition, width, warnings, issued):
    section = data.section
    year = (f"{SEMESTER_WORDS.get(section.semester, value(section.semester))} Semester, "
            if edition.per_semester and section.semester else "") + f"SY {value(section.school_year)}"
    story = [
        letterhead(data.school, width),
        Paragraph("CERTIFICATE OF REGISTRATION", TITLE),
        Paragraph(f"({LEVEL_NAMES.get(section.school_level, value(section.school_level))})", SUBTITLE),
        Paragraph(year, YEAR),
        particulars(data, width),
        Spacer(1, 14),
        Paragraph("Subjects Enrolled", HEADING),
        Spacer(1, 3),
        subject_table(data, width, warnings),
        Spacer(1, 14),
        certification(data),
    ]
    if data.learner.status != "pending":
        registrar = signatory(data.school, "records_officer")
        if not registrar:
            warnings.append("No Records Officer / Registrar is set under Billing Settings › School Forms, so the "
                            "COR's registrar line prints without a name.")
        half = width / 2
        story += [Spacer(1, 18), plain(
            [[Paragraph(f"Date issued: {long_date(issued)}", LABEL),
              signature_line("Certified by:", registrar, "Registrar", half)]],
            [half, half],
        )]
    return story


# ─── The agreement ──────────────────────────────────────────────────────────

def columns(block, width):
    left = 3.4 * inch
    head = block.rows[0]
    rows = [["", Paragraph(peso(head[0]), CELL_HEAD if block.centered_head else CELL),
             Paragraph(peso(head[1]), CELL_HEAD if block.centered_head else CELL)]]
    rows += [["", Paragraph(peso(a), CELL), Paragraph(peso(b), CELL)] for a, b in block.rows[1:]]
    return plain(rows, [TEXT_AT, left, width - TEXT_AT - left], extra=[
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 0.5),
    ])


def body(edition, width):
    out = []
    for block in edition.body:
        if isinstance(block, Heading):
            out.append(Paragraph(block.text, HEADING))
        elif isinstance(block, Clause):
            out.append(Paragraph(peso(block.text), CLAUSE, bulletText=block.number))
        elif isinstance(block, Item):
            out.append(Paragraph(peso(block.text), ITEM, bulletText=block.letter))
        elif isinstance(block, Note):
            out.append(Paragraph(peso(block.text), NOTE))
        elif isinstance(block, Lead):
            out.append(Paragraph(peso(block.text), LEAD))
        elif isinstance(block, Columns):
            out.append(columns(block, width))
    return out


def opening(data, edition, width):
    """'… the admission and / enrollment of ____ ____ / NAME OF STUDENT  GRADE/LEVEL / at … as follows:'."""
    intro = 1.0 * inch
    level_w = 2.1 * inch
    name_w = width - intro - level_w - 0.2 * inch
    fill = plain(
        [[Paragraph(agreements.ENROLLMENT_OF, style("of", 10, leading=12)),
          filled(learner_name(data), name_w), "", filled(level_text(data), level_w)],
         ["", Paragraph("NAME OF STUDENT", BIG_CAPTION), "", Paragraph(edition.level_caption, BIG_CAPTION)]],
        [intro, name_w, 0.2 * inch, level_w],
        extra=[("LINEBELOW", (1, 0), (3, 0), 0.75, "black"), ("TOPPADDING", (0, 1), (-1, 1), 2)],
    )
    return [
        Paragraph(agreements.OPENING, TEXT),
        Spacer(1, 4),
        fill,
        Spacer(1, 6),
        Paragraph(agreements.AS_FOLLOWS, style("as_follows", 10, leading=13)),
        Spacer(1, 2),
    ]


def signatures(data, edition, width, warnings):
    """ACCEPTANCE through the approvers' lines, kept together on one page."""
    accept = style("accept", 10, bold=True, leading=12.5,
                   align=TA_CENTER if edition.acceptance_centered else TA_JUSTIFY,
                   firstLineIndent=0 if edition.acceptance_centered else 0.41 * inch)
    col = (width - 0.6 * inch) / 2
    gap = width - 2 * col
    box = Table([[""]], colWidths=[col], rowHeights=[1.05 * inch])
    box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.75, "black")]))
    grid = plain(
        [
            [filled(learner_name(data), col), "", filled(level_text(data), col)],
            [Paragraph("Student’s Printed Name", CAPTION), "", Paragraph(edition.level_label, CAPTION)],
            ["", "", ""],
            ["", "", box],
            [Paragraph("Printed Name of Parent/Guardian", CAPTION), "", ""],
            ["", "", ""],
            [Paragraph("Date", CAPTION), "", Paragraph(agreements.SIGN_IN_BOX, SIGN_NOTE)],
        ],
        [col, gap, col],
        heights=[None, None, 14, 0.42 * inch, 0.2 * inch, 0.42 * inch, None],
        extra=[
            ("LINEABOVE", (0, 1), (0, 1), 0.75, "black"), ("LINEABOVE", (2, 1), (2, 1), 0.75, "black"),
            ("LINEABOVE", (0, 4), (0, 4), 0.75, "black"), ("LINEABOVE", (0, 6), (0, 6), 0.75, "black"),
            ("SPAN", (2, 3), (2, 5)), ("VALIGN", (2, 3), (2, 5), "TOP"),
            ("TOPPADDING", (0, 1), (-1, 1), 2), ("TOPPADDING", (0, 4), (0, 4), 2),
            ("TOPPADDING", (0, 6), (-1, 6), 2),
        ],
    )
    option = style("option", 10, leading=12)
    box_ = "(&nbsp;&nbsp;&nbsp;&nbsp;)"
    relation = plain(
        [[Paragraph("<b>Relation of Signatory to Student:</b>", option), "", "", ""],
         [Paragraph(f"{box_} Father", option), Paragraph(f"{box_} Mother", option),
          Paragraph(f"{box_} Others, please specify", option), ""]],
        [1.7 * inch, 1.7 * inch, 1.85 * inch, width - 5.25 * inch],
        extra=[("SPAN", (0, 0), (-1, 0)), ("TOPPADDING", (0, 1), (-1, 1), 4),
               ("LINEBELOW", (3, 1), (3, 1), 0.75, "black")],
    )
    signers = [signature_line(s.caption, approver(data, s.role, warnings), s.title, col) for s in edition.signers]
    if len(signers) == 1:
        approvals = plain([["", signers[0], ""]], [(width - col) / 2, col, (width - col) / 2])
    else:
        approvals = plain([[signers[0], "", signers[1]]], [col, gap, col])
    return KeepTogether([
        Paragraph("ACCEPTANCE", ACCEPTANCE_HEAD),
        *[Paragraph(text, accept) for text in edition.acceptance],
        Spacer(1, 26),
        grid,
        Spacer(1, 14),
        relation,
        Spacer(1, 14),
        approvals,
    ])


def agreement_pages(data, edition, width, warnings):
    section = data.section
    if edition.per_semester:
        semester = SEMESTER_WORDS.get(section.semester, value(section.semester)) or "&nbsp;" * 12
        year = (f"<u>&nbsp;&nbsp;{semester}&nbsp;&nbsp;</u> Semester, SY "
                f"<u>&nbsp;&nbsp;{value(section.school_year)}&nbsp;&nbsp;</u>")
    else:
        year = f"SY <u>&nbsp;&nbsp;{value(section.school_year)}&nbsp;&nbsp;</u>"
    return [
        Paragraph(agreements.STAMP, STAMP),
        letterhead(data.school, width),
        Paragraph("ADMISSIONS AGREEMENT", TITLE),
        Paragraph(edition.subtitle, SUBTITLE),
        Paragraph(year, YEAR),
        *opening(data, edition, width),
        *body(edition, width),
        signatures(data, edition, width, warnings),
    ]


# ─── The document ───────────────────────────────────────────────────────────

def numbered_canvas(label, margin):
    """A canvas that writes the copy's label and "Page X of Y" once the page count is known."""

    class NumberedCanvas(canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for number, state in enumerate(self._pages, 1):
                self.__dict__.update(state)
                self.setFont("Times-BoldItalic", 8)
                self.drawString(margin, FOOTER_Y, label)
                self.drawRightString(PAGE[0] - margin, FOOTER_Y, f"Page {number} of {total}")
                super().showPage()
            super().save()

    return NumberedCanvas


def build(data, copy="slis", issued=None):
    """Returns (pdf_bytes, warnings): the COR, then the agreement for the learner's level."""
    register_fonts()
    edition = agreements.edition_for(data.section.school_level)
    margin = edition.side_margin * inch
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=PAGE, leftMargin=margin, rightMargin=margin,
        topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN,
        title=f"Certificate of Registration – {natural_name(data.learner)}",
        author=data.school.name, subject="Certificate of Registration and Admissions Agreement",
    )
    warnings = []
    story = cor_page(data, edition, doc.width, warnings, issued or timezone.localdate())
    story += [PageBreak(), *agreement_pages(data, edition, doc.width, warnings)]
    doc.build(story, canvasmaker=numbered_canvas(COPIES[copy], margin))
    return buffer.getvalue(), warnings
