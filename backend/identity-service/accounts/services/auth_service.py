from accounts.models import User
from django.contrib.auth.hashers import check_password

def find_user(identifier, password):
    identifier = identifier.strip()

    user = User.objects.filter(email__iexact=identifier).first()
    if not user:
        user = User.objects.filter(name__iexact=identifier).first()
    if not user:
        return None, "User not found."

    if not check_password(password, user.password):
        return None, "Invalid credentials."

    return user, None