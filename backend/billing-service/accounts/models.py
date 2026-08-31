"""
Stub User model that points at the existing `users` table managed by
identity-service. It is `managed = False` so Django will never alter it.

If your real identity-service User model differs, replace this file with the
exact same model — what matters is:
    - db_table = "users"
    - primary key column = "user_id"
    - has a `role` field (or property) returning one of:
        super_admin, admin, registrar, teacher, accounting

That's enough for SimpleJWT to find users via `USER_ID_FIELD = "user_id"`
and for our role-checked permissions to work.
"""
from django.db import models

from shared.roles import ROLE_CHOICES
from shared.user_stub import UserManager

__all__ = ["ROLE_CHOICES", "UserManager", "User"]


class User(models.Model):
    user_id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    password = models.CharField(max_length=255)
    current_session_id = models.UUIDField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "users"

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    def __str__(self):
        return self.email

    @property
    def is_active(self):
        return True

    @property
    def is_staff(self):
        return self.role in ["super_admin", "admin"]

    @property
    def is_superuser(self):
        return self.role == "super_admin"

    @property
    def is_anonymous(self):
        return False

    @property
    def is_authenticated(self):
        return True

    def has_perm(self, perm, obj=None):
        return self.role == "super_admin"

    def has_module_perms(self, app_label):
        return self.role == "super_admin"
