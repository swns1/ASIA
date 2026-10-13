"""
SF10 Learner's Permanent Academic Record, written into DepEd's own file.

One file per level, as DepEd keeps them: SF10-ES (Grades 1-6), SF10-JHS
(Grades 7-10) and SF10-SHS (Grades 11-12), all from the LIS Support page.
Each school year (each semester in senior high) fills the next grade block in
order, so a repeated grade gets its own block like it would on paper.

A block's printed learning areas are DepEd's defaults for that grade; the
learner's own subjects replace them, because a permanent record lists what
the learner actually took.
"""
import re
from copy import copy
from decimal import Decimal

from enrollments.rules import GRADE_ORDER
from grading.deped import PASSING_GRADE, general_average, quantize, subject_remarks

from . import cells
from .records import grade_number, natural_name
from .workbook import load_template, merge_rows, put

MAPS = {
    "elementary": cells.SF10_ES,
    "junior_highschool": cells.SF10_JHS,
    "senior_highschool": cells.SF10_SHS,
}

CHECK = "✓"
BIRTH_DATE_FORMAT = "mm/dd/yyyy"

# DepEd's order of learning areas on the MATATAG SF9/SF10, matched by name.
# Subjects matching none follow, A to Z.
_ORDER = {
    "elementary": (
        ("language",), ("reading",), ("mother tongue",), ("filipino",), ("english",),
        ("math",), ("science",),
        ("gmrc", "good manners", "edukasyon sa pagpapakatao", "esp", "values"),
        ("makabansa",), ("araling panlipunan", "social studies"),
        ("epp", "tle", "technology and livelihood", "edukasyong pantahanan"),
        ("mapeh",), ("music",), ("arts",), ("physical education", "p.e."), ("health",),
    ),
    "junior_highschool": (
        ("filipino",), ("english",), ("math",), ("science",),
        ("araling panlipunan", "social studies"),
        ("values", "gmrc", "edukasyon sa pagpapakatao", "esp"),
        ("tle", "technology and livelihood", "epp"),
        ("mapeh",), ("music",), ("arts",), ("physical education", "p.e."), ("health",),
    ),
}

# The year-level outcomes DepEd's SF10 helper list offers for the General
# Average row: no failed area, remedial classes for one or two (DO 8, s.
# 2015), retained for three or more.
REMEDIAL_LIMIT = 2


def subject_rank(level, subject):
    name = subject.name.lower()
    if level == "senior_highschool":
        return (0 if subject.core else 1, name)
    groups = _ORDER.get(level, ())
    for i, words in enumerate(groups):
        if any(re.search(rf"\b{re.escape(w)}", name) for w in words):
            return (i, name)
    return (len(groups), name)


def whole(value):
    """Round half up to a whole number, as DepEd's grade sheets do."""
    return None if value is None else int(quantize(Decimal(str(value)), "1"))


def subject_result(subject, periods):
    """(period grades as whole numbers, final rating, remark) for one learning area."""
    grades = [whole(subject.grades.get(p)) for p in periods]
    final = None
    if grades and all(g is not None for g in grades):
        final = whole(sum(Decimal(str(subject.grades[p])) for p in periods) / len(periods))
    remark = subject_remarks(set(subject.recorded_remarks), final)
    return grades, final, remark


def year_result(year):
    """[(subject, grades, final, remark)], the General Average, and the failed count."""
    rows = [(s, *subject_result(s, year.periods)) for s in year.subjects]
    finals = [final for _, _, final, _ in rows]
    complete = bool(rows) and all(f is not None for f in finals)
    average = general_average(finals) if complete else None
    failed = sum(1 for *_, remark in rows if remark in ("failed", "incomplete", "dropped"))
    return rows, average, failed


def build(data):
    """Returns (workbook, warnings)."""
    m = MAPS[data.level]
    wb = load_template(m.template)
    warnings = []
    shs = data.level == "senior_highschool"
    school, learner = data.school, data.learner

    def at(spec, value, **kw):
        sheet, ref = spec
        if value not in (None, ""):
            put(wb[sheet], ref, value, **kw)

    first_name = learner.first_name
    if "suffix" not in m.learner and learner.suffix:
        first_name = f"{first_name} {learner.suffix}"  # SF10-SHS has no extension box
    values = {
        "last_name": learner.last_name, "first_name": first_name,
        "middle_name": learner.middle_name, "suffix": learner.suffix, "lrn": learner.lrn,
        "sex": {"male": "Male", "female": "Female"}.get((learner.sex or "").lower(), ""),
    }
    for name, spec in m.learner.items():
        if name == "birth_date":
            at(spec, learner.birth_date, number_format=BIRTH_DATE_FORMAT)
        else:
            at(spec, values.get(name))

    _eligibility(m, data, at)

    ordered = list(data.years)
    if len(ordered) > len(m.blocks):
        kept = ordered[:len(m.blocks)]
        warnings.append(
            f"{len(ordered)} records but DepEd's {m.name} has room for {len(m.blocks)}; "
            f"the last {len(ordered) - len(kept)} were left off. Add a page in Excel."
        )
        ordered = kept

    results = []
    for block, year in zip(m.blocks, ordered):
        results.append((year, *_fill_block(wb[block.sheet], block, year, data, warnings)))

    _certification(m, data, results, at)
    if shs:
        _shs_footer(m, results, at)
    if not data.years:
        warnings.append(f"No {m.name} records: the learner has no enrollment at this level here.")
    return wb, warnings


def _eligibility(m, data, at):
    e = data.eligibility
    if not e.completed_here:
        return
    check = m.eligibility.get("kinder_check") or m.eligibility.get("completer_check")
    if check:
        at(check, CHECK)
    if "general_average" in m.eligibility:
        at(m.eligibility["general_average"], e.general_average)
    at(m.eligibility["school_name"], data.school.name)
    if "school_id" in m.eligibility:
        at(m.eligibility["school_id"], data.school.school_id)
    at(m.eligibility["school_address"], data.school.address)


def _fill_block(ws, block, year, data, warnings):
    shs = block.type_col is not None
    school = data.school
    header = {
        "school": school.name, "school_id": school.school_id, "district": school.district,
        "division": school.division, "region": school.region,
        "grade": grade_number(year.grade_level), "section": year.section,
        "school_year": year.school_year, "adviser": year.adviser,
        "semester": {"1st": "1ST", "2nd": "2ND"}.get(year.semester, ""),
        "track_strand": year.strand,
    }
    for name, ref in block.header.items():
        put(ws, ref, header.get(name) or "")
    for ref, template in block.text_header.items():
        put(ws, ref, template.format(**{k: v or "" for k, v in header.items()}))
    if block.quarter_label_cells:
        labels = ("3RD", "4TH") if year.semester == "2nd" else ("1ST", "2ND")
        for ref, label in zip(block.quarter_label_cells, labels):
            put(ws, ref, label)
    if block.adviser_cell:
        put(ws, block.adviser_cell, year.adviser)

    rows, average, failed = year_result(year)
    rows.sort(key=lambda r: subject_rank(data.level, r[0]))
    first, last = block.subject_rows
    regular = last - first + 1 - block.reserved_rows
    capacity = last - first + 1
    if len(rows) > capacity:
        warnings.append(
            f"{year.grade_level} {year.school_year}: {len(rows)} subjects, room for {capacity}; "
            f"the last {len(rows) - capacity} were left off."
        )
        rows = rows[:capacity]
    merge_rows(ws, range(first, last + 1), block.row_merges)
    # DepEd's default names for this grade go; Madrasah rows stay unless needed.
    for row in range(first, first + max(regular, len(rows))):
        put(ws, f"{block.label_col}{row}", None)
    # Every subject name in the block's first-row style: DepEd's file indents
    # and italicises some rows for MAPEH's parts, whatever lands there now.
    label_font = copy(ws[f"{block.label_col}{first}"].font)
    for i, (subject, grades, final, remark) in enumerate(rows):
        row = first + i
        label = put(ws, f"{block.label_col}{row}", subject.name)
        label.font = copy(label_font)
        alignment = copy(label.alignment)
        alignment.indent = 0
        label.alignment = alignment
        if shs:
            put(ws, f"{block.type_col}{row}", "CORE" if subject.core else "")
            # SLIS records the semester's grade, not its two quarters.
            put(ws, f"{block.final_col}{row}", final)
        else:
            for col, grade in zip(block.period_cols, grades):
                if grade is not None:
                    put(ws, f"{col}{row}", grade)
            if final is not None:
                put(ws, f"{block.final_col}{row}", final)
        put(ws, f"{block.remarks_col}{row}", remark.upper() if remark else None)

    ga_row = block.general_average_row
    put(ws, f"{block.final_col}{ga_row}", average)
    if average is None:
        put(ws, f"{block.remarks_col}{ga_row}", None)
    elif shs:
        put(ws, f"{block.remarks_col}{ga_row}", "PASSED" if average >= PASSING_GRADE else "FAILED")
    else:
        outcome = "PROMOTED" if not failed else "REMEDIAL" if failed <= REMEDIAL_LIMIT else "RETAINED"
        put(ws, f"{block.remarks_col}{ga_row}", outcome)
    return average, failed


def _certification(m, data, results, at):
    c = m.certification
    learner, school = data.learner, data.school
    if "school_head" in c:
        at(c["school_head"], school.head)
    if "name" not in c:
        return
    at(c["name"], natural_name(learner))
    at(c["lrn"], learner.lrn)
    at(c["school_name"], school.name)
    for name, value in (("school_id", school.school_id), ("division", school.division)):
        if name in c:
            at(c[name], value)
    if results:
        year, average, failed = results[-1]
        at(c["last_school_year"], year.school_year)
        if average is not None and not failed and year.grade_level in GRADE_ORDER:
            index = GRADE_ORDER.index(year.grade_level)
            if index + 1 < len(GRADE_ORDER):
                at(c["next_grade"], grade_number(GRADE_ORDER[index + 1]))


def _shs_footer(m, results, at):
    averages = [average for _, average, _ in results]
    if len(results) == 4 and all(a is not None for a in averages):
        at(m.footer["general_average"], general_average(averages))
    final_year = next(
        (y for y, average, failed in results
         if y.grade_level == "Grade 12" and y.semester == "2nd" and average is not None and not failed),
        None,
    )
    if final_year and final_year.strand:
        at(m.footer["track_accomplished"], final_year.strand)
