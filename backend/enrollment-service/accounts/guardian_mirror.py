"""
Read-only ORM mirror of the `guardians` table owned by student-service.
managed=False — enrollment-service never runs migrations for it.

Used to resolve a `role=guardian` login account (users.user_id, carried on
the JWT) to the set of student_ids that guardian is linked to, so guardian
requests can be scoped to only their own child(ren)'s records. Same
cross-service DB-mirror precedent as billing/enrollment_mirror.py.
"""
from django.db import models


class GuardianMirror(models.Model):
    guardian_id = models.BigAutoField(primary_key=True)
    student_id  = models.BigIntegerField()
    # Nullable link to users.user_id — null until an admin links the guardian
    # contact record to a login account. One user_id may appear on multiple
    # rows (a parent with several enrolled children / siblings).
    user_id     = models.BigIntegerField(null=True, blank=True)

    class Meta:
        managed  = False
        db_table = "guardians"
