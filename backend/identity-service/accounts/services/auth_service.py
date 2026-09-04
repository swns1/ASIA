from accounts.models import User

# Credential verification used to live here (find_user()), called directly
# from LoginSerializer. It now goes through django.contrib.auth.authenticate()
# instead, via accounts.auth_backends.IdentityUserBackend -- see that
# module's docstring for why: axes' brute-force lockout only engages when a
# login travels through authenticate(), and find_user() bypassed it entirely.


def stamp_session_id(user_id, session_id):
    """
    Marks `session_id` as the user's one valid session, superseding any
    previous login. A filtered update (not user.save()) so it works
    regardless of whether the caller holds a full model instance.
    """
    User.objects.filter(user_id=user_id).update(current_session_id=session_id)