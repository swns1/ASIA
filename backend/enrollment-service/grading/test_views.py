"""
Targeted tests for the grade-computation engine (ScoreEntryViewSet.compute_
grade), its role-based access controls, and the queryset filtering in
ScoreEntryViewSet / GradingTemplateViewSet / GradingComponentViewSet.

GradingTemplate/GradingComponent/ScoreEntry are all `managed = False`, so a
fresh pytest-django test database has none of these tables — these tests
mock ORM calls, or assert on constructed-but-unexecuted querysets, rather
than hitting a real database. This matches the style already used elsewhere
in this repo (billing/test_services.py, accounts/test_permissions.py).
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.models import Enrollment
from subjects.models import Subject
from grading.models import ScoreEntry
from grading.views import GradingComponentViewSet, GradingTemplateViewSet, ScoreEntryViewSet

factory = APIRequestFactory()


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _component(comp_id, name, weight, sort_order=0):
    return SimpleNamespace(
        grading_component_id=comp_id,
        component_name=name,
        weight=Decimal(str(weight)),
        sort_order=sort_order,
    )


def _entry(score, max_score):
    return SimpleNamespace(score=Decimal(str(score)), max_score=Decimal(str(max_score)))


def _entries_queryset(entries):
    qs = MagicMock()
    qs.exists.return_value = bool(entries)
    qs.count.return_value = len(entries)
    qs.__iter__.return_value = iter(entries)
    return qs


def _mock_subject(components, template_name="Q1 Report Card"):
    template = MagicMock()
    template.template_name = template_name
    template.components.all.return_value.order_by.return_value = components
    return SimpleNamespace(subject_name="Math", grading_template=template)


def _compute_request(enrollment_id=1, subject_id=2, grading_period="1st_quarter", role="admin"):
    request = Request(factory.get("/score-entries/compute/", {
        "enrollment_id": enrollment_id,
        "subject_id": subject_id,
        "grading_period": grading_period,
    }))
    request.user = _user(role)
    return request


def _run_compute(components, entries_by_component, role="admin"):
    subject = _mock_subject(components)
    with patch.object(Subject, "objects") as mock_subject_objects, \
         patch.object(ScoreEntry, "objects") as mock_se_objects:
        mock_subject_objects.select_related.return_value.get.return_value = subject
        mock_se_objects.filter.side_effect = (
            lambda **kw: entries_by_component[kw["grading_component"].grading_component_id]
        )
        view = ScoreEntryViewSet()
        response = view.compute_grade(_compute_request(role=role))
    return response


class TestComputeGradeWeightedAverage:
    def test_weighted_average_across_components(self):
        written = _component(1, "Written Works", 40, sort_order=1)
        performance = _component(2, "Performance Tasks", 60, sort_order=2)
        response = _run_compute(
            [written, performance],
            {
                1: _entries_queryset([_entry(80, 100), _entry(90, 100)]),  # 170/200
                2: _entries_queryset([_entry(70, 100)]),                   # 70/100
            },
        )

        assert response.status_code == 200
        comps = {c["component_name"]: c for c in response.data["components"]}
        assert comps["Written Works"]["average_percentage"] == 85.0
        assert comps["Written Works"]["weighted_score"] == 34.0   # 85 * 40 / 100
        assert comps["Performance Tasks"]["average_percentage"] == 70.0
        assert comps["Performance Tasks"]["weighted_score"] == 42.0  # 70 * 60 / 100

        # Initial Grade is the sum of the weighted scores...
        assert response.data["initial_grade"] == 76.0
        # ...and the reported grade is that Initial Grade transmuted per DO 8.
        assert response.data["transmuted_grade"] == 85
        assert response.data["final_grade"] == 85
        assert response.data["is_complete"] is True

    def test_percentage_score_is_weighted_by_assessment_size(self):
        """
        DO 8 sums raw scores over summed highest-possible scores. The old
        implementation took the mean of per-assessment percentages, so a
        perfect 5-point seatwork offset a failed 50-point test.
        """
        only = _component(1, "Written Works", 100, sort_order=1)
        response = _run_compute(
            [only],
            {1: _entries_queryset([_entry(5, 5), _entry(5, 50)])},
        )

        # 10/55 = 18.18%, not the 50% an unweighted mean would report.
        assert response.data["components"][0]["average_percentage"] == 18.18
        assert response.data["initial_grade"] == 18.18


class TestComputeGradeUnencodedComponent:
    def test_a_component_with_no_entries_is_pending_not_zero(self):
        """
        Scoring an unencoded component 0 and weighting it in made every learner
        read as failing until the last column was encoded. It is now excluded,
        and the remaining weights are renormalised.
        """
        scored = _component(1, "Written Works", 50, sort_order=1)
        unscored = _component(2, "Performance Tasks", 50, sort_order=2)
        response = _run_compute(
            [scored, unscored],
            {
                1: _entries_queryset([_entry(80, 100)]),
                2: _entries_queryset([]),
            },
        )

        comps = {c["component_name"]: c for c in response.data["components"]}
        assert comps["Performance Tasks"]["entries_count"] == 0
        assert comps["Performance Tasks"]["is_encoded"] is False
        assert comps["Performance Tasks"]["average_percentage"] is None
        assert comps["Performance Tasks"]["weighted_score"] is None

        # Renormalised over the encoded 50% rather than halved to 40.
        assert response.data["initial_grade"] == 80.0
        assert response.data["is_complete"] is False
        assert response.data["pending_components"] == ["Performance Tasks"]
        # No pass/fail determination on an unfinished quarter.
        assert response.data["remarks"] is None


class TestComputeGradePassFailBoundary:
    """
    Pass/fail is determined on the TRANSMUTED grade. Applying the 75 line to
    the raw Initial Grade, as this used to, got the determination wrong across
    the whole 60-99 initial-grade band.
    """

    def _single_component_result(self, entries):
        comp = _component(1, "Only", 100, sort_order=1)
        response = _run_compute([comp], {1: _entries_queryset(entries)})
        return response.data

    def test_an_initial_grade_of_75_transmutes_well_clear_of_the_line(self):
        data = self._single_component_result([_entry(75, 100)])
        assert data["initial_grade"] == 75.0
        assert data["final_grade"] == 84
        assert data["remarks"] == "passed"

    def test_an_initial_grade_just_under_75_is_a_pass_not_a_failure(self):
        data = self._single_component_result([_entry(7499, 10000)])  # 74.99%
        assert data["initial_grade"] == 74.99
        assert data["final_grade"] == 84
        assert data["remarks"] == "passed"

    def test_the_real_failing_line_is_an_initial_grade_below_60(self):
        data = self._single_component_result([_entry(5999, 10000)])  # 59.99%
        assert data["final_grade"] == 74
        assert data["remarks"] == "failed"

    def test_a_very_low_initial_grade_still_floors_at_60(self):
        data = self._single_component_result([_entry(10, 100)])
        assert data["final_grade"] == 62
        assert data["remarks"] == "failed"

    def test_no_entries_at_all_stays_uncomputed(self):
        data = self._single_component_result([])
        assert data["initial_grade"] is None
        assert data["final_grade"] is None
        assert data["remarks"] is None
        assert data["is_complete"] is False


class TestComputeGradeAccessCheck:
    def test_teacher_denied_for_unlinked_student(self):
        request = _compute_request(role="teacher")
        with patch.object(Enrollment, "objects") as mock_enrollment_objects, \
             patch("grading.views.teacher_student_ids", return_value={99}):
            mock_enrollment_objects.filter.return_value.values_list.return_value.first.return_value = 5
            response = ScoreEntryViewSet().compute_grade(request)
        assert response.status_code == 403

    def test_teacher_allowed_for_linked_student(self):
        request = _compute_request(role="teacher")
        with patch.object(Enrollment, "objects") as mock_enrollment_objects, \
             patch("grading.views.teacher_student_ids", return_value={5}), \
             patch.object(Subject, "objects") as mock_subject_objects:
            mock_enrollment_objects.filter.return_value.values_list.return_value.first.return_value = 5
            mock_subject_objects.select_related.return_value.get.side_effect = Subject.DoesNotExist
            response = ScoreEntryViewSet().compute_grade(request)
        # 404 (subject lookup deliberately fails) rather than 403 proves the
        # access check let the request through.
        assert response.status_code == 404

    def test_guardian_denied_for_unlinked_student(self):
        request = _compute_request(role="guardian")
        with patch.object(Enrollment, "objects") as mock_enrollment_objects, \
             patch("grading.views.guardian_student_ids", return_value=set()):
            mock_enrollment_objects.filter.return_value.values_list.return_value.first.return_value = 5
            response = ScoreEntryViewSet().compute_grade(request)
        assert response.status_code == 403

    def test_staff_role_skips_access_check(self):
        request = _compute_request(role="admin")
        with patch.object(Subject, "objects") as mock_subject_objects:
            mock_subject_objects.select_related.return_value.get.side_effect = Subject.DoesNotExist
            response = ScoreEntryViewSet().compute_grade(request)
        assert response.status_code == 404  # never touched the access-check branch


class TestScoreEntryQuerysetScoping:
    def _view_with_mock_queryset(self, request):
        view = ScoreEntryViewSet()
        view.request = request
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        view.queryset = mock_qs
        return view, mock_qs

    def test_teacher_scoped_to_own_students(self):
        request = Request(factory.get("/"))
        request.user = _user("teacher")
        view, mock_qs = self._view_with_mock_queryset(request)
        with patch("grading.views.teacher_student_ids", return_value={10, 20}):
            view.get_queryset()
        kwargs_seen = [c.kwargs for c in mock_qs.filter.call_args_list]
        assert {"enrollment__student_id__in": {10, 20}} in kwargs_seen

    def test_guardian_scoped_to_own_children(self):
        request = Request(factory.get("/"))
        request.user = _user("guardian")
        view, mock_qs = self._view_with_mock_queryset(request)
        with patch("grading.views.guardian_student_ids", return_value={7}):
            view.get_queryset()
        kwargs_seen = [c.kwargs for c in mock_qs.filter.call_args_list]
        assert {"enrollment__student_id__in": {7}} in kwargs_seen

    def test_staff_role_not_scoped(self):
        request = Request(factory.get("/"))
        request.user = _user("admin")
        view, mock_qs = self._view_with_mock_queryset(request)
        view.get_queryset()
        kwargs_seen = [c.kwargs for c in mock_qs.filter.call_args_list]
        assert not any("enrollment__student_id__in" in kw for kw in kwargs_seen)


class TestGradingTemplateQuerysetFiltering:
    def test_filters_by_is_active_and_school_level(self):
        request = Request(factory.get("/", {"is_active": "true", "school_level": "elementary"}))
        view = GradingTemplateViewSet()
        view.request = request
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        view.queryset = mock_qs

        view.get_queryset()

        kwargs_seen = [c.kwargs for c in mock_qs.filter.call_args_list]
        assert {"is_active": True} in kwargs_seen
        assert {"school_level": "elementary"} in kwargs_seen

    def test_no_filters_when_params_absent(self):
        request = Request(factory.get("/"))
        view = GradingTemplateViewSet()
        view.request = request
        mock_qs = MagicMock()
        view.queryset = mock_qs

        result = view.get_queryset()

        mock_qs.filter.assert_not_called()
        assert result is mock_qs


class TestGradingComponentQuerysetFiltering:
    def test_filters_by_grading_template_id(self):
        request = Request(factory.get("/", {"grading_template_id": "9"}))
        view = GradingComponentViewSet()
        view.request = request
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        view.queryset = mock_qs

        view.get_queryset()

        mock_qs.filter.assert_called_once_with(grading_template_id="9")

    def test_no_filter_when_param_absent(self):
        request = Request(factory.get("/"))
        view = GradingComponentViewSet()
        view.request = request
        mock_qs = MagicMock()
        view.queryset = mock_qs

        result = view.get_queryset()

        mock_qs.filter.assert_not_called()
        assert result is mock_qs
