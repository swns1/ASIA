"""
openpyxl helpers for filling DepEd's own Excel files.

The school forms are DepEd's templates, committed unchanged under xlsx/ (see
xlsx/SOURCES.md). openpyxl opens and saves them, but leaves these jobs to us:

- A value written to a merged range anywhere but its top-left cell is dropped
  without a word. `put` writes to the top-left.
- A string that starts with "=" is stored as a live formula. A learner's
  address typed as "=HYPERLINK(...)" must not run in a registrar's Excel, so
  `put` stores text as text.
- Control characters that a paste can carry make the save raise
  IllegalCharacterError. `put` strips them.
- `Worksheet.insert_rows` moves cells but not merged ranges, row heights,
  pictures or the print area. `insert_rows` here moves all of them, so a class
  bigger than the template's printed rows pushes the footer down intact.
"""
import warnings
from copy import copy
from io import BytesIO
from pathlib import Path

import openpyxl
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE, MergedCell
from openpyxl.drawing.image import Image
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, OneCellAnchor, TwoCellAnchor
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.utils.cell import (
    column_index_from_string,
    coordinate_from_string,
    get_column_letter,
    range_boundaries,
)

TEMPLATE_DIR = Path(__file__).resolve().parent / "xlsx"

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def load_template(filename, keep=None):
    """
    DepEd's workbook `filename`, keeping only the sheets named in `keep` (all
    of them when `keep` is None).

    openpyxl warns about what it cannot carry over: the WMF wordmark in the DO
    4 workbook, which the SF1/SF2 builders put back as a PNG, and the SF10-SHS
    file's extended dropdown lists, which only help typing. Neither is news on
    every request, so the warnings are silenced here.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        wb = openpyxl.load_workbook(TEMPLATE_DIR / filename)
    if keep is not None:
        for ws in list(wb.worksheets):
            if ws.title not in keep:
                wb.remove(ws)
        wb.active = 0
    return wb


def top_left(ws, ref):
    """The cell a value at `ref` has to go in: the merged range's first cell."""
    cell = ws[ref]
    if isinstance(cell, MergedCell):
        for rng in ws.merged_cells.ranges:
            if rng.min_row <= cell.row <= rng.max_row and rng.min_col <= cell.column <= rng.max_col:
                return ws.cell(rng.min_row, rng.min_col)
    return cell


def put(ws, ref, value, number_format=None, shrink=False):
    """
    Write `value` at `ref` (or its merged range), text always as text.

    `shrink` turns on Excel's shrink-to-fit, for figures going into DepEd's
    narrow summary boxes, where a number one digit too wide prints as ####.
    It also sets the text upright: some of those boxes in DepEd's SF2 carry a
    stray 90-degree rotation that prints a count sideways.
    """
    cell = top_left(ws, ref)
    if isinstance(value, str):
        cell.value = ILLEGAL_CHARACTERS_RE.sub("", value)
        # openpyxl reads a leading "=" as a formula; this is data, not one.
        cell.data_type = "s"
    else:
        cell.value = value
    if number_format:
        cell.number_format = number_format
    if shrink:
        alignment = copy(cell.alignment)
        alignment.shrink_to_fit = True
        alignment.wrap_text = False
        alignment.textRotation = 0
        cell.alignment = alignment
    return cell


def ensure_merged(ws, coord):
    """Merge `coord`, first undoing any merged range that overlaps it."""
    min_col, min_row, max_col, max_row = range_boundaries(coord)
    for rng in list(ws.merged_cells.ranges):
        if (rng.min_col, rng.min_row, rng.max_col, rng.max_row) == (min_col, min_row, max_col, max_row):
            return
        overlaps = not (
            rng.max_row < min_row or rng.min_row > max_row
            or rng.max_col < min_col or rng.min_col > max_col
        )
        if overlaps:
            ws.unmerge_cells(rng.coord)
    ws.merge_cells(coord)


def merge_rows(ws, rows, spans):
    """
    Give every row in `rows` the merged ranges named by `spans` ("C:F"),
    undoing whatever single-row merge overlaps one first.

    One pass over the sheet's merged ranges for the whole block: checking
    each row against every range made a senior high SF1 take two seconds.
    """
    rows = list(rows)
    if not rows:
        return
    lo, hi = min(rows), max(rows)
    touching = {}
    for rng in ws.merged_cells.ranges:
        if rng.max_row < lo or rng.min_row > hi:
            continue
        for row in range(max(rng.min_row, lo), min(rng.max_row, hi) + 1):
            touching.setdefault(row, []).append(rng)
    wanted = []
    for span in spans:
        first, _, last = span.partition(":")
        wanted.append((column_index_from_string(first), column_index_from_string(last or first)))
    for row in rows:
        existing = touching.get(row, [])
        exact = {(r.min_col, r.max_col) for r in existing if r.min_row == r.max_row == row}
        for c1, c2 in wanted:
            if (c1, c2) in exact:
                continue
            for rng in list(existing):
                if rng.max_col < c1 or rng.min_col > c2:
                    continue
                if rng.min_row != rng.max_row:
                    raise ValueError(f"{rng.coord} spans rows; a learner row can't be re-merged across it.")
                ws.unmerge_cells(rng.coord)
                existing.remove(rng)
            ws.merge_cells(start_row=row, start_column=c1, end_row=row, end_column=c2)


def shift_ref(ref, rows):
    """`ref` moved down by `rows`: shift_ref("R59", 3) -> "R62"."""
    if not rows:
        return ref
    col, row = coordinate_from_string(ref)
    return f"{col}{row + rows}"


def insert_rows(ws, idx, amount, style_row):
    """
    Insert `amount` rows before row `idx`, styled like `style_row` (given in
    the sheet's coordinates before the insert), moving everything below down.

    Refuses to split a merged range: every caller inserts between whole rows
    of a learner list, where none crosses.
    """
    if amount <= 0:
        return
    crossing = [r.coord for r in ws.merged_cells.ranges if r.min_row < idx <= r.max_row]
    if crossing:
        raise ValueError(f"Inserting at row {idx} would split merged ranges {crossing}.")

    src_row = style_row + amount if style_row >= idx else style_row
    moving = [r for r in ws.merged_cells.ranges if r.min_row >= idx]
    heights = {
        key: ws.row_dimensions[key].height
        for key in list(ws.row_dimensions.keys())
        if key >= idx
    }

    ws.insert_rows(idx, amount)

    # The cells (MergedCell placeholders included) moved with insert_rows;
    # the ranges describing them did not. The set is rebuilt afterwards
    # because a range's hash is its bounds.
    for rng in moving:
        rng.shift(row_shift=amount)
    ws.merged_cells.ranges = set(ws.merged_cells.ranges)

    for key in heights:
        ws.row_dimensions[key].height = None
    for key, height in heights.items():
        ws.row_dimensions[key + amount].height = height

    for img in ws._images:
        _shift_anchor(img.anchor, idx, amount)

    if ws.print_area:
        _extend_print_area(ws, idx, amount)

    style_height = ws.row_dimensions[src_row].height
    row_merges = [
        (r.min_col, r.max_col)
        for r in ws.merged_cells.ranges
        if r.min_row == r.max_row == src_row
    ]
    max_col = ws.max_column
    for row in range(idx, idx + amount):
        ws.row_dimensions[row].height = style_height
        for col in range(1, max_col + 1):
            ws.cell(row, col)._style = copy(ws.cell(src_row, col)._style)
        for min_col, max_col_ in row_merges:
            ws.merge_cells(start_row=row, start_column=min_col, end_row=row, end_column=max_col_)


def _shift_anchor(anchor, idx, amount):
    # Anchors count rows from 0; `idx` counts from 1.
    if isinstance(anchor, (OneCellAnchor, TwoCellAnchor)) and anchor._from.row >= idx - 1:
        anchor._from.row += amount
        if isinstance(anchor, TwoCellAnchor):
            anchor.to.row += amount


def _extend_print_area(ws, idx, amount):
    area = ws.print_area
    ref = area.split("!")[-1].replace("$", "")
    min_col, min_row, max_col, max_row = range_boundaries(ref)
    if max_row >= idx:
        max_row += amount
    ws.print_area = f"{get_column_letter(min_col)}{min_row}:{get_column_letter(max_col)}{max_row}"


def add_picture(ws, path, *, col, row, col_off=0, row_off=0, cx, cy):
    """
    Place the picture at `path` the way DepEd's file had it: anchored at
    (`col`, `row`), counted from 0, offset and sized in EMU.
    """
    img = Image(str(path))
    img.anchor = OneCellAnchor(
        _from=AnchorMarker(col=col, colOff=col_off, row=row, rowOff=row_off),
        ext=XDRPositiveSize2D(cx, cy),
    )
    ws.add_image(img)


def to_bytes(wb):
    """The workbook as .xlsx bytes, set to recalculate on open.

    Values are written as values, but the SF10-SHS file keeps DepEd's own
    formulas in the blocks we leave empty, and openpyxl saves no cached
    results for them.
    """
    wb.calculation.fullCalcOnLoad = True
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
