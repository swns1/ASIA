"""
Checks against identity-service's `users` table that this service needs
before it points a guardian contact at a login account.

Raw SQL rather than the accounts.User stub: `is_active` is a real column now
(identity-service migration accounts.0003_add_user_is_active, and schema.sql),
but the stub still describes it as an always-True property, and giving the
stub the field would mean a migration in an `accounts` app whose history is
shared with three other services.
"""
from django.db import connection


def guardian_account_problem(user_id):
    """Why login account `user_id` can't be linked to a guardian contact, or
    None when it can."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT role, is_active FROM users WHERE user_id = %s", [user_id])
        row = cursor.fetchone()
    if row is None:
        return "That login account doesn't exist."
    role, is_active = row
    if role != "guardian":
        return "Only a parent/guardian account can be linked to a guardian contact."
    if not is_active:
        return "That account is deactivated. Reactivate it in Users first, or choose another account."
    return None
