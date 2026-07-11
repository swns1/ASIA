"""
Read-only ORM mirror of the `guardians` table owned by student-service.
managed=False — billing-service never runs migrations for it.

Used to resolve a `role=guardian` login account (users.user_id, carried on
the JWT) to the set of student_ids that guardian is linked to, so a guardian
only sees invoices/installments for their own child(ren). Sits alongside the
existing enrollment_mirror.py cross-service mirrors.
"""
from django.db import models


class GuardianMirror(models.Model):
    guardian_id = models.BigAutoField(primary_key=True)
    student_id  = models.BigIntegerField()
    # Nullable link to users.user_id — one user_id may appear on multiple
    # rows (a parent with several enrolled children / siblings).
    user_id     = models.BigIntegerField(null=True, blank=True)

    class Meta:
        managed  = False
        db_table = "guardians"
