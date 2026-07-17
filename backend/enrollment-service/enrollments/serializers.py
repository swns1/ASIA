from rest_framework import serializers
from .models import Enrollment, EnrollmentTransfer, SectionAdvisory, Student


class SectionAdvisorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SectionAdvisory
        fields = (
            "advisory_id", "teacher_user_id", "school_year",
            "school_level", "grade_level", "section", "strand",
            "created_at",
        )
        read_only_fields = ("advisory_id", "created_at")


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
GRADE_ORDER = [
    "Nursery", "Kindergarten",
    "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
    "Grade 7", "Grade 8", "Grade 9", "Grade 10",
    "Grade 11", "Grade 12",
]


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
        )

    def get_full_name(self, obj):
        parts = [obj.first_name, obj.middle_name, obj.last_name, obj.suffix]
        return " ".join(p for p in parts if p)


class EnrollmentSerializer(serializers.ModelSerializer):
    student_detail = StudentSummarySerializer(source="student", read_only=True)
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    student_id = serializers.IntegerField(source="student.student_id", read_only=True)
    student_name = serializers.SerializerMethodField()

    # Write-only override fields — consumed during validation, never stored on Enrollment
    progression_override = serializers.BooleanField(write_only=True, required=False, default=False)
    progression_override_reason = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )

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
        )
        read_only_fields = ("enrollment_id",)

    def get_student_name(self, obj):
        s = obj.student
        if not s:
            return None
        parts = [s.first_name, s.middle_name, s.last_name, s.suffix]
        return " ".join(p for p in parts if p)

    def validate(self, attrs):
        # ── Pull override flags before any other check ─────────────────────────
        progression_override = attrs.pop("progression_override", False)
        progression_override_reason = attrs.pop("progression_override_reason", "")

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
            if attrs.get("strand") == "":
                attrs["strand"] = None

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
            from grades.models import Grade

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
                last_semester = last_completed.semester
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
                    elif grade_level == last_grade and semester_val == "2nd" and last_semester == "2nd":
                        raise serializers.ValidationError({
                            "semester": (
                                f"Student already completed Grade {grade_level} 2nd semester."
                            )
                        })
                    elif grade_level == last_grade and semester_val == "1st" and last_semester == "1st":
                        # Repeating 1st sem of same grade — allowed (retention)
                        pass
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

                # ── Failed/incomplete subjects block promotion ─────────────────
                if not progression_override and grade_level != last_grade:
                    failed = Grade.objects.filter(
                        enrollment=last_completed,
                        remarks__in=["failed", "incomplete"],
                    ).select_related("subject")
                    if failed.exists():
                        names = ", ".join(
                            g.subject.subject_name for g in failed
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

            active_req_ids = set(
                RequirementType.objects.filter(is_active=True)
                .values_list("requirement_type_id", flat=True)
            )
            submitted_ids = set(
                StudentRequirementSubmission.objects
                .filter(student_id=student.student_id, is_submitted=True)
                .values_list("requirement_type_id", flat=True)
            )
            missing_ids = active_req_ids - submitted_ids
            if missing_ids:
                missing_names = list(
                    RequirementType.objects
                    .filter(requirement_type_id__in=missing_ids)
                    .values_list("requirement_name", flat=True)
                )
                raise serializers.ValidationError({
                    "enrollment_status": (
                        f"Cannot activate enrollment — missing required documents: "
                        f"{', '.join(sorted(missing_names))}."
                    )
                })

        # ── Grade placement change guard on UPDATE ─────────────────────────────
        if self.instance is not None:
            PLACEMENT_FIELDS = ("grade_level", "school_level", "strand", "semester")
            changed = [
                f for f in PLACEMENT_FIELDS
                if f in attrs and attrs[f] != getattr(self.instance, f, None)
            ]
            if changed and not progression_override:
                raise serializers.ValidationError({
                    "non_field_errors": [
                        "Grade placement fields (grade_level, school_level, strand, semester) "
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