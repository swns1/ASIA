"""
Demo guardians from seed_demo_students.

The command created households and learners but no guardians, so the whole
seeded cohort had nobody on file -- though registration requires a guardian --
and guardian_provisioning had nothing to build a portal login from.

Pure function plus the command with its queries patched out; no database.
"""
import random
from unittest.mock import MagicMock, patch

import pytest

from students.management.commands import seed_demo_students as seed
from students.management.commands.seed_demo_students import guardians_for_household


def _draw(arrangement, key=7, family="Santos", rng_seed=1):
    return guardians_for_household(
        random.Random(rng_seed), family_name=family, living_arrangement=arrangement, household_key=key,
    )


@pytest.mark.parametrize("arrangement,relationships", [
    ("both_parents", ["mother", "father"]),
    (None, ["mother", "father"]),
    ("mother_only", ["mother"]),
    ("father_only", ["father"]),
    ("guardian", ["guardian"]),
    ("relative", ["guardian"]),
])
def test_guardians_follow_the_living_arrangement(arrangement, relationships):
    assert [g["relationship"] for g in _draw(arrangement)] == relationships


def test_exactly_one_primary_and_it_comes_first():
    rows = _draw("both_parents")
    assert [g["is_primary_contact"] for g in rows] == [True, False]


@pytest.mark.parametrize("rng_seed", range(20))
def test_the_primary_contact_always_has_a_reserved_domain_email(rng_seed):
    primary = _draw("both_parents", rng_seed=rng_seed)[0]
    assert primary["email_address"].endswith("@example.com")


def test_parents_carry_the_family_name_and_a_guardian_does_not():
    assert all(g["full_name"].endswith(" Santos") for g in _draw("both_parents"))
    assert not _draw("guardian")[0]["full_name"].endswith(" Santos")


def test_rows_fit_their_columns():
    for arrangement in ("both_parents", "guardian"):
        for g in _draw(arrangement, family="Del Rosario", key=123456):
            assert len(g["full_name"]) <= 150
            assert g["email_address"] is None or len(g["email_address"]) <= 150
            assert len(g["mobile_number"]) <= 20


def test_same_seed_same_household_same_parents():
    assert _draw("both_parents", rng_seed=5) == _draw("both_parents", rng_seed=5)


def test_siblings_in_one_household_get_the_same_parents():
    learners = [
        {"student_id": 1, "last_name": "Reyes", "household_id": 40},
        {"student_id": 2, "last_name": "Reyes", "household_id": 40},
        {"student_id": 3, "last_name": "Cruz", "household_id": None},
    ]
    with patch.object(seed, "Student") as student_model, \
            patch.object(seed, "Household") as household_model, \
            patch.object(seed, "Guardian") as guardian_model:
        (student_model.objects.filter.return_value.order_by.return_value
         .values.return_value) = learners
        household_model.objects.filter.return_value.values_list.return_value = [(40, "both_parents")]
        guardian_model.side_effect = lambda **kw: kw
        made, covered = seed.Command()._make_guardians(20260923)

    rows = guardian_model.objects.bulk_create.call_args.args[0]
    assert (made, covered) == (len(rows), 3)
    first, second = ([r for r in rows if r["student_id"] == sid] for sid in (1, 2))
    strip = lambda rs: [{k: v for k, v in r.items() if k != "student_id"} for r in rs]  # noqa: E731
    assert strip(first) == strip(second) and len(first) == 2
    # The learner without a household still gets a guardian of their own.
    assert any(r["student_id"] == 3 for r in rows)
    student_model.objects.filter.assert_called_once_with(lrn__startswith="9900", guardian__isnull=True)


def test_nothing_to_do_creates_nothing():
    with patch.object(seed, "Student") as student_model, patch.object(seed, "Guardian") as guardian_model:
        student_model.objects.filter.return_value.order_by.return_value.values.return_value = []
        assert seed.Command()._make_guardians(1) == (0, 0)
    guardian_model.objects.bulk_create.assert_not_called()
