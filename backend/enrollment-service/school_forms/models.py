from django.db import models


class SchoolIdentity(models.Model):
    """
    Read-only mirror of `school_settings` (owned by billing-service): what
    the header of every school form names. The DepEd fields arrived with
    scripts/2026-10-school-identity.sql; the SF10 letterhead's landline and
    signature lines with scripts/2026-10-sf10-school-format.sql.
    """

    setting_id = models.BigAutoField(primary_key=True)
    school_name = models.CharField(max_length=150)
    school_address = models.TextField(null=True, blank=True)
    contact_email = models.CharField(max_length=150, null=True, blank=True)
    contact_phone = models.CharField(max_length=50, null=True, blank=True)
    deped_school_id = models.CharField(max_length=6, null=True, blank=True)
    region = models.CharField(max_length=100, null=True, blank=True)
    division = models.CharField(max_length=100, null=True, blank=True)
    district = models.CharField(max_length=100, null=True, blank=True)
    school_head_name = models.CharField(max_length=150, null=True, blank=True)
    contact_landline = models.CharField(max_length=50, null=True, blank=True)
    records_officer_name = models.CharField(max_length=150, null=True, blank=True)
    elementary_principal_name = models.CharField(max_length=150, null=True, blank=True)
    jhs_principal_name = models.CharField(max_length=150, null=True, blank=True)
    shs_principal_name = models.CharField(max_length=150, null=True, blank=True)
    shs_department_head_name = models.CharField(max_length=150, null=True, blank=True)

    class Meta:
        managed = False
        db_table = "school_settings"
