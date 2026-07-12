from rest_framework.authentication import BaseAuthentication


class NoOpAuthentication(BaseAuthentication):
    """
    Never authenticates -- accounts.permissions.HasRole resolves the caller
    by hand via resolve_user_from_request() instead (see its docstring for
    why: this service has no AUTH_USER_MODEL wired up, so the real
    JWTAuthentication would crash).

    Exists purely so DRF sees a non-empty `authenticate_header()`. Without
    any authenticator at all (authentication_classes = []),
    APIView.handle_exception() silently rewrites a raised NotAuthenticated
    (401) into 403, because it can't offer a WWW-Authenticate header --
    see DRF's handle_exception(): `if auth_header: ... else: exc.status_code
    = 403`. Registering this authenticator (which never actually resolves a
    user) keeps that header present so 401 stays 401.
    """

    def authenticate(self, request):
        return None  # No DRF-level authentication; HasRole does it manually.

    def authenticate_header(self, request):
        return "Bearer"
