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

        user = User.objects.filter(email__iexact=username).first()
        if not user:
            user = User.objects.filter(name__iexact=username).first()
        if not user:
            return None

        if not check_password(password, user.password):
            return None

        return user

    def get_user(self, user_id):
        return User.objects.filter(pk=user_id).first()
