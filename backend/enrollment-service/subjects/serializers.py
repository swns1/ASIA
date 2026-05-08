from rest_framework import serializers
from .models import Subject


class SubjectSerializer(serializers.ModelSerializer):
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
        )
        read_only_fields = ("subject_id",)

    def validate(self, attrs):
        """
        Mirrors schema CHECK:
          (school_level = 'senior_highschool' AND semester IN ('1st','2nd'))
          OR (school_level <> 'senior_highschool' AND semester IS NULL)
        """
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
