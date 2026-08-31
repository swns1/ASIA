"""
Shared UserManager for the `managed = False` User stub models that mirror
identity-service's `users` table in enrollment-service, billing-service, and
student-service. The stub User model itself still has to be defined locally
in each service — Django requires AUTH_USER_MODEL to point at an app-local
model — this just removes the duplicated manager logic.
"""
from django.contrib.auth.models import BaseUserManager


class UserManager(BaseUserManager):
    def get_by_natural_key(self, email):
        return self.get(email=email)
