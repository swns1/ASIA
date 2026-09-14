"""
Regression tests for three ways EnrollmentViewSet.eligibility() disagreed with
the gate it is supposed to preview (QA audit findings).

The eligibility report and EnrollmentSerializer.validate()'s document gate must
answer the same question the same way. Where they diverged, the registrar was
told the enrollment would go through and then met a 400 naming documents the
panel had never mentioned -- the worst shape a validation error can take,
because the page had already vouched for the opposite.

1. `accounting` could read the whole report. The viewset's permission class
   (IsStaffOrOwnerGuardianReadOnly) waves through every SAFE_METHOD for every
   authenticated role, and this action never calls get_object(), so
   has_object_permission never narrows it. Guardians were denied by name;
   accounting was not -- despite GradeViewSet denying that role outright, and
   despite this report carrying failed subject names with their grades.

2. The row being activated counted as its own prior enrollment.
   `has_prior_enrollment=last_any is not None` included the pending row the
   registrar was about to activate, so a Grade 7 walk-in read as `continuing`
   (owing nothing extra) here while the gate -- which correctly excludes
   self.instance -- read `transferee` and demanded Good Moral and a Form 137.
   rules.derive_entry_status's docstring warns about exactly this.

3. An unresolvable placement was reported as "nothing missing".
   applies_to() answers "no" rather than "unknown" when it cannot resolve a
   school level, so a student with no enrollment history and a caller that
   passed no placement had EVERY document judged inapplicable -- and the
   endpoint called them eligible while they had submitted nothing.

Everything here is managed=False and mocked, matching test_eligibility_scoping.py.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.views import EnrollmentViewSet

factory = APIRequestFactory()


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _call(user, query=""):
    django_request = factory.get(f"/api/enrollments/eligibility/?student_id=42{query}")
    request = Request(django_request)
    request.user = user
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    return view.eligibility(request)


def _no_enrollments():
    """Enrollment.objects.filter(...).exclude(...).order_by(...) -> []"""
    qs = MagicMock()
    qs.exclude.return_value = qs
    qs.order_by.return_value = []
    manager = MagicMock()
    manager.filter.return_value = qs
    return manager, qs


def _requirement_type(rt_id, code, *, required=True):
    return SimpleNamespace(
        requirement_type_id=rt_id,
        requirement_code=code,
        requirement_name=code.replace("_", " ").title(),
        is_required=required,
        applies_to_levels=["elementary", "junior_highschool", "senior_highschool"],
        applies_to_entry_statuses=["new", "transferee", "continuing"],
    )


def _patch_requirements(types, submitted_ids=()):
    """Patches the two requirement querysets the action imports at call time."""
    rt_manager = MagicMock()
    rt_manager.filter.return_value = types

    sub_qs = MagicMock()
    sub_qs.values_list.return_value = list(submitted_ids)
    sub_manager = MagicMock()
    sub_manager.filter.return_value = sub_qs

    return (
        patch("requirements.models.RequirementType.objects", rt_manager),
        patch("requirements.models.StudentRequirementSubmission.objects", sub_manager),
    )


# ── 1. accounting has no business in an academic report ──────────────────────

def test_accounting_is_denied():
    response = _call(_user("accounting"))
    assert response.status_code == 403


def test_guardian_is_still_denied():
    """The rule that was already there must not have been traded away."""
    response = _call(_user("guardian"))
    assert response.status_code == 403


# ── 2. the row being activated is not its own history ────────────────────────

def test_exclude_enrollment_id_is_applied_to_the_history():
    manager, qs = _no_enrollments()
    rt_patch, sub_patch = _patch_requirements([])

    with patch("enrollments.views.Enrollment.objects", manager), rt_patch, sub_patch:
        response = _call(_user("registrar"), query="&exclude_enrollment_id=77&school_level=junior_highschool")

    assert response.status_code == 200
    qs.exclude.assert_called_once_with(pk=77)
    # With its own row excluded and nothing else on file, this learner has no
    # prior enrollment -- which is what lets derive_entry_status reach
    # "transferee" instead of silently reporting "continuing".
    assert response.data["is_new_student"] is True


def test_a_non_numeric_exclude_enrollment_id_is_rejected_cleanly():
    manager, _ = _no_enrollments()
    rt_patch, sub_patch = _patch_requirements([])

    with patch("enrollments.views.Enrollment.objects", manager), rt_patch, sub_patch:
        response = _call(_user("registrar"), query="&exclude_enrollment_id=abc")

    assert response.status_code == 400


def test_entry_status_matches_the_gate_for_a_grade_7_walk_in():
    """The case the whole exclusion exists for: no history once the pending row
    is excluded, entering above an entry grade -> transferee, not continuing."""
    manager, _ = _no_enrollments()
    rt_patch, sub_patch = _patch_requirements([])

    with patch("enrollments.views.Enrollment.objects", manager), rt_patch, sub_patch:
        response = _call(
            _user("registrar"),
            query="&exclude_enrollment_id=77&school_level=junior_highschool&grade_level=Grade+7",
        )

    assert response.data["entry_status"] == "transferee"


# ── 3. "we did not check" is not "nothing is missing" ────────────────────────

def test_an_unresolvable_placement_is_reported_as_unassessed():
    manager, _ = _no_enrollments()
    # A document that WOULD be required if the placement were known.
    rt_patch, sub_patch = _patch_requirements([_requirement_type(1, "psa_birth_certificate")])

    with patch("enrollments.views.Enrollment.objects", manager), rt_patch, sub_patch:
        response = _call(_user("registrar"))          # no placement supplied

    assert response.status_code == 200
    assert response.data["documents_assessed"] is False
    # The critical part: an empty missing_docs must NOT read as eligible.
    assert response.data["is_eligible"] is False


def test_a_resolved_placement_reports_the_missing_document():
    manager, _ = _no_enrollments()
    rt_patch, sub_patch = _patch_requirements([_requirement_type(1, "psa_birth_certificate")])

    with patch("enrollments.views.Enrollment.objects", manager), rt_patch, sub_patch:
        response = _call(_user("registrar"), query="&school_level=elementary&grade_level=Grade+1")

    assert response.data["documents_assessed"] is True
    assert [d["requirement_code"] for d in response.data["missing_docs"]] == [
        "psa_birth_certificate"
    ]
    assert response.data["is_eligible"] is False


def test_a_submitted_document_clears_the_block():
    manager, _ = _no_enrollments()
    rt_patch, sub_patch = _patch_requirements(
        [_requirement_type(1, "psa_birth_certificate")], submitted_ids=[1]
    )

    with patch("enrollments.views.Enrollment.objects", manager), rt_patch, sub_patch:
        response = _call(_user("registrar"), query="&school_level=elementary&grade_level=Grade+1")

    assert response.data["documents_assessed"] is True
    assert response.data["missing_docs"] == []
    assert response.data["is_eligible"] is True
