"""
Account setup for a real install, where there is no seed data to log in with.

    python manage.py manage_accounts create-admin --email you@school.edu.ph --name "Your Name"
    python manage.py manage_accounts set-password --email you@school.edu.ph
    python manage.py manage_accounts lock-demo

`createsuperuser` does not apply here: this service leaves AUTH_USER_MODEL
unset and keeps accounts in its own `users` table (see accounts/models.py),
so the first super_admin has to be created through this command instead.

Passwords are always prompted for (never taken as an argument, which would
leave them in shell history) and run through the same validators and hasher
as the portal's own user-create view.

lock-demo is for a database that was loaded with seed_data.sql: the six demo
accounts share a password published in the README. The `users` table has no
"active" flag, so an account is locked by replacing its password with an
unusable hash (no password can match it) and ending its current session.
"""
import getpass

from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User

# Created by seed_data.sql's USERS block, matched by email the same way.
DEMO_EMAILS = (
    "superadmin@slis.test",
    "admin@slis.test",
    "registrar@slis.test",
    "teacher@slis.test",
    "accounting@slis.test",
    "maribel.reyes.seed@gmail.com",
)


class Command(BaseCommand):
    help = "Create the first super admin, reset a password, or lock the demo accounts."

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest="action", required=True)

        create = sub.add_parser("create-admin", help="Create a super_admin account.")
        create.add_argument("--email", required=True)
        create.add_argument("--name", required=True)

        reset = sub.add_parser("set-password", help="Set a new password for any account.")
        reset.add_argument("--email", required=True)

        sub.add_parser("lock-demo", help="Make the seeded demo accounts unusable.")

    def handle(self, *args, **options):
        action = options["action"]
        if action == "create-admin":
            self._create_admin(options["email"].strip(), options["name"].strip())
        elif action == "set-password":
            self._set_password(options["email"].strip())
        elif action == "lock-demo":
            self._lock_demo()

    # ── prompts ──────────────────────────────────────────────────────────
    def _prompt_password(self, user):
        for _ in range(3):
            password = getpass.getpass("Password: ")
            if password != getpass.getpass("Password (again): "):
                self.stderr.write("Passwords do not match.")
                continue
            try:
                validate_password(password, user=user)
            except ValidationError as exc:
                self.stderr.write(" ".join(exc.messages))
                continue
            return password
        raise CommandError("No valid password entered.")

    # ── actions ──────────────────────────────────────────────────────────
    def _create_admin(self, email, name):
        if not email or not name:
            raise CommandError("--email and --name are required.")
        if len(email) > 150:
            raise CommandError("Email must be 150 characters or fewer.")
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError(
                f"An account with {email} already exists. Use set-password to change its password."
            )

        user = User(name=name, email=email, role="super_admin")
        user.password = make_password(self._prompt_password(user))
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Created super admin {email} (user_id {user.pk})."))

    def _set_password(self, email):
        user = User.objects.filter(email__iexact=email).first()
        if not user:
            raise CommandError(f"No account with {email}.")
        password = self._prompt_password(user)
        # Clearing the session id signs the account out everywhere, the same
        # as a password change made in the portal.
        User.objects.filter(pk=user.pk).update(
            password=make_password(password), current_session_id=None,
        )
        self.stdout.write(self.style.SUCCESS(f"Password updated for {email}."))

    def _lock_demo(self):
        with transaction.atomic():
            demo = list(User.objects.filter(email__in=DEMO_EMAILS))
            for user in demo:
                # make_password(None) is Django's "unusable password" marker.
                User.objects.filter(pk=user.pk).update(
                    password=make_password(None), current_session_id=None,
                )

        if not demo:
            self.stdout.write("No demo accounts found; nothing to lock.")
            return
        for user in demo:
            self.stdout.write(f"  locked {user.email} ({user.role})")
        self.stdout.write(self.style.SUCCESS(
            f"Locked {len(demo)} demo account(s). Re-running seed_data.sql unlocks them again."
        ))
        if not User.objects.filter(role="super_admin").exclude(email__in=DEMO_EMAILS).exists():
            self.stdout.write(self.style.WARNING(
                "No other super_admin exists — create one with: "
                "python manage.py manage_accounts create-admin --email ... --name ..."
            ))
