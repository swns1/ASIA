from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from grading.deped import blocking_subjects
from shared.school_year import InvalidSchoolYear, normalize as normalize_school_year, start_year
from .models import Enrollment, EnrollmentTransfer, SchoolYear, Section, SectionAdvisory, Student
from .rules import (
    ATTENDED_STATUSES,
    GRADE_ORDER,
    placement_problems,
    status_change_problem,
)


class SchoolYearField(serializers.CharField):
    """A school year, validated and normalized to canonical "YYYY-YYYY" form.

    school_year is the partition key every screen filters by and that billing
    joins on in raw SQL. Validating on the way in is what keeps "2025-26" and a
    trailing space from splitting one school year into several that no query
    ever brings back together.

    `registered=True` also requires the year to exist in the registry. The
    database enforces that by foreign key anyway (migration 0006); checking
    here turns what would be a 500 into a message saying what to do.
    """

    def __init__(self, *args, registered=False, **kwargs):
        self.registered = registered
        super().__init__(*args, **kwargs)

    def to_internal_value(self, data):
        text = super().to_internal_value(data)
        try:
            label = normalize_school_year(text)
        except InvalidSchoolYear as exc:
            raise serializers.ValidationError(str(exc)) from exc
        if self.registered and not SchoolYear.objects.filter(label=label).exists():
            raise serializers.ValidationError(
                f"S.Y. {label} hasn't been set up yet. An admin can add it under School Years."
            )
        return label


class SchoolYearSerializer(serializers.ModelSerializer):
    """
    A registered school year. `state` is derived (see SchoolYear.state), so
    the view passes the current year's label in the context once rather than
    each row looking it up.

    The label is fixed once created: every record in that year is filed under
    it. `is_current` changes only through make-current, which moves it in one
    transaction, and `archived_at` only through archiving.
    """

    label = SchoolYearField()
    state = serializers.SerializerMethodField()

    class Meta:
        model = SchoolYear
        fields = (
            "school_year_id", "label", "start_date", "end_date",
            "is_current", "state", "archived_at", "created_at", "updated_at",
        )
        read_only_fields = (
            "school_year_id", "is_current", "archived_at", "created_at", "updated_at",
        )

    def get_state(self, obj):
        return obj.state(self.context.get("current_label"))

    def validate_label(self, value):
        if self.instance is not None and value != self.instance.label:
            raise serializers.ValidationError(
                "A school year's label can't be changed; every record in that year is filed under it."
            )
        if self.instance is None and SchoolYear.objects.filter(label=value).exists():
            raise serializers.ValidationError(f"S.Y. {value} already exists.")
        return value

    def validate(self, attrs):
        label = attrs.get("label", getattr(self.instance, "label", None))
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))

        if start and end and start >= end:
            raise serializers.ValidationError({"end_date": "The end date has to be after the start date."})

        first = start_year(label)
        if first is not None and start and start.year != first:
            raise serializers.ValidationError(
                {"start_date": f"S.Y. {label} has to start in {first}."}
            )
        if first is not None and end and end.year != first + 1:
            raise serializers.ValidationError(
                {"end_date": f"S.Y. {label} has to end in {first + 1}."}
            )

        if start and end:
            overlap = SchoolYear.objects.filter(start_date__lte=end, end_date__gte=start)
            if self.instance is not None:
                overlap = overlap.exclude(pk=self.instance.pk)
            clash = overlap.first()
            if clash is not None:
                # Not "%-d": that unpadded-day flag is glibc-only, and on the
                # Windows server strftime raises on it -- the overlap answered
                # 500 instead of saying which year it clashes with.
                def day(d):
                    return f"{d:%b} {d.day}, {d.year}"

                raise serializers.ValidationError({
                    "start_date": (
                        f"These dates overlap S.Y. {clash.label} "
                        f"({day(clash.start_date)} – {day(clash.end_date)})."
                    ),
                })
        return attrs


def resolve_placement_section(attrs, instance=None):
    """
    Hold a placement (an enrollment or an advisory) to a registered section.

    Sections are set up per year and picked, not typed; the database enforces
    that by composite foreign key (migration 0007). Checking here turns what
    would be a 500 into a message saying what to do, matches the name
    case-insensitively and stores the section's own spelling -- "rizal" files
    under "Rizal" instead of failing -- and takes a Senior High learner's
    strand from the section, which is where the strand now lives.

    Only runs when the placement itself is being written; an update that
    doesn't touch year, grade or section leaves it alone.
    """
    placement_keys = ("school_year", "grade_level", "section")
    if instance is not None and not any(k in attrs for k in placement_keys):
        return attrs

    year = attrs.get("school_year", getattr(instance, "school_year", None))
    grade = attrs.get("grade_level", getattr(instance, "grade_level", None))
    name = (attrs.get("section", getattr(instance, "section", None)) or "").strip()
    if not (year and grade and name):
        return attrs  # the missing field's own "required" error says it better

    section = (
        Section.objects.filter(school_year_id=year, grade_level=grade, name__iexact=name)
        .only("name", "school_level", "strand")
        .first()
    )
    if section is None:
        raise serializers.ValidationError({
            "section": (
                f"S.Y. {year} {grade} has no section named \u201c{name}\u201d. "
                "Add it first, or pick one of that grade's sections."
            ),
        })
    attrs["section"] = section.name
    if section.school_level == "senior_highschool":
        attrs["strand"] = section.strand
    return attrs


class SectionAdvisorySerializer(serializers.ModelSerializer):
    school_year = SchoolYearField(registered=True)

    class Meta:
        model = SectionAdvisory
        fields = (
            "advisory_id", "teacher_user_id", "school_year",
            "school_level", "grade_level", "section", "strand",
            "created_at",
        )
        read_only_fields = ("advisory_id", "created_at")

    def validate_teacher_user_id(self, value):
        """
        Only an active teacher account can be made an adviser -- the id is
        client-supplied, and the pickers hiding inactive staff is no guard.
        Leaving an existing advisory's teacher as-is stays allowed, so a
        deactivated teacher's past advisories can still be edited.
        """
        from accounts.models import User

        if self.instance is not None and value == self.instance.teacher_user_id:
            return value
        user = User.objects.filter(user_id=value).values("role", "is_active").first()
        if user is None or user["role"] != "teacher":
            raise serializers.ValidationError("Choose a teacher account.")
        if not user["is_active"]:
            raise serializers.ValidationError("This teacher's account is inactive.")
        return value

    def validate(self, attrs):
        grade_level = attrs.get("grade_level", getattr(self.instance, "grade_level", None))
        school_level = attrs.get("school_level", getattr(self.instance, "school_level", None))
        strand = attrs.get("strand", getattr(self.instance, "strand", None))
        problems = placement_problems(
            school_level=school_level, grade_level=grade_level, strand=strand,
        )
        # A senior high advisory without a strand covers every strand in the
        # section, so unlike an enrollment it doesn't need one.
        problems.pop("strand", None)
        if problems:
            raise serializers.ValidationError(problems)
        if school_level != "senior_highschool":
            attrs["strand"] = None
        return attrs

    def to_internal_value(self, data):
        return resolve_placement_section(super().to_internal_value(data), self.instance)


class SectionSerializer(serializers.ModelSerializer):
    """
    A section of one grade in one school year.

    Only `name` and `strand` change after creation. Moving a section to
    another grade or year would carry every enrolled learner with it -- the
    foreign key cascades -- so that is a new section, not an edit. A rename
    does cascade, deliberately: that is the point of it.
    """

    school_year = serializers.SlugRelatedField(
        slug_field="label",
        queryset=SchoolYear.objects.all(),
        error_messages={"does_not_exist": "S.Y. {value} hasn't been set up yet."},
    )
    enrollment_count = serializers.SerializerMethodField()
    adviser_count = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = (
            "section_id", "school_year", "school_level", "grade_level", "name", "strand",
            "enrollment_count", "adviser_count", "created_at", "updated_at",
        )
        read_only_fields = ("section_id", "created_at", "updated_at")
        # DRF would add a case-sensitive UniqueTogetherValidator from the
        # model's constraint; validate() does the case-insensitive check
        # (and says which section it clashes with) instead.
        validators = []

    def _count(self, key, obj):
        return self.context.get(key, {}).get((obj.school_year_id, obj.grade_level, obj.name), 0)

    def get_enrollment_count(self, obj):
        return self._count("enrollment_counts", obj)

    def get_adviser_count(self, obj):
        return self._count("adviser_counts", obj)

    def validate_name(self, value):
        name = " ".join(value.split())
        if not name:
            raise serializers.ValidationError("A section needs a name.")
        return name

    def validate(self, attrs):
        instance = self.instance
        if instance is not None:
            for fixed in ("school_year", "school_level", "grade_level"):
                if fixed in attrs and attrs[fixed] != getattr(instance, fixed):
                    raise serializers.ValidationError({
                        fixed: "A section can't move to another year or grade; add a new section there instead.",
                    })

        year = attrs.get("school_year", getattr(instance, "school_year", None))
        level = attrs.get("school_level", getattr(instance, "school_level", None))
        grade = attrs.get("grade_level", getattr(instance, "grade_level", None))
        name = attrs.get("name", getattr(instance, "name", None))

        if grade not in GRADE_LEVELS_BY_LEVEL.get(level, []):
            raise serializers.ValidationError({"grade_level": f"{grade} isn't a {level.replace('_', ' ') if level else ''} grade."})

        strand = attrs.get("strand", getattr(instance, "strand", None))
        strand = (strand or "").strip() or None
        if level == "senior_highschool" and not strand:
            raise serializers.ValidationError({"strand": "Senior High sections belong to a strand."})
        if level != "senior_highschool":
            strand = None
        attrs["strand"] = strand

        clash = Section.objects.filter(school_year=year, grade_level=grade, name__iexact=name)
        if instance is not None:
            clash = clash.exclude(pk=instance.pk)
        existing = clash.first()
        if existing is not None:
            raise serializers.ValidationError({
                "name": f"{grade} already has a section named \u201c{existing.name}\u201d in S.Y. {year.label}.",
            })
        return attrs


class EnrollmentTransferSerializer(serializers.ModelSerializer):
    student_id = serializers.IntegerField(source="enrollment.student_id", read_only=True)

    class Meta:
        model = EnrollmentTransfer
        fields = (
            "transfer_id", "enrollment", "student_id", "transfer_type",
            "effective_date", "reason",
            "from_grade_level", "from_section", "from_strand",
            "to_grade_level", "to_section", "to_strand",
            "destination_school_name", "origin_school_name",
            "initiated_by", "created_at",
        )
        read_only_fields = ("transfer_id", "initiated_by", "created_at")

# ── Grade progression helpers ─────────────────────────────────────────────────
# GRADE_ORDER lives in enrollments.rules and is re-exported from here, where
# the views have always imported it from.


def promotion_grades(last_completed):
    """
    The grade rows a move up from `last_completed` is judged on.

    Grade 11 is enrolled per semester, so moving up from it is judged on both
    semesters of that year -- the rows Promote reads. Judging only the last
    completed row (the 2nd semester) let a learner who failed a 1st-semester
    subject into Grade 12 one learner at a time while Promote refused them.
    """
    from grades.models import Grade
    from .promotion import SEMESTERED_SOURCE

    if last_completed.grade_level == SEMESTERED_SOURCE:
        year_rows = list(
            Enrollment.objects.filter(
                student_id=last_completed.student_id,
                school_year=last_completed.school_year,
                grade_level=SEMESTERED_SOURCE,
                enrollment_status="completed",
            ).values_list("enrollment_id", flat=True)
        )
        return Grade.objects.filter(enrollment_id__in=year_rows).select_related("subject")
    return Grade.objects.filter(enrollment=last_completed).select_related("subject")


# The same ladder split by school level -- the one list sections, promotion
# and placement validate grades against. Mirrors the frontend's
# constants/schoolLevels.js GRADE_LEVELS_BY_LEVEL.
GRADE_LEVELS_BY_LEVEL = {
    "nursery":           ["Nursery"],
    "kindergarten":      ["Kindergarten"],
    "elementary":        ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
    "junior_highschool": ["Grade 7", "Grade 8", "Grade 9", "Grade 10"],
    "senior_highschool": ["Grade 11", "Grade 12"],
}


def school_level_for_grade(grade):
    """The school level a grade belongs to, or None if it isn't on the ladder."""
    for level, grades in GRADE_LEVELS_BY_LEVEL.items():
        if grade in grades:
            return level
    return None


def get_next_grade_level(current):
    try:
        idx = GRADE_ORDER.index(current)
        return GRADE_ORDER[idx + 1] if idx < len(GRADE_ORDER) - 1 else None
    except ValueError:
        return None


def get_grade_index(grade):
    try:
        return GRADE_ORDER.index(grade)
    except ValueError:
        return -1


class StudentSummarySerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = (
            "student_id",
            "student_number",
            "lrn",
            "first_name",
            "middle_name",
            "last_name",
            "suffix",
            "full_name",
            "sex",
            "birth_date",
            "status",
            "current_address",
        )

    def get_full_name(self, obj):
        parts = [obj.first_name, obj.middle_name, obj.last_name, obj.suffix]
        return " ".join(p for p in parts if p)


class EnrollmentSerializer(serializers.ModelSerializer):
    school_year = SchoolYearField(registered=True)

    student_detail = StudentSummarySerializer(source="student", read_only=True)
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    student_id = serializers.IntegerField(source="student.student_id", read_only=True)
    student_name = serializers.SerializerMethodField()

    # Write-only override fields — consumed during validation, never stored on Enrollment
    progression_override = serializers.BooleanField(write_only=True, required=False, default=False)
    progression_override_reason = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    # The registrar's own "Transfer In" declaration, used to decide which
    # documents this learner owes (requirements/rules.py). The durable record
    # is still the EnrollmentTransfer row the client writes after this POST
    # returns — which is exactly why the gate cannot read it and needs this:
    # at validation time that row does not exist yet.
    is_transfer_in = serializers.BooleanField(write_only=True, required=False, default=False)

    # The guardian's answer on a next-year pending row (GuardianResponse).
    # Read-only here: guardians write it through the guardian-response action,
    # never through this serializer.
    guardian_response = serializers.SerializerMethodField()

    class Meta:
        model = Enrollment
        fields = (
            "enrollment_id",
            "student",
            "student_id",
            "student_name",
            "student_detail",
            "school_year",
            "school_level",
            "grade_level",
            "section",
            "strand",
            "semester",
            "enrollment_status",
            "progression_override",
            "progression_override_reason",
            "is_transfer_in",
            "guardian_response",
        )
        read_only_fields = ("enrollment_id",)

    def get_guardian_response(self, obj):
        try:
            answer = obj.guardian_response
        except (ObjectDoesNotExist, AttributeError):
            return None
        if answer is None:
            return None
        return {
            "response":     answer.response,
            "reason":       answer.reason,
            "responded_at": answer.responded_at,
        }

    def get_student_name(self, obj):
        s = obj.student
        if not s:
            return None
        parts = [s.first_name, s.middle_name, s.last_name, s.suffix]
        return " ".join(p for p in parts if p)

    def to_internal_value(self, data):
        return resolve_placement_section(super().to_internal_value(data), self.instance)

    def validate(self, attrs):
        # ── Pull override flags before any other check ─────────────────────────
        # Everything popped here is write-only: anything left in attrs reaches
        # Enrollment(**attrs) and blows up on an unexpected keyword.
        progression_override = attrs.pop("progression_override", False)
        progression_override_reason = attrs.pop("progression_override_reason", "")
        is_transfer_in = attrs.pop("is_transfer_in", False)

        # ── Who and what an edit may change ────────────────────────────────────
        # An enrollment carries the learner's grades, attendance and invoice, so
        # re-pointing it at another student handed that whole record to them.
        if self.instance is not None and "student" in attrs:
            current = getattr(self.instance, "student_id", None) or getattr(
                getattr(self.instance, "student", None), "pk", None
            )
            if attrs["student"].pk != current:
                raise serializers.ValidationError({
                    "student": (
                        "An enrollment's learner can't be changed. Cancel this "
                        "enrollment and enroll the right learner instead."
                    )
                })
        if "enrollment_status" in attrs:
            if self.instance is None:
                if attrs["enrollment_status"] == "transferred_out":
                    raise serializers.ValidationError({
                        "enrollment_status": "Use Transfer Out on an enrolled learner instead.",
                    })
            else:
                problem = status_change_problem(
                    self.instance.enrollment_status, attrs["enrollment_status"],
                )
                if problem:
                    raise serializers.ValidationError({"enrollment_status": problem})

        # ── Semester / strand consistency ──────────────────────────────────────
        school_level = attrs.get("school_level", getattr(self.instance, "school_level", None))
        semester = attrs.get("semester", getattr(self.instance, "semester", None))

        if semester == "":
            semester = None
            attrs["semester"] = None

        if school_level == "senior_highschool":
            if semester not in ("1st", "2nd"):
                raise serializers.ValidationError({
                    "semester": "Senior HS enrollments require semester '1st' or '2nd'."
                })
        else:
            if semester is not None:
                raise serializers.ValidationError({
                    "semester": f"Semester must be empty for {school_level} enrollments."
                })
            if "strand" in attrs:
                attrs["strand"] = None

        # ── The placement has to agree with itself ─────────────────────────────
        # The form only offers consistent choices, but the API took anything:
        # elementary Grade 11 with a strand, senior high Grade 3, "Grade 99".
        problems = placement_problems(
            school_level=school_level,
            grade_level=attrs.get("grade_level", getattr(self.instance, "grade_level", None)),
            strand=attrs.get("strand", getattr(self.instance, "strand", None)),
        )
        if problems:
            raise serializers.ValidationError(problems)

        # ── Duplicate active enrollment guard ──────────────────────────────────
        student = attrs.get("student", getattr(self.instance, "student", None))
        school_year = attrs.get("school_year", getattr(self.instance, "school_year", None))
        new_status = attrs.get(
            "enrollment_status",
            getattr(self.instance, "enrollment_status", "enrolled"),
        )
        if student and school_year and new_status in ("enrolled", "pending"):
            qs = Enrollment.objects.filter(
                student=student,
                school_year=school_year,
                enrollment_status__in=("enrolled", "pending"),
            )
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    "non_field_errors": [
                        f"This student already has an active or pending enrollment "
                        f"for school year {school_year}."
                    ]
                })

        # ── Grade progression + completion gate (create only) ─────────────────
        if self.instance is None and student:
            grade_level = attrs.get("grade_level")
            semester_val = attrs.get("semester")

            # Find the most recent completed enrollment
            last_completed = (
                Enrollment.objects
                .filter(student=student, enrollment_status="completed")
                .order_by("-school_year", "-enrollment_id")
                .first()
            )

            if last_completed:
                last_grade = last_completed.grade_level
                expected_next = get_next_grade_level(last_grade)
                current_idx = get_grade_index(grade_level)
                last_idx = get_grade_index(last_grade)

                # ── Strand consistency for SHS ─────────────────────────────────
                if (
                    school_level == "senior_highschool"
                    and last_completed.school_level == "senior_highschool"
                    and not progression_override
                ):
                    if attrs.get("strand") and last_completed.strand and attrs["strand"] != last_completed.strand:
                        raise serializers.ValidationError({
                            "strand": (
                                f"Strand must remain '{last_completed.strand}' (set in Grade 11). "
                                f"Use progression_override with a reason to change strands."
                            )
                        })

                # ── Block skipping or regressing grades ────────────────────────
                if not progression_override:
                    # Repeating the same grade is allowed (retention)
                    if grade_level == last_grade:
                        pass  # retention — check for SHS semester order below
                    elif grade_level == expected_next:
                        pass  # normal promotion
                    elif current_idx < last_idx:
                        raise serializers.ValidationError({
                            "grade_level": (
                                f"Cannot regress to {grade_level}. "
                                f"Student's last completed grade is {last_grade}. "
                                f"Next allowed grade is {expected_next or '(none — Grade 12 complete)'}, "
                                f"or repeat {last_grade} (retention)."
                            )
                        })
                    else:
                        raise serializers.ValidationError({
                            "grade_level": (
                                f"Cannot skip to {grade_level}. "
                                f"Student's last completed grade is {last_grade}. "
                                f"Next allowed grade is {expected_next or '(none — Grade 12 complete)'}."
                            )
                        })

                # ── SHS semester sequencing ────────────────────────────────────
                if school_level == "senior_highschool" and not progression_override:
                    if grade_level == last_grade and grade_level in ("Grade 11", "Grade 12"):
                        # Repeating same grade — allow regardless of semester
                        pass
                    elif grade_level == expected_next and last_grade == "Grade 11":
                        # Grade 11 → Grade 12: require both semesters of Grade 11 done
                        g11_semesters_done = set(
                            Enrollment.objects
                            .filter(
                                student=student,
                                grade_level="Grade 11",
                                enrollment_status="completed",
                            )
                            .values_list("semester", flat=True)
                        )
                        if not {"1st", "2nd"}.issubset(g11_semesters_done):
                            missing = {"1st", "2nd"} - g11_semesters_done
                            raise serializers.ValidationError({
                                "grade_level": (
                                    f"Cannot enroll in Grade 12 — Grade 11 "
                                    f"{', '.join(sorted(missing))} semester(s) not yet completed."
                                )
                            })
                        # A new grade opens with its 1st semester. The branch
                        # below that checked this never ran for Grade 12 --
                        # this one returns first -- so Grade 12 2nd semester
                        # could be entered straight after Grade 11.
                        if semester_val != "1st":
                            raise serializers.ValidationError({
                                "semester": "Grade 12 starts with its 1st semester.",
                            })
                    elif semester_val == "2nd":
                        # Enrolling in 2nd sem: last completed must be 1st sem of same grade
                        first_sem_done = Enrollment.objects.filter(
                            student=student,
                            grade_level=grade_level,
                            semester="1st",
                            enrollment_status="completed",
                        ).exists()
                        if not first_sem_done:
                            raise serializers.ValidationError({
                                "semester": (
                                    f"Cannot enroll in {grade_level} 2nd Semester — "
                                    f"1st Semester of {grade_level} has not been completed."
                                )
                            })

                # ── Moving up is judged the way Promote judges it ──────────────
                # On the YEAR, per learning area, over both Grade 11 semesters,
                # and "no grades recorded" is not a pass -- enrollments.promotion
                # is the one answer, so a learner can't be refused by Promote
                # and let through here, or the reverse.
                if not progression_override and grade_level != last_grade:
                    from .promotion import SKIP_NO_GRADES, assess

                    year_grades = list(promotion_grades(last_completed))
                    _avg, skip = assess(
                        year_grades,
                        from_grade_level=last_grade,
                        to_school_year=school_year,
                        # The semester sequencing above already requires both.
                        first_semester_done=True,
                    )
                    if skip and skip["kind"] == SKIP_NO_GRADES:
                        raise serializers.ValidationError({
                            "grade_level": (
                                f"Cannot promote from {last_grade} — no final grades are "
                                f"recorded for it. Record the grades, repeat {last_grade}, "
                                f"or use admin override."
                            )
                        })
                    if skip:
                        # Each with its year average, so the message shows why.
                        names = ", ".join(
                            f"{o['subject'].subject_name} "
                            f"({o['average'] if o['average'] is not None else o['remarks']})"
                            for o in blocking_subjects(year_grades)
                        )
                        raise serializers.ValidationError({
                            "grade_level": (
                                f"Cannot promote from {last_grade} — student has "
                                f"failed/incomplete subjects: {names}. "
                                f"Student must repeat {last_grade} or use admin override."
                            )
                        })

        # ── Document completeness gate ─────────────────────────────────────────
        # Fires on two paths:
        #   1. PATCH: pending → enrolled transition
        #   2. POST:  direct creation with enrollment_status="enrolled"
        old_status = getattr(self.instance, "enrollment_status", None)
        direct_enrolled_creation = self.instance is None and new_status == "enrolled"
        pending_to_enrolled_patch = (
            self.instance is not None
            and old_status == "pending"
            and new_status == "enrolled"
        )
        if (direct_enrolled_creation or pending_to_enrolled_patch) and student:
            from requirements.models import RequirementType, StudentRequirementSubmission
            from requirements.rules import derive_entry_status, missing_required

            # Which documents this learner owes depends on where they are being
            # placed and how they got here — not on the whole catalogue. See
            # requirements/rules.py; before that, every active type was demanded
            # of everyone, so a Grade 1 entrant was asked for a Form 137.
            #
            # grade_level cannot be read from the block above: that one defines
            # it inside `if self.instance is None`, so it does not exist on the
            # PATCH path. Same fallback shape as school_level near the top.
            grade_level_val = attrs.get(
                "grade_level", getattr(self.instance, "grade_level", None)
            )
            school_level_val = attrs.get(
                "school_level", getattr(self.instance, "school_level", None)
            )

            # EXCLUDING the row being validated. On a pending → enrolled
            # activation the row already exists, so counting it would classify
            # every activation as "continuing" and silently switch off the
            # transferee rules on the exact path this gate exists for.
            #
            # And only rows the learner actually attended: a cancelled
            # application is not a year spent here, and counting it made a
            # Grade 7 walk-in "continuing", owing neither Good Moral nor Form 137.
            prior = Enrollment.objects.filter(
                student=student, enrollment_status__in=ATTENDED_STATUSES,
            )
            if self.instance is not None:
                prior = prior.exclude(pk=self.instance.pk)

            entry_status = derive_entry_status(
                has_prior_enrollment=prior.exists(),
                is_transfer_in=is_transfer_in,
                grade_level=grade_level_val,
            )

            submitted_ids = set(
                StudentRequirementSubmission.objects
                .filter(student_id=student.student_id, is_submitted=True)
                .values_list("requirement_type_id", flat=True)
            )
            missing = missing_required(
                RequirementType.objects.filter(is_active=True),
                submitted_ids,
                school_level=school_level_val,
                entry_status=entry_status,
            )
            if missing:
                names = sorted(rt.requirement_name for rt in missing)
                raise serializers.ValidationError({
                    "enrollment_status": (
                        f"Cannot activate enrollment — this learner is a "
                        f"{entry_status} in {school_level_val or 'an unset school level'}, "
                        f"and these required documents are missing: "
                        f"{', '.join(names)}."
                    )
                })

        # ── Grade placement change guard on UPDATE ─────────────────────────────
        if self.instance is not None:
            # school_year included: moving a row to another year re-files its
            # grades, attendance and invoice under that year, and it used to go
            # through with no reason and no trace.
            PLACEMENT_FIELDS = ("school_year", "grade_level", "school_level", "strand", "semester")
            changed = [
                f for f in PLACEMENT_FIELDS
                if f in attrs and attrs[f] != getattr(self.instance, f, None)
            ]
            if changed and not progression_override:
                raise serializers.ValidationError({
                    "non_field_errors": [
                        "Placement fields (school_year, grade_level, school_level, strand, semester) "
                        "cannot be changed on an existing enrollment without admin override. "
                        "Send progression_override=true with a progression_override_reason."
                    ]
                })
            if changed and not progression_override_reason.strip():
                raise serializers.ValidationError({
                    "progression_override_reason": (
                        "A reason is required when changing grade placement on an existing enrollment."
                    )
                })

        # Carry override data forward for the view layer to create the audit record
        self._progression_override = progression_override
        self._progression_override_reason = progression_override_reason

        return attrs