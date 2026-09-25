"""
The guardian portal's one write: "will your child return next school year?"

The guardian role is read-only everywhere else, and IsStaffOrOwnerGuardianReadOnly
is what makes it so. This action steps around that class on purpose, so these
tests pin what it must still refuse -- another family's child, a row that is
no longer pending, a new learner's placement -- and that answering never
changes the enrollment itself.

Also covers the registrar's "not yet placed" worklist, which checks the other
half of the enrollment rule: every active student holds one active row per
school year.

DB-free: managers swapped for enrollments.fake_orm.FakeQuerySet.
"""
from types import SimpleNamespace
from unittest.mock import patch

from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.fake_orm import FakeQuerySet
from enrollments.views import EnrollmentViewSet

factory = APIRequestFactory()


def student(student_id, status="active", last="Cruz", first="Ana"):
    return SimpleNamespace(
        student_id=student_id, pk=student_id, status=status,
        student_number=f"S-{student_id}", lrn=f"99000{student_id}",
        first_name=first, middle_name=None, last_name=last, suffix=None,
    )


def enrollment(e_id, st, *, year, status, grade="Grade 5"):
    return SimpleNamespace(
        enrollment_id=e_id, pk=e_id, student=st, student_id=st.student_id,
        school_year=year, grade_level=grade, section="Rizal", semester=None,
        enrollment_status=status, guardian_response=None,
    )


ANA = student(1)
BEN = student(2, last="Reyes", first="Ben")

LAST_YEAR = enrollment(10, ANA, year="2025-2026", status="completed", grade="Grade 4")
NEXT_YEAR = enrollment(11, ANA, year="2026-2027", status="pending")
BEN_NEXT = enrollment(21, BEN, year="2026-2027", status="pending")


def _answer(role, pk, data, rows, *, linked=frozenset({1})):
    request = Request(factory.post(f"/api/enrollments/{pk}/guardian-response/", data, format="json"))
    request._full_data = data
    request.user = SimpleNamespace(role=role, user_id=77, is_authenticated=True)
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    view.queryset = FakeQuerySet(rows)

    store = FakeQuerySet(rows)
    with patch("enrollments.views.guardian_student_ids", return_value=set(linked)), \
         patch("enrollments.views.Enrollment.objects", new=store), \
         patch("enrollments.views.GuardianResponse.objects.update_or_create") as upsert:
        upsert.side_effect = lambda enrollment, defaults: (
            SimpleNamespace(enrollment=enrollment, responded_at="now", **defaults), True,
        )
        response = view.guardian_response(request, pk=pk)
    return response, upsert


ROWS = [LAST_YEAR, NEXT_YEAR, BEN_NEXT]


def test_guardian_answers_their_own_childs_next_year_row():
    response, upsert = _answer("guardian", 11, {"response": "returning"}, ROWS)

    assert response.status_code == 200
    assert response.data["guardian_response"]["response"] == "returning"
    kwargs = upsert.call_args.kwargs
    assert kwargs["enrollment"] is NEXT_YEAR
    assert kwargs["defaults"]["responded_by"] == 77


def test_answer_never_changes_the_enrollment_status():
    _answer("guardian", 11, {"response": "not_returning", "reason": "Moving"}, ROWS)
    assert NEXT_YEAR.enrollment_status == "pending"


def test_not_returning_keeps_the_reason_and_returning_drops_it():
    _, upsert = _answer("guardian", 11, {"response": "not_returning", "reason": " Moving "}, ROWS)
    assert upsert.call_args.kwargs["defaults"]["reason"] == "Moving"

    _, upsert = _answer("guardian", 11, {"response": "returning", "reason": "ignored"}, ROWS)
    assert upsert.call_args.kwargs["defaults"]["reason"] == ""


def test_another_familys_child_is_refused():
    response, upsert = _answer("guardian", 21, {"response": "returning"}, ROWS)
    assert response.status_code == 403
    upsert.assert_not_called()


def test_staff_cannot_answer_for_a_family():
    response, upsert = _answer("registrar", 11, {"response": "returning"}, ROWS)
    assert response.status_code == 403
    upsert.assert_not_called()


def test_a_row_that_is_already_enrolled_is_refused():
    enrolled = enrollment(12, ANA, year="2026-2027", status="enrolled")
    response, upsert = _answer("guardian", 12, {"response": "returning"}, [LAST_YEAR, enrolled])
    assert response.status_code == 409
    upsert.assert_not_called()


def test_a_new_learners_pending_row_is_not_a_question_for_the_family():
    """No earlier enrollment: this is a placement waiting on documents."""
    response, upsert = _answer("guardian", 11, {"response": "returning"}, [NEXT_YEAR])
    assert response.status_code == 409
    upsert.assert_not_called()


def test_an_unknown_answer_is_rejected():
    response, upsert = _answer("guardian", 11, {"response": "maybe"}, ROWS)
    assert response.status_code == 400
    upsert.assert_not_called()


# ── not-yet-placed worklist ──────────────────────────────────────────────────

def _unplaced(role, students, enrollments, year="2026-2027"):
    request = Request(factory.get(f"/api/enrollments/unplaced/?school_year={year}"))
    request.user = SimpleNamespace(role=role, user_id=5, is_authenticated=True)
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    with patch("enrollments.views.Student.objects", new=FakeQuerySet(students)), \
         patch("enrollments.views.Enrollment.objects", new=FakeQuerySet(enrollments)):
        return view.unplaced(request)


def test_active_students_without_a_row_this_year_are_listed():
    cara = student(3, last="Santos", first="Cara")      # never enrolled
    gone = student(4, status="transferred", last="Diaz")  # not expected back

    response = _unplaced(
        "registrar",
        [ANA, BEN, cara, gone],
        [LAST_YEAR, BEN_NEXT],   # Ana: last year only; Ben: pending this year
    )

    assert response.status_code == 200
    ids = [r["student_id"] for r in response.data["results"]]
    assert ids == [1, 3]  # Cruz, Santos -- by surname
    ana = response.data["results"][0]
    assert ana["last_enrollment"]["grade_level"] == "Grade 4"
    assert "semester" in ana["last_enrollment"]
    assert response.data["results"][1]["last_enrollment"] is None


def test_worklist_is_staff_only():
    for role in ("guardian", "teacher", "accounting"):
        assert _unplaced(role, [ANA], []).status_code == 403


def test_worklist_rejects_a_malformed_year():
    assert _unplaced("registrar", [ANA], [], year="2026-27").status_code == 400


def test_the_route_lets_a_guardian_reach_the_action():
    """The viewset's permission class refuses every guardian write; the
    action's own IsAuthenticated is what lets this one through, and only the
    router applies it. The tests above call the method directly, so pin it."""
    from django.urls import resolve
    from rest_framework.permissions import IsAuthenticated

    match = resolve("/api/enrollments/5/guardian-response/")
    assert match.func.initkwargs["permission_classes"] == [IsAuthenticated]
