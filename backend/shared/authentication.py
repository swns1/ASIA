from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class SingleSessionJWTAuthentication(JWTAuthentication):
    """
    Enforces single-active-session-per-user: a token's `sid` claim must
    match the user's current_session_id (stamped by identity-service on
    login). A mismatch means this token was superseded by a later login on
    another client — reject it the same way an expired token would be
    rejected, so the client's existing 401 handling covers it.

    Used by student-service, billing-service and enrollment-service (each
    has its own accounts.User with AUTH_USER_MODEL set, so JWTAuthentication
    can populate request.user normally here). identity-service is the one
    exception: it has no AUTH_USER_MODEL and resolves the caller by hand via
    accounts.audit.resolve_user_from_request() instead, which performs the
    equivalent sid/current_session_id check itself -- see that function and
    accounts.permissions.HasRole's docstring in identity-service.
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        sid = validated_token.get("sid")
        if not sid or not user.current_session_id or str(user.current_session_id) != str(sid):
            raise AuthenticationFailed("Session no longer active.", code="session_invalidated")
        return user
