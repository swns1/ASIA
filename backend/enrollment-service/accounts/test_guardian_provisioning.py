"""
Guardian portal account provisioning.

The cases that matter here are the ones the data actually contains: a parent
with more than one enrolled child (the same email on several `guardians` rows,
against a UNIQUE `users.email`), and guardians with no email at all — which is
the majority of the current rows. Both must be non-events, not errors.

Mocked at the model boundary rather than run against a database: this service
can't build a test DB (see ai/test_risk_assessment.py's docstring for that
pre-existing limitation), and the logic under test is the branching, not the
SQL.
"""
from unittest.mock import MagicMock, patch

from django.db import IntegrityError

from accounts.guardian_provisioning import (
    ALREADY_LINKED,
    CREATED,
    LINKED,
    SKIPPED_NO_EMAIL,
    provision_for_enrollment,
    provision_guardian_accounts,
)

MODULE = "accounts.guardian_provisioning"

# The real function is wrapped in @transaction.atomic, whose __enter__ needs a
# live connection even when every query underneath is mocked. ContextDecorator
# keeps the undecorated function on __wrapped__, so call that: the atomicity is
# a database concern, and what's under test here is the branching.
_provision = provision_guardian_accounts.__wrapped__


def _guardian(pk=1, name="Nora Valdez", email="nora@example.com", user_id=None, student_id=111):
    g = MagicMock()
    g.pk = pk
    g.guardian_id = pk
    g.full_name = name
    g.email_address = email
    g.user_id = user_id
    g.student_id = student_id
    return g


class _MirrorStub:
    """Stands in for GuardianMirror.objects: canned filter() results, plus a
    record of every update() so linking can be asserted."""

    def __init__(self, guardians):
        self._guardians = guardians
        self.updates = []

    def filter(self, **kwargs):
        if "student_id" in kwargs:
            return list(self._guardians)
        # pk=... -> the update path
        stub = MagicMock()
        stub.update = lambda **vals: self.updates.append((kwargs.get("pk"), vals))
        return stub


def _run(guardians, existing_user=None, create_side_effect=None):
    mirror = _MirrorStub(guardians)
    user_qs = MagicMock()
    user_qs.first.return_value = existing_user
    user_model = MagicMock()
    user_model.objects.filter.return_value = user_qs
    if create_side_effect:
        user_model.objects.create.side_effect = create_side_effect
    else:
        created = MagicMock()
        created.user_id = 900
        user_model.objects.create.return_value = created

    # Household sibling-linking is a separate concern with its own tests below
    # (TestHouseholdSiblingLinking); patched out here so these cases isolate
    # the per-guardian link-or-create decision.
    with patch(f"{MODULE}.GuardianMirror") as gm, patch(f"{MODULE}.User", user_model), \
            patch(f"{MODULE}._link_same_person_across_household"):
        gm.objects = mirror
        results = _provision(111)
    return results, mirror, user_model


def test_creates_and_links_an_account_for_a_guardian_with_an_email():
    results, mirror, user_model = _run([_guardian()])

    assert len(results[CREATED]) == 1
    user_model.objects.create.assert_called_once()
    kwargs = user_model.objects.create.call_args.kwargs
    assert kwargs["email"] == "nora@example.com"
    assert kwargs["role"] == "guardian"
    # Unusable password -- the account exists but can't be signed into until
    # an admin sets one.
    assert kwargs["password"].startswith("!")
    assert mirror.updates == [(1, {"user_id": 900})]


def test_a_second_child_links_the_existing_account_instead_of_creating_a_duplicate():
    # The real failure this prevents: users.email is UNIQUE, so creating per
    # guardian row raises IntegrityError the moment a sibling enrolls.
    existing = MagicMock()
    existing.user_id = 42
    results, mirror, user_model = _run([_guardian(pk=7)], existing_user=existing)

    assert results[CREATED] == []
    assert len(results[LINKED]) == 1
    user_model.objects.create.assert_not_called()
    assert mirror.updates == [(7, {"user_id": 42})]


def test_matches_an_existing_account_case_insensitively():
    existing = MagicMock()
    existing.user_id = 42
    _, _, user_model = _run([_guardian(email="  NORA@Example.COM ")], existing_user=existing)

    # Lookup is iexact on the trimmed, lowercased address, so the same parent
    # entered twice by two registrars doesn't become two accounts.
    assert user_model.objects.filter.call_args.kwargs == {"email__iexact": "nora@example.com"}


def test_guardian_without_an_email_is_skipped_not_failed():
    results, mirror, user_model = _run([_guardian(email=None), _guardian(pk=2, email="   ")])

    assert len(results[SKIPPED_NO_EMAIL]) == 2
    user_model.objects.create.assert_not_called()
    assert mirror.updates == []


def test_already_linked_guardian_is_left_alone():
    results, mirror, user_model = _run([_guardian(user_id=5)])

    assert len(results[ALREADY_LINKED]) == 1
    user_model.objects.create.assert_not_called()
    assert mirror.updates == []


def test_losing_a_race_on_create_falls_back_to_linking():
    # Two siblings enrolled concurrently: the second create hits the UNIQUE
    # constraint, so re-read and link rather than surfacing an error.
    existing = MagicMock()
    existing.user_id = 77
    mirror = _MirrorStub([_guardian(pk=3)])
    user_qs = MagicMock()
    user_qs.first.side_effect = [None, existing]  # miss, then found on retry
    user_model = MagicMock()
    user_model.objects.filter.return_value = user_qs
    user_model.objects.create.side_effect = IntegrityError("duplicate key")

    with patch(f"{MODULE}.GuardianMirror") as gm, patch(f"{MODULE}.User", user_model), \
            patch(f"{MODULE}._link_same_person_across_household"):
        gm.objects = mirror
        results = _provision(111)

    assert len(results[LINKED]) == 1
    assert mirror.updates == [(3, {"user_id": 77})]


class TestHouseholdSiblingLinking:
    """The split-email case: the registrar types the parent's email on one
    child's guardian row and leaves it blank on the sibling's. Matching on
    email alone would give that parent an account that sees one child and not
    the other."""

    def _run_with_household(self, guardians, sibling_rows, household_id=3, sibling_ids=(222,)):
        mirror = _MirrorStub(guardians)
        # filter(student_id__in=..., user_id__isnull=True) -> the sibling rows
        mirror.sibling_rows = sibling_rows

        def filter_(**kwargs):
            if "student_id__in" in kwargs:
                return list(sibling_rows)
            if "student_id" in kwargs:
                return list(guardians)
            stub = MagicMock()
            stub.update = lambda **vals: mirror.updates.append((kwargs.get("pk"), vals))
            return stub

        mirror.filter = filter_

        student_model = MagicMock()
        student_model.objects.filter.return_value.values_list.return_value.first.return_value = household_id
        student_model.objects.filter.return_value.exclude.return_value.values_list.return_value = list(sibling_ids)

        user_qs = MagicMock()
        user_qs.first.return_value = None
        user_model = MagicMock()
        user_model.objects.filter.return_value = user_qs
        created = MagicMock()
        created.user_id = 900
        user_model.objects.create.return_value = created

        with patch(f"{MODULE}.GuardianMirror") as gm, patch(f"{MODULE}.User", user_model), \
                patch.dict("sys.modules", {"enrollments.models": MagicMock(Student=student_model)}):
            gm.objects = mirror
            results = _provision(111)
        return results, mirror

    def test_links_the_siblings_row_for_the_same_person_without_an_email(self):
        sibling_row = _guardian(pk=50, name="Nora Valdez", email=None, student_id=222)
        results, mirror = self._run_with_household([_guardian()], [sibling_row])

        assert len(results[CREATED]) == 1
        # Both the original row and the sibling's row now point at the account.
        assert (1, {"user_id": 900}) in mirror.updates
        assert (50, {"user_id": 900}) in mirror.updates

    def test_does_not_link_a_different_person_in_the_same_household(self):
        # A household can hold a child whose guardian is somebody else -- a
        # relative's child. Linking on household alone would hand that child's
        # records to the wrong parent.
        other = _guardian(pk=51, name="Different Person", email=None, student_id=222)
        results, mirror = self._run_with_household([_guardian()], [other])

        assert (51, {"user_id": 900}) not in mirror.updates

    def test_does_not_link_a_sibling_row_with_a_different_email(self):
        other = _guardian(pk=52, name="Nora Valdez", email="someoneelse@example.com", student_id=222)
        results, mirror = self._run_with_household([_guardian()], [other])

        # Same name, but it carries its own and different address -- treat the
        # email as authoritative over the name when one is present.
        assert (52, {"user_id": 900}) not in mirror.updates


class TestProvisionForEnrollment:
    def test_runs_only_for_an_enrolled_status(self):
        for status in ("pending", "cancelled", "transferred_out", "completed"):
            enrollment = MagicMock(enrollment_status=status, student_id=111)
            with patch(f"{MODULE}.provision_guardian_accounts") as inner:
                assert provision_for_enrollment(enrollment) is None
                inner.assert_not_called()

    def test_runs_for_enrolled(self):
        enrollment = MagicMock(enrollment_status="enrolled", student_id=111)
        with patch(f"{MODULE}.provision_guardian_accounts") as inner:
            inner.return_value = {CREATED: [], LINKED: [], SKIPPED_NO_EMAIL: [], ALREADY_LINKED: []}
            provision_for_enrollment(enrollment)
            inner.assert_called_once_with(111)

    def test_a_provisioning_failure_never_breaks_the_enrollment_save(self):
        enrollment = MagicMock(enrollment_status="enrolled", student_id=111)
        with patch(f"{MODULE}.provision_guardian_accounts", side_effect=RuntimeError("db on fire")):
            # No exception escapes: enrolling a student must not 500 because a
            # convenience side effect failed.
            assert provision_for_enrollment(enrollment) is None
