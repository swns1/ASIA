from django.db import IntegrityError, transaction
from django.db.models import ProtectedError, RestrictedError
from rest_framework import status
from rest_framework.response import Response


class InUseDeleteMixin:
    """
    DELETE on a record that other records still point at answers 409 with a
    sentence the user can act on.

    These references are RESTRICT at the database -- rightly, since deleting a
    subject must not take its grades with it -- but the refusal surfaced as a
    500, "Something went wrong on our end", for a request that was simply not
    allowed. Set `in_use_message` on the viewset.

    The delete runs in its own atomic block so that constraints the database
    only checks at commit (the DEFERRABLE foreign keys) are caught here too.
    """

    in_use_message = "This is still in use, so it can't be deleted."

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            with transaction.atomic():
                self.perform_destroy(instance)
        except (ProtectedError, RestrictedError, IntegrityError):
            return Response(
                {"detail": self.in_use_message, "code": "in_use"},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
