from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
import jwt
from django.conf import settings


class JWTStatelessUser:
    """A lightweight user object built from JWT claims — no DB lookup."""
    def __init__(self, payload):
        self.payload = payload
        self.user_id = payload.get("user_id")
        self.is_authenticated = True

    def __str__(self):
        return f"JWTUser(user_id={self.user_id})"


class StatelessJWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None

        token = auth_header.split(" ")[1]

        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=["HS256"],
            )
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed("Token has expired.")
        except jwt.InvalidTokenError:
            raise AuthenticationFailed("Invalid token.")

        user = JWTStatelessUser(payload)
        return (user, token)