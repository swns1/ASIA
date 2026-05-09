from rest_framework import serializers
from .models import Subject


class SubjectSerializer(serializers.ModelSerializer):
    grading_template_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Subject
        fields = (
            "subject_id",
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