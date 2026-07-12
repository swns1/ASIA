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


def stamp_session_id(user_id, session_id):
    """
    Marks `session_id` as the user's one valid session, superseding any
    previous login. A filtered update (not user.save()) so it works
    regardless of whether the caller holds a full model instance.
    """
    User.objects.filter(user_id=user_id).update(current_session_id=session_id)