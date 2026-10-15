from django.core.exceptions import ValidationError
from django.db import models


class SchoolSetting(models.Model):
    """
    Singleton table — there must only ever be one row (setting_id = 1).
    Always access via SchoolSetting.objects.first() or get_or_create(pk=1).
    """
    setting_id           = models.BigAutoField(primary_key=True)
    current_school_year  = models.CharField(max_length=20)
    sy_start_date        = models.DateField()
    sy_end_date          = models.DateField()
    early_bird_days      = models.IntegerField(default=7)
    school_name          = models.CharField(max_length=150, default="South Lakes Integrated School")
    school_address       = models.TextField(null=True, blank=True)
    contact_email        = models.CharField(max_length=150, null=True, blank=True)
    contact_phone        = models.CharField(max_length=50, null=True, blank=True)
    # The header of every DepEd school form (scripts/2026-10-school-identity.sql);
    # read by enrollment-service's school_forms exports.
    deped_school_id      = models.CharField(max_length=6, null=True, blank=True)
    region               = models.CharField(max_length=100, null=True, blank=True)
    division             = models.CharField(max_length=100, null=True, blank=True)
    district             = models.CharField(max_length=100, null=True, blank=True)
    school_head_name     = models.CharField(max_length=150, null=True, blank=True)
    # The SF10 permanent record's letterhead and signature lines
    # (scripts/2026-10-sf10-school-format.sql); read by the same exports.
    contact_landline          = models.CharField(max_length=50, null=True, blank=True)
    records_officer_name      = models.CharField(max_length=150, null=True, blank=True)
    elementary_principal_name = models.CharField(max_length=150, null=True, blank=True)
    jhs_principal_name        = models.CharField(max_length=150, null=True, blank=True)
    shs_principal_name        = models.CharField(max_length=150, null=True, blank=True)
    shs_department_head_name  = models.CharField(max_length=150, null=True, blank=True)
    updated_at           = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "school_settings"

    def save(self, *args, **kwargs):
        # Force pk=1 so a second row can never be inserted.
        self.setting_id = 1
        super().save(*args, **kwargs)

    def clean(self):
        if not self.pk and SchoolSetting.objects.exists():
            raise ValidationError("Only one SchoolSetting row is allowed.")

    def __str__(self):
        return f"{self.school_name} — S.Y. {self.current_school_year}"