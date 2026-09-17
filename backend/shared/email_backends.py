"""
Django email backends that send over HTTPS instead of SMTP.

Railway blocks outbound SMTP (ports 25, 465, 587, 2525) on its Free, Trial
and Hobby plans, so Django's SMTP backend -- which the LAN deployment uses --
cannot connect there. Selecting this backend changes nothing else: views keep
building EmailMultiAlternatives and calling .send().

    EMAIL_BACKEND=shared.email_backends.BrevoEmailBackend
    BREVO_API_KEY=xkeysib-...
    DEFAULT_FROM_EMAIL=South Lakes Integrated School <registrar@example.com>

Brevo (https://www.brevo.com) is used because its free plan needs no domain
of your own: a single sender address verified in the Brevo dashboard is
enough. DEFAULT_FROM_EMAIL must be that verified address.

Errors are raised, never swallowed, so the caller's retry and
EmailDeliveryFailure logging still apply. requests' own exceptions (timeouts,
connection errors, 429/5xx HTTPError) are what shared.resilience treats as
transient; a 400/401 is not retried.
"""
from email.utils import parseaddr

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail.backends.base import BaseEmailBackend

BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


def _address(value):
    name, email = parseaddr(value)
    entry = {"email": email}
    if name:
        entry["name"] = name[:70]
    return entry


class BrevoEmailBackend(BaseEmailBackend):
    def __init__(self, fail_silently=False, api_key=None, timeout=None, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self.api_key = api_key or getattr(settings, "BREVO_API_KEY", "")
        self.timeout = timeout or getattr(settings, "EMAIL_TIMEOUT", None) or 10

    def send_messages(self, email_messages):
        if not self.api_key:
            if self.fail_silently:
                return 0
            raise ImproperlyConfigured("BREVO_API_KEY is not set.")

        sent = 0
        for message in email_messages:
            try:
                self._send(message)
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
        return sent

    def _send(self, message):
        recipients = message.to + message.cc + message.bcc
        if not recipients:
            return
        payload = {
            "sender": _address(message.from_email),
            "to": [_address(r) for r in message.to],
            "subject": message.subject,
            "textContent": message.body,
        }
        if message.cc:
            payload["cc"] = [_address(r) for r in message.cc]
        if message.bcc:
            payload["bcc"] = [_address(r) for r in message.bcc]
        if message.reply_to:
            payload["replyTo"] = _address(message.reply_to[0])
        for content, mimetype in getattr(message, "alternatives", []):
            if mimetype == "text/html":
                payload["htmlContent"] = content

        response = requests.post(
            BREVO_SEND_URL,
            json=payload,
            headers={"api-key": self.api_key, "accept": "application/json"},
            timeout=self.timeout,
        )
        response.raise_for_status()
