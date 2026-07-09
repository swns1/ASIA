from rest_framework.throttling import SimpleRateThrottle

class StatelessUserRateThrottle(SimpleRateThrottle):
    """
    UserRateThrottle variant keyed off `user_id` (the accounts.User pk field
    name) rather than DRF's default `.pk`-based cache key.
    """
    scope = "user"

    def get_cache_key(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return None  # let AnonRateThrottle handle unauthenticated

        uid = getattr(user, "user_id", None) or getattr(user, "id", None)
        if not uid:
            return None

        return self.cache_format % {
            "scope": self.scope,
            "ident": uid,
        }