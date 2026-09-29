"""
Fee schedules of an archived school year are read-only.

The same rule enrollment-service applies to a finished year's records
(enrollments/archive.py there): editing an archived year's fees would rewrite
its invoices, so it takes unarchiving the year first. Payments are NOT guarded
-- late balances are paid after a year ends -- and nothing here touches them.
"""
from rest_framework import status
from rest_framework.exceptions import APIException


class YearArchived(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "year_archived"


def ensure_year_open(label):
    """Refuse (409) if `label` is an archived school year."""
    # Imported here, like every enrollment_mirror use: importing the mirrors
    # at module load registers them as models of this app, and makemigrations
    # would then want migrations for tables billing doesn't own.
    from .enrollment_mirror import SchoolYearMirror

    if label and SchoolYearMirror.objects.filter(label=label, archived_at__isnull=False).exists():
        raise YearArchived(
            f"S.Y. {label} is archived, so its fees are read-only. "
            "An admin can unarchive it under School Years to change them."
        )
