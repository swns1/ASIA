from rest_framework import serializers

from .models import AuditLog
from .services.auth_service import find_user


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True)
    remember_me = serializers.BooleanField(default=True)

    def validate(self, attrs):
        identifier = attrs.get("identifier", "").strip()
        password = attrs.get("password", "")

        if not identifier or not password:
            raise serializers.ValidationError("Identifier and password are required.")

        user, error = find_user(identifier, password)
        if error:
            raise serializers.ValidationError(error)

        attrs["user"] = user
        return attrs


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = (
            "log_id",
            "user_id",
            "user_name",
            "user_role",
            "action",
            "module",
            "occurred_at",
            "status",
            "details",
            "ip_address",
            "metadata",
        )