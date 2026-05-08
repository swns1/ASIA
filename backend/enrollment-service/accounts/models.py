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
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.db import models


ROLE_CHOICES = [
    ("super_admin", "Super Admin"),
    ("admin",       "Admin"),
    ("registrar",   "Registrar"),
    ("teacher",     "Teacher"),
    ("accounting",  "Accounting"),
]


class UserManager(BaseUserManager):
    def get_by_natural_key(self, email):
        return self.get(email=email)


class User(AbstractBaseUser):
    user_id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(max_length=150, unique=True)
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    password = models.CharField(max_length=255)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    objects = UserManager()

    class Meta:
        managed = False  # identity-service owns this table
        db_table = "users"

    # ── Required by Django auth machinery ──────────────────────────────────
    @property
    def is_anonymous(self):
        return False

    @property
    def is_authenticated(self):
        return True

    @property
    def is_active(self):
        # Schema has no `is_active` column — treat all rows as active.
        return True

    @property
    def is_staff(self):
        return self.role in ("super_admin", "admin")

    @property
    def is_superuser(self):
        return self.role == "super_admin"

    def has_perm(self, perm, obj=None):
        return self.is_superuser

    def has_module_perms(self, app_label):
        return self.is_superuser

    def __str__(self):  # pragma: no cover
        return f"{self.name} <{self.email}>"
