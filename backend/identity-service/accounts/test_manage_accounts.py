"""
Tests for `manage.py manage_accounts` — first-admin creation, password reset,
and locking the published demo accounts on a real install.

User.objects is mocked rather than hitting a real database, matching the
convention in test_role_hierarchy.py / test_roles.py.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.hashers import check_password, is_password_usable
from django.core.management import CommandError, call_command

from accounts.management.commands.manage_accounts import DEMO_EMAILS
from accounts.models import User

STRONG = "Lakeview-Registrar-2026"


def _prompts(*answers):
    return patch(
        "accounts.management.commands.manage_accounts.getpass.getpass",
        side_effect=list(answers),
    )


def test_create_admin_hashes_the_password_and_sets_super_admin():
    with patch.object(User, "objects") as objects, \
         patch.object(User, "save", autospec=True) as save, \
         _prompts(STRONG, STRONG):
        objects.filter.return_value.exists.return_value = False
        call_command("manage_accounts", "create-admin", "--email", "head@school.edu.ph", "--name", "Head Registrar")

    saved = save.call_args.args[0]
    assert saved.role == "super_admin"
    assert saved.email == "head@school.edu.ph"
    assert saved.password != STRONG
    assert check_password(STRONG, saved.password)


def test_create_admin_refuses_an_existing_email():
    with patch.object(User, "objects") as objects, \
         patch.object(User, "save") as save:
        objects.filter.return_value.exists.return_value = True
        with pytest.raises(CommandError, match="already exists"):
            call_command("manage_accounts", "create-admin", "--email", "admin@slis.test", "--name", "X")
    save.assert_not_called()


def test_create_admin_rejects_weak_and_mismatched_passwords():
    with patch.object(User, "objects") as objects, \
         patch.object(User, "save") as save, \
         _prompts("short", "short", STRONG, "different", "123", "123"):
        objects.filter.return_value.exists.return_value = False
        with pytest.raises(CommandError, match="No valid password"):
            call_command("manage_accounts", "create-admin", "--email", "a@b.ph", "--name", "A")
    save.assert_not_called()


def test_set_password_updates_hash_and_ends_the_session():
    target = SimpleNamespace(pk=7, name="Registrar", email="registrar@school.edu.ph", role="registrar")
    with patch.object(User, "objects") as objects, _prompts(STRONG, STRONG):
        objects.filter.return_value.first.return_value = target
        call_command("manage_accounts", "set-password", "--email", "registrar@school.edu.ph")

    update = objects.filter.return_value.update
    kwargs = update.call_args.kwargs
    assert check_password(STRONG, kwargs["password"])
    assert kwargs["current_session_id"] is None


def test_lock_demo_makes_every_demo_password_unusable():
    demo = [SimpleNamespace(pk=i, email=e, role="admin") for i, e in enumerate(DEMO_EMAILS, 1)]
    with patch.object(User, "objects") as objects, \
         patch("accounts.management.commands.manage_accounts.transaction.atomic", MagicMock()):
        objects.filter.return_value = MagicMock()
        objects.filter.return_value.__iter__.return_value = iter(demo)
        objects.filter.return_value.exclude.return_value.exists.return_value = True
        call_command("manage_accounts", "lock-demo")

    email_filter = objects.filter.call_args_list[0]
    assert set(email_filter.kwargs["email__in"]) == set(DEMO_EMAILS)
    updates = objects.filter.return_value.update.call_args_list
    assert len(updates) == len(DEMO_EMAILS)
    for call in updates:
        assert not is_password_usable(call.kwargs["password"])
        assert call.kwargs["current_session_id"] is None
