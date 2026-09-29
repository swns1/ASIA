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

Which years exist, which one is current, and each year's dates live in the
`school_years` registry (enrollments.SchoolYear). `configured_current()` and
`configured_dates()` below read it for every service; `current()` is only the
calendar guess used before any year has been set up.
"""
import re

SCHOOL_YEAR_RE = re.compile(r"^(\d{4})-(\d{4})$")

# The calendar guess's cutoff: with no registered year to go on, the academic
# year is assumed to open in July.
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


def following(value):
    """The school year after `value`: "2025-2026" -> "2026-2027"."""
    start = int(normalize(value)[:4]) + 1
    return f"{start}-{start + 1}"


def current(today=None):
    """The canonical school year `today` falls in, on the July-June calendar.

    A guess from the date alone -- the fallback for when the registry has no
    current year yet. Prefer `configured_current()`."""
    if today is None:
        from datetime import date
        today = date.today()
    year = today.year if today.month >= SY_START_MONTH else today.year - 1
    return f"{year}-{year + 1}"


def start_year(value):
    """The opening calendar year of a school year ("2025-2026" -> 2025), or
    None when `value` isn't a canonical school year."""
    try:
        return int(normalize(value)[:4])
    except InvalidSchoolYear:
        return None


# ── The registry ─────────────────────────────────────────────────────────────
#
# `school_years` is owned by enrollment-service, but every service needs the
# same two answers from it, and the four services share one database. Plain
# SQL keeps billing and student-service from each growing a mirror model just
# to ask "which year is current".
#
# Any failure (the table not migrated yet, a dropped connection) answers None
# and the caller falls back. The savepoint matters: a failed statement inside
# an outer transaction (invoice generation is atomic) would otherwise abort
# that whole transaction, not just this read.

def _fetch_one(sql, params=()):
    from django.db import connection, transaction

    try:
        with transaction.atomic(), connection.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()
    except Exception:  # noqa: BLE001 — a registry read must never take a request down
        return None


def configured_current():
    """The label of the year marked current in the registry, or None."""
    row = _fetch_one("SELECT label FROM school_years WHERE is_current LIMIT 1")
    return row[0] if row else None


def configured_dates(value):
    """(start_date, end_date) the school set for this year, or None when the
    year isn't registered (or isn't a school year at all)."""
    if not is_valid(value):
        return None
    row = _fetch_one(
        "SELECT start_date, end_date FROM school_years WHERE label = %s",
        [normalize(value)],
    )
    if not row or not row[0] or not row[1]:
        return None
    return row[0], row[1]
