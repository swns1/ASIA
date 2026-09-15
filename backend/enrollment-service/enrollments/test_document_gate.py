"""
Regression tests for the document completeness gate in EnrollmentSerializer.

This gate is the only hard enforcement of documents anywhere in the system —
it blocks moving an enrollment into `enrolled` — and until now **nothing
tested it at all**.

What changed underneath it: it used to demand every `is_active=True`
requirement type from every learner, because the table had no way to say a
document was optional or situational. It now asks requirements/rules.py which
documents *this* learner owes, given where they are being placed and how they
got here.

The case worth the most here is `test_activating_does_not_count_itself`. On a
pending → enrolled PATCH the enrollment row already exists, so a prior-
enrollment check that forgets to exclude it sees the row being activated,
concludes "continuing", and silently switches off every transferee rule on the
exact path this gate exists for. It fails open, so nothing visibly breaks —
which is why it needs a test rather than care.

Enrollment/RequirementType/StudentRequirementSubmission are all managed=False
and this service cannot build a test database (see ai/test_risk_assessment.py),
so these mock the managers, same convention as test_eligibility_scoping.py.
"""
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework import serializers as drf_serializers

from enrollments.serializers import EnrollmentSerializer

STUDENT = SimpleNamespace(student_id=42, pk=42)


def req(id_, name, *, required=True, levels=None, statuses=None):
    return SimpleNamespace(
        requirement_type_id=id_,
        requirement_name=name,
        is_required=required,
        applies_to_levels=levels or [
            "nursery", "kindergarten", "elementary",
            "junior_highschool", "senior_highschool",
        ],
        applies_to_entry_statuses=statuses or ["new", "transferee", "continuing"],
    )


# The seeded shape, trimmed to what these tests need.
PSA = req(9, "PSA Birth Certificate")
HEALTH = req(10, "Health Record")
GOOD_MORAL = req(3, "Certificate of Good Moral",
                 levels=["elementary", "junior_highschool", "senior_highschool"],
                 statuses=["transferee"])
RECO = req(7, "Recommendation Letter", required=False)

CATALOGUE = [PSA, HEALTH, GOOD_MORAL, RECO]


def _enrollment_filter_side_effect(*, has_prior, row_exists):
    """
    validate() calls Enrollment.objects.filter twice with different shapes:
    the duplicate-enrollment guard passes school_year, the document gate does
    not. Distinguish on that so each gets its own answer.

    Crucially the document-gate queryset models the real database: WITHOUT
    .exclude(pk=...) it still contains the row being activated, so .exists()
    is True whenever an instance exists. That is what gives
    test_activating_does_not_count_itself teeth — a gate that forgets to
    exclude reads True here and wrongly concludes "continuing".
    """
    def _filter(*args, **kwargs):
        qs = SimpleNamespace()
        if "school_year" in kwargs:                     # duplicate guard
            qs.exclude = lambda **_: SimpleNamespace(exists=lambda: False)
            qs.exists = lambda: False
        else:                                            # document gate
            qs.exclude = lambda **_: SimpleNamespace(exists=lambda: has_prior)
            qs.exists = lambda: has_prior or row_exists
        return qs
    return _filter


def run_gate(*, instance, attrs, submitted=(), catalogue=CATALOGUE, has_prior=False):
    """Drive EnrollmentSerializer.validate() to the document gate."""
    serializer = EnrollmentSerializer()
    serializer.instance = instance

    with patch("enrollments.serializers.Enrollment.objects.filter",
               side_effect=_enrollment_filter_side_effect(
                   has_prior=has_prior, row_exists=instance is not None)), \
         patch("requirements.models.RequirementType.objects.filter",
               return_value=list(catalogue)), \
         patch("requirements.models.StudentRequirementSubmission.objects.filter") as subs:
        subs.return_value.values_list.return_value = list(submitted)
        return serializer.validate(dict(attrs))


def pending_instance(**overrides):
    base = dict(
        pk=500, enrollment_status="pending", student=STUDENT,
        school_year="2025-2026", school_level="elementary",
        grade_level="Grade 4", semester=None, strand=None, section="A",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ── the regression ───────────────────────────────────────────────────────


def test_activating_does_not_count_itself():
    """
    The self-exclusion trap. A Grade 7 learner with no history is a transferee
    and owes Good Moral. If the gate counted the very row being activated as
    "prior enrollment", it would call them continuing and let this through.
    """
    instance = pending_instance(school_level="junior_highschool", grade_level="Grade 7")

    with pytest.raises(drf_serializers.ValidationError) as exc:
        run_gate(instance=instance, attrs={"enrollment_status": "enrolled"},
                 submitted=[9, 10], has_prior=False)

    assert "Certificate of Good Moral" in str(exc.value)
    assert "transferee" in str(exc.value)


def test_a_genuine_prior_enrollment_makes_them_continuing():
    """The same learner, but with real history here, owes no Good Moral."""
    instance = pending_instance(school_level="junior_highschool", grade_level="Grade 7")

    result = run_gate(instance=instance, attrs={"enrollment_status": "enrolled"},
                      submitted=[9, 10], has_prior=True)
    assert result["enrollment_status"] == "enrolled"


# ── what blocks and what does not ────────────────────────────────────────


def test_missing_universal_document_blocks_activation():
    with pytest.raises(drf_serializers.ValidationError) as exc:
        run_gate(instance=pending_instance(), attrs={"enrollment_status": "enrolled"},
                 submitted=[10])                       # health record only
    assert "PSA Birth Certificate" in str(exc.value)


def test_optional_document_never_blocks():
    """
    A recommendation letter is tracked, not gating. Uses a kindergarten
    entrant so Good Moral is out of scope by level too, leaving the optional
    document as the only thing missing.
    """
    instance = pending_instance(school_level="kindergarten", grade_level="Kindergarten")
    result = run_gate(instance=instance, attrs={"enrollment_status": "enrolled"},
                      submitted=[9, 10])               # RECO deliberately absent
    assert result["enrollment_status"] == "enrolled"


def test_non_applicable_document_never_blocks():
    """
    Good Moral is scoped to transferees. A continuing elementary learner is
    never asked, so it cannot hold up their activation.
    """
    result = run_gate(instance=pending_instance(), attrs={"enrollment_status": "enrolled"},
                      submitted=[9, 10], has_prior=True)
    assert result["enrollment_status"] == "enrolled"


def test_staying_pending_is_never_gated():
    """Documents gate activation, not the existence of an enrollment."""
    result = run_gate(instance=pending_instance(), attrs={"enrollment_status": "pending"},
                      submitted=[])
    assert result["enrollment_status"] == "pending"


def test_an_empty_catalogue_blocks_nothing():
    result = run_gate(instance=pending_instance(), attrs={"enrollment_status": "enrolled"},
                      submitted=[], catalogue=[])
    assert result["enrollment_status"] == "enrolled"


def test_error_names_the_placement_that_produced_it():
    """
    The old message listed documents with no hint why they were being asked
    for. Naming the entry status and level is what makes it actionable.
    """
    with pytest.raises(drf_serializers.ValidationError) as exc:
        run_gate(instance=pending_instance(), attrs={"enrollment_status": "enrolled"},
                 submitted=[], has_prior=True)
    message = str(exc.value)
    assert "continuing" in message and "elementary" in message


# ── is_transfer_in ───────────────────────────────────────────────────────


def test_transfer_in_declaration_pulls_in_the_transferee_documents():
    """
    A Grade 1 walk-in is "new" by grade alone, so Good Moral would not apply —
    until the registrar ticks Transfer In.
    """
    instance = pending_instance(grade_level="Grade 1")

    ok = run_gate(instance=instance, attrs={"enrollment_status": "enrolled"},
                  submitted=[9, 10])
    assert ok["enrollment_status"] == "enrolled"

    with pytest.raises(drf_serializers.ValidationError) as exc:
        run_gate(instance=instance,
                 attrs={"enrollment_status": "enrolled", "is_transfer_in": True},
                 submitted=[9, 10])
    assert "Certificate of Good Moral" in str(exc.value)


def test_is_transfer_in_never_reaches_the_model():
    """
    It is write-only and must be popped in validate(); anything left in attrs
    reaches Enrollment(**attrs) and raises on an unexpected keyword.
    """
    result = run_gate(instance=pending_instance(),
                      attrs={"enrollment_status": "enrolled", "is_transfer_in": True},
                      submitted=[9, 10, 3])
    assert "is_transfer_in" not in result
