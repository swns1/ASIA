# DepEd school form templates

These are DepEd's own Excel files, committed unchanged. The exports load them
with openpyxl and write values into their cells (`school_forms/cells.py` says
which cells). Downloaded 2026-10-13.

| File | Used for | Source |
|---|---|---|
| `deped-school-forms-do4-2014.xlsx` | SF1, SF2 (Nursery–Grade 10) | DepEd's modified school forms workbook (DO 4, s. 2014), as hosted by SDO Catanduanes: https://catanduanes.deped.gov.ph/files/School-Forms-Spread-sheet.xlsx |
| `lis-senior-high-school-forms.xlsx` | SF1-SHS, SF2-SHS (Grades 11–12) | LIS Support page, "Senior High School Forms.xlsx": https://support.lis.deped.gov.ph/support/downloads/schoolforms/Senior%20High%20School%20Forms.xlsx |
| `lis-sf10-es-2025-03-26.xlsx` | SF10-ES (Grades 1–6) | LIS Support page, archived SF10-ES of 26 March 2025 (MATATAG learning areas) |
| `lis-sf10-jhs-2025-03-26.xlsx` | SF10-JHS (Grades 7–10) | LIS Support page, archived SF10-JHS of 26 March 2025 (MATATAG learning areas) |
| `lis-sf10-shs.xlsx` | SF10-SHS (Grades 11–12) | LIS Support page, "School Form 10 SF10-SHS Senior High School Student Permanent Record.xlsx" (DO 69, s. 2016 format) |
| `deped-wordmark.png` | SF1, SF2 | The DepEd wordmark from `deped-school-forms-do4-2014.xlsx` (a WMF, which openpyxl cannot keep), rendered to PNG. The exports put it back where the WMF was. |

LIS Support page: https://support.lis.deped.gov.ph/support

The 2022 LIS update to SF1 ("AGE as of 1st Friday of June" became "AGE as of
October 31") is applied in code, not by editing the file.

To swap in a newer DepEd file, replace it here and run
`pytest school_forms/test_cells.py`: every cell map checks the labels it
expects, so a template that moved its cells fails there instead of misfiling
data.
