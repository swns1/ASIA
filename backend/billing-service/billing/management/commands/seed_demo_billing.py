"""
python manage.py seed_demo_billing

Fee schedules, invoices, installments and payments for the learners seeded by
the other two commands.

Why this goes through the real service functions
------------------------------------------------
Invoices are created with `generate_invoice_for_enrollment` and money is
applied with `apply_payment` -- the same functions the API calls -- rather than
by inserting rows. Fabricated rows would look right and be wrong in the ways
that matter: the discount waterfall, the installment calendar derived from
`sy_start_date`, the rounding remainder parked on the final installment, and
the invoice status recomputed from live installments are all logic, not data.
Seeding through them means the demo database is correct by construction, and it
exercises those paths end to end as a side effect.

Who falls behind, and why it is not random
------------------------------------------
Delinquency is driven by `households.is_4ps_beneficiary` -- read straight off
the household row rather than passed between commands. 4Ps is a means-tested
national cash transfer, so it is a real socioeconomic marker rather than an
invented one, and it gives billing history a defensible relationship to
something the school already records. That relationship is what makes arrears
usable later as a fifth at-risk signal; independent noise would make it
worthless for that and for any classifier trained on it.

Order
-----
Run after student-service's `seed_demo_students` and enrollment-service's
`seed_demo`. `scripts/seed-demo.ps1` runs all three.
"""
import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from billing.models import FeeSchedule, FeeScheduleItem, StudentInvoice, StudentPayment
from billing.services import apply_payment, generate_invoice_for_enrollment

SEED_LRN_PREFIX = "9900"

# Annual fees per level, in pesos. Tuition is the only discountable category;
# misc and other are added to the total untouched, which is what the waterfall
# in billing/services.py expects.
FEE_TABLE = {
    "nursery":           (22000, 6500, 2500),
    "kindergarten":      (24000, 6500, 2500),
    "elementary":        (28000, 7500, 3000),
    "junior_highschool": (34000, 8500, 3500),
    "senior_highschool": (38000, 9500, 4000),
}
MISC_ITEMS = ["Library Fee", "Laboratory Fee", "Medical and Dental", "Computer Fee"]
OTHER_ITEMS = ["ID and Insurance", "School Publication", "Athletics"]

# (school_level, grade_level) for every grade the school offers. Declared here
# rather than imported: enrollment-service owns the academic ladder, and these
# are separate Django projects that cannot import one another.
LADDER = [
    ("nursery", "Nursery"), ("kindergarten", "Kindergarten"),
    ("elementary", "Grade 1"), ("elementary", "Grade 2"), ("elementary", "Grade 3"),
    ("elementary", "Grade 4"), ("elementary", "Grade 5"), ("elementary", "Grade 6"),
    ("junior_highschool", "Grade 7"), ("junior_highschool", "Grade 8"),
    ("junior_highschool", "Grade 9"), ("junior_highschool", "Grade 10"),
    ("senior_highschool", "Grade 11"), ("senior_highschool", "Grade 12"),
]

PLANS = ["monthly", "quarterly", "semi_annual", "annual"]
PLAN_WEIGHTS = [0.55, 0.22, 0.13, 0.10]
METHODS = ["cash", "gcash", "bank_transfer", "check"]
METHOD_WEIGHTS = [0.45, 0.33, 0.17, 0.05]


class Command(BaseCommand):
    help = "Seed fee schedules, invoices and payments for demo learners."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, default=20260923)
        parser.add_argument("--school-year", default=None,
                            help="Defaults to school_settings.current_school_year.")
        parser.add_argument("--wipe", action="store_true",
                            help="Void and delete invoices for seeded learners first.")

    def handle(self, *args, **opts):
        rng = random.Random(opts["seed"])

        # Derived from the seeded data, not from school_settings. The settings
        # row is what this command is about to ALIGN, so reading the year from
        # it would bill whichever year the school was last pointed at -- which
        # is precisely the stale one the alignment exists to move off.
        school_year = opts["school_year"] or self._latest_seeded_year()
        if not school_year:
            raise CommandError(
                "No seeded enrollments found. Run student-service's "
                "`manage.py seed_demo_students` and enrollment-service's "
                "`manage.py seed_demo` first."
            )

        enrollments = self._seeded_enrollments(school_year)
        if not enrollments:
            raise CommandError(
                f"No seeded enrollments found for {school_year}. Run "
                "enrollment-service's `manage.py seed_demo` first."
            )

        with transaction.atomic():
            if opts["wipe"]:
                self._wipe([e["enrollment_id"] for e in enrollments])
            self._ensure_fee_schedules()
            self._align_school_settings(school_year)

        # Deliberately outside one big transaction: generate_invoice_for_enrollment
        # takes a per-enrollment advisory lock and opens its own atomic block, so
        # wrapping ~180 of them in a single outer transaction would hold every
        # lock until the last one committed.
        invoiced, paid, amount = self._bill(rng, enrollments, school_year)

        self.stdout.write(self.style.SUCCESS(
            f"{invoiced} invoices for {school_year}; {paid} payments "
            f"totalling PHP {amount:,.2f}."
        ))

    # ── lookups ─────────────────────────────────────────────────────────────

    def _latest_seeded_year(self):
        """The newest school year that has seeded enrollments.

        String ordering is safe here because every value went through
        `shared.school_year.normalize` on the way in, so they are all
        "YYYY-YYYY" and sort chronologically.
        """
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT MAX(e.school_year)
                  FROM enrollments e
                  JOIN students s ON s.student_id = e.student_id
                 WHERE s.lrn LIKE %s
                """,
                [f"{SEED_LRN_PREFIX}%"],
            )
            row = cur.fetchone()
        return (row[0] or "").strip() if row and row[0] else None

    def _seeded_enrollments(self, school_year):
        """Active enrollments for seeded learners, with the household's 4Ps flag.

        Raw SQL because `enrollments`, `students` and `households` all belong to
        other services -- billing already reads `enrollments` this way in
        recalculate_invoices_for_schedule, so this follows the existing seam
        rather than inventing a new one.
        """
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT e.enrollment_id, e.school_level, e.grade_level,
                       COALESCE(h.is_4ps_beneficiary, false)
                  FROM enrollments e
                  JOIN students   s ON s.student_id = e.student_id
             LEFT JOIN households h ON h.household_id = s.household_id
                 WHERE e.school_year = %s
                   AND e.enrollment_status = 'enrolled'
                   AND s.lrn LIKE %s
                 ORDER BY e.enrollment_id
                """,
                [school_year, f"{SEED_LRN_PREFIX}%"],
            )
            return [
                {"enrollment_id": r[0], "school_level": r[1],
                 "grade_level": r[2], "is_4ps": r[3]}
                for r in cur.fetchall()
            ]

    # ── wipe ────────────────────────────────────────────────────────────────

    def _wipe(self, enrollment_ids):
        invoices = StudentInvoice.objects.filter(enrollment_id__in=enrollment_ids)
        n = invoices.count()
        # Payments and installments are FK-cascaded from the invoice.
        invoices.delete()
        self.stdout.write(f"  wiped {n} invoices (payments and installments cascade)")

    # ── fee schedules ───────────────────────────────────────────────────────

    def _ensure_fee_schedules(self):
        """A complete, itemised fee schedule for every grade level.

        Four schedules existed and only one of them carried any items, so
        `generate_invoice_for_enrollment` raised "No active fee schedule for
        ..." for almost every learner -- which is why the database held two
        invoices in total.

        A schedule that already has items is left exactly as it is: an
        accountant may have entered those amounts, and this command has no
        business overwriting them. Only empty or missing schedules are filled.
        """
        created = filled = 0
        for level, grade in LADDER:
            schedule, made = FeeSchedule.objects.get_or_create(
                school_level=level, grade_level=grade,
                defaults={"is_active": True, "notes": "Seeded demo fee schedule."},
            )
            created += int(made)

            if schedule.items.exists():
                continue

            tuition, misc_total, other_total = FEE_TABLE[level]
            rows = [FeeScheduleItem(
                fee_schedule=schedule, item_category="tuition",
                item_name="Tuition Fee", amount=Decimal(tuition), sort_order=0,
            )]
            # Split the misc and other pots across named line items so the
            # invoice breakdown has something to show per category rather than
            # one opaque figure.
            rows += self._split_items(schedule, "misc", MISC_ITEMS, misc_total)
            rows += self._split_items(schedule, "other", OTHER_ITEMS, other_total)
            FeeScheduleItem.objects.bulk_create(rows)
            filled += 1

        self.stdout.write(
            f"  fee schedules: {created} created, {filled} itemised"
        )

    @staticmethod
    def _split_items(schedule, category, names, total):
        """Divide `total` across `names`, with the remainder on the last item
        so the parts always sum back to the pot."""
        share = (Decimal(total) / len(names)).quantize(Decimal("0.01"))
        remainder = Decimal(total) - share * len(names)
        return [
            FeeScheduleItem(
                fee_schedule=schedule,
                item_category=category,
                item_name=name,
                amount=share + (remainder if i == len(names) - 1 else Decimal("0")),
                sort_order=i + 1,
            )
            for i, name in enumerate(names)
        ]

    def _align_school_settings(self, school_year):
        """Point the singleton settings row at the year being demonstrated.

        `current_school_year` is what the whole application opens on, and
        `sy_start_date` is what the installment calendar and the Early Bird
        window are both measured from. Left pointing at a year that has already
        closed, every "this year" screen shows a finished year and the at-risk
        model has nothing left to be early about.

        This is billing-service's own table, which is why the alignment lives
        here rather than in the command that seeds the academic records.
        """
        start_year = int(str(school_year)[:4])
        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE school_settings
                   SET current_school_year = %s,
                       sy_start_date       = %s,
                       sy_end_date         = %s
                 WHERE setting_id = 1
                """,
                [school_year, f"{start_year}-06-01", f"{start_year + 1}-03-31"],
            )
            updated = cur.rowcount
        if updated:
            self.stdout.write(
                f"  school settings: current year set to {school_year} "
                f"({start_year}-06-01 to {start_year + 1}-03-31)"
            )
        else:
            self.stderr.write(
                "  school settings: no singleton row (setting_id=1) to align"
            )

    # ── billing ─────────────────────────────────────────────────────────────

    def _bill(self, rng, enrollments, school_year):
        invoiced = paid_count = 0
        total = Decimal("0")

        for row in enrollments:
            plan = rng.choices(PLANS, weights=PLAN_WEIGHTS, k=1)[0]
            try:
                invoice = generate_invoice_for_enrollment(row["enrollment_id"], plan)
            except ValueError as exc:
                self.stderr.write(f"  skipped #{row['enrollment_id']}: {exc}")
                continue
            invoiced += 1

            for payment in self._payments_for(rng, invoice, row["is_4ps"]):
                StudentPayment.objects.create(invoice=invoice, **payment)
                apply_payment(invoice.invoice_id, payment["amount_paid"])
                paid_count += 1
                total += payment["amount_paid"]

        return invoiced, paid_count, total

    def _payments_for(self, rng, invoice, is_4ps):
        """Settle some share of the schedule, installment by installment.

        Families pay per installment rather than in one lump, and a family
        under strain stops partway through the year rather than paying a
        uniform fraction of everything. That shape is what makes the arrears
        data usable: 'paid up to November, nothing since' is a signal, whereas
        'paid 63% of every installment' is not something a cashier ever sees.
        """
        # How far through the schedule this family got.
        if is_4ps:
            completion = rng.betavariate(2.0, 2.4)      # centred near 45%
        else:
            completion = rng.betavariate(5.5, 1.6)      # centred near 78%

        installments = list(invoice.installments.order_by("due_date", "sequence"))
        if not installments:
            return []

        settled = max(0, min(len(installments), round(completion * len(installments))))
        payments = []
        for inst in installments[:settled]:
            amount = Decimal(inst.amount)
            if amount <= 0:
                continue
            # A few pay late; the date is what the collections chart plots.
            lateness = rng.choice([-7, -3, 0, 0, 2, 9, 21])
            payments.append({
                "payment_date": inst.due_date + timedelta(days=lateness),
                "amount_paid": amount,
                "payment_method": rng.choices(METHODS, weights=METHOD_WEIGHTS, k=1)[0],
                "reference_number": f"REF-{rng.randrange(10**6, 10**7)}",
            })

        # One partial payment against the next installment, for the families
        # who are mid-way through one rather than cleanly between two.
        if settled < len(installments) and rng.random() < 0.35:
            inst = installments[settled]
            part = (Decimal(inst.amount) * Decimal(str(round(rng.uniform(0.2, 0.7), 2)))
                    ).quantize(Decimal("0.01"))
            if part > 0:
                payments.append({
                    "payment_date": inst.due_date + timedelta(days=rng.randrange(-5, 15)),
                    "amount_paid": part,
                    "payment_method": rng.choices(METHODS, weights=METHOD_WEIGHTS, k=1)[0],
                    "reference_number": f"REF-{rng.randrange(10**6, 10**7)}",
                })
        return payments
