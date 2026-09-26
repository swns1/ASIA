from decimal import Decimal
from rest_framework import serializers

from enrollments.models import Enrollment
from enrollments.rules import ATTENDED_STATUSES
from grading.deped import HIGHEST_TRANSMUTED_GRADE, LOWEST_TRANSMUTED_GRADE, PASSING_GRADE
from subjects.models import Subject
from .models import Grade, NarrativeCategory, NarrativeReport


SHS_PERIODS     = {"1st_semester", "2nd_semester"}
NON_SHS_PERIODS = {"1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"}


def period_problem(enrollment, period):
    """
    Why `period` can't be recorded on `enrollment`, or None.

    Shared by grades, observed values and score entries: the last two took any
    text (a DB CHECK then answered 500), and none of them matched a senior
    high period to the enrollment's semester -- each semester is its own
    enrollment row, so a 2nd-semester grade on the 1st-semester row is filed
    under the wrong half of the year.
    """
    if period is None:
        return "Required."
    if enrollment.school_level == "senior_highschool":
        if period not in SHS_PERIODS:
            return "Senior HS enrollments only accept '1st_semester' or '2nd_semester'."
        if enrollment.semester and period != f"{enrollment.semester}_semester":
            return (
                f"This is the learner's {enrollment.semester} semester enrollment, "
                f"so it takes '{enrollment.semester}_semester' only."
            )
        return None
    if period not in NON_SHS_PERIODS:
        return f"{enrollment.school_level} enrollments only accept '1st_quarter' through '4th_quarter'."
    return None


def attended_problem(enrollment, what):
    """Records belong on an enrollment the learner actually attended."""
    if enrollment.enrollment_status in ATTENDED_STATUSES:
        return None
    return (
        f"{what} can only be recorded on an enrollment the learner attended; "
        f"this one is {enrollment.enrollment_status}."
    )


class GradeSerializer(serializers.ModelSerializer):
    enrollment = serializers.PrimaryKeyRelatedField(queryset=Enrollment.objects.all())
    subject    = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())

    enrollment_detail = serializers.SerializerMethodField(read_only=True)
    subject_detail    = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Grade
        fields = (
            "grade_id", "enrollment", "subject",
            "enrollment_detail", "subject_detail",
            "grading_period", "numeric_grade", "remarks", "recorded_at",
        )
        read_only_fields = ("grade_id", "recorded_at")

    def get_enrollment_detail(self, obj):
        e = obj.enrollment
        return {
            "enrollment_id": e.enrollment_id, "student_id": e.student_id,
            "school_year": e.school_year, "school_level": e.school_level,
            "grade_level": e.grade_level, "section": e.section,
        }

    def get_subject_detail(self, obj):
        s = obj.subject
        return {"subject_id": s.subject_id, "subject_code": s.subject_code, "subject_name": s.subject_name}

    def validate_numeric_grade(self, value):
        """
        This column holds a DO 8 s.2015 TRANSMUTED grade -- the number that
        goes on the report card and on SF9/SF10 -- so the floor is 60, not 0.

        The range used to be 0-100, which let an untransmuted score through on
        any path that did not go via the grading calculator. The section
        quick-entry grid on My Sections is exactly such a path: it posts
        whatever the teacher types. So a learner could still be recorded as 40
        -- the precise defect grading/deped.py was written to end, and which
        its docstring already describes as fixed. Enforcing the floor here
        rather than in one of the two clients is what actually makes that
        true, since both write to this serializer.

        Note this does NOT transmute for the caller: transmuting an
        already-transmuted grade moves it again (84 -> 90), so the conversion
        has to stay with whoever holds the raw component scores.
        """
        if value is None:
            raise serializers.ValidationError("Required.")
        lo, hi = LOWEST_TRANSMUTED_GRADE, HIGHEST_TRANSMUTED_GRADE
        if value < Decimal(lo) or value > Decimal(hi):
            raise serializers.ValidationError(
                f"Numeric grade must be a transmuted grade between {lo} and {hi} "
                f"(DepEd Order 8 s.2015). Got {value}. If this is a raw score, "
                f"compute it in the grading calculator first."
            )
        return value

    def validate(self, attrs):
        enrollment = attrs.get("enrollment", getattr(self.instance, "enrollment", None))
        period     = attrs.get("grading_period", getattr(self.instance, "grading_period", None))
        subject    = attrs.get("subject", getattr(self.instance, "subject", None))

        if enrollment is None:
            raise serializers.ValidationError({"enrollment": "Required."})

        # A cancelled or never-started enrollment has no class to be graded in.
        problem = attended_problem(enrollment, "Grades")
        if problem:
            raise serializers.ValidationError({"enrollment": problem})
        problem = period_problem(enrollment, period)
        if problem:
            raise serializers.ValidationError({"grading_period": problem})

        if subject and subject.school_level != enrollment.school_level:
            raise serializers.ValidationError({"subject": f"Subject is for {subject.school_level} but enrollment is for {enrollment.school_level}."})
        if subject and subject.grade_level != enrollment.grade_level:
            raise serializers.ValidationError({"subject": f"Subject '{subject.subject_name}' is tagged for {subject.grade_level}, but this enrollment is {enrollment.grade_level}."})
        if subject and enrollment.school_level == "senior_highschool":
            if subject.semester and enrollment.semester and subject.semester != enrollment.semester:
                raise serializers.ValidationError({"subject": f"'{subject.subject_name}' is a {subject.semester} semester subject; this is the learner's {enrollment.semester} semester."})
            if subject.strand and enrollment.strand and subject.strand != enrollment.strand:
                raise serializers.ValidationError({"subject": f"'{subject.subject_name}' is a {subject.strand} subject; this learner is in {enrollment.strand}."})

        qs = Grade.objects.filter(enrollment=enrollment, subject=subject, grading_period=period)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({"non_field_errors": ["A grade for this enrollment, subject, and period already exists."]})

        # Passed or failed follows from the grade itself -- a 70 marked
        # "passed" printed that way on the report card. Only incomplete and
        # dropped say something a number can't, so those stand as entered.
        remarks = attrs.get("remarks", getattr(self.instance, "remarks", None))
        numeric = attrs.get("numeric_grade", getattr(self.instance, "numeric_grade", None))
        if remarks not in ("incomplete", "dropped") and numeric is not None:
            attrs["remarks"] = "passed" if numeric >= PASSING_GRADE else "failed"

        return attrs


class NarrativeCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model  = NarrativeCategory
        fields = ("category_id", "name", "description", "sort_order", "is_active")


class NarrativeReportSerializer(serializers.ModelSerializer):
    enrollment      = serializers.PrimaryKeyRelatedField(queryset=Enrollment.objects.all())
    category        = serializers.PrimaryKeyRelatedField(queryset=NarrativeCategory.objects.all())
    category_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model  = NarrativeReport
        fields = (
            "report_id", "enrollment", "category", "category_detail",
            "grading_period", "rating", "recorded_at",
        )
        read_only_fields = ("report_id", "recorded_at")

    def get_category_detail(self, obj):
        c = obj.category
        return {"category_id": c.category_id, "name": c.name, "sort_order": c.sort_order}

    def validate_rating(self, value):
        # Derived from the model rather than restated here. This allowlist was
        # hardcoded to the three legacy prototype ratings, which meant the
        # DepEd Order No. 8 marks (AO/SO/RO/NO) — the vocabulary the model
        # declares, the report card prints, the seed data uses, and
        # ai.services.NARRATIVE_SCORE scores — could not be written through
        # any endpoint. A teacher filling in the Observed Values section got a
        # 400 for entering the only marks the form actually has.
        valid = {choice for choice, _label in NarrativeReport.RATING_CHOICES}
        if value not in valid:
            raise serializers.ValidationError(f"Must be one of: {', '.join(sorted(valid))}.")
        return value

    def validate(self, attrs):
        enrollment = attrs.get("enrollment", getattr(self.instance, "enrollment", None))
        category   = attrs.get("category",   getattr(self.instance, "category",   None))
        period     = attrs.get("grading_period", getattr(self.instance, "grading_period", None))

        if enrollment is not None:
            problem = attended_problem(enrollment, "Observed values")
            if problem:
                raise serializers.ValidationError({"enrollment": problem})
            problem = period_problem(enrollment, period)
            if problem:
                raise serializers.ValidationError({"grading_period": problem})

        qs = NarrativeReport.objects.filter(enrollment=enrollment, category=category, grading_period=period)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({"non_field_errors": ["A narrative report for this enrollment, category, and period already exists."]})
        return attrs