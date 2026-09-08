"""
Best-effort invite delivery, ported from enrollment-service's
enrollments/email_views.py (Resend is HTTP-only and was only wired up in
that service before now). Unlike that endpoint, a failed send here must
never fail the invite-issue request — the access code is shown on screen to
the issuing staff member regardless, and the link/code can always be read
out or written on a slip (see the plan's decision 10). There is
deliberately no EmailDeliveryFailure-style table for this: the artifact
that matters (the link) is already in the registrar's hands the moment
issuing succeeds, so there is nothing to "follow up" on the way an unpaid
invoice email would need one.

The invite email carries the link ONLY, never the access code — sending
both over the same channel defeats the two-factor split (plan decision 3).
"""
import logging

import resend
from django.conf import settings

from shared.resilience import retry_with_backoff

logger = logging.getLogger(__name__)

FROM_ADDRESS = "South Lakes Integrated School <onboarding@resend.dev>"


def send_invite_email(*, to_email, applicant_name, apply_url):
    """Returns True if the email was accepted by Resend, False otherwise.
    Never raises — the caller must treat this as advisory."""
    if not to_email:
        return False

    resend.api_key = settings.RESEND_API_KEY
    params: resend.Emails.SendParams = {
        "from": FROM_ADDRESS,
        "to": [to_email],
        "subject": "Your student information form link",
        "html": f"""
            <div style="font-family:'DM Sans',sans-serif;max-width:560px;margin:0 auto;background:#fff8f6;border:1px solid #fde2de;border-radius:16px;padding:36px;">
              <div style="text-align:center;margin-bottom:28px;">
                <h1 style="font-family:Georgia,serif;color:#1a0a0a;font-size:26px;margin:0 0 6px;">
                  South Lakes Integrated School
                </h1>
                <p style="color:#7a5050;font-size:13px;margin:0;">Student Information Form</p>
              </div>

              <p style="color:#1a0a0a;font-size:15px;">Dear <strong>{applicant_name}</strong>,</p>

              <p style="color:#4a3a3a;font-size:14px;line-height:1.7;">
                A staff member has invited you to fill in the student information
                form online. Use the link below, then enter the access code you
                were given separately (in person, or by phone) to continue.
              </p>

              <div style="text-align:center;margin:28px 0;">
                <a href="{apply_url}" style="display:inline-block;background:#c0392b;color:#fff;
                   text-decoration:none;font-weight:600;font-size:14px;padding:14px 28px;border-radius:10px;">
                  Open the form
                </a>
              </div>

              <p style="color:#4a3a3a;font-size:14px;line-height:1.7;">
                This link does not work without the access code. If you did not
                receive one, please contact the Registrar's office.
              </p>

              <p style="color:#7a5050;font-size:13px;margin-top:32px;border-top:1px solid #fde2de;padding-top:20px;">
                South Lakes Integrated School · Registrar's Office
              </p>
            </div>
        """,
    }

    try:
        retry_with_backoff(lambda: resend.Emails.send(params), attempts=3, label="resend-invite")
        return True
    except Exception:
        logger.exception("Invite email to %s failed after retries", to_email)
        return False
