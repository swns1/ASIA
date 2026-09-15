"""
Provisioning portal accounts for guardians.

The guardian portal is scoped entirely by `guardians.user_id` (see
`guardian_student_ids()`), so a guardian who has no account, or has one that
was never linked, sees nothing. Until now that link was made by hand, which is
why 1 of 60 guardian rows had it.

Three things about the data shape drive the design here, and all three are
easy to get wrong:

1. **Guardian rows are per-student; accounts are per-person.** A parent with
   three enrolled children has three `guardians` rows carrying the same name
   and email. `users.email` is UNIQUE, so "create an account for each guardian
   row" throws IntegrityError on the second child. This provisions by
   *link-or-create*: an existing account with that email is linked to the new
   row rather than duplicated, which is also what makes one login show several
   children.

2. **Most guardians have no email.** The column is nullable and, in the
   current data, empty on the large majority of rows. A guardian without a
   usable email is skipped and reported, not failed on — there is no identity
   to key an account to, and inventing one (`student123@school.invalid`)
   would produce accounts nobody can receive a password for.

3. **`users.password` is NOT NULL and there is no password-reset flow yet.**
   New accounts get an *unusable* password hash (Django's `make_password(None)`
   convention — a hash no input can ever match), so the account exists and is
   linked but cannot be logged into until someone sets a password through the
   existing admin user-management screen. That is deliberate: it is the honest
   state until a set-password/invite flow exists, and it is strictly safer than
   seeding a shared default password.

Idempotent by construction — a row that already has `user_id` is left alone —
so this is safe to call on every save and safe to re-run as a backfill.
"""
import logging

from django.contrib.auth.hashers import make_password
from django.db import IntegrityError, transaction

from .guardian_mirror import GuardianMirror
from .models import User

logger = logging.getLogger(__name__)

# Outcome keys returned by provision_guardian_accounts(), so callers (and the
# management command) can report without re-deriving anything.
LINKED = "linked"          # an existing account matched by email
CREATED = "created"        # a new account was made and linked
SKIPPED_NO_EMAIL = "skipped_no_email"
ALREADY_LINKED = "already_linked"
SKIPPED_EMAIL_IN_USE = "skipped_email_in_use"   # the address belongs to a staff account


def _clean_email(value):
    return (value or "").strip().lower()


def _clean_name(value):
    return " ".join((value or "").split()).lower()


def _linkable_account(email):
    """The existing account this guardian row may be linked to, if any.

    Deliberately role-scoped. `users.email` is UNIQUE across every role, and a
    staff member who is also a parent is entirely ordinary at this scale -- so
    matching on email alone bound guardian rows to teacher and accounting
    accounts. That grants no extra access (every guardian-scoped query is
    gated on role == "guardian" before it resolves the link), but it consumes
    the link: the row then reads as provisioned, this module reports it
    ALREADY_LINKED for ever, and the actual parent can never be given portal
    access without someone unpicking it by hand.

    Returns (linkable_user, blocking_user). At most one is ever set.
    """
    existing = User.objects.filter(email__iexact=email).first()
    if existing is None:
        return None, None
    if getattr(existing, "role", None) == "guardian":
        return existing, None
    return None, existing


def _link_same_person_across_household(guardian, user_id, results):
    """
    Give this account the family's other children too.

    Guardian rows are per-student, so the same parent appears once per child --
    and in practice the registrar types the email on one child's row and leaves
    it blank on the next. Matching on email alone then produces an account that
    sees one child and not their sibling, which is the split-email problem.

    Scoped deliberately tightly: only rows for students in the *same household*
    (which is how this system records siblings -- see StudentViewSet.siblings),
    and only where the row is the same person by email, or by exact name when
    it carries no email of its own. A household can contain a child whose
    guardian is somebody else entirely (a cousin, a relative's child), and
    linking on household alone would hand that child's records to the wrong
    parent.
    """
    from enrollments.models import Student

    household_id = (
        Student.objects.filter(student_id=guardian.student_id)
        .values_list("household_id", flat=True)
        .first()
    )
    if not household_id:
        return

    sibling_ids = set(
        Student.objects.filter(household_id=household_id)
        .exclude(student_id=guardian.student_id)
        .values_list("student_id", flat=True)
    )
    if not sibling_ids:
        return

    email = _clean_email(guardian.email_address)
    name = _clean_name(guardian.full_name)

    household_rows = list(GuardianMirror.objects.filter(student_id__in=sibling_ids))

    # A name match is much weaker evidence than an email match, and it is the
    # only evidence available for the rows that matter most (the registrar
    # typed the email on one child and left it blank on the next). Guard it:
    # if the same name appears in this household under a different address,
    # the name plainly is not unique to this person and must not be treated as
    # proof of identity.
    emails_by_name = {}
    for row in household_rows:
        row_email = _clean_email(row.email_address)
        if row_email:
            emails_by_name.setdefault(_clean_name(row.full_name), set()).add(row_email)
    name_is_ambiguous = len(emails_by_name.get(name, set()) - {email}) > 0

    for row in household_rows:
        if row.user_id is not None:
            continue
        row_email = _clean_email(row.email_address)
        if row_email:
            if row_email != email:
                continue
            basis = "same email"
        else:
            if name_is_ambiguous or not name or _clean_name(row.full_name) != name:
                continue
            basis = "same name, no email on the row"
        GuardianMirror.objects.filter(pk=row.pk).update(user_id=user_id)
        results[LINKED].append(
            f"{row.full_name} (guardian #{row.guardian_id}, sibling) -> same account ({basis})"
        )


@transaction.atomic
def provision_guardian_accounts(student_id):
    """
    Ensure every guardian contact for `student_id` that has a usable email is
    linked to a portal account, creating one only where no account with that
    email exists yet.

    Returns a dict of outcome -> list of human-readable descriptions, e.g.
    {"created": ["Nora Valdez <nora@example.com>"], "skipped_no_email": [...]}.
    Never raises on a per-guardian problem: one bad row must not roll back an
    enrollment or block the rest.
    """
    results = {
        LINKED: [], CREATED: [], SKIPPED_NO_EMAIL: [],
        ALREADY_LINKED: [], SKIPPED_EMAIL_IN_USE: [],
    }

    guardians = GuardianMirror.objects.filter(student_id=student_id)

    for guardian in guardians:
        label = f"{guardian.full_name} (guardian #{guardian.guardian_id})"

        if guardian.user_id:
            results[ALREADY_LINKED].append(label)
            continue

        email = _clean_email(guardian.email_address)
        if not email:
            results[SKIPPED_NO_EMAIL].append(label)
            continue

        # Match case-insensitively: the same parent typed in twice by two
        # different registrars shouldn't become two accounts.
        existing, blocker = _linkable_account(email)
        if blocker:
            results[SKIPPED_EMAIL_IN_USE].append(
                f"{label} -> {email} already belongs to a "
                f"{getattr(blocker, 'role', 'non-guardian')} account (#{blocker.user_id}); "
                f"give this guardian their own address, or change that account's role"
            )
            continue
        if existing:
            GuardianMirror.objects.filter(pk=guardian.pk).update(user_id=existing.user_id)
            results[LINKED].append(f"{label} -> existing account {email}")
            _link_same_person_across_household(guardian, existing.user_id, results)
            continue

        try:
            # An unusable password: the account is real and linked, but cannot
            # be signed into until an admin sets one. See the module docstring.
            user = User.objects.create(
                name=guardian.full_name or email,
                email=email,
                role="guardian",
                password=make_password(None),
            )
        except IntegrityError:
            # Lost a race against a concurrent provision for the same email
            # (two siblings enrolled at once). Re-read and link instead.
            existing, blocker = _linkable_account(email)
            if blocker:
                results[SKIPPED_EMAIL_IN_USE].append(
                    f"{label} -> {email} already belongs to a "
                    f"{getattr(blocker, 'role', 'non-guardian')} account (#{blocker.user_id})"
                )
                continue
            if not existing:
                logger.exception(
                    "Could not provision a guardian account for %s <%s>", label, email
                )
                continue
            GuardianMirror.objects.filter(pk=guardian.pk).update(user_id=existing.user_id)
            results[LINKED].append(f"{label} -> existing account {email}")
            _link_same_person_across_household(guardian, existing.user_id, results)
            continue

        GuardianMirror.objects.filter(pk=guardian.pk).update(user_id=user.user_id)
        results[CREATED].append(f"{label} -> new account {email}")
        _link_same_person_across_household(guardian, user.user_id, results)

    return results


def provision_for_enrollment(enrollment):
    """
    Hook used by EnrollmentViewSet on save. Only runs for an enrollment that is
    actually active — a pending application shouldn't hand out portal access,
    and a cancelled/transferred one shouldn't either.

    Deliberately swallows its own failures: provisioning is a convenience that
    rides along with enrolling a student, and it must never be the reason an
    enrollment save 500s. A failure is logged (with the request ID, see
    shared/logging_config.py) and the enrollment stands; the backfill command
    can pick it up later.
    """
    if getattr(enrollment, "enrollment_status", None) != "enrolled":
        return None

    student_id = getattr(enrollment, "student_id", None)
    if not student_id:
        return None

    try:
        results = provision_guardian_accounts(student_id)
    except Exception:  # noqa: BLE001 - see docstring: never break the save
        logger.exception(
            "Guardian account provisioning failed for student_id=%s", student_id
        )
        return None

    if results[CREATED] or results[LINKED]:
        logger.info(
            "Guardian portal accounts for student_id=%s: %d created, %d linked",
            student_id, len(results[CREATED]), len(results[LINKED]),
        )
    return results
