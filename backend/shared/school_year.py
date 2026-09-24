"""
The canonical form of a school year string, and the one place that decides it.

`school_year` is the partition key for this whole system. It appears on
enrollments, section_advisories, grades, attendance and school_settings, it is
what the sidebar's picker scopes every page by, and billing matches it in raw
SQL across the service boundary when it recalculates a fee schedule. Every one
of those is a string comparison.

It was also, until this module, an unvalidated `varchar(20)`: no CHECK
constraint, no serializer validator, nothing. A single "2025-26", a trailing
space, or an "SY 2025-2026" pasted from a spreadsheet does not raise anything
-- it silently splits one school year into two that never join, and the halves
are invisible because every screen filters to one of them at a time.

Canonical form is "YYYY-YYYY" with consecutive years: "2025-2026".
"""
import re

SCHOOL_YEAR_RE = re.compile(r"^(\d{4})-(\d{4})$")

# Matches school_settings.sy_start_date's convention and
# enrollments.views.school_years(): the academic year opens in July.
SY_START_MONTH = 7


class InvalidSchoolYear(ValueError):
    """Raised by `normalize` for anything that isn't a canonical school year."""


def normalize(value):
    """
    Return `value` as a canonical "YYYY-YYYY" string.

    Surrounding whitespace is stripped -- that much is a paste artefact rather
    than a decision by whoever typed it. Everything else raises: guessing what
    "2025-26" or "SY2025" was meant to be is how one year quietly becomes two.
    """
    if value is None:
        raise InvalidSchoolYear("School year is required.")

    text = str(value).strip()
    match = SCHOOL_YEAR_RE.match(text)
    if not match:
        raise InvalidSchoolYear(
            f"'{value}' is not a valid school year. Use the form 2025-2026."
        )

    start, end = (int(g) for g in match.groups())
    if end != start + 1:
        raise InvalidSchoolYear(
            f"'{text}' spans {end - start} years. A school year covers exactly "
            f"one, so it should read {start}-{start + 1}."
        )
    return text


def is_valid(value):
    try:
        normalize(value)
    except InvalidSchoolYear:
        return False
    return True


def current(today=None):
    """The canonical school year `today` falls in, on the July-June calendar."""
    if today is None:
        from datetime import date
        today = date.today()
    year = today.year if today.month >= SY_START_MONTH else today.year - 1
    return f"{year}-{year + 1}"
