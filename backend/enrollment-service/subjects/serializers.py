from rest_framework import serializers
from .models import Subject


class SubjectSerializer(serializers.ModelSerializer):
    grading_template_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Subject
        fields = (
            "subject_id",
            "school_year",
            "subject_code",
            "subject_name",
            "school_level",
            "grade_level",
            "strand",
            "semester",
            "grading_template",
            "grading_template_detail",
        )
        read_only_fields = ("subject_id",)
        # One code per year, checked in validate() with a message that names
        # the year; DRF's own would say "must make a unique set".
        validators = []

    def get_grading_template_detail(self, obj):
        if not obj.grading_template:
            return None
        t = obj.grading_template
        components = t.components.all().order_by("sort_order")
        return {
            "grading_template_id": t.grading_template_id,
            "template_name": t.template_name,
            "description": t.description,
            "school_level": t.school_level,
            "is_active": t.is_active,
            "components": [
                {
                    "grading_component_id": c.grading_component_id,
                    "component_name": c.component_name,
                    "weight": float(c.weight),
                    "sort_order": c.sort_order,
                }
                for c in components
            ],
            "total_weight": float(sum(c.weight for c in components)),
        }

    def validate(self, attrs):
        attrs = self._validate_year_and_code(attrs)
        school_level = attrs.get("school_level", getattr(self.instance, "school_level", None))
        semester     = attrs.get("semester",     getattr(self.instance, "semester", None))

        if semester == "":
            semester = None
            attrs["semester"] = None
        if attrs.get("strand") == "":
            attrs["strand"] = None

        if school_level == "senior_highschool":
            if semester not in ("1st", "2nd"):
                raise serializers.ValidationError({
                    "semester": "Senior HS subjects require semester '1st' or '2nd'."
                })
        else:
            if semester is not None:
                raise serializers.ValidationError({
                    "semester": f"Semester must be empty for {school_level} subjects."
                })

        return attrs

    def _validate_year_and_code(self, attrs):
        """
        A subject stays in the year it was made for -- its grades are that
        year's -- so the year is set once, to a registered year. Archived
        years are refused by the viewset (ArchivedYearGuard), with the rest
        of the archive's 409s.
        """
        from enrollments.models import SchoolYear

        if self.instance is not None:
            if "school_year" in attrs and attrs["school_year"] != self.instance.school_year:
                raise serializers.ValidationError(
                    {"school_year": "A subject stays in its school year. Add it to the other year instead."}
                )
            year = self.instance.school_year
        else:
            year = (attrs.get("school_year") or "").strip()
            if not year:
                raise serializers.ValidationError({"school_year": "Pick the school year this subject is for."})
            if not SchoolYear.objects.filter(label=year).exists():
                raise serializers.ValidationError(
                    {"school_year": f"S.Y. {year} hasn't been set up yet. An admin can add it under School Years."}
                )
            attrs["school_year"] = year

        code = attrs.get("subject_code")
        if code is not None:
            code = code.strip()
            attrs["subject_code"] = code
            clash = Subject.objects.filter(school_year=year, subject_code__iexact=code)
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    {"subject_code": f"S.Y. {year} already has a subject coded {code}."}
                )
        return attrs
