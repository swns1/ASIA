"""
ORM mirror of the `guardians` table owned by student-service.
managed=False — enrollment-service never runs migrations for it.

Used to resolve a `role=guardian` login account (users.user_id, carried on
the JWT) to the set of student_ids that guardian is linked to, so guardian
requests can be scoped to only their own child(ren)'s records. Same
cross-service DB-mirror precedent as billing/enrollment_mirror.py.

Reads are the overwhelming majority of what this is for. The one write is
`user_id`, set by accounts/guardian_provisioning.py when a portal account is
linked to a guardian contact — the column exists precisely to be filled in,
and nothing else in this service writes to this table.
"""
from django.db import models


class GuardianMirror(models.Model):
    guardian_id = models.BigAutoField(primary_key=True)
    student_id  = models.BigIntegerField()
    # Nullable link to users.user_id — null until a guardian contact record is
    # linked to a login account. One user_id may appear on multiple rows (a
    # parent with several enrolled children / siblings), which is exactly why
    # provisioning links an existing account rather than creating a second one.
    user_id     = models.BigIntegerField(null=True, blank=True)

    # Contact fields, needed to provision an account from a guardian record.
    # email_address is nullable in the schema and empty for most rows in
    # practice, which is why provisioning skips rather than fails on it.
    full_name          = models.CharField(max_length=150)
    email_address      = models.CharField(max_length=150, null=True, blank=True)
    relationship       = models.CharField(max_length=20)
    is_primary_contact = models.BooleanField(default=False)

    class Meta:
        managed  = False
        db_table = "guardians"
