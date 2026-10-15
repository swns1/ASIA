from rest_framework import serializers

from .summaries import MAX_TEXT_CHARS, clean_text


class SummaryEditSerializer(serializers.Serializer):
    """The owner's own version of a summary. Blank puts the AI's back."""

    text = serializers.CharField(
        allow_blank=True, trim_whitespace=False, max_length=MAX_TEXT_CHARS,
    )

    def validate_text(self, value):
        try:
            return clean_text(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from None


class SummaryShareSerializer(serializers.Serializer):
    """True publishes the current version to staff; false withdraws it."""

    shared = serializers.BooleanField()
