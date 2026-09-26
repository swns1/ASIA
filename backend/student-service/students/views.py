import os

from rest_framework import viewsets, filters, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework import serializers
from django.conf import settings
from django.db import transaction
from django.db.models import OuterRef, Q, Subquery
from django.http import FileResponse, Http404
from django.utils import timezone

from accounts.permissions import IsAdminRegistrarOrReadOnly, teacher_student_ids
from accounts.users import guardian_account_problem
from shared.uploads import resolve_stored_path, verify_download_token
from .services import create_student_bundle
from .models import (
    Student,
    Household,
    Guardian,
    Sibling,
    PreviousSchool,
    RequirementType,
    StudentRequirementSubmission,
)
from .serializers import (
    StudentSerializer,
    StudentBillingSummarySerializer,
    HouseholdSerializer,
    GuardianSerializer,
    SiblingSerializer,
    PreviousSchoolSerializer,
    RequirementTypeSerializer,
    StudentRequirementSubmissionSerializer,
    StudentBulkCreateSerializer,
    StudentBulkCreateResponseSerializer,
)


# An enrollment that places a learner for its school year. Cancelled and
# completed rows are history, not a placement.
LIVE_ENROLLMENT_STATUSES = ("enrolled", "pending")


def _int_param(params, name):
    """Query parameter `name` as an int, or None when it is absent.

    These ids go straight into ORM filters, which raise ValueError on a
    non-number -- so `?student_id=abc` answered 500 "something went wrong on
    our end" for what is the caller's mistake. A 400 naming the parameter says
    what actually happened.
    """
    raw = params.get(name)
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise serializers.ValidationError({name: "Must be a whole number."})


def _int_list_param(params, name):
    """Comma-separated ids (`?user_id__in=1,2,3`) as a list of ints."""
    values = []
    for part in (params.get(name) or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            values.append(int(part))
        except ValueError:
            raise serializers.ValidationError({name: "Must be whole numbers separated by commas."})
    return values


def _scope_to_teacher_roster(queryset, user, *, field="student_id__in", deny_accounting=True):
    """
    A teacher only sees records for students in their own section advisory
    roster (accounts.permissions.teacher_student_ids). accounting is denied
    outright by default -- guardian contacts, sibling relationships,
    previous-school history, and document-submission status aren't
    billing-relevant (see StudentViewSet.get_serializer_class and
    HouseholdViewSet, the two places accounting does have a real need, for
    the deny_accounting=False exception). super_admin/admin/registrar are
    unfiltered, matching this class's existing behavior before this scoping
    was added.
    """
    role = getattr(user, "role", None)
    if role == "teacher":
        return queryset.filter(**{field: teacher_student_ids(user)})
    if role == "accounting" and deny_accounting:
        return queryset.none()
    return queryset


def _annotate_last_enrollment(queryset):
    """
    Where each student was last enrolled: the school year, grade and section
    of their latest enrollment that wasn't cancelled -- a completed one still
    counts, it is the year they finished. The Students page is the school's
    masterlist, so this is what tells a registrar at a glance where a learner
    stands. Annotated in one query rather than looked up per row; students
    never enrolled come back with NULLs (see LastEnrollmentMixin).
    """
    from accounts.enrollment_mirror import EnrollmentMirror
    latest = (
        EnrollmentMirror.objects
        .filter(student_id=OuterRef("student_id"))
        .exclude(enrollment_status="cancelled")
        # "2025-2026" sorts as its start year; the id breaks a tie within one.
        .order_by("-school_year", "-enrollment_id")
    )
    return queryset.annotate(
        last_school_year=Subquery(latest.values("school_year")[:1]),
        last_grade_level=Subquery(latest.values("grade_level")[:1]),
        last_section=Subquery(latest.values("section")[:1]),
    )


# Household fields that carry real meaning downstream. parent_marital_status,
# living_arrangement, is_4ps_beneficiary and four_ps_id drive fee discounts and
# scholarship eligibility (see HouseholdViewSet.get_queryset), which is why
# linking two siblings must not quietly discard one family's copy of them.
_HOUSEHOLD_MERGE_FIELDS = (
    "parent_marital_status",
    "living_arrangement",
    "is_4ps_beneficiary",
    "four_ps_id",
)


def _merge_household_details(source_id, target_id):
    """Copy across any detail the surviving household is missing, and return a
    description of every field where the two disagreed.

    Linking siblings moves students between households and abandons the empty
    row. Before this, the abandoned row's details went with it: a child could
    lose their 4Ps beneficiary status -- and the fee discount that rides on it
    -- purely by being recorded as somebody's sibling.

    Conflicts are reported, never auto-resolved. Choosing between two stated
    marital statuses is a registrar's call, not a merge rule's.
    """
    source = Household.objects.filter(pk=source_id).first()
    target = Household.objects.filter(pk=target_id).first()
    if not source or not target:
        return []

    updates = {}
    conflicts = []
    for field in _HOUSEHOLD_MERGE_FIELDS:
        src = getattr(source, field, None)
        tgt = getattr(target, field, None)
        if src is None or src == "" or src is False:
            continue                      # nothing worth carrying over
        if tgt is None or tgt == "" or tgt is False:
            updates[field] = src
        elif src != tgt:
            conflicts.append(f"{field}: kept {tgt!r}; the other household said {src!r}")

    if updates:
        Household.objects.filter(pk=target_id).update(**updates)
    return conflicts


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["student_number", "lrn", "first_name", "middle_name", "last_name", "email"]
    ordering_fields = ["student_id", "student_number", "last_name", "birth_date", "status"]

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("sex"):
            queryset = queryset.filter(sex=params["sex"])
        household_id = _int_param(params, "household_id")
        if household_id is not None:
            queryset = queryset.filter(household_id=household_id)
        if params.get("student_number"):
            queryset = queryset.filter(student_number=params["student_number"])
        if params.get("lrn"):
            queryset = queryset.filter(lrn=params["lrn"])
        if params.get("name"):
            name = params["name"]
            queryset = queryset.filter(
                Q(first_name__icontains=name) |
                Q(middle_name__icontains=name) |
                Q(last_name__icontains=name)
            )
        # ?unenrolled=<school_year> -- students with no live enrollment for
        # that year. A student registered but never enrolled has no section,
        # appears in no SF1 or SF2 and can be given no grades, and until this
        # filter existed nothing in the app could list them: the registration
        # and enrolment forms both warn that someone must "enrol them later",
        # with no way to find out who that is. Cancelled and completed rows do
        # not count as covering the year -- only a live one does.
        unenrolled_year = (params.get("unenrolled") or "").strip()
        if unenrolled_year:
            from accounts.enrollment_mirror import EnrollmentMirror
            covered = (
                EnrollmentMirror.objects
                .filter(school_year=unenrolled_year, enrollment_status__in=("enrolled", "pending"))
                .values_list("student_id", flat=True)
            )
            queryset = queryset.exclude(student_id__in=list(covered))

        # ?school_level= / ?grade_level= [&school_year=] -- students placed at
        # that level or grade: a live enrollment matching it, in that school
        # year when one is given. The Requirements page has always sent both,
        # but nothing here read them, so its Level and Grade filters changed
        # nothing and every student was listed whatever was picked.
        school_level = (params.get("school_level") or "").strip()
        grade_level = (params.get("grade_level") or "").strip()
        if school_level or grade_level:
            from accounts.enrollment_mirror import EnrollmentMirror
            placed = EnrollmentMirror.objects.filter(enrollment_status__in=LIVE_ENROLLMENT_STATUSES)
            if school_level:
                placed = placed.filter(school_level=school_level)
            if grade_level:
                placed = placed.filter(grade_level=grade_level)
            placed_year = (params.get("school_year") or "").strip()
            if placed_year:
                placed = placed.filter(school_year=placed_year)
            queryset = queryset.filter(student_id__in=placed.values("student_id"))

        # Only the masterlist shows it; other actions leave it off (and so
        # does their serializer output -- see LastEnrollmentMixin). getattr:
        # a view built outside DRF's routing has no `action` at all.
        if getattr(self, "action", None) == "list":
            queryset = _annotate_last_enrollment(queryset)

        # accounting keeps roster-wide access (see get_serializer_class --
        # it gets a reduced field set instead, not a filtered queryset: any
        # student could need an invoice, so scoping by teacher-style roster
        # doesn't make sense here).
        return _scope_to_teacher_roster(queryset, self.request.user, deny_accounting=False)

    def get_serializer_class(self):
        # accounting gets enough to identify a student for invoicing (name,
        # LRN, status, household) without the demographic PII (religion,
        # birth_date, exact addresses, personal contact info) it has no
        # billing-relevant need for -- see StudentBillingSummarySerializer.
        if getattr(self.request.user, "role", None) == "accounting":
            return StudentBillingSummarySerializer
        return super().get_serializer_class()

    def destroy(self, request, *args, **kwargs):
        """
        Deleting is for a record created by mistake -- a duplicate
        registration -- before the learner was ever enrolled.

        It used to delete anyone. The database cascades a student to their
        enrollments and from there to grades, score entries and narrative
        reports, so a learner with grades but no attendance yet was erased
        outright, permanent record included; one with attendance or an invoice
        hit a foreign key at commit and got a 500 instead. School records have
        to be kept: a learner who leaves is marked Transferred, Dropped or
        Inactive, which keeps their history attached to their name.
        """
        student = self.get_object()
        from accounts.enrollment_mirror import EnrollmentMirror
        if EnrollmentMirror.objects.filter(student_id=student.pk).exists():
            return Response(
                {
                    "detail": (
                        f"{student.first_name} {student.last_name} has enrollment history, so "
                        "this record can't be deleted -- school records have to be kept. "
                        "Change their status to Transferred, Dropped or Inactive instead."
                    ),
                    "code": "student_has_history",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"], url_path="mark-graduated")
    def mark_graduated(self, request):
        """
        POST /api/students/mark-graduated/  {"student_ids": [..]}

        Marks learners who finished Grade 12 as graduated. Nothing else ever
        set that status, so every Grade 12 completer stayed `active` for good
        and turned up on the "not yet placed" worklist every year after.

        Only a learner who is still active, has a completed Grade 12
        2nd-semester enrollment and holds no enrolled or pending row is
        changed; everyone else comes back under `skipped` with the reason.
        """
        raw_ids = request.data.get("student_ids")
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response({"detail": "student_ids must be a non-empty list."}, status=400)
        try:
            ids = {int(i) for i in raw_ids}
        except (TypeError, ValueError):
            return Response({"detail": "student_ids must be whole numbers."}, status=400)

        from accounts.enrollment_mirror import EnrollmentMirror
        rows = EnrollmentMirror.objects.filter(student_id__in=ids)
        finished = set(
            rows.filter(grade_level="Grade 12", semester="2nd", enrollment_status="completed")
            .values_list("student_id", flat=True)
        )
        still_placed = set(
            rows.filter(enrollment_status__in=LIVE_ENROLLMENT_STATUSES)
            .values_list("student_id", flat=True)
        )
        statuses = dict(Student.objects.filter(pk__in=ids).values_list("student_id", "status"))

        graduated, skipped = [], []
        for sid in sorted(ids):
            if sid not in statuses:
                reason = "No such student."
            elif statuses[sid] != "active":
                reason = f"Already marked {statuses[sid]}."
            elif sid not in finished:
                reason = "Has not completed Grade 12 (2nd semester)."
            elif sid in still_placed:
                reason = "Still has an enrolled or pending enrollment."
            else:
                graduated.append(sid)
                continue
            skipped.append({"student_id": sid, "reason": reason})

        if graduated:
            # updated_at by hand: .update() skips auto_now, and an edit form
            # opened before this must see that the record changed under it.
            Student.objects.filter(pk__in=graduated, status="active").update(
                status="graduated", updated_at=timezone.now(),
            )
        return Response({"graduated": graduated, "skipped": skipped})

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        serializer = StudentBulkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            student, household, guardians = create_student_bundle(data)

            # Same atomic block as the student itself. Created here rather than
            # by the client afterwards: a half-finished registration used to
            # leave a saved student with its siblings lost, and since `lrn` is
            # UNIQUE the retry could never get past the student row again.
            # Mirrors intake/services.py::approve_application, which has always
            # written these two inside its own transaction.
            siblings = Sibling.objects.bulk_create([
                Sibling(student=student, full_name=sib["full_name"], age=sib.get("age"))
                for sib in data.get("siblings", [])
                if (sib.get("full_name") or "").strip()
            ])
            previous_schools = PreviousSchool.objects.bulk_create([
                PreviousSchool(
                    student=student,
                    school_name=sch["school_name"],
                    school_address=sch.get("school_address", ""),
                )
                for sch in data.get("previous_schools", [])
                if (sch.get("school_name") or "").strip()
            ])

        response_data = {
            "student": student,
            "household": household,
            "guardians": guardians,
            "siblings": siblings,
            "previous_schools": previous_schools,
        }
        response_serializer = StudentBulkCreateResponseSerializer(response_data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    # ── Siblings ─────────────────────────────────────────────────────────────
    # Sibling-ness is *derived* from a shared household rather than stored as
    # its own student-to-student link. There is a `student_siblings` table that
    # models the second approach, but keeping both means keeping two answers to
    # one question that can disagree (A linked to B, but living in different
    # households -- which is right?). `students.household_id` already exists,
    # is nullable, has a real FK, and carries no unique constraint, so several
    # students sharing one household is something the schema already allows;
    # it just never happened because intake creates a fresh household per
    # student. These two actions are how that gets established and read back.

    @action(detail=True, methods=["get"], url_path="siblings")
    def siblings(self, request, pk=None):
        """
        GET /api/students/{id}/siblings/

        The other students in this student's household. Empty (not an error)
        when the student has no household or is the only one in it.
        """
        student = self.get_object()
        if not student.household_id:
            return Response([])

        # Reuse get_queryset() so a teacher still only sees their own roster
        # and accounting still gets the reduced serializer -- a sibling list
        # must not become a way around either.
        others = self.get_queryset().filter(
            household_id=student.household_id
        ).exclude(pk=student.pk)
        return Response(self.get_serializer(others, many=True).data)

    @action(detail=True, methods=["post"], url_path="link-sibling")
    def link_sibling(self, request, pk=None):
        """
        POST /api/students/{id}/link-sibling/  {"sibling_student_id": N}

        Records that two students are siblings by putting them in the same
        household. Whichever student already has one wins; if neither does, a
        household is created for both. Deliberately server-side and atomic:
        done from the client this is a read, a conditional create and two
        updates, and a half-finished version leaves a family split in two.
        """
        student = self.get_object()
        sibling_id = request.data.get("sibling_student_id")
        if not sibling_id:
            return Response({"detail": "sibling_student_id is required."}, status=400)

        try:
            sibling = Student.objects.get(pk=int(sibling_id))
        except (Student.DoesNotExist, TypeError, ValueError):
            return Response({"detail": "That student could not be found."}, status=404)

        if sibling.pk == student.pk:
            return Response({"detail": "A student cannot be their own sibling."}, status=400)

        with transaction.atomic():
            household_id = student.household_id or sibling.household_id
            if not household_id:
                household_id = Household.objects.create().household_id

            # Is there a second, different household being absorbed?
            absorbed_id = None
            if (student.household_id and sibling.household_id
                    and student.household_id != sibling.household_id):
                absorbed_id = (
                    sibling.household_id if household_id == student.household_id
                    else student.household_id
                )

            conflicts = []
            if absorbed_id:
                # Carry across anything the surviving household is missing
                # before the move, so 4Ps status and the rest are not lost with
                # the abandoned row.
                conflicts = _merge_household_details(absorbed_id, household_id)

                # Sibling-ness is transitive: everyone already in the absorbed
                # household is a sibling of both of these students, so the
                # whole group moves. Moving only the named student used to
                # silently split them from children they were already recorded
                # with, leaving the old household holding the remainder.
                moved = list(
                    Student.objects.filter(household_id=absorbed_id)
                    .values_list("student_id", flat=True)
                )
                Student.objects.filter(household_id=absorbed_id).update(household_id=household_id)
                # Empty now, and its details were merged above. Leaving it
                # behind is how households with nobody in them built up.
                Household.objects.filter(pk=absorbed_id).delete()
            else:
                moved = []
                for person in (student, sibling):
                    if person.household_id != household_id:
                        Student.objects.filter(pk=person.pk).update(household_id=household_id)
                        moved.append(person.pk)

        payload = {
            "household_id": household_id,
            "moved_student_ids": moved,
            "detail": f"{student.first_name} and {sibling.first_name} are now recorded as siblings.",
        }
        # Surfaced rather than resolved: where the two households disagreed the
        # surviving value was kept, and a registrar has to be told which so
        # they can correct it if the wrong one won.
        if conflicts:
            payload["household_conflicts"] = conflicts
        return Response(payload)

    @action(detail=True, methods=["post"], url_path="unlink-sibling")
    def unlink_sibling(self, request, pk=None):
        """
        POST /api/students/{id}/unlink-sibling/

        Moves this student out of the household they share, which is what
        "they aren't siblings after all" means when the link is derived. The
        household row stays with whoever remains in it.

        The student leaves with their own copy of the household's details.
        Clearing their household_id, as this used to, dropped the parents'
        marital status, living arrangement and 4Ps membership from their record
        entirely -- facts about their family that didn't stop being true
        because a sibling link was wrong.
        """
        student = self.get_object()
        if not student.household_id:
            return Response({"detail": "This student isn't linked to a household."}, status=400)
        if not Student.objects.filter(household_id=student.household_id).exclude(pk=student.pk).exists():
            return Response(
                {"detail": f"{student.first_name} has no siblings recorded in this household, so there is nothing to unlink."},
                status=400,
            )

        with transaction.atomic():
            source = Household.objects.filter(pk=student.household_id).first()
            details = {f: getattr(source, f) for f in _HOUSEHOLD_MERGE_FIELDS} if source else {}
            own = Household.objects.create(**details)
            Student.objects.filter(pk=student.pk).update(household_id=own.household_id)
        return Response({
            "detail": "Removed from the siblings' household. Their family details were kept on their own record.",
            "household_id": own.household_id,
        })


class HouseholdViewSet(viewsets.ModelViewSet):
    queryset = Household.objects.all()
    serializer_class = HouseholdSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    def get_queryset(self):
        queryset = super().get_queryset()
        student_id = _int_param(self.request.query_params, "student")
        if student_id is not None:
            queryset = queryset.filter(student__student_id=student_id)
        # accounting keeps access here (unlike the other viewsets below):
        # is_4ps_beneficiary / parent_marital_status / living_arrangement
        # are exactly the kind of thing that affects fee discounts and
        # scholarship eligibility.
        return _scope_to_teacher_roster(
            queryset, self.request.user, field="student__student_id__in", deny_accounting=False
        )


class GuardianViewSet(viewsets.ModelViewSet):
    # select_related: every row serializes student_name.
    queryset = Guardian.objects.select_related("student").order_by("guardian_id")
    serializer_class = GuardianSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["full_name", "email_address", "mobile_number"]
    ordering_fields = ["guardian_id", "full_name"]

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        student_id = _int_param(params, "student_id")
        if student_id is not None:
            queryset = queryset.filter(student_id=student_id)
        if params.get("relationship"):
            queryset = queryset.filter(relationship=params["relationship"])
        if params.get("is_primary_contact") in ["true", "false"]:
            queryset = queryset.filter(is_primary_contact=params["is_primary_contact"] == "true")
        user_id = _int_param(params, "user_id")
        if user_id is not None:
            queryset = queryset.filter(user_id=user_id)
        if params.get("user_id__in"):
            queryset = queryset.filter(user_id__in=_int_list_param(params, "user_id__in"))
        return _scope_to_teacher_roster(queryset, self.request.user)

    # ── One primary contact per student ──────────────────────────────────────
    # Marking a guardian primary demotes whoever held it, in one transaction.
    # Refusing instead broke the edit form, which saves guardians one request
    # at a time in list order: moving the star upward was refused while the
    # guardian below still held it, halfway through a save. The demotion runs
    # first because uq_guardian_primary_per_student allows only one.

    def _demote_other_primaries(self, serializer):
        if not serializer.validated_data.get("is_primary_contact"):
            return
        instance = serializer.instance
        student = serializer.validated_data.get("student") or getattr(instance, "student", None)
        others = Guardian.objects.filter(student=student, is_primary_contact=True)
        if instance is not None:
            others = others.exclude(pk=instance.pk)
        others.update(is_primary_contact=False)

    def perform_create(self, serializer):
        with transaction.atomic():
            self._demote_other_primaries(serializer)
            serializer.save()

    def perform_update(self, serializer):
        with transaction.atomic():
            self._demote_other_primaries(serializer)
            serializer.save()

    def destroy(self, request, *args, **kwargs):
        """
        A learner's last guardian can't be removed.

        Registration and the kiosk both require a guardian, but deleting was
        unguarded, so a record could be left with nobody to contact, no name
        for the SF forms, and -- if the removed row carried the portal link --
        no parent able to see the child. The edit form creates a replacement
        before it deletes, so swapping one guardian for another still works.

        Removing the primary contact hands the star to the longest-standing
        remaining guardian, so the student never goes without one.

        Every guardian row of the student is locked, in id order, before the
        count: two removals racing on a two-guardian record would otherwise
        each see the other still there and both go through.
        """
        guardian = self.get_object()
        with transaction.atomic():
            rows = list(
                Guardian.objects.select_for_update()
                .filter(student_id=guardian.student_id)
                .order_by("guardian_id")
            )
            others = [g for g in rows if g.pk != guardian.pk]
            if not others:
                return Response(
                    {
                        "detail": (
                            f"{guardian.full_name} is this learner's only guardian. "
                            "Add another guardian before removing this one."
                        ),
                        "code": "last_guardian",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            self.perform_destroy(guardian)
            if guardian.is_primary_contact and not any(g.is_primary_contact for g in others):
                Guardian.objects.filter(pk=others[0].pk).update(is_primary_contact=True)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="link-account")
    def link_account(self, request, pk=None):
        """
        POST /api/guardians/{id}/link-account/  {"user_id": N}   (null unlinks)

        Gives this guardian's parent-portal login access to the student.
        `user_id` is read-only on the plain guardian endpoints, which is right
        -- it is the one key the parent portal scopes by -- but the Link
        account screen kept PATCHing it there, got a 200 back with the field
        silently ignored, and told staff it had linked. This is where a person
        links by hand, and it checks the target: it must exist, be a
        parent/guardian account, and not be deactivated.
        """
        guardian = self.get_object()
        raw = request.data.get("user_id")
        if raw in (None, ""):
            user_id = None
        else:
            try:
                user_id = int(raw)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "user_id must be a whole number.", "user_id": ["Must be a whole number."]},
                    status=400,
                )
            problem = guardian_account_problem(user_id)
            if problem:
                return Response({"detail": problem, "user_id": [problem]}, status=400)

        Guardian.objects.filter(pk=guardian.pk).update(user_id=user_id)
        guardian.user_id = user_id
        return Response(self.get_serializer(guardian).data)


class SiblingViewSet(viewsets.ModelViewSet):
    queryset = Sibling.objects.all()
    serializer_class = SiblingSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    def get_queryset(self):
        queryset = super().get_queryset()
        student_id = _int_param(self.request.query_params, "student_id")
        if student_id is not None:
            queryset = queryset.filter(student_id=student_id)
        return _scope_to_teacher_roster(queryset, self.request.user)


class PreviousSchoolViewSet(viewsets.ModelViewSet):
    queryset = PreviousSchool.objects.all()
    serializer_class = PreviousSchoolSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    def get_queryset(self):
        queryset = super().get_queryset()
        student_id = _int_param(self.request.query_params, "student_id")
        if student_id is not None:
            queryset = queryset.filter(student_id=student_id)
        return _scope_to_teacher_roster(queryset, self.request.user)


class RequirementTypeViewSet(viewsets.ReadOnlyModelViewSet):
    # Read-only. requirement_types belongs to enrollment-service, which is
    # where the app manages it; this copy used to accept writes too, and
    # deleting a type students had already submitted answered 500 (the
    # RESTRICT foreign key) instead of anything useful.
    queryset = RequirementType.objects.all()
    serializer_class = RequirementTypeSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["requirement_code", "requirement_name"]
    ordering_fields = ["requirement_type_id", "requirement_code", "requirement_name"]

    def get_queryset(self):
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active in ["true", "false"]:
            queryset = queryset.filter(is_active=is_active == "true")
        return queryset


class StudentRequirementSubmissionViewSet(viewsets.ModelViewSet):
    queryset = StudentRequirementSubmission.objects.all()
    serializer_class = StudentRequirementSubmissionSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
    parser_classes = [MultiPartParser, FormParser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    ordering_fields = ["student_requirement_submission_id", "submitted_at", "verified_at"]
    # ViewSet.as_view() rejects any @action initkwarg that is not already an
    # attribute of the class, and APIView declares throttle_classes but not
    # throttle_scope -- so the scoped `file` action below made the router raise
    # TypeError while building urlpatterns, taking the whole service down at
    # import. None leaves the default routes unscoped; the action sets its own.
    throttle_scope = None

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        student_id = _int_param(params, "student_id")
        if student_id is not None:
            queryset = queryset.filter(student_id=student_id)
        requirement_type_id = _int_param(params, "requirement_type_id")
        if requirement_type_id is not None:
            queryset = queryset.filter(requirement_type_id=requirement_type_id)
        if params.get("is_submitted") in ["true", "false"]:
            queryset = queryset.filter(is_submitted=params["is_submitted"] == "true")
        return _scope_to_teacher_roster(queryset, self.request.user)

    # Deliberately no auth/permission classes: this URL is loaded from plain
    # <img>/<iframe> src attributes, which can't attach an Authorization
    # header. Access control is the signed, submission-scoped, 5-minute
    # token in ?token= (minted only by the authenticated, role-gated
    # endpoints above) — not the request's own credentials. See
    # shared/uploads.py.
    @action(
        detail=True,
        methods=["get"],
        url_path="file",
        authentication_classes=[],
        permission_classes=[AllowAny],
        # Anonymous by design (see above), which put these on the 30/min
        # AnonRateThrottle bucket — a single student's document panel could
        # exhaust it, and a school behind one NAT address shared that budget
        # building-wide, so thumbnails failed as 429s that looked like broken
        # images. The signed token is the access control; this only needs to
        # stop a runaway loop. Mirrors enrollment-service's twin action.
        throttle_classes=[ScopedRateThrottle],
        throttle_scope="document_download",
    )
    def file(self, request, pk=None):
        try:
            submission = StudentRequirementSubmission.objects.get(pk=pk)
        except (StudentRequirementSubmission.DoesNotExist, ValueError):
            raise Http404

        token = request.query_params.get("token")
        if not verify_download_token(token, submission.student_requirement_submission_id):
            return Response({"detail": "Invalid or expired download link."}, status=403)

        if not submission.image_url:
            raise Http404

        file_path = resolve_stored_path(settings.MEDIA_ROOT, submission.image_url)
        if not os.path.isfile(file_path):
            raise Http404

        # Inline rather than as_attachment, matching enrollment-service's twin:
        # the SPA renders these in <img>/<iframe>, and an attachment
        # disposition makes the browser download a PDF instead of showing it.
        # Uploads are magic-byte restricted to jpg/png/pdf and served from the
        # API origin, so inline display cannot reach the SPA's session storage.
        response = FileResponse(
            open(file_path, "rb"),
            as_attachment=False,
            filename=os.path.basename(file_path),
        )
        response["X-Content-Type-Options"] = "nosniff"
        return response