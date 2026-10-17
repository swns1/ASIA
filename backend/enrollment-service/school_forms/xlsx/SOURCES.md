# DepEd school form templates

These are DepEd's own Excel files, committed unchanged. The exports load them
with openpyxl and write values into their cells (`school_forms/cells.py` says
which cells). Downloaded 2026-10-13.

The SF10 isn't here: the school issues its own permanent record, not DepEd's
LIS form, so `school_forms/sf10.py` draws it from scratch after the school's
2026 Word templates (SF10-ES, SF10-JHS, SF10-SHS). Its crest and photo box
are in `../assets/`.

| File | Used for | Source |
|---|---|---|
| `deped-school-forms-do4-2014.xlsx` | SF1, SF2 (Nursery–Grade 10) | DepEd's modified school forms workbook (DO 4, s. 2014), as hosted by SDO Catanduanes: https://catanduanes.deped.gov.ph/files/School-Forms-Spread-sheet.xlsx |
| `lis-senior-high-school-forms.xlsx` | SF1-SHS, SF2-SHS (Grades 11–12) | LIS Support page, "Senior High School Forms.xlsx": https://support.lis.deped.gov.ph/support/downloads/schoolforms/Senior%20High%20School%20Forms.xlsx |
| `deped-wordmark.png` | SF1, SF2 | The DepEd wordmark from `deped-school-forms-do4-2014.xlsx` (a WMF, which openpyxl cannot keep), rendered to PNG. The exports put it back where the WMF was. |

LIS Support page: https://support.lis.deped.gov.ph/support

The 2022 LIS update to SF1 ("AGE as of 1st Friday of June" became "AGE as of
October 31") is applied in code, not by editing the file.

To swap in a newer DepEd file, replace it here and run
`pytest school_forms/test_cells.py`: every cell map checks the labels it
expects, so a template that moved its cells fails there instead of misfiling
data.
