from django.db import models


# ════════════════════════════════════════════════════════════════════════════
# FEE SCHEDULES — admin-defined fees per (school_level, grade_level)
# ════════════════════════════════════════════════════════════════════════════

class FeeSchedule(models.Model):
    SCHOOL_LEVEL_CHOICES = [
        ("nursery",            "Nursery"),
        ("kindergarten",       "Kindergarten"),
        ("elementary",         "Elementary"),
        ("junior_highschool",  "Junior High School"),
        ("senior_highschool",  "Senior High School"),
    ]

    fee_schedule_id = models.BigAutoField(primary_key=True)
    school_level    = models.CharField(max_length=20, choices=SCHOOL_LEVEL_CHOICES)
    grade_level     = models.CharField(max_length=20)
    is_active       = models.BooleanField(default=True)
    notes           = models.TextField(null=True, blank=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "fee_schedules"
        unique_together = (("school_level", "grade_level"),)

    def __str__(self):
        return f"{self.get_school_level_display()} — {self.grade_level}"


class FeeScheduleItem(models.Model):
    CATEGORY_CHOICES = [
        ("tuition", "Tuition"),
        ("misc",    "Miscellaneous"),
        ("other",   "Other"),
    ]

    fee_schedule_item_id = models.BigAutoField(primary_key=True)
    fee_schedule = models.ForeignKey(
        FeeSchedule,
        on_delete=models.CASCADE,
        db_column="fee_schedule_id",
        related_name="items",
    )
    item_category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    item_name     = models.CharField(max_length=150)
    amount        = models.DecimalField(max_digits=12, decimal_places=2)
    sort_order    = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = "fee_schedule_items"
        ordering = ("item_category", "sort_order", "fee_schedule_item_id")


# ════════════════════════════════════════════════════════════════════════════
# DISCOUNTS — managed in shared DB, may be reused across services
# ════════════════════════════════════════════════════════════════════════════

class DiscountType(models.Model):
    DISCOUNT_MODE_CHOICES = [
        ("percentage",   "Percentage"),
        ("fixed_amount", "Fixed amount"),
    ]

    discount_type_id = models.BigAutoField(primary_key=True)
    discount_code    = models.CharField(max_length=50, unique=True)
    discount_name    = models.CharField(max_length=150)
    discount_mode    = models.CharField(max_length=20, choices=DISCOUNT_MODE_CHOICES)
    discount_value   = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        managed = False
        db_table = "discount_types"

    def __str__(self):
        return self.discount_name


# ════════════════════════════════════════════════════════════════════════════
# INVOICES — auto-generated when an enrollment becomes "enrolled"
# ════════════════════════════════════════════════════════════════════════════

class StudentInvoice(models.Model):
    STATUS_CHOICES = [
        ("unpaid",         "Unpaid"),
        ("partially_paid", "Partially paid"),
        ("paid",           "Paid"),
        ("void",           "Void"),
    ]

    PAYMENT_PLAN_CHOICES = [
        ("monthly",     "Monthly"),
        ("quarterly",   "Quarterly"),
        ("semi_annual", "Semi-annual"),
        ("annual",      "Annual"),
    ]

    invoice_id      = models.BigAutoField(primary_key=True)
    enrollment_id   = models.BigIntegerField()  # FK to enrollments.enrollment_id (cross-service)
    invoice_no      = models.CharField(max_length=50, unique=True)
    invoice_date    = models.DateField(auto_now_add=True)
    status          = models.CharField(max_length=20, choices=STATUS_CHOICES, default="unpaid")
    payment_plan    = models.CharField(max_length=20, choices=PAYMENT_PLAN_CHOICES, default="monthly")
    recalculated_at = models.DateTimeField(null=True, blank=True)
    due_date        = models.DateField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "student_invoices"

    def __str__(self):
        return f"Invoice {self.invoice_no} (E#{self.enrollment_id})"


class StudentInvoiceItem(models.Model):
    invoice_item_id = models.BigAutoField(primary_key=True)
    invoice = models.ForeignKey(
        StudentInvoice,
        on_delete=models.CASCADE,
        db_column="invoice_id",
        related_name="items",
    )
    billing_item_id = models.BigIntegerField(null=True, blank=True)  # nullable FK to billing_items
    description     = models.CharField(max_length=255)
    amount          = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        managed = False
        db_table = "student_invoice_items"


class StudentInvoiceDiscount(models.Model):
    invoice_discount_id = models.BigAutoField(primary_key=True)
    invoice = models.ForeignKey(
        StudentInvoice,
        on_delete=models.CASCADE,
        db_column="invoice_id",
        related_name="discounts",
    )
    discount_type = models.ForeignKey(
        DiscountType,
        on_delete=models.SET_NULL,
        db_column="discount_type_id",
        null=True, blank=True,
        related_name="invoice_discounts",
    )
    description = models.CharField(max_length=255)
    amount      = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        managed = False
        db_table = "student_invoice_discounts"


# ════════════════════════════════════════════════════════════════════════════
# PAYMENTS — actual cash collected against an invoice
# ════════════════════════════════════════════════════════════════════════════

class StudentPayment(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ("cash",          "Cash"),
        ("bank_transfer", "Bank transfer"),
        ("gcash",         "GCash"),
        ("card",          "Card"),
        ("check",         "Check"),
        ("others",        "Others"),
    ]

    payment_id       = models.BigAutoField(primary_key=True)
    invoice = models.ForeignKey(
        StudentInvoice,
        on_delete=models.CASCADE,
        db_column="invoice_id",
        related_name="payments",
    )
    payment_date     = models.DateField()
    amount_paid      = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method   = models.CharField(max_length=30, choices=PAYMENT_METHOD_CHOICES)
    reference_number = models.CharField(max_length=100, null=True, blank=True)
    notes            = models.TextField(null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = "student_payments"


# ════════════════════════════════════════════════════════════════════════════
# INSTALLMENTS — auto-generated due-date schedule based on payment plan
# ════════════════════════════════════════════════════════════════════════════

class InvoiceInstallment(models.Model):
    STATUS_CHOICES = [
        ("pending",        "Pending"),
        ("partially_paid", "Partially paid"),
        ("paid",           "Paid"),
        ("overdue",        "Overdue"),
    ]

    installment_id = models.BigAutoField(primary_key=True)
    invoice = models.ForeignKey(
        StudentInvoice,
        on_delete=models.CASCADE,
        db_column="invoice_id",
        related_name="installments",
    )
    sequence    = models.IntegerField()
    due_date    = models.DateField()
    amount      = models.DecimalField(max_digits=12, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    class Meta:
        managed = False
        db_table = "invoice_installments"
        ordering = ("invoice_id", "sequence")
        unique_together = (("invoice", "sequence"),)