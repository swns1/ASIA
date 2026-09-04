import base64
import re
import uuid

from axes.helpers import get_client_ip_address
from axes.utils import reset as axes_reset
from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.utils.dateparse import parse_date, parse_time
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .audit import ADMIN_ROLES, is_audit_admin, record_audit_event
from .authentication import NoOpAuthentication
from .models import AuditLog, User, VALID_ROLES
from .permissions import HasRole
from .serializers import LoginSerializer, AuditLogSerializer, UserSerializer
from .services.auth_service import stamp_session_id
from .throttles import LoginRateThrottle

MAX_IMAGE_BYTES = 2 * 1024 * 1024  # 2 MB

# The refresh cookie only needs to be sent back on this service's own
# /api/auth/* endpoints (RefreshView, LogoutView read it) -- previously
# unscoped (path="/"), so it rode along on every request to this service,
# including /admin/. Used by both the set_cookie() and delete_cookie() calls
# below; they have to match, or logout's delete_cookie() silently fails to
# clear a cookie set with a different path.
REFRESH_COOKIE_PATH = "/api/auth/"


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            detail = serializer.errors.get("non_field_errors", serializer.errors)
            if isinstance(detail, list) and detail:
                detail = detail[0]

            identifier = request.data.get("identifier") or "Unknown user"
            record_audit_event(
                request,
                user_name=str(identifier),
                user_role="unknown",
                action="Failed login attempt",
                module="Identity",
                status="failed",
                details=str(detail),
                metadata={"identifier": str(identifier)},
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
        axes_reset(
            ip=get_client_ip_address(request),
            username=serializer.validated_data["identifier"],
            ip_or_username=True,
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
                "user": {
                    "id": user.user_id,
                    "name": user.name,
                    "email": user.email,
                    "role": user.role,
                    "profile_picture": user.profile_picture,
                },
            },
            status=200,
        )

        cookie_max_age = 7 * 24 * 60 * 60 if remember_me else None
        response.set_cookie(
            "refresh",
            str(refresh),
            httponly=True,
            samesite="Lax",
            secure=settings.SESSION_COOKIE_SECURE,  # off by default; see settings.py
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

    def post(self, request):
        refresh_token = request.COOKIES.get("refresh")
        if not refresh_token:
            return Response({"detail": "Refresh token missing."}, status=401)

        try:
            refresh = RefreshToken(refresh_token)
        except TokenError:
            return Response({"detail": "Invalid refresh token."}, status=401)

        sid = refresh.get("sid")
        user = User.objects.filter(user_id=refresh.get("user_id")).first()
        if not sid or not user or str(user.current_session_id) != str(sid):
            return Response({"detail": "Session no longer active."}, status=401)

        access_token = str(refresh.access_token)
        return Response({"access": access_token}, status=200)


class LogoutView(APIView):
    authentication_classes = [NoOpAuthentication]
    permission_classes = [HasRole]
    ALLOW_ANY_AUTHENTICATED_ROLE = True  # any authenticated user may log themselves out

    def post(self, request):
        user = request.resolved_user
        refresh_token = request.COOKIES.get("refresh")
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                if hasattr(token, "blacklist"):
                    token.blacklist()
            except TokenError:
                pass

        # request.resolved_user was only resolved because resolve_user_from_request()
        # already confirmed this token's sid matches the current session, so
        # it's always safe to clear it here.
        User.objects.filter(user_id=user.user_id).update(current_session_id=None)

        record_audit_event(
            request,
            user=user,
            action="Logged out",
            module="Identity",
            status="success",
            details="Admin portal logout completed.",
        )
        response = Response({"message": "Logged out."}, status=200)
        response.delete_cookie("refresh", path=REFRESH_COOKIE_PATH)
        return response


# ── Users ──────────────────────────────────────────────────────────────────────

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
        users = User.objects.all().order_by("user_id")
        return Response(UserSerializer(users, many=True).data)

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

        if role not in VALID_ROLES:
            return Response({"detail": f"Invalid role '{role}'."}, status=400)

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

        # ── Name ──────────────────────────────────────────────────────────────
        if "name" in data:
            new_name = (data["name"] or "").strip()
            if not new_name:
                return Response({"detail": "Name cannot be empty."}, status=400)
            if new_name != target.name:
                changes.append(f"name changed from '{target.name}' to '{new_name}'")
                target.name = new_name

        # ── Email ─────────────────────────────────────────────────────────────
        if "email" in data:
            new_email = (data["email"] or "").strip()
            if not new_email:
                return Response({"detail": "Email cannot be empty."}, status=400)
            if new_email.lower() != target.email.lower():
                if User.objects.filter(email__iexact=new_email).exclude(user_id=target.user_id).exists():
                    return Response({"detail": "This email is already in use."}, status=400)
                changes.append(f"email changed from '{target.email}' to '{new_email}'")
                target.email = new_email

        # ── Role (admin only) ─────────────────────────────────────────────────
        if "role" in data:
            if not is_admin:
                return Response({"detail": "Only admins can change roles."}, status=403)
            new_role = (data["role"] or "").strip()
            if new_role and new_role not in VALID_ROLES:
                return Response({"detail": f"Invalid role '{new_role}'."}, status=400)
            if new_role and new_role != target.role:
                changes.append(f"role changed from '{target.role}' to '{new_role}'")
                target.role = new_role
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
                    decoded_size = len(base64.b64decode(b64_data + "=="))
                except Exception:
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
    max_page_size = 10000


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