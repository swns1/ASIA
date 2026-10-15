"""
Every cell map against DepEd's own file (SF1 and SF2; the SF10 is drawn, see test_sf10.py).

A newer DepEd template dropped into xlsx/ that moved its cells fails here,
by name and cell, instead of quietly filing a learner's birthday under
Mother Tongue. No database: the templates are files.
"""
import pytest

from school_forms import cells
from school_forms.workbook import load_template, top_left


def _norm(value):
    return " ".join(str(value or "").split())


@pytest.mark.parametrize("m", cells.REGISTER_MAPS + cells.ATTENDANCE_MAPS, ids=lambda m: m.name)
def test_section_form_anchors(m):
    ws = load_template(m.template, [m.sheet])[m.sheet]
    for ref, label in m.anchors.items():
        assert _norm(top_left(ws, ref).value).startswith(label), f"{m.name} {ref}"


@pytest.mark.parametrize("m", cells.REGISTER_MAPS + cells.ATTENDANCE_MAPS, ids=lambda m: m.name)
def test_learner_blocks_hold_no_labels(m):
    """The rows a map writes learners into are empty in DepEd's file (pre-printed numbers aside)."""
    ws = load_template(m.template, [m.sheet])[m.sheet]
    skip = {m.columns.get("number"), m.columns.get("lrn") if getattr(m, "clear_columns", ()) else None}
    for group in m.groups:
        for row in range(group.first_row, group.last_row + 1):
            for col in m.columns.values():
                if col in skip:
                    continue
                assert top_left(ws, f"{col}{row}").value in (None, ""), f"{m.name} {col}{row}"


def test_every_template_keeps_its_logos_through_openpyxl():
    """Pillow has to be installed or openpyxl drops pictures on load."""
    seal_and_wordmark = {
        (cells.SF1_SHS.template, cells.SF1_SHS.sheet): 2,
        (cells.SF2_SHS.template, cells.SF2_SHS.sheet): 2,
        # The DO 4 workbook's wordmark is a WMF openpyxl cannot keep; the
        # builders put a PNG of it back, so only the seal survives the load.
        (cells.SF1.template, cells.SF1.sheet): 1,
        (cells.SF2.template, cells.SF2.sheet): 1,
    }
    for (template, sheet), count in seal_and_wordmark.items():
        ws = load_template(template, [sheet])[sheet]
        assert len(ws._images) == count, f"{template} {sheet}"
