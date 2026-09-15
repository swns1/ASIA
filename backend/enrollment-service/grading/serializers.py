from decimal import Decimal

from rest_framework import serializers
from .models import GradingTemplate, GradingComponent, ScoreEntry


class GradingComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradingComponent
        fields = (
            "grading_component_id",
            "grading_template",
            "component_name",
            "weight",
            "sort_order",
        )
        read_only_fields = ("grading_component_id",)

    def validate(self, attrs):
        """
        A template's component weights must total 100.

        GradingSettingsPage enforces this before saving, but that was the only
        check -- a direct POST could build a 250% template, and every grade
        computed from it would be silently wrong. The DB constraint only bounds
        each individual weight to (0, 100].
        """
        template = attrs.get("grading_template") or getattr(
            self.instance, "grading_template", None
        )
        weight = attrs.get("weight", getattr(self.instance, "weight", None))
        if template is None or weight is None:
            return attrs

        siblings = GradingComponent.objects.filter(grading_template=template)
        if self.instance is not None:
            siblings = siblings.exclude(pk=self.instance.pk)

        total = sum(Decimal(str(c.weight)) for c in siblings) + Decimal(str(weight))
        if total > Decimal("100"):
            raise serializers.ValidationError(
                {
                    "weight": (
                        f"Component weights for this template would total {total}%. "
                        f"They must not exceed 100%."
                    )
                }
            )
        return attrs


class GradingTemplateSerializer(serializers.ModelSerializer):
    components = GradingComponentSerializer(many=True, read_only=True)
    total_weight = serializers.SerializerMethodField()

    class Meta:
        model = GradingTemplate
        fields = (
            "grading_template_id",
            "template_name",
            "description",
            "school_level",
            "is_active",
            "created_at",
            "components",
            "total_weight",
        )
        read_only_fields = ("grading_template_id", "created_at")

    def get_total_weight(self, obj):
        return float(sum(c.weight for c in obj.components.all()))


class ScoreEntrySerializer(serializers.ModelSerializer):
    percentage = serializers.SerializerMethodField()
    component_name = serializers.CharField(
        source="grading_component.component_name", read_only=True
    )

    class Meta:
        model = ScoreEntry
        fields = (
            "score_entry_id",
            "enrollment",
            "subject",
            "grading_component",
            "component_name",
            "grading_period",
            "label",
            "score",
            "max_score",
            "percentage",
            "recorded_at",
        )
        read_only_fields = ("score_entry_id", "recorded_at")

    def get_percentage(self, obj):
        if obj.max_score and obj.max_score > 0:
            return round(float(obj.score) / float(obj.max_score) * 100, 2)
        return 0

    def validate(self, attrs):
        score = attrs.get("score", getattr(self.instance, "score", 0))
        max_score = attrs.get("max_score", getattr(self.instance, "max_score", 1))
        if score > max_score:
            raise serializers.ValidationError(
                {"score": "Score cannot exceed max_score."}
            )
        return attrs