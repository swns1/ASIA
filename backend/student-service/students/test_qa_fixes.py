"""
Regression tests for the student-service QA pass (2026-09-25).

Each class is one finding: what used to happen is in its docstring. DB-free
like the rest of this service's tests (see intake/test_invites.py for why no
test database can be built here) -- mocked at the model boundary, with the
real behaviour checked separately against the local database.
"""
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.urls import Resolver404, resolve
from rest_framework import serializers as drf_serializers
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from accounts.users import guardian_account_problem
from intake.serializers import ApplicationInviteIssueSerializer
from students.serializers import (
    BulkGuardianSerializer,
    BulkStudentSerializer,
    StudentBulkCreateSerializer,
    StudentSerializer,
    require_a_guardian,
)
from students.views import (
    GuardianViewSet,
    RequirementTypeViewSet,
    StudentViewSet,
    _int_param,
)

factory = APIRequestFactory()


def _user(role="registrar", user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _action_view(cls, obj=None, data=None, method="post", query=""):
    """A viewset wired up enough to call one action or hook directly."""
    view = cls()
    raw = getattr(factory, method)(f"/x/?{query}", data or {}, format="json")
    raw.user = _user()
    view.request = Request(raw, parsers=[JSONParser()])
    view.request.user = raw.user
    view.format_kwarg = None
    view.kwargs = {"pk": getattr(obj, "pk", 1)}
    if obj is not None:
        view.get_object = lambda: obj
    return view


def _no_db_transaction(module="students.views"):
    return patch(f"{module}.transaction.atomic", return_value=nullcontext())


# ── 1. Linking a guardian contact to a login account ─────────────────────────

class TestLinkAccount:
    """The Link account screen PATCHed guardians.user_id, which is read-only;
    the 200 it got back meant nothing was saved while staff were told it was."""

    def _guardian(self):
        return SimpleNamespace(pk=5, guardian_id=5, user_id=None, student=None)

    def _call(self, data, problem=None):
        guardian = self._guardian()
        view = _action_view(GuardianViewSet, guardian, data)
        with patch("students.views.Guardian") as guardian_model, \
                patch("students.views.guardian_account_problem", return_value=problem) as check, \
                patch.object(GuardianViewSet, "get_serializer",
                             side_effect=lambda g: SimpleNamespace(data={"user_id": g.user_id})):
            response = view.link_account(view.request, pk=5)
        return response, guardian_model, check

    def test_links_a_valid_guardian_account(self):
        response, guardian_model, check = self._call({"user_id": 42})
        check.assert_called_once_with(42)
        guardian_model.objects.filter.assert_called_once_with(pk=5)
        guardian_model.objects.filter.return_value.update.assert_called_once_with(user_id=42)
        assert response.status_code == 200
        assert response.data["user_id"] == 42

    def test_refuses_an_account_that_fails_the_check_and_saves_nothing(self):
        response, guardian_model, _ = self._call({"user_id": 7}, problem="Only a parent/guardian account can be linked.")
        assert response.status_code == 400
        assert "parent/guardian" in response.data["detail"]
        guardian_model.objects.filter.assert_not_called()

    def test_null_unlinks_without_checking_an_account(self):
        response, guardian_model, check = self._call({"user_id": None})
        check.assert_not_called()
        guardian_model.objects.filter.return_value.update.assert_called_once_with(user_id=None)
        assert response.status_code == 200

    def test_a_non_number_is_a_400(self):
        response, guardian_model, _ = self._call({"user_id": "abc"})
        assert response.status_code == 400
        guardian_model.objects.filter.assert_not_called()

    def test_it_is_routed_as_a_post(self):
        match = resolve("/api/guardians/5/link-account/")
        assert match.func.actions == {"post": "link_account"}


class TestGuardianAccountProblem:
    def _check(self, row):
        cursor = MagicMock()
        cursor.fetchone.return_value = row
        with patch("accounts.users.connection") as connection:
            connection.cursor.return_value.__enter__.return_value = cursor
            return guardian_account_problem(3)

    def test_missing_account(self):
        assert "doesn't exist" in self._check(None)

    def test_staff_account(self):
        assert "parent/guardian" in self._check(("teacher", True))

    def test_deactivated_account(self):
        assert "deactivated" in self._check(("guardian", False))

    def test_active_guardian_account_is_fine(self):
        assert self._check(("guardian", True)) is None


# ── 2. Deleting a student ────────────────────────────────────────────────────

class TestDeleteStudent:
    """Deleting cascaded to enrollments, grades and the rest -- erasing the
    permanent record, or failing with a 500 when attendance or an invoice
    held a foreign key."""

    def _destroy(self, has_history):
        student = SimpleNamespace(pk=9, first_name="Ana", last_name="Cruz")
        view = _action_view(StudentViewSet, student, method="delete")
        with patch("accounts.enrollment_mirror.EnrollmentMirror") as mirror, \
                patch("rest_framework.mixins.DestroyModelMixin.destroy", return_value="deleted") as parent:
            mirror.objects.filter.return_value.exists.return_value = has_history
            response = view.destroy(view.request, pk=9)
            mirror.objects.filter.assert_called_once_with(student_id=9)
        return response, parent

    def test_a_student_with_enrollment_history_is_refused(self):
        response, parent = self._destroy(has_history=True)
        assert response.status_code == 409
        assert response.data["code"] == "student_has_history"
        assert "Transferred" in response.data["detail"]
        parent.assert_not_called()

    def test_a_student_never_enrolled_can_be_deleted(self):
        response, parent = self._destroy(has_history=False)
        assert response == "deleted"
        parent.assert_called_once()


# ── 3. Blank email ───────────────────────────────────────────────────────────

class TestBlankEmail:
    """A blank email was stored as "" -- a value, not an absence -- so the
    second student without one hit students.email's unique index as a 500."""

    @pytest.mark.parametrize("serializer_class", [StudentSerializer, BulkStudentSerializer])
    @pytest.mark.parametrize("blank", ["", "   ", None])
    def test_blank_becomes_null(self, serializer_class, blank):
        assert serializer_class().validate_email(blank) is None

    def test_a_real_address_is_kept(self):
        assert StudentSerializer().validate_email("ana@example.com") == "ana@example.com"


# ── 5. Primary contact ───────────────────────────────────────────────────────

class TestPrimaryContactDemotion:
    """Marking a guardian primary was refused while another still held it, so
    moving the star upward failed halfway through the edit form's save."""

    def _serializer(self, validated, instance=None):
        return SimpleNamespace(validated_data=validated, instance=instance)

    def test_marking_primary_demotes_the_others_for_that_student(self):
        view = GuardianViewSet()
        instance = SimpleNamespace(pk=3, student="STUDENT")
        with patch("students.views.Guardian") as guardian_model:
            view._demote_other_primaries(self._serializer({"is_primary_contact": True}, instance))
        guardian_model.objects.filter.assert_called_once_with(student="STUDENT", is_primary_contact=True)
        others = guardian_model.objects.filter.return_value
        others.exclude.assert_called_once_with(pk=3)
        others.exclude.return_value.update.assert_called_once_with(is_primary_contact=False)

    def test_a_new_primary_guardian_demotes_the_existing_one(self):
        view = GuardianViewSet()
        with patch("students.views.Guardian") as guardian_model:
            view._demote_other_primaries(self._serializer({"is_primary_contact": True, "student": "S"}))
        guardian_model.objects.filter.return_value.update.assert_called_once_with(is_primary_contact=False)

    def test_saving_a_non_primary_guardian_touches_nobody(self):
        view = GuardianViewSet()
        with patch("students.views.Guardian") as guardian_model:
            view._demote_other_primaries(self._serializer({"is_primary_contact": False}))
        guardian_model.objects.filter.assert_not_called()

    def test_demotion_happens_before_the_save(self):
        """uq_guardian_primary_per_student allows one primary, so the old one
        must be cleared before the new one is written."""
        view = GuardianViewSet()
        order = []
        serializer = MagicMock()
        serializer.save.side_effect = lambda: order.append("save")
        with _no_db_transaction(), \
                patch.object(GuardianViewSet, "_demote_other_primaries", side_effect=lambda s: order.append("demote")):
            view.perform_update(serializer)
        assert order == ["demote", "save"]


# ── 6. user_id on the registration endpoint ──────────────────────────────────

def test_registration_cannot_set_a_guardian_login_account():
    """bulk-create accepted guardians[].user_id, handing a new child's records
    to any existing login account."""
    assert "user_id" not in BulkGuardianSerializer().fields
    ser = BulkGuardianSerializer(data={"relationship": "mother", "full_name": "Ana", "user_id": 94})
    assert ser.is_valid(), ser.errors
    assert "user_id" not in ser.validated_data


# ── 7. Level/grade filters ───────────────────────────────────────────────────

class TestPlacementFilters:
    """The Requirements page sent school_level/grade_level and nothing read
    them, so every student was listed whatever filter was picked."""

    def _queryset(self, query):
        view = _action_view(StudentViewSet, method="get", query=query)
        view.queryset = MagicMock()
        with patch("accounts.enrollment_mirror.EnrollmentMirror") as mirror:
            qs = view.get_queryset()
        return view.queryset, mirror, qs

    def test_filters_students_by_a_live_placement_at_that_grade_and_year(self):
        base, mirror, _ = self._queryset("school_level=elementary&grade_level=Grade%204&school_year=2026-2027")
        mirror.objects.filter.assert_called_once_with(enrollment_status__in=("enrolled", "pending"))
        chain = mirror.objects.filter.return_value
        chain.filter.assert_called_once_with(school_level="elementary")
        chain.filter.return_value.filter.assert_called_once_with(grade_level="Grade 4")
        chain.filter.return_value.filter.return_value.filter.assert_called_once_with(school_year="2026-2027")
        placed = chain.filter.return_value.filter.return_value.filter.return_value
        placed.values.assert_called_once_with("student_id")
        base.filter.assert_any_call(student_id__in=placed.values.return_value)

    def test_no_filter_no_enrollment_lookup(self):
        _, mirror, _ = self._queryset("")
        mirror.objects.filter.assert_not_called()


# ── 9. Bad input answered as 400/404/405, not 500 ────────────────────────────

class TestNotA500:
    def test_int_param(self):
        params = {"student_id": "12", "blank": "", "bad": "abc"}
        assert _int_param(params, "student_id") == 12
        assert _int_param(params, "blank") is None
        assert _int_param(params, "missing") is None
        with pytest.raises(drf_serializers.ValidationError):
            _int_param(params, "bad")

    def test_a_non_numeric_guardian_filter_is_a_validation_error(self):
        view = _action_view(GuardianViewSet, method="get", query="student_id=abc")
        view.queryset = MagicMock()
        with pytest.raises(drf_serializers.ValidationError):
            view.get_queryset()

    def test_requirement_types_are_read_only_here(self):
        """enrollment-service owns this table; deleting an in-use type here
        answered 500 from the RESTRICT foreign key."""
        for name in ("create", "update", "partial_update", "destroy"):
            assert not hasattr(RequirementTypeViewSet, name)

    def test_invite_contact_email_is_bounded_by_the_column(self):
        ser = ApplicationInviteIssueSerializer(data={
            "applicant_first_name": "A", "applicant_last_name": "B",
            "contact_email": "a" * 148 + "@example.test",
        })
        assert not ser.is_valid()
        assert "contact_email" in ser.errors


# ── 11. Unlinking a sibling ──────────────────────────────────────────────────

class TestUnlinkSibling:
    """Unlinking cleared household_id, dropping the family's details (marital
    status, living arrangement, 4Ps) from the student's record."""

    def _student(self, household_id=3):
        return SimpleNamespace(pk=1, student_id=1, household_id=household_id, first_name="Ana")

    def test_the_student_leaves_with_a_copy_of_the_household_details(self):
        view = _action_view(StudentViewSet, self._student())
        source = SimpleNamespace(parent_marital_status="married", living_arrangement="both_parents",
                                 is_4ps_beneficiary=True, four_ps_id="4PS-1")
        with _no_db_transaction(), patch("students.views.Student") as student_model, \
                patch("students.views.Household") as household_model:
            student_model.objects.filter.return_value.exclude.return_value.exists.return_value = True
            household_model.objects.filter.return_value.first.return_value = source
            household_model.objects.create.return_value = SimpleNamespace(household_id=44)
            response = view.unlink_sibling(view.request, pk=1)

        assert response.status_code == 200
        household_model.objects.create.assert_called_once_with(
            parent_marital_status="married", living_arrangement="both_parents",
            is_4ps_beneficiary=True, four_ps_id="4PS-1",
        )
        student_model.objects.filter.return_value.update.assert_called_once_with(household_id=44)
        assert response.data["household_id"] == 44

    def test_nothing_to_unlink_when_nobody_else_is_in_the_household(self):
        view = _action_view(StudentViewSet, self._student())
        with patch("students.views.Student") as student_model, \
                patch("students.views.Household") as household_model:
            student_model.objects.filter.return_value.exclude.return_value.exists.return_value = False
            response = view.unlink_sibling(view.request, pk=1)
        assert response.status_code == 400
        household_model.objects.create.assert_not_called()


# ── 12. At least one guardian ────────────────────────────────────────────────

class TestGuardianRequired:
    def test_no_guardian_is_refused(self):
        with pytest.raises(drf_serializers.ValidationError):
            require_a_guardian([])

    def test_two_primaries_are_refused(self):
        with pytest.raises(drf_serializers.ValidationError):
            require_a_guardian([{"is_primary_contact": True}, {"is_primary_contact": True}])

    def test_the_first_guardian_becomes_primary_when_none_is_marked(self):
        out = require_a_guardian([{"full_name": "A"}, {"full_name": "B"}])
        assert out[0]["is_primary_contact"] is True
        assert not out[1].get("is_primary_contact")

    def test_registration_applies_the_rule(self):
        with pytest.raises(drf_serializers.ValidationError):
            StudentBulkCreateSerializer().validate_guardians([])


# ── 13. Graduation ───────────────────────────────────────────────────────────

class TestMarkGraduated:
    """Nothing ever set a student graduated, so Grade 12 completers stayed
    active and sat on the "not yet placed" list every year."""

    def _call(self, data, *, finished=(), placed=(), statuses=None):
        view = _action_view(StudentViewSet, data=data)
        with patch("accounts.enrollment_mirror.EnrollmentMirror") as mirror, \
                patch("students.views.Student") as student_model:
            rows = mirror.objects.filter.return_value

            def rows_filter(**kw):
                result = MagicMock()
                result.values_list.return_value = list(finished if "grade_level" in kw else placed)
                return result
            rows.filter.side_effect = rows_filter
            student_model.objects.filter.return_value.values_list.return_value = list((statuses or {}).items())
            response = view.mark_graduated(view.request)
        return response, student_model

    def test_marks_only_eligible_learners_and_says_why_the_rest_were_skipped(self):
        response, student_model = self._call(
            {"student_ids": [1, 2, 3, 4, 5]},
            finished=[1, 2, 4], placed=[4],
            statuses={1: "active", 2: "transferred", 3: "active", 4: "active"},
        )
        assert response.status_code == 200
        assert response.data["graduated"] == [1]
        reasons = {s["student_id"]: s["reason"] for s in response.data["skipped"]}
        assert "transferred" in reasons[2]
        assert "Grade 12" in reasons[3]
        assert "enrolled or pending" in reasons[4]
        assert "No such student" in reasons[5]
        update = student_model.objects.filter.return_value.update
        assert update.call_args.kwargs["status"] == "graduated"
        assert "updated_at" in update.call_args.kwargs

    def test_an_empty_request_is_a_400(self):
        response, _ = self._call({"student_ids": []})
        assert response.status_code == 400


# ── 14. No Django admin ──────────────────────────────────────────────────────

def test_admin_is_not_mounted():
    """/admin/ could never log anyone in -- every attempt was a 500."""
    with pytest.raises(Resolver404):
        resolve("/admin/")
