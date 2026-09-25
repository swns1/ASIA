"""
Authentication backend for identity-service's own `users` table.

Needed because Django's built-in ModelBackend expects settings.AUTH_USER_MODEL,
which identity-service deliberately does not set -- see accounts/permissions.py's
HasRole docstring: every other view in this service resolves the caller by hand
via resolve_user_from_request() instead of request.user. Login is the one place
that has to go through Django's real authenticate() function rather than a
bespoke lookup, because django-axes' lockout tracking (AUTHENTICATION_BACKENDS,
AXES_* in settings.py) only engages when a request travels through
authenticate() -- see the note on LoginSerializer.validate() in serializers.py.
"""
from django.contrib.auth.backends import BaseBackend
from django.contrib.auth.hashers import check_password

from .models import User

MAX_NAME_MATCHES = 5


class IdentityUserBackend(BaseBackend):
    """
    Looks up accounts.User by email, falling back to a case-insensitive name
    match (the login form accepts either) -- the same two-step lookup
    services/auth_service.py used to do by hand before this existed.

    `username` is Django's conventional kwarg name for the first credential,
    not a claim that this app has literal usernames -- axes.helpers.get_credentials
    reads AXES_USERNAME_FORM_FIELD (defaults to "username") to key its lockout
    tracking, so this backend and the authenticate() call in serializers.py
    both use that exact name to keep axes correctly wired in.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None

        # Email is unique, so a match there is the account.
        user = User.objects.filter(email__iexact=username).first()
        if user:
            if not check_password(password, user.password):
                return None
            return self._active_or_none(request, user)

        # Display names are not unique -- two guardians named "Maria Santos"
        # is ordinary, and guardian accounts are created from guardian names.
        # This used to take the first name match and test the password only
        # against it, so the second Maria could never sign in by name even
        # with her own correct password. Now the password picks the account:
        # it signs in when exactly one account with this name has it. The
        # same password on two of them is ambiguous, and neither signs in --
        # the email still works. Capped so a very common name can't turn one
        # request into dozens of password hashes.
        candidates = User.objects.filter(name__iexact=username)[:MAX_NAME_MATCHES]
        matches = [u for u in candidates if check_password(password, u.password)]
        return self._active_or_none(request, matches[0]) if len(matches) == 1 else None

    @staticmethod
    def _active_or_none(request, user):
        """
        A deactivated account doesn't sign in. Only reached once the password
        has matched, so flagging it on the request (LoginSerializer turns it
        into "this account has been deactivated") tells nothing to someone
        who doesn't already know the password.
        """
        if getattr(user, "is_active", True):
            return user
        if request is not None:
            request.slis_account_deactivated = True
        return None

    def get_user(self, user_id):
        return User.objects.filter(pk=user_id).first()
