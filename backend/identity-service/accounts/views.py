from django.utils.dateparse import parse_date, parse_time
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .audit import is_audit_admin, record_audit_event, resolve_user_from_request
from .models import AuditLog
from .serializers import LoginSerializer, AuditLogSerializer
from .throttles import LoginRateThrottle


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
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

        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)

        response = Response(
            {
                "access": access_token,
                "message": "Login successful.",
                "user": {
                    "id": user.user_id,
                    "name": user.name,
                    "email": user.email,
                    "role": user.role,
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
            access_token = str(refresh.access_token)
        except TokenError:
            return Response({"detail": "Invalid refresh token."}, status=401)

        return Response({"access": access_token}, status=200)


class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        user = resolve_user_from_request(request)
        refresh_token = request.COOKIES.get("refresh")
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                if hasattr(token, "blacklist"):
                    token.blacklist()
            except TokenError:
                pass

        record_audit_event(
            request,
            user=user,
            action="Logged out",
            module="Identity",
            status="success",
            details="Admin portal logout completed.",
        )
        response = Response({"message": "Logged out."}, status=200)
        response.delete_cookie("refresh")
        return response


class AuditLogPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 500


class AuditLogListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        user = resolve_user_from_request(request)
        if not is_audit_admin(user):
            return Response({"detail": "Only Admin and Super Admin users can view audit records."}, status=403)

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