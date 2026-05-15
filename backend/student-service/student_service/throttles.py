from rest_framework.throttling import SimpleRateThrottle

class StatelessUserRateThrottle(SimpleRateThrottle):
    """
    UserRateThrottle replacement for StatelessJWTAuthentication.
    JWTStatelessUser has no .pk — use user_id from the JWT payload instead.
    """
    scope = "user"

    def get_cache_key(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return None  # let AnonRateThrottle handle unauthenticated

        # StatelessJWTAuthentication stores user_id on the user object
        uid = getattr(user, "user_id", None) or getattr(user, "id", None)
        if not uid:
            return None

        return self.cache_format % {
            "scope": self.scope,
            "ident": uid,
        }