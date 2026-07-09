import resend
from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(["POST"])
def send_enrollment_email(request):
    # @api_view applies this service's DEFAULT_AUTHENTICATION_CLASSES /
    # DEFAULT_PERMISSION_CLASSES (JWTAuthentication + IsAuthenticated), so this
    # endpoint is no longer reachable without a valid access token. It also
    # replaces the old @csrf_exempt + json.loads(request.body) combo — DRF
    # parses the JSON body into request.data and doesn't enforce Django's
    # session-based CSRF check for token-authenticated requests.
    try:
        data = request.data
        student_name  = data.get("student_name", "Student")
        student_email = data.get("student_email")
        grade_level   = data.get("grade_level", "")
        section       = data.get("section", "")
        school_year   = data.get("school_year", "")
        school_level  = data.get("school_level", "").replace("_", " ").title()

        if not student_email:
            return Response({"error": "No email address on file for this student."}, status=400)

        resend.api_key = settings.RESEND_API_KEY

        params: resend.Emails.SendParams = {
            "from": "South Lakes Integrated School <onboarding@resend.dev>",
            "to": [student_email],
            "subject": f"Enrollment Confirmation – {school_year}",
            "html": f"""
            <div style="font-family:'DM Sans',sans-serif;max-width:560px;margin:0 auto;background:#fff8f6;border:1px solid #fde2de;border-radius:16px;padding:36px;">
              <div style="text-align:center;margin-bottom:28px;">
                <h1 style="font-family:Georgia,serif;color:#1a0a0a;font-size:26px;margin:0 0 6px;">
                  South Lakes Integrated School
                </h1>
                <p style="color:#7a5050;font-size:13px;margin:0;">Enrollment Confirmation</p>
              </div>

              <p style="color:#1a0a0a;font-size:15px;">Dear <strong>{student_name}</strong>,</p>

              <p style="color:#4a3a3a;font-size:14px;line-height:1.7;">
                We are pleased to inform you that your enrollment at
                <strong>South Lakes Integrated School</strong> has been successfully
                processed for the <strong>{school_year}</strong> school year.
              </p>

              <div style="background:#ffffff;border:1px solid #fde2de;border-radius:12px;padding:20px 24px;margin:24px 0;">
                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                  <tr>
                    <td style="color:#7a5050;padding:6px 0;width:40%;">School Level</td>
                    <td style="color:#1a0a0a;font-weight:600;">{school_level}</td>
                  </tr>
                  <tr>
                    <td style="color:#7a5050;padding:6px 0;">Grade Level</td>
                    <td style="color:#1a0a0a;font-weight:600;">{grade_level}</td>
                  </tr>
                  <tr>
                    <td style="color:#7a5050;padding:6px 0;">Section</td>
                    <td style="color:#1a0a0a;font-weight:600;">{section}</td>
                  </tr>
                  <tr>
                    <td style="color:#7a5050;padding:6px 0;">School Year</td>
                    <td style="color:#1a0a0a;font-weight:600;">{school_year}</td>
                  </tr>
                </table>
              </div>

              <p style="color:#4a3a3a;font-size:14px;line-height:1.7;">
                Please keep this email for your records. If you have any questions,
                feel free to contact our Registrar's office.
              </p>

              <p style="color:#7a5050;font-size:13px;margin-top:32px;border-top:1px solid #fde2de;padding-top:20px;">
                South Lakes Integrated School · Registrar's Office
              </p>
            </div>
            """,
        }

        resend.Emails.send(params)
        return Response({"success": True})

    except Exception as e:
        print(f"[Resend] Email send failed: {e}")
        return Response({"error": str(e)}, status=500)
