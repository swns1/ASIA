import base64
import binascii
import re
import uuid

from axes.helpers import get_client_ip_address
from axes.utils import reset as axes_reset
from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import IntegrityError
from django.db.models import Count, Q
from django.utils.dateparse import parse_date, parse_time
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .audit import (
    ADMIN_ROLES,
    SUPER_ADMIN_ROLES,
    is_audit_admin,
    is_super_admin,
    record_audit_event,
    resolve_user_from_request,
)
from .authentication import NoOpAuthentication
from .models import AuditLog, User, VALID_ROLES
from .permissions import HasRole
from .serializers import LoginSerializer, AuditLogSerializer, UserSerializer
from .services.auth_service import stamp_session_id
from .throttles import LoginRateThrottle, SessionRateThrottle

MAX_IMAGE_BYTES = 2 * 1024 * 1024  # 2 MB

# The column widths (users.name varchar(100), users.email varchar(150)).
# Checked up front: past them the INSERT/UPDATE failed with a DataError, and
# the user saw "Something went wrong on the server" instead of which field.
NAME_MAX_LENGTH = User._meta.get_field("name").max_length
EMAIL_MAX_LENGTH = User._meta.get_field("email").max_length

# What a registrar may see of the user list: the accounts behind the two
# pickers they use it for (class advisers, guardian portal accounts). The
# admin accounts, and everyone's photos, are none of their business.
REGISTRAR_VISIBLE_ROLES = {"teacher", "guardian"}


def _name_error(name):
    if not name:
        return "Name cannot be empty."
    if len(name) > NAME_MAX_LENGTH:
        return f"Name must be {NAME_MAX_LENGTH} characters or fewer."
    return None


def _email_error(email):
    """Accounts are signed into by email, so a typo here locks the person out."""
    if not email:
        return "Email cannot be empty."
    if len(email) > EMAIL_MAX_LENGTH:
        return f"Email must be {EMAIL_MAX_LENGTH} characters or fewer."
    try:
        validate_email(email)
    except DjangoValidationError:
        return "Enter a valid email address."
    return None


def _field_error(field, message):
    # `detail` for the form-level alert, the field key for the inline one
    # (see the frontend's apiError.fieldErrorsFrom).
    return Response({"detail": message, field: [message]}, status=400)


def _user_payload(user):
    return {
        "id": user.user_id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "profile_picture": user.profile_picture,
    }


def _session_user_from_refresh_cookie(request):
    """
    The user whose *current* session the refresh cookie belongs to, or None.

    A cookie from a superseded session (the user has since signed in
    somewhere else) resolves to None, same as an invalid one.
    """
    raw = request.COOKIES.get("refresh")
    if not raw:
        return None
    try:
        refresh = RefreshToken(raw)
    except TokenError:
        return None
    sid = refresh.get("sid")
    user = User.objects.filter(user_id=refresh.get("user_id")).first()
    if not sid or not user or str(user.current_session_id) != str(sid):
        return None
    if not getattr(user, "is_active", True):
        return None
    return user

# The refresh cookie only needs to be sent back on this service's own
# /api/auth/* endpoints (RefreshView, LogoutView read it) -- previously
# unscoped (path="/"), so it rode along on every request to this service,
# including /admin/. Used by both the set_cookie() and delete_cookie() calls
# below; they have to match, or logout's delete_cookie() silently fails to
# clear a cookie set with a different path.
REFRESH_COOKIE_PATH = "/api/auth/"


def _origin_allowed(request):
    """
    The refresh endpoint is the one place a cookie alone authorizes a request,
    so a cross-site page could make a victim's browser call it. CORS already
    stops that page reading the new token; this also refuses to act for an
    origin the frontend was never served from. It matters once
    REFRESH_COOKIE_SAMESITE=None lets the browser send the cookie cross-site.
    A request with no Origin header is not a browser cross-origin call and
    carries no ambient cookie, so it is allowed.
    """
    origin = request.META.get("HTTP_ORIGIN")
    if not origin:
        return True
    allowed = {o.rstrip("/") for o in settings.CORS_ALLOWED_ORIGINS}
    return origin.rstrip("/") in allowed


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            LoginRateThrottle.record_failure(request, self)
            # Always one string. A missing field used to come back as the
            # whole errors dict under `detail`, which the login page renders
            # as text -- React cannot render an object.
            errors = serializer.errors.get("non_field_errors")
            detail = str(errors[0]) if errors else "Identifier and password are required."

            identifier = str(request.data.get("identifier") or "Unknown user")
            record_audit_event(
                request,
                user_name=identifier,
                user_role="unknown",
                action="Failed login attempt",
                module="Identity",
                status="failed",
                details=detail,
                metadata={"identifier": identifier[:EMAIL_MAX_LENGTH]},
            )
            return Response({"detail": detail}, status=400)

        user = serializer.validated_data["user"]
        remember_me = serializer.validated_data.get("remember_me", True)

        # axes normally clears its failure counter on Django's
        # user_logged_in signal, which only fires from
        # django.contrib.auth.login() -- this API never calls that (it's
        # stateless JWT, not Django sessions), so a successful login would
        # otherwise leave prior failed attempts sitting on the counter
        # indefinitely instead of resetting it. Reset by hand instead.
        # ip_or_username=True clears whichever key AXES_LOCKOUT_PARAMETERS
        # is actually using (defaults to IP address alone, not username --
        # see settings.py) rather than assuming one or the other.
        # Reset the exact (ip, username) pair that just succeeded, and only
        # that pair — AXES_LOCKOUT_PARAMETERS is ["ip_address", "username"],
        # so that is the key actually being tracked.
        #
        # ip_or_username=True cleared every counter for the IP *or* the
        # username instead, which meant one valid low-privilege credential
        # could be used to wipe the brute-force state for every other account
        # being attacked from the same address: log in as yourself, and the
        # attacker's failed attempts against the super_admin reset too.
        axes_reset(
            ip=get_client_ip_address(request),
            username=serializer.validated_data["identifier"],
        )

        session_id = uuid.uuid4()
        refresh = RefreshToken.for_user(user)
        refresh["sid"] = str(session_id)
        access_token = str(refresh.access_token)
        stamp_session_id(user.user_id, session_id)

        response = Response(
            {
                "access": access_token,
                "message": "Login successful.",
                "user": _user_payload(user),
            },
            status=200,
        )

        cookie_max_age = 7 * 24 * 60 * 60 if remember_me else None
        response.set_cookie(
            "refresh",
            str(refresh),
            httponly=True,
            samesite=settings.REFRESH_COOKIE_SAMESITE,  # see settings.py
            secure=settings.REFRESH_COOKIE_SECURE,
            path=REFRESH_COOKIE_PATH,
            max_age=cookie_max_age,
        )
        record_audit_event(
            request,
            user=user,
            action="Signed in",
            module="Identity",
            status="success",
            details="Admin portal login completed.",
        )
        return response


class RefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [SessionRateThrottle]

    def post(self, request):
        if not _origin_allowed(request):
            return Response({"detail": "Origin not allowed."}, status=403)

        refresh_token = request.COOKIES.get("refresh")
        if not refresh_token:
            return Response({"detail": "Refresh token missing."}, status=401)

        try:
            refresh = RefreshToken(refresh_token)
        except TokenError:
            return Response({"detail": "Invalid refresh token."}, status=401)

        user = _session_user_from_refresh_cookie(request)
        if user is None:
            return Response({"detail": "Session no longer active."}, status=401)

        # The user comes back too: a new tab (or a browser reopened under
        # "Remember me") restores its session from this call alone, and the
        # portal needs the name and role to draw the page and gate routes.
        return Response(
            {"access": str(refresh.access_token), "user": _user_payload(user)},
            status=200,
        )


class LogoutView(APIView):
    """
    Ends the caller's session and deletes the refresh cookie -- always.

    It used to require a live access token. A user who left the portal open
    past the 2-hour token and then clicked Log out got a 401: the session
    stayed active, and the refresh cookie (kept up to 7 days under "Remember
    me") could still mint new tokens on that computer.

    Now the refresh cookie identifies the session when the access token
    can't. Only the session that credential belongs to is ended: one from a
    superseded session (the user has since signed in somewhere else) must
    not sign out the newer login. The cookie is deleted regardless.
    """
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [SessionRateThrottle]

    def post(self, request):
        if not _origin_allowed(request):
            return Response({"detail": "Origin not allowed."}, status=403)

        user = resolve_user_from_request(request) or _session_user_from_refresh_cookie(request)
        if user is not None:
            # Filtered on the session too, so a login that lands between the
            # lookup above and this write is not the one cleared.
            User.objects.filter(
                user_id=user.user_id, current_session_id=user.current_session_id,
            ).update(current_session_id=None)

            record_audit_event(
                request,
                user=user,
                action="Logged out",
                module="Identity",
                status="success",
                details="Admin portal logout completed.",
            )

        response = Response({"message": "Logged out."}, status=200)
        # Same attributes as set_cookie(): a SameSite=None cookie is only
        # replaced by a deletion that is also SameSite=None (and Secure).
        response.delete_cookie(
            "refresh", path=REFRESH_COOKIE_PATH, samesite=settings.REFRESH_COOKIE_SAMESITE,
        )
        return response


# ── Users ──────────────────────────────────────────────────────────────────────

class UserPagination(PageNumberPagination):
    # The Users page used to download every account -- guardians included,
    # photos included -- and filter in the browser.
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class UserListView(APIView):
    """GET /api/auth/users/  — list all users (admin, super_admin, or registrar
       — registrar needs this to populate the teacher picker on the My
       Sections page, see TeacherSectionsPage.jsx)
       POST /api/auth/users/ — create a new user (admin only, enforced below
       since required_roles here also has to allow registrar's GET)"""
    authentication_classes = [NoOpAuthentication]
    permission_classes = [HasRole]
    required_roles = ADMIN_ROLES | {"registrar"}

    def get(self, request):
        """
        Filters:
          ?role=teacher or ?role=teacher,guardian   (the pickers pass one)
          ?status=active | inactive
          ?search=ana                               (name or email)

        With ?page=N the result is one page of 25 (?page_size up to 100),
        plus `counts` over every account the caller may see -- what the Users
        page draws its stat cards and filter chips from. Without it, the
        plain list the pickers use.

        A registrar only ever sees teachers and guardians, without photos.
        """
        base = User.objects.all().order_by("user_id")
        is_admin = request.resolved_user.role in ADMIN_ROLES
        if not is_admin:
            base = base.filter(role__in=REGISTRAR_VISIBLE_ROLES)

        users = base
        roles = {r.strip() for r in (request.query_params.get("role") or "").split(",") if r.strip()}
        if not is_admin and roles:
            roles &= REGISTRAR_VISIBLE_ROLES
            if not roles:
                users = users.none()
        if roles:
            users = users.filter(role__in=roles)

        status_value = request.query_params.get("status")
        if status_value in ("active", "inactive"):
            users = users.filter(is_active=status_value == "active")

        search = (request.query_params.get("search") or "").strip()
        if search:
            users = users.filter(Q(name__icontains=search) | Q(email__icontains=search))

        def serialize(rows):
            data = UserSerializer(rows, many=True).data
            if not is_admin:
                for row in data:
                    row.pop("profile_picture", None)
            return data

        if "page" not in request.query_params:
            return Response(serialize(users))

        paginator = UserPagination()
        page = paginator.paginate_queryset(users, request, view=self)
        by_role = {
            row["role"]: row["n"]
            for row in base.order_by().values("role").annotate(n=Count("pk"))
        }
        return Response({
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "results": serialize(page),
            "counts": {
                "total": sum(by_role.values()),
                "by_role": by_role,
                "inactive": base.filter(is_active=False).count(),
            },
        })

    def post(self, request):
        requester = request.resolved_user
        if getattr(requester, "role", None) not in ADMIN_ROLES:
            return Response({"detail": "Only admins can create users."}, status=403)

        data = request.data
        name     = (data.get("name") or "").strip()
        email    = (data.get("email") or "").strip()
        role     = (data.get("role") or "").strip()
        password = data.get("password") or ""

        if not name or not email or not role or not password:
            return Response({"detail": "name, email, role and password are required."}, status=400)

        error = _name_error(name)
        if error:
            return _field_error("name", error)
        error = _email_error(email)
        if error:
            return _field_error("email", error)

        if role not in VALID_ROLES:
            return Response({"detail": f"Invalid role '{role}'."}, status=400)

        # Creating a second super_admin is a super_admin's decision -- otherwise
        # the hierarchy enforced in UserDetailView is trivially sidestepped by
        # minting a fresh super_admin and logging in as it.
        if role in SUPER_ADMIN_ROLES and not is_super_admin(requester):
            return Response(
                {"detail": "Only a super admin can create a super admin account."},
                status=403,
            )

        if User.objects.filter(email__iexact=email).exists():
            return Response({"detail": "A user with this email already exists."}, status=400)

        try:
            # Unsaved instance, purely so UserAttributeSimilarityValidator can
            # check the password isn't just this user's own name or email.
            validate_password(password, user=User(name=name, email=email, role=role))
        except DjangoValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=400)

        try:
            user = User.objects.create(
                name=name,
                email=email,
                role=role,
                password=make_password(password),
                profile_picture=None,
            )
        except IntegrityError:
            return Response(
                {"detail": f"Role '{role}' is not permitted by the database schema."},
                status=400,
            )

        record_audit_event(
            request,
            user=requester,
            action="Created user account",
            module="Users",
            status="success",
            details=f"New user '{name}' ({email}) with role '{role}' was created.",
            metadata={"target_user_id": user.user_id, "target_email": email, "role": role},
        )

        return Response(UserSerializer(user).data, status=201)


class UserDetailView(APIView):
    """GET /api/auth/users/<id>/   — view a user
       PATCH /api/auth/users/<id>/ — edit a user
       DELETE /api/auth/users/<id>/ — delete a user (admin only)"""
    authentication_classes = [NoOpAuthentication]
    permission_classes = [HasRole]
    # No required_roles: this is reachable by any authenticated user because
    # it's how a user views/edits their OWN profile, which isn't role-gated
    # -- it's identity-gated. Each method below enforces ownership-or-admin
    # by hand (is_own_profile / is_audit_admin(requester)).
    ALLOW_ANY_AUTHENTICATED_ROLE = True

    def _get_target(self, user_id):
        try:
            return User.objects.get(user_id=user_id)
        except User.DoesNotExist:
            return None

    def get(self, request, user_id):
        requester = request.resolved_user

        if requester.user_id != int(user_id) and not is_audit_admin(requester):
            return Response({"detail": "Permission denied."}, status=403)

        target = self._get_target(user_id)
        if not target:
            return Response({"detail": "User not found."}, status=404)

        return Response(UserSerializer(target).data)

    def patch(self, request, user_id):
        requester = request.resolved_user

        is_own_profile = requester.user_id == int(user_id)
        is_admin       = is_audit_admin(requester)

        if not is_own_profile and not is_admin:
            return Response({"detail": "Permission denied."}, status=403)

        target = self._get_target(user_id)
        if not target:
            return Response({"detail": "User not found."}, status=404)

        # ── Role hierarchy ────────────────────────────────────────────────────
        # A super_admin account may only be edited by a super_admin (or by
        # itself). Otherwise a plain admin could reset the super_admin's
        # password -- the current-password check below applies only to
        # self-edits -- and then simply log in as them.
        if is_super_admin(target) and not is_own_profile and not is_super_admin(requester):
            return Response(
                {"detail": "Only a super admin can modify a super admin account."},
                status=403,
            )

        data    = request.data
        changes = []
        # Set True by the role/password sections below. A role or password
        # change has to kill any existing session for this user immediately
        # -- otherwise a compromised account stays fully usable with its old
        # access token for up to ACCESS_TOKEN_LIFETIME (2h) after an admin
        # "fixes" it, since access tokens are stateless JWTs that are only
        # ever re-checked against the DB via this current_session_id/sid
        # comparison (see accounts.audit.resolve_user_from_request and
        # shared.authentication.SingleSessionJWTAuthentication -- every
        # service checks it, so this also signs the user out of billing/
        # enrollment/student-service, not just identity-service).
        invalidate_session = False
        password_changed = False

        # ── Name ──────────────────────────────────────────────────────────────
        if "name" in data:
            new_name = (data["name"] or "").strip()
            error = _name_error(new_name)
            if error:
                return _field_error("name", error)
            if new_name != target.name:
                changes.append(f"name changed from '{target.name}' to '{new_name}'")
                target.name = new_name

        # ── Email ─────────────────────────────────────────────────────────────
        if "email" in data:
            new_email = (data["email"] or "").strip()
            if new_email.lower() != target.email.lower():
                error = _email_error(new_email)
                if error:
                    return _field_error("email", error)
                if User.objects.filter(email__iexact=new_email).exclude(user_id=target.user_id).exists():
                    return _field_error("email", "This email is already in use.")
                changes.append(f"email changed from '{target.email}' to '{new_email}'")
                target.email = new_email

        # ── Role (admin only) ─────────────────────────────────────────────────
        if "role" in data:
            if not is_admin:
                return Response({"detail": "Only admins can change roles."}, status=403)
            new_role = (data["role"] or "").strip()
            if new_role and new_role not in VALID_ROLES:
                return Response({"detail": f"Invalid role '{new_role}'."}, status=400)
            # Nobody edits their own role. An admin who can hand themselves
            # super_admin makes the distinction between the two meaningless,
            # and a self-demotion is just as likely to be a mistake that locks
            # the last admin out of the system.
            if new_role and new_role != target.role and is_own_profile:
                return Response(
                    {"detail": "You cannot change your own role. Ask another admin."},
                    status=403,
                )
            # Granting super_admin is a super_admin's decision.
            if new_role in SUPER_ADMIN_ROLES and not is_super_admin(requester):
                return Response(
                    {"detail": "Only a super admin can grant the super admin role."},
                    status=403,
                )
            if new_role and new_role != target.role:
                changes.append(f"role changed from '{target.role}' to '{new_role}'")
                target.role = new_role
                invalidate_session = True

        # ── Active / deactivated (admin only) ─────────────────────────────────
        # Deactivating is how an account is retired: the person can't sign
        # in, any open session ends, and everything that points at their id
        # still names them. The super admin rule above already applies.
        if "is_active" in data:
            if not is_admin:
                return Response({"detail": "Only admins can deactivate accounts."}, status=403)
            new_active = data.get("is_active")
            if not isinstance(new_active, bool):
                return Response({"detail": "is_active must be true or false."}, status=400)
            if is_own_profile and not new_active:
                return Response(
                    {"detail": "You cannot deactivate your own account. Ask another admin."},
                    status=403,
                )
            if new_active != target.is_active:
                changes.append("account reactivated" if new_active else "account deactivated")
                target.is_active = new_active
                if not new_active:
                    invalidate_session = True

        # ── Password ──────────────────────────────────────────────────────────
        if "new_password" in data:
            new_password = data.get("new_password") or ""
            try:
                validate_password(new_password, user=target)
            except DjangoValidationError as exc:
                return Response({"detail": " ".join(exc.messages)}, status=400)

            if is_own_profile:
                current_password = data.get("current_password") or ""
                if not check_password(current_password, target.password):
                    return Response({"detail": "Current password is incorrect."}, status=400)

            target.password = make_password(new_password)
            changes.append("password updated")
            invalidate_session = True
            password_changed = True

        # ── Profile picture ───────────────────────────────────────────────────
        if "profile_picture" in data:
            pic = data.get("profile_picture")
            if pic is None or pic == "":
                target.profile_picture = None
                changes.append("profile picture removed")
            else:
                if not re.match(r"^data:image/(jpeg|png|gif|webp);base64,", pic):
                    return Response({"detail": "profile_picture must be a valid base64 image data URI."}, status=400)
                b64_data = pic.split(",", 1)[1]
                try:
                    # validate=True: the lenient default silently discarded
                    # anything outside the base64 alphabet, so a string of
                    # junk measured as a tiny image and was stored whole.
                    decoded_size = len(base64.b64decode(b64_data, validate=True))
                except (binascii.Error, ValueError):
                    return Response({"detail": "Invalid base64 image data."}, status=400)
                if decoded_size > MAX_IMAGE_BYTES:
                    return Response({"detail": "Profile picture must be under 2 MB."}, status=400)
                target.profile_picture = pic
                changes.append("profile picture updated")

        if not changes:
            return Response(UserSerializer(target).data)

        if invalidate_session:
            target.current_session_id = None

        target.save()

        if password_changed:
            # A person locked out after five wrong guesses is told "contact an
            # admin", and the admin's answer is to set a new password -- which
            # did nothing while axes still held the lockout for up to an hour.
            # Clear it for both identifiers they might sign in with.
            axes_reset(username=target.email)
            axes_reset(username=target.name)

        detail_msg = "; ".join(changes).capitalize() + "."
        record_audit_event(
            request,
            user=requester,
            action="Updated user profile",
            module="Users",
            status="success",
            details=f"Profile of '{target.name}' ({target.email}) updated: {detail_msg}",
            metadata={
                "target_user_id": target.user_id,
                "target_email": target.email,
                "changes": changes,
                "self_edit": is_own_profile,
            },
        )

        return Response(UserSerializer(target).data)

    def delete(self, request, user_id):
        requester = request.resolved_user
        if not is_audit_admin(requester):
            return Response({"detail": "Only admins can delete users."}, status=403)
        if requester.user_id == int(user_id):
            return Response({"detail": "You cannot delete your own account."}, status=400)

        target = self._get_target(user_id)
        if not target:
            return Response({"detail": "User not found."}, status=404)

        # Same hierarchy as patch(): a plain admin must not be able to delete
        # the super_admin account out from under the system.
        if is_super_admin(target) and not is_super_admin(requester):
            return Response(
                {"detail": "Only a super admin can delete a super admin account."},
                status=403,
            )

        name, email, role = target.name, target.email, target.role
        target.delete()

        record_audit_event(
            request,
            user=requester,
            action="Deleted user account",
            module="Users",
            status="success",
            details=f"User '{name}' ({email}) with role '{role}' was permanently deleted.",
            metadata={"target_user_id": int(user_id), "target_email": email, "role": role},
        )

        return Response({"detail": "User deleted."}, status=204)


# ── Audit ──────────────────────────────────────────────────────────────────────

class AuditLogPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    # Was 10000. Audit rows carry a free-text `details` plus a JSON `metadata`
    # blob, so a single ?page_size=10000 pulled tens of megabytes and held a
    # worker for the duration — trivially, and from any admin session. The
    # page only ever renders a screenful; the filter options it used to need
    # the whole table for now come from the facets endpoint.
    max_page_size = 200


class AuditLogListView(APIView):
    authentication_classes = [NoOpAuthentication]
    permission_classes = [HasRole]
    required_roles = ADMIN_ROLES

    def get(self, request):
        queryset = AuditLog.objects.all()

        role = request.query_params.get("role")
        if role and role != "all":
            queryset = queryset.filter(user_role=role)

        module = request.query_params.get("module")
        if module:
            queryset = queryset.filter(module__iexact=module)

        status_value = request.query_params.get("status")
        if status_value:
            queryset = queryset.filter(status=status_value)

        # Free-text lookup across who did it, what they did, and the detail
        # blurb — the three things someone scanning an audit trail actually
        # reads. `metadata` is deliberately excluded: it's a JSON blob whose
        # keys would produce confusing matches.
        search = (request.query_params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(user_name__icontains=search)
                | Q(action__icontains=search)
                | Q(details__icontains=search)
            )

        date_value = parse_date(request.query_params.get("date") or "")
        if date_value:
            queryset = queryset.filter(occurred_at__date=date_value)

        time_from = parse_time(request.query_params.get("time_from") or "")
        if time_from:
            queryset = queryset.filter(occurred_at__time__gte=time_from)

        time_to = parse_time(request.query_params.get("time_to") or "")
        if time_to:
            queryset = queryset.filter(occurred_at__time__lte=time_to)

        ordering = request.query_params.get("ordering", "-occurred_at")
        if ordering in {"occurred_at", "-occurred_at", "user_role", "-user_role", "module", "-module", "status", "-status"}:
            queryset = queryset.order_by(ordering, "-log_id")

        paginator = AuditLogPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = AuditLogSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class AuditLogFacetsView(APIView):
    """
    GET /api/auth/audit-logs/facets/

    The distinct roles and modules present in the log, plus per-status counts.

    The page used to derive these by scanning every row it had downloaded,
    which only worked because it fetched the whole table. Now that the list is
    paginated server-side, the filter options have to come from the full set
    rather than whatever happens to be on the current page.
    """
    authentication_classes = [NoOpAuthentication]
    permission_classes = [HasRole]
    required_roles = ADMIN_ROLES

    def get(self, request):
        # `.order_by()` clears the model's Meta.ordering. Without it the
        # ordering column joins the SELECT and DISTINCT dedupes on the pair,
        # returning one row per log rather than one per distinct value.
        qs = AuditLog.objects.order_by()

        roles = sorted(
            r for r in qs.values_list("user_role", flat=True).distinct() if r
        )

        # Module values are stored inconsistently cased ("students" and
        # "Students" are separate rows), so they're folded to one entry per
        # distinct spelling-insensitive name. The list filter uses `iexact`,
        # so any one spelling matches them all.
        seen = {}
        for m in qs.values_list("module", flat=True).distinct():
            if not m:
                continue
            key = m.strip().lower()
            if key and key not in seen:
                seen[key] = m.strip()
        modules = sorted(seen.values(), key=str.lower)

        counts = {
            row["status"]: row["count"]
            for row in qs.values("status").annotate(count=Count("pk"))
        }
        counts["total"] = sum(counts.values())

        return Response({"roles": roles, "modules": modules, "status_counts": counts})