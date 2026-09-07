"""
python manage.py provision_guardian_accounts [--student-id N] [--dry-run]

Backfills guardian portal accounts for students who are already enrolled.

New enrollments provision automatically (EnrollmentViewSet.perform_create /
perform_update -> accounts/guardian_provisioning.py), but every student
enrolled before that hook existed still has guardians with no linked account,
so their parents can't sign in. This is the one-time (and safely repeatable)
catch-up for those.

Idempotent: guardians already linked are left alone, so re-running is a no-op
for anything already done. Guardians without an email are reported, not
failed on -- there is no identity to key an account to, and that is the
overwhelming majority of the current data, so expect a large skip count and
read it as "these need an email collected", not as an error.

Accounts created here have an UNUSABLE password and cannot be signed into
until someone sets one through the admin user-management screen. See
accounts/guardian_provisioning.py for why that's deliberate.
"""
from django.core.management.base import BaseCommand

from accounts.guardian_mirror import GuardianMirror
from accounts.guardian_provisioning import (
    ALREADY_LINKED,
    CREATED,
    LINKED,
    SKIPPED_NO_EMAIL,
    provision_guardian_accounts,
)
from enrollments.models import Enrollment


class Command(BaseCommand):
    help = "Link or create portal accounts for the guardians of enrolled students."

    def add_arguments(self, parser):
        parser.add_argument(
            "--student-id",
            type=int,
            help="Only provision this student's guardians (default: every enrolled student).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would happen without writing anything.",
        )

    def handle(self, *args, **options):
        student_id = options.get("student_id")
        dry_run = options.get("dry_run")

        if student_id:
            student_ids = [student_id]
        else:
            # Only students who are actually enrolled -- a pending application
            # shouldn't hand out portal access, matching the save-time hook.
            student_ids = sorted(
                set(
                    Enrollment.objects
                    .filter(enrollment_status="enrolled")
                    .values_list("student_id", flat=True)
                )
            )

        if dry_run:
            self._report_dry_run(student_ids)
            return

        totals = {CREATED: 0, LINKED: 0, SKIPPED_NO_EMAIL: 0, ALREADY_LINKED: 0}
        for sid in student_ids:
            results = provision_guardian_accounts(sid)
            for key in totals:
                totals[key] += len(results[key])
            for line in results[CREATED]:
                self.stdout.write(self.style.SUCCESS(f"  created  {line}"))
            for line in results[LINKED]:
                self.stdout.write(f"  linked   {line}")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"{totals[CREATED]} account(s) created, {totals[LINKED]} linked to an existing account."
        ))
        self.stdout.write(
            f"{totals[ALREADY_LINKED]} already linked; "
            f"{totals[SKIPPED_NO_EMAIL]} skipped for having no email on file."
        )
        if totals[CREATED]:
            self.stdout.write(self.style.WARNING(
                "New accounts have no usable password yet - set one per account in "
                "the admin Users screen before telling a guardian to sign in."
            ))

    def _report_dry_run(self, student_ids):
        would_create, would_link, no_email, already = 0, 0, 0, 0
        seen_emails = set()

        for sid in student_ids:
            for guardian in GuardianMirror.objects.filter(student_id=sid):
                if guardian.user_id:
                    already += 1
                    continue
                email = (guardian.email_address or "").strip().lower()
                if not email:
                    no_email += 1
                    continue
                # A parent with two enrolled children appears twice; the
                # second occurrence links to the account the first created.
                from accounts.models import User
                if email in seen_emails or User.objects.filter(email__iexact=email).exists():
                    would_link += 1
                else:
                    would_create += 1
                seen_emails.add(email)

        self.stdout.write(self.style.WARNING("DRY RUN - nothing was written."))
        self.stdout.write(f"  would create : {would_create}")
        self.stdout.write(f"  would link   : {would_link}")
        self.stdout.write(f"  already linked: {already}")
        self.stdout.write(f"  skipped (no email): {no_email}")
        self.stdout.write(
            "  (a real run may link more than this: a guardian row with no email of "
            "its own is also linked when the same person appears, by name, on a "
            "sibling's record in the same household)"
        )
