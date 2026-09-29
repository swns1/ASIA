"""
An archived school year is read-only.

Archiving says a year is finished: its enrollments, grades, score entries,
attendance, narrative reports, advisers, sections, subjects, calendar,
scholarships and risk runs stay as they are. Correcting any of them -- a grade included -- means
unarchiving the year first (School Years page), which is a deliberate, logged
step rather than something a stray edit can do.

Not guarded: payments and invoices (billing-service), because late balances
are paid after a year ends, and student records, which don't belong to a year.

Every write path to a year's records calls ensure_open() before it writes:
ModelViewSets through ArchivedYearGuard, the custom actions (bulk enroll,
promotion, transfers, the section grade/attendance/narrative grids, attendance
bulk, risk runs) directly. A refused write is a 409 whose message says how to
get past it.
"""
from rest_framework import status
from rest_framework.exceptions import APIException

from .models import SchoolYear


class YearArchived(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "year_archived"


def archived_among(labels):
    """The archived years among `labels` (blank ones ignored)."""
    labels = {label for label in labels if label}
    if not labels:
        return set()
    return set(
        SchoolYear.objects.filter(label__in=labels, archived_at__isnull=False)
        .values_list("label", flat=True)
    )


def ensure_open(*labels):
    """Refuse (409) if any of these school years is archived."""
    closed = sorted(archived_among(labels))
    if closed:
        raise YearArchived(
            f"S.Y. {closed[0]} is archived, so its records are read-only. "
            "An admin can unarchive it under School Years to make changes."
        )


def year_of(record):
    """The school year label a record belongs to -- a model instance or a
    serializer's validated data. Records that have no year of their own
    (grades, attendance, scholarships...) have it through their enrollment.
    None when there's nothing to go on, e.g. a PATCH that leaves it alone."""
    if record is None:
        return None
    if isinstance(record, dict):
        year = record.get("school_year")
        enrollment = record.get("enrollment")
    else:
        # A Section's year is a foreign key to the label; `school_year_id`
        # reads it without fetching the SchoolYear row.
        year = getattr(record, "school_year_id", None) or getattr(record, "school_year", None)
        enrollment = None if year else getattr(record, "enrollment", None)
    if year:
        return year if isinstance(year, str) else getattr(year, "label", None)
    return getattr(enrollment, "school_year", None)


class ArchivedYearGuard:
    """
    For a ModelViewSet over one year's records: create, update and delete are
    refused while the record's year -- before or after the change -- is
    archived.

    A viewset that overrides these hooks calls super() instead of saving
    itself; the extra keyword arguments pass through to serializer.save().
    """

    def perform_create(self, serializer, **save_kwargs):
        ensure_open(year_of(serializer.validated_data))
        return serializer.save(**save_kwargs)

    def perform_update(self, serializer, **save_kwargs):
        ensure_open(year_of(serializer.instance), year_of(serializer.validated_data))
        return serializer.save(**save_kwargs)

    def perform_destroy(self, instance):
        ensure_open(year_of(instance))
        instance.delete()
