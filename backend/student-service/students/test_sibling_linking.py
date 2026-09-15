"""
Sibling linking via shared households (StudentViewSet.siblings /
link_sibling / unlink_sibling).

The design decision under test: sibling-ness is *derived* from
students.household_id rather than stored in the `student_siblings` table,
which modelled the same relationship a second, separately-maintained way and
had no rows, no UI, and no route. What matters here is that linking is
whole-or-nothing across both students, that it picks up an existing household
instead of always making a new one (otherwise nothing ever groups -- the state
the live data is in: 56 households for 57 students), and that reading siblings
back can't be used to see around the teacher/accounting scoping on students.

DB-free, mocked at the model boundary -- same technique and reason as
test_role_scoping.py in this directory.
"""
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from students.views import StudentViewSet

factory = APIRequestFactory()


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _view(student, user=None, data=None):
    """A StudentViewSet wired up enough to call one action directly."""
    view = StudentViewSet()
    raw = factory.post("/api/students/1/link-sibling/", data or {}, format="json")
    raw.user = user or _user("registrar")
    # Parsers have to be passed explicitly: we're building the Request by hand
    # rather than going through as_view()/initialize_request(), which is what
    # normally hands the view's parser classes over.
    view.request = Request(raw, parsers=[JSONParser()])
    view.request.user = raw.user
    view.kwargs = {"pk": student.pk}
    view.get_object = lambda: student
    return view


def _no_db_transaction():
    """link_sibling wraps its writes in `with transaction.atomic()`, whose
    __enter__ needs a live connection even when every query under it is
    mocked. The atomicity is a database guarantee, not the branching this
    file is testing."""
    return patch("students.views.transaction.atomic", return_value=nullcontext())


def _student(pk=1, household_id=None, first_name="Maria"):
    s = MagicMock()
    s.pk = pk
    s.student_id = pk
    s.household_id = household_id
    s.first_name = first_name
    return s


class TestSiblingsRead:
    def test_no_household_means_no_siblings_not_an_error(self):
        view = _view(_student(household_id=None))
        response = view.siblings(view.request, pk=1)
        assert response.status_code == 200
        assert response.data == []

    def test_lists_the_others_in_the_household_excluding_self(self):
        student = _student(pk=1, household_id=3)
        view = _view(student)
        scoped = MagicMock()
        view.get_queryset = MagicMock(return_value=scoped)
        view.get_serializer = MagicMock(return_value=MagicMock(data=[{"student_id": 2}]))

        response = view.siblings(view.request, pk=1)

        scoped.filter.assert_called_once_with(household_id=3)
        scoped.filter.return_value.exclude.assert_called_once_with(pk=1)
        assert response.data == [{"student_id": 2}]

    def test_reads_through_the_scoped_queryset_not_the_raw_table(self):
        # get_queryset() is where teacher-roster scoping and the accounting
        # denial live. Going around it here would turn "who are this child's
        # siblings" into an unscoped read of the student table.
        student = _student(pk=1, household_id=3)
        view = _view(student, user=_user("teacher"))
        view.get_queryset = MagicMock(return_value=MagicMock())
        view.get_serializer = MagicMock(return_value=MagicMock(data=[]))

        view.siblings(view.request, pk=1)

        view.get_queryset.assert_called_once()


class TestLinkSibling:
    def test_requires_a_sibling_id(self):
        view = _view(_student(), data={})
        response = view.link_sibling(view.request, pk=1)
        assert response.status_code == 400

    def test_rejects_linking_a_student_to_themselves(self):
        student = _student(pk=1)
        view = _view(student, data={"sibling_student_id": 1})
        with patch("students.views.Student") as student_model:
            student_model.objects.get.return_value = student
            response = view.link_sibling(view.request, pk=1)
        assert response.status_code == 400
        assert "own sibling" in response.data["detail"]

    def test_unknown_sibling_is_a_404(self):
        view = _view(_student(), data={"sibling_student_id": 999})
        with patch("students.views.Student") as student_model:
            student_model.DoesNotExist = Exception
            student_model.objects.get.side_effect = student_model.DoesNotExist
            response = view.link_sibling(view.request, pk=1)
        assert response.status_code == 404

    def test_joins_the_existing_household_rather_than_making_a_new_one(self):
        # The whole point: if either child already has a household, reuse it.
        # Always creating one is exactly why the live data has a household per
        # student and no sibling groups at all.
        student = _student(pk=1, household_id=None)
        sibling = _student(pk=2, household_id=7, first_name="Juan")
        view = _view(student, data={"sibling_student_id": 2})

        with _no_db_transaction(), patch("students.views.Student") as student_model, \
                patch("students.views.Household") as household_model:
            student_model.objects.get.return_value = sibling
            response = view.link_sibling(view.request, pk=1)

        household_model.objects.create.assert_not_called()
        assert response.data["household_id"] == 7
        # Only the student without the household is moved.
        student_model.objects.filter.assert_called_once_with(pk=1)
        student_model.objects.filter.return_value.update.assert_called_once_with(household_id=7)

    def test_creates_one_household_when_neither_student_has_one(self):
        student = _student(pk=1, household_id=None)
        sibling = _student(pk=2, household_id=None, first_name="Juan")
        view = _view(student, data={"sibling_student_id": 2})

        with _no_db_transaction(), patch("students.views.Student") as student_model, \
                patch("students.views.Household") as household_model:
            household_model.objects.create.return_value = SimpleNamespace(household_id=12)
            student_model.objects.get.return_value = sibling
            response = view.link_sibling(view.request, pk=1)

        household_model.objects.create.assert_called_once()
        assert response.data["household_id"] == 12
        # Both students move into it.
        assert student_model.objects.filter.call_count == 2

    def test_already_in_the_same_household_moves_nobody(self):
        student = _student(pk=1, household_id=5)
        sibling = _student(pk=2, household_id=5, first_name="Juan")
        view = _view(student, data={"sibling_student_id": 2})

        with _no_db_transaction(), patch("students.views.Student") as student_model, \
                patch("students.views.Household") as household_model:
            student_model.objects.get.return_value = sibling
            response = view.link_sibling(view.request, pk=1)

        household_model.objects.create.assert_not_called()
        student_model.objects.filter.assert_not_called()
        assert response.data["household_id"] == 5


class TestUnlinkSibling:
    def test_unlinking_clears_the_household(self):
        student = _student(pk=1, household_id=3)
        view = _view(student)
        with patch("students.views.Student") as student_model:
            response = view.unlink_sibling(view.request, pk=1)
        assert response.status_code == 200
        student_model.objects.filter.return_value.update.assert_called_once_with(household_id=None)

    def test_unlinking_a_student_with_no_household_is_a_400(self):
        view = _view(_student(household_id=None))
        response = view.unlink_sibling(view.request, pk=1)
        assert response.status_code == 400


class TestAbsorbingASecondHousehold:
    """Both children already had a household -- the case that lost data.

    Linking used to move only the named student into the other household and
    abandon their old row. Two things went wrong with that: the abandoned row
    carried is_4ps_beneficiary / four_ps_id / parent_marital_status /
    living_arrangement, which drive fee discounts and scholarship eligibility,
    so a child could lose their 4Ps status by being recorded as somebody's
    sibling; and anyone else already in that household was silently left
    behind, splitting them from the sibling they were recorded with.
    """

    def _households(self, source, target):
        """_merge_household_details reads source first, then target."""
        household_model = MagicMock()
        household_model.objects.filter.return_value.first.side_effect = [source, target]
        return household_model

    def _blank(self, **overrides):
        base = dict(parent_marital_status="", living_arrangement="",
                    is_4ps_beneficiary=False, four_ps_id=None)
        base.update(overrides)
        return SimpleNamespace(**base)

    def _link(self, student_model, household_model):
        student = _student(pk=1, household_id=5)
        sibling = _student(pk=2, household_id=7, first_name="Juan")
        view = _view(student, data={"sibling_student_id": 2})
        with _no_db_transaction(), \
                patch("students.views.Student", student_model), \
                patch("students.views.Household", household_model):
            student_model.objects.get.return_value = sibling
            return view.link_sibling(view.request, pk=1)

    def test_everyone_in_the_absorbed_household_moves_not_just_the_one_named(self):
        student_model = MagicMock()
        # Household 7 holds the sibling AND another child already linked to them.
        student_model.objects.filter.return_value.values_list.return_value = [2, 9]
        household_model = self._households(self._blank(), self._blank())

        response = self._link(student_model, household_model)

        assert response.data["household_id"] == 5
        assert sorted(response.data["moved_student_ids"]) == [2, 9]
        # Moved as a group, by household -- not one student at a time.
        student_model.objects.filter.assert_any_call(household_id=7)
        student_model.objects.filter.return_value.update.assert_called_with(household_id=5)

    def test_details_the_surviving_household_lacks_are_carried_across(self):
        student_model = MagicMock()
        student_model.objects.filter.return_value.values_list.return_value = [2]
        source = self._blank(is_4ps_beneficiary=True, four_ps_id="4PS-991")
        household_model = self._households(source, self._blank())

        self._link(student_model, household_model)

        household_model.objects.filter.return_value.update.assert_called_once_with(
            is_4ps_beneficiary=True, four_ps_id="4PS-991",
        )

    def test_a_disagreement_is_reported_not_silently_resolved(self):
        """Choosing between two stated marital statuses is a registrar's call,
        so the surviving value is kept and the difference surfaced."""
        student_model = MagicMock()
        student_model.objects.filter.return_value.values_list.return_value = [2]
        source = self._blank(parent_marital_status="separated")
        target = self._blank(parent_marital_status="married")
        household_model = self._households(source, target)

        response = self._link(student_model, household_model)

        conflicts = response.data["household_conflicts"]
        assert len(conflicts) == 1
        assert "parent_marital_status" in conflicts[0]
        assert "married" in conflicts[0] and "separated" in conflicts[0]
        # Nothing was overwritten on the survivor.
        household_model.objects.filter.return_value.update.assert_not_called()

    def test_no_conflicts_key_when_the_two_agree(self):
        student_model = MagicMock()
        student_model.objects.filter.return_value.values_list.return_value = [2]
        same = dict(parent_marital_status="married")
        household_model = self._households(self._blank(**same), self._blank(**same))

        response = self._link(student_model, household_model)

        assert "household_conflicts" not in response.data
