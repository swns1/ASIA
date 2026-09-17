from rest_framework.throttling import SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    """
    At most N *failed* sign-ins per client address per window (the "login"
    rate).

    It used to count every attempt, successful or not, which capped a whole
    building: a hosted SLIS sees one public address for everyone on a
    school's network (mobile carriers also share addresses between many
    subscribers), so the eleventh person to sign in within a minute -- staff
    arriving in the morning, parents at an orientation -- was turned away.
    Counting only failures keeps what the limit is for, slowing password
    guessing across many accounts from one address, while a correct
    password costs nothing. Guessing at one account is django-axes' job
    (AXES_LOCKOUT_PARAMETERS in settings.py).

    allow_request() only reads the count; LoginView calls record_failure()
    once it knows the credentials were wrong.
    """

    scope = "login"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}

    def _recent(self, key):
        return [t for t in self.cache.get(key, []) if t > self.now - self.duration]

    def allow_request(self, request, view):
        if self.rate is None:
            return True
        self.key = self.get_cache_key(request, view)
        self.now = self.timer()
        # wait() reads self.history (newest first) to compute Retry-After.
        self.history = self._recent(self.key)
        if len(self.history) >= self.num_requests:
            return self.throttle_failure()
        return True

    @classmethod
    def record_failure(cls, request, view):
        throttle = cls()
        if throttle.rate is None:
            return
        key = throttle.get_cache_key(request, view)
        throttle.now = throttle.timer()
        history = throttle._recent(key)
        history.insert(0, throttle.now)
        throttle.cache.set(key, history, throttle.duration)
