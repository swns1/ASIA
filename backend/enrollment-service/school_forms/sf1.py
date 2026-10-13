"""
SF1 School Register, written into DepEd's own sheet.

Nursery to Grade 10 use the SF1 from DepEd's DO 4, s. 2014 workbook: one list,
males first. Senior high uses the LIS SF1-SHS, which keeps males and females in
separate blocks with a headcount under each.
"""
from . import cells
from .records import (
    age_cutoff, age_on, by_sex_then_name, register_name, semester_label, sex_letter,
    short_date,
)
from .workbook import (
    TEMPLATE_DIR, add_picture, ensure_merged, insert_rows, load_template, merge_rows, put,
    shift_ref,
)

# Learners still in the school at the end of the year.
STILL_ENROLLED = ("enrolled", "completed")


def remarks(learner):
    """The REMARK/S codes DepEd's legend defines, from what SLIS records."""
    notes = []
    if learner.transfer_in:
        notes.append(_transfer_note("T/I", learner.transfer_in))
    if learner.transfer_out:
        notes.append(_transfer_note("T/O", learner.transfer_out))
    # A student record marked dropped while this year's row is still open:
    # the learner stopped attending. SLIS records no reason or date for it.
    if learner.student_status == "dropped" and learner.status == "enrolled":
        notes.append("DRP")
    return "; ".join(notes)


def _transfer_note(code, transfer):
    detail = ", ".join(p for p in (transfer.school, short_date(transfer.effective_date)) if p)
    return f"{code} {detail}".strip()


def counts(learners, keep=lambda learner: True):
    """(male, female, total) over the learners `keep` accepts."""
    kept = [l for l in learners if keep(l)]
    male = sum(1 for l in kept if (l.sex or "").lower() == "male")
    female = sum(1 for l in kept if (l.sex or "").lower() == "female")
    return male, female, len(kept)


def build(data):
    """Returns (workbook, warnings)."""
    shs = data.section.school_level == "senior_highschool"
    m = cells.SF1_SHS if shs else cells.SF1
    wb = load_template(m.template, [m.sheet])
    ws = wb[m.sheet]
    warnings = []

    school, section = data.school, data.section
    header = {
        "school_id": school.school_id, "region": school.region,
        "division": school.division, "district": school.district,
        "school_name": school.name, "school_year": section.school_year,
        "grade_level": section.grade_level, "section": section.section,
        "semester": semester_label(section.semester), "track_strand": section.strand,
    }
    for name, ref in m.header.items():
        put(ws, ref, header.get(name) or "")
    for ref, text in m.relabel.items():
        put(ws, ref, text)

    ordered = sorted(data.learners, key=by_sex_then_name)
    if len(m.groups) == 1:
        lists = [ordered]
    else:
        lists = [
            [l for l in ordered if (l.sex or "").lower() != "female"],
            [l for l in ordered if (l.sex or "").lower() == "female"],
        ]

    cutoff = age_cutoff(section.school_year)
    offset = 0
    number = 0
    for group, learners in zip(m.groups, lists):
        first = group.first_row + offset
        last = group.last_row + offset
        extra = max(0, len(learners) - group.capacity)
        insert_rows(ws, last + 1, extra, style_row=last)
        merge_rows(ws, range(first, last + extra + 1), m.row_merges)
        for row in range(first, last + extra + 1):
            for col in m.clear_columns:
                put(ws, f"{col}{row}", None)
        for i, learner in enumerate(learners):
            number += 1
            _write_learner(ws, m, first + i, learner, number, cutoff)
        offset += extra
        if group.total_row and m.count_col:
            put(ws, f"{m.count_col}{group.total_row + offset}", len(learners))
    if m.combined_row and m.count_col:
        put(ws, f"{m.count_col}{m.combined_row + offset}", len(ordered))

    footer = {name: shift_ref(ref, offset) for name, ref in m.footer.items()}
    for span in m.footer_merges:
        first, _, last = span.partition(":")
        ensure_merged(ws, f"{shift_ref(first, offset)}:{shift_ref(last, offset)}")

    bosy = counts(ordered, lambda l: l.transfer_in is None)
    for key, value in zip(("bosy_male", "bosy_female", "bosy_total"), bosy):
        put(ws, footer[key], value)
    if data.year_ended:
        eosy = counts(ordered, lambda l: l.status in STILL_ENROLLED)
        for key, value in zip(("eosy_male", "eosy_female", "eosy_total"), eosy):
            put(ws, footer[key], value)
    put(ws, footer["adviser"], ", ".join(section.advisers))
    if "school_head" in footer:
        put(ws, footer["school_head"], school.head)

    if m.picture:
        p = m.picture
        add_picture(
            ws, TEMPLATE_DIR / "deped-wordmark.png",
            col=p.col, row=p.row, col_off=p.col_off, row_off=p.row_off, cx=p.cx, cy=p.cy,
        )

    if not ordered:
        warnings.append("No learners are enrolled in this section.")
    return wb, warnings


def _write_learner(ws, m, row, learner, number, cutoff):
    c = m.columns
    values = {
        "number": number,
        "lrn": learner.lrn,
        "name": register_name(learner),
        "sex": sex_letter(learner.sex),
        "age": age_on(learner.birth_date, cutoff),
        "religion": learner.religion,
        # SLIS keeps the address as one line; it goes in DepEd's first address
        # column whole rather than split by guesswork.
        "street": learner.address,
        "father": learner.father,
        "mother": learner.mother,
        "guardian": learner.guardian,
        "contact": learner.contact,
        "remarks": remarks(learner),
    }
    for name, value in values.items():
        if name in c and value not in (None, ""):
            put(ws, f"{c[name]}{row}", value)
    if learner.birth_date and "birth_date" in c:
        put(ws, f"{c['birth_date']}{row}", learner.birth_date, number_format=m.birth_date_format)
