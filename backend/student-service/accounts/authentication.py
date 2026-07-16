from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class SingleSessionJWTAuthentication(JWTAuthentication):
    """
    Enforces single-active-session-per-user: a token's `sid` claim must
    match the user's current_session_id (stamped by identity-service on
    login). A mismatch means this token was superseded by a later login on
    another client — reject it the same way an expired token would be
    rejected, so the client's existing 401 handling covers it.
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        sid = validated_token.get("sid")
        if not sid or not user.current_session_id or str(user.current_session_id) != str(sid):
            raise AuthenticationFailed("Session no longer active.", code="session_invalidated")
        return user
