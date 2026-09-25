from django.db import models

# Canonical role set for the whole system. identity-service's
# UserListView/UserDetailView validate against this set whenever a role is
# assigned. Mirrored (informational only) in the other three services'
# accounts/models.py ROLE_CHOICES.
#
# The `users` table (Meta.managed = False below, schema hand-built via
# pgAdmin) also has its own Postgres CHECK constraint on `role`
# (users_role_check) that must be kept in sync with this set by hand —
# Django's own validation here does NOT guarantee the DB will accept the
# value. Forgetting to update the constraint when adding a role here
# produces a 500 (IntegrityError) on create/update, not a clean 400.
VALID_ROLES = {"super_admin", "admin", "registrar", "teacher", "accounting", "guardian"}


class User(models.Model):
    user_id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100)
    # max_length must match the column (users.email is varchar(150)).
    # EmailField defaults to 254, so a 151-254 character address passed
    # Django's validation and then blew up on INSERT with "value too long for
    # type character varying(150)" — a 500 where the user should have seen a
    # 400 naming the field.
    email = models.EmailField(max_length=150, unique=True)
    role = models.CharField(max_length=30)
    password = models.CharField(max_length=255)
    profile_picture = models.TextField(null=True, blank=True)  # ← this line must exist
    current_session_id = models.UUIDField(null=True, blank=True)
    # False = deactivated: cannot sign in, but the account stays, so the
    # person's name stays on everything that points at them (advisories,
    # grades, overrides, guardian links) -- which a delete would orphan.
    # Added by migration 0003_add_user_is_active.
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "users"
        managed = False

    @property
    def is_authenticated(self):
        return True

    def __str__(self):
        return self.email


class AuditLog(models.Model):
    log_id = models.BigAutoField(primary_key=True)
    user_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    user_name = models.CharField(max_length=150, default="Unknown user")
    user_role = models.CharField(max_length=50, default="unknown", db_index=True)
    action = models.CharField(max_length=120)
    module = models.CharField(max_length=80, db_index=True)
    occurred_at = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=30, default="success", db_index=True)
    details = models.TextField(blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-occurred_at", "-log_id"]

    def __str__(self):
        return f"{self.occurred_at} - {self.user_name} - {self.action}"