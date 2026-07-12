import resend
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsAdminRegistrarOrReadOnly
from .models import Enrollment


@api_view(["POST"])
@permission_classes([IsAdminRegistrarOrReadOnly])
def send_enrollment_email(request):
    # Only enrollment_id is trusted from the client -- every other field is
    # derived server-side from the DB record. Previously this endpoint sent
    # whatever student_name/student_email/etc the client posted, verbatim,
    # to an address the client also chose -- any authenticated role could
    # trigger an official-looking email to an arbitrary address.
    enrollment_id = request.data.get("enrollment_id")
    if not enrollment_id:
        return Response({"error": "enrollment_id is required."}, status=400)

    enrollment = (
        Enrollment.objects.select_related("student")
        .filter(pk=enrollment_id)
        .first()
    )
    if not enrollment:
        return Response({"error": "Enrollment not found."}, status=404)

    student = enrollment.student
    if not student.email:
        return Response({"error": "No email address on file for this student."}, status=400)

    student_name = " ".join(
        filter(None, [student.first_name, student.middle_name, student.last_name])
    ).strip() or "Student"
    grade_level  = enrollment.grade_level
    section      = enrollment.section
    school_year  = enrollment.school_year
    school_level = enrollment.get_school_level_display()

    try:
        resend.api_key = settings.RESEND_API_KEY

        params: resend.Emails.SendParams = {
            "from": "South Lakes Integrated School <onboarding@resend.dev>",
            "to": [student.email],
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
