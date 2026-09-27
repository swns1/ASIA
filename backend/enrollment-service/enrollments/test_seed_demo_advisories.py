"""
seed_demo --advisories: the demo teacher's sections, on their own.

A database seeded before seed_demo assigned current-year advisories left the
demo teacher with none in the year in progress -- My Sections, grade entry and
attendance empty -- and the only way to get them was a --wipe that rebuilds
every enrollment, grade and invoice.
"""
from contextlib import nullcontext
from datetime import date
from unittest.mock import MagicMock, patch

from enrollments.management.commands import seed_demo


def _run(**extra):
    cmd = seed_demo.Command()
    cmd.stdout = MagicMock()
    opts = {"seed": 1, "years": 3, "sy_start_year": None, "as_of": None, "wipe": False,
            "advisories": True, **extra}
    with patch.object(seed_demo, "Student") as student_model, \
            patch.object(seed_demo.transaction, "atomic", return_value=nullcontext()), \
            patch.object(seed_demo.timezone, "localdate", return_value=date(2026, 9, 27)), \
            patch.object(seed_demo.Command, "_ensure_demo_advisories") as advisories, \
            patch.object(seed_demo.Command, "_seed_year") as seed_year, \
            patch.object(seed_demo.Command, "_ensure_subjects") as subjects:
        student_model.objects.filter.return_value.order_by.return_value = ["LEARNER"]
        cmd.handle(**opts)
    return advisories, seed_year, subjects


def test_only_the_current_years_advisories_are_made():
    advisories, seed_year, subjects = _run()
    advisories.assert_called_once_with("2026-2027", ["LEARNER"], wipe=False)
    seed_year.assert_not_called()
    subjects.assert_not_called()


def test_the_year_follows_as_of_on_the_july_cutoff():
    advisories, _, _ = _run(as_of="2027-06-30")
    assert advisories.call_args.args[0] == "2026-2027"
    advisories, _, _ = _run(as_of="2027-07-01")
    assert advisories.call_args.args[0] == "2027-2028"
