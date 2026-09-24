"""
python manage.py seed_demo_students

Households and learners for a demonstrable database.

Why this exists
---------------
The database this was written against held 58 students, of whom 22 had any
grade at all and 15 had any attendance -- a maximum of 10 attendance days for
any one learner. Every downstream feature degrades quietly at that density
rather than failing: the K-means view clusters ~14 students, the at-risk model
scores ~12, and the dashboards report on a school that barely exists. None of
that is a code defect, and no amount of fixing code repairs it.

This command owns only what student-service owns -- households and students.
Enrollments, attendance, grades and narratives come from enrollment-service's
`seed_demo`; invoices and payments from billing-service's `seed_demo_billing`.
The split follows table ownership deliberately: writing another service's
tables from here is the habit that produced the RequirementType split-brain
this project already has. `scripts/seed-demo.ps1` runs the three in order.

Determinism
-----------
`--seed` fixes every random draw, so a run is reproducible and a figure in the
thesis can be traced back to the data that produced it. The other two commands
derive each learner's latent traits from `(seed, student_id)` rather than from
anything stored here, so they agree with this command without sharing state.

Identifying seeded rows
-----------------------
Every learner created here gets an LRN in the reserved 9900-prefixed block.
That, and not a timestamp or a guess, is what `--wipe` deletes -- so re-running
this can never touch a real record that a registrar typed in.
"""
import random
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from students.models import Household, Student

# Reserved LRN block for generated learners. Real Philippine LRNs begin with a
# region code, so nothing a registrar enters lands in 9900.
SEED_LRN_PREFIX = "9900"

FIRST_NAMES_M = [
    "Jose", "Juan", "Miguel", "Gabriel", "Rafael", "Andres", "Emilio", "Carlos",
    "Antonio", "Ramon", "Francisco", "Luis", "Mateo", "Diego", "Paolo", "Enrique",
    "Nathaniel", "Joshua", "Christian", "Mark", "John Paul", "Angelo", "Kurt",
    "Rigoberto", "Dominic", "Elias", "Ezekiel", "Lorenzo",
]
FIRST_NAMES_F = [
    "Maria", "Ana", "Josefa", "Corazon", "Teresita", "Luzviminda", "Rosario",
    "Carmela", "Isabel", "Beatriz", "Cristina", "Dolores", "Imelda", "Leticia",
    "Angelica", "Patricia", "Kristine", "Mary Grace", "Jasmine", "Bianca",
    "Althea", "Nicole", "Sofia", "Danica", "Reyna", "Marisol", "Camille",
]
LAST_NAMES = [
    "Dela Cruz", "Santos", "Reyes", "Bautista", "Garcia", "Mendoza", "Torres",
    "Flores", "Ramos", "Gonzales", "Castillo", "Villanueva", "Aquino", "Rivera",
    "Domingo", "Salvador", "Navarro", "Pascual", "Manalo", "Cabrera", "Espiritu",
    "Lagman", "Bacani", "Trinidad", "Ocampo", "Soriano", "Fernandez", "Marquez",
    "Del Rosario", "Alonzo", "Macapagal", "Sarmiento", "Valdez", "Yabut",
]
BARANGAYS = [
    "Barangay San Isidro", "Barangay Poblacion", "Barangay Santo Niño",
    "Barangay Mabini", "Barangay Bagong Silang", "Barangay Malaya",
    "Barangay San Roque", "Barangay Maligaya", "Barangay Masagana",
]
MUNICIPALITY = "South Lakes, Laguna"

MARITAL_STATUSES = ["married", "separated", "single_parent", "widowed", "annulled"]
MARITAL_WEIGHTS = [0.62, 0.12, 0.16, 0.07, 0.03]

LIVING_ARRANGEMENTS = ["both_parents", "mother_only", "father_only", "guardian", "relative"]
LIVING_WEIGHTS = [0.60, 0.18, 0.07, 0.09, 0.06]

# The household table carries no income column, so 4Ps membership is the one
# socioeconomic marker available. It is a means-tested national cash transfer,
# which makes it a real (not invented) proxy: billing-service's seeder reads it
# straight off the household row to decide who falls behind on fees, so the
# financial-strain signal is reproducible from the data itself rather than from
# hidden state shared between the two commands.
FOUR_PS_SHARE = 0.18

# The grade ladder, and the age a learner is expected to turn during the school
# year they sit in it. Used only to give each learner a birth date consistent
# with the grade enrollment-service will place them in.
LADDER_AGES = {
    "Nursery": 4, "Kindergarten": 5,
    "Grade 1": 6, "Grade 2": 7, "Grade 3": 8, "Grade 4": 9,
    "Grade 5": 10, "Grade 6": 11,
    "Grade 7": 12, "Grade 8": 13, "Grade 9": 14, "Grade 10": 15,
    "Grade 11": 16, "Grade 12": 17,
}
LADDER = list(LADDER_AGES)


class Command(BaseCommand):
    help = "Create demo households and learners (LRN block 9900)."

    def add_arguments(self, parser):
        parser.add_argument("--students", type=int, default=180,
                            help="How many learners to create (default 180).")
        parser.add_argument("--seed", type=int, default=20260923,
                            help="RNG seed. Fixed by default so runs are reproducible.")
        parser.add_argument("--sy-start-year", type=int, default=None,
                            help="Opening year of the CURRENT school year. Defaults "
                                 "to the year today falls in, on the July cutoff -- "
                                 "the same rule enrollment-service's seed_demo uses.")
        parser.add_argument("--wipe", action="store_true",
                            help="Delete previously seeded learners and their households first.")

    def handle(self, *args, **opts):
        rng = random.Random(opts["seed"])
        count = opts["students"]

        # Must agree with enrollment-service's seed_demo, which derives the same
        # year the same way. These two commands hardcoding different defaults is
        # not a cosmetic mismatch: grade placement is driven by age, so a roster
        # aged for 2025 has nobody young enough for Nursery in 2026 -- the level
        # is offered, has subjects and a fee schedule, and shows zero learners.
        sy_year = opts["sy_start_year"]
        if sy_year is None:
            today = timezone.localdate()
            sy_year = today.year if today.month >= 7 else today.year - 1

        if count < 1:
            raise CommandError("--students must be at least 1.")

        with transaction.atomic():
            if opts["wipe"]:
                self._wipe()

            if Student.objects.filter(lrn__startswith=SEED_LRN_PREFIX).exists():
                raise CommandError(
                    "Seeded learners already exist. Re-run with --wipe to replace them."
                )

            households = self._make_households(rng, count)
            created = self._make_students(rng, count, sy_year, households)

        self.stdout.write(self.style.SUCCESS(
            f"Created {len(households)} households and {created} learners "
            f"(LRN {SEED_LRN_PREFIX}…)."
        ))
        self.stdout.write(
            "Next: enrollment-service `manage.py seed_demo`, "
            "then billing-service `manage.py seed_demo_billing`."
        )

    # ── wipe ────────────────────────────────────────────────────────────────

    def _wipe(self):
        """Remove previously seeded learners, and the households left empty.

        Scoped by the reserved LRN block, never by date or by "everything" --
        this runs against the same database a registrar has been typing real
        records into, and those must be untouchable from here.

        Enrollments, grades, attendance and invoices all cascade from the
        student row at the database level, so this clears the whole downstream
        tree in one statement. Households are removed only once no student
        remains attached, so a household shared with a real learner survives.
        """
        doomed = Student.objects.filter(lrn__startswith=SEED_LRN_PREFIX)
        household_ids = set(
            doomed.exclude(household__isnull=True).values_list("household_id", flat=True)
        )

        # Nothing below students cascades reliably. Django only cascades for
        # tables this service models, and student-service models none of the
        # academic or financial ones; at the database level the FKs onto
        # `enrollments` are NO ACTION or RESTRICT, which is correct for real
        # data -- nobody should lose a financial record by deleting a roster
        # row -- and means the teardown has to run child-first.
        #
        # The child list is read from the catalog rather than hardcoded. A
        # hand-maintained list is exactly the kind of thing that goes stale the
        # first time someone adds a table, and the failure mode is a confusing
        # FK error rather than anything that names the cause.
        #
        # Every statement stays scoped to the reserved LRN block, so this can
        # only ever reach rows this command created.
        like = f"{SEED_LRN_PREFIX}%"
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT c.conrelid::regclass::text AS child,
                       a.attname                  AS fk_column
                  FROM pg_constraint c
                  JOIN pg_attribute a
                    ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                 WHERE c.contype = 'f'
                   AND c.confrelid = 'enrollments'::regclass
                   AND array_length(c.conkey, 1) = 1
                """
            )
            children = cur.fetchall()

            removed = {}
            for child, fk_column in children:
                # Grandchildren (invoice items, installments, payments) hang off
                # these and DO cascade from their own parent, so deleting the
                # direct children is enough.
                cur.execute(
                    f"""
                    DELETE FROM {child}
                     WHERE {fk_column} IN (
                           SELECT e.enrollment_id
                             FROM enrollments e
                             JOIN students s ON s.student_id = e.student_id
                            WHERE s.lrn LIKE %s
                     )
                    """,
                    [like],
                )
                if cur.rowcount:
                    removed[child] = cur.rowcount

        for child, n in sorted(removed.items()):
            self.stdout.write(f"  wiped {n} rows from {child}")

        n, _ = doomed.delete()
        self.stdout.write(f"  wiped {n} seeded student rows (and their cascades)")

        if household_ids:
            orphans = Household.objects.filter(
                household_id__in=household_ids
            ).exclude(student__isnull=False)
            h, _ = orphans.delete()
            self.stdout.write(f"  wiped {h} now-empty households")

    # ── households ──────────────────────────────────────────────────────────

    def _make_households(self, rng, student_count):
        """One household per ~1.4 learners, so siblings genuinely share one.

        Siblings are not decoration. `accounts/guardian_provisioning.py` keys a
        parent's portal account off `household_id`, so a household with two
        enrolled children is the only way to exercise the case where one login
        covers several learners -- which is exactly the case a panel asks to see.
        """
        n = max(1, round(student_count / 1.4))
        rows = []
        for _ in range(n):
            marital = rng.choices(MARITAL_STATUSES, weights=MARITAL_WEIGHTS, k=1)[0]
            living = rng.choices(LIVING_ARRANGEMENTS, weights=LIVING_WEIGHTS, k=1)[0]
            # Single-parent and guardian households are over-represented in the
            # 4Ps rolls, so the two are correlated rather than drawn apart.
            strain = 1.8 if marital in ("separated", "single_parent", "widowed") else 1.0
            is_4ps = rng.random() < min(0.6, FOUR_PS_SHARE * strain)
            rows.append(Household(
                parent_marital_status=marital,
                living_arrangement=living,
                is_4ps_beneficiary=is_4ps,
                four_ps_id=f"4P-{rng.randrange(10**7, 10**8)}" if is_4ps else None,
            ))
        Household.objects.bulk_create(rows, batch_size=200)

        # bulk_create on an unmanaged table does not reliably return PKs on
        # every backend, so read them back rather than trusting the objects.
        return list(
            Household.objects.order_by("-household_id")
            .values_list("household_id", flat=True)[:n]
        )

    # ── learners ────────────────────────────────────────────────────────────

    def _make_students(self, rng, count, sy_year, household_ids):
        """Learners spread across the whole ladder, aged to match their grade.

        The age is not cosmetic: enrollment-service places a learner by the age
        they reach during the school year, so a birth date that disagrees with
        the intended grade produces a roster nobody would believe. `age` is
        stored as well as `birth_date` because the column exists and is NOT
        NULL-ish in practice -- note it is a snapshot the application never
        recomputes, which is a known wart, not something this command invents.
        """
        # Roughly even across the ladder, with the elementary years heavier,
        # the way a K-12 private school actually distributes.
        weights = [0.4, 0.6] + [1.0] * 6 + [0.9] * 4 + [0.6] * 2
        grades = rng.choices(LADDER, weights=weights, k=count)

        sy_open = date(sy_year, 6, 1)
        used_emails = set()
        rows = []

        # student_number is unique school-wide and a registrar may already hold
        # any given value -- one of them held 2026-0001 here. Walk past what is
        # taken rather than formatting blindly and colliding on insert. (The
        # model's own save() does something similar, but bulk_create bypasses
        # it, and its version is a read-then-write that would serialise every
        # row and still race.)
        taken_numbers = set(
            Student.objects.filter(student_number__startswith=f"{sy_year}-")
            .values_list("student_number", flat=True)
        )
        next_seq = iter(range(1, count + len(taken_numbers) + 2))

        def free_student_number():
            for n in next_seq:
                candidate = f"{sy_year}-{n:04d}"
                if candidate not in taken_numbers:
                    taken_numbers.add(candidate)
                    return candidate
            raise CommandError("Ran out of student numbers; widen the range.")

        for i, grade in enumerate(grades, start=1):
            sex = rng.choice(["male", "female"])
            first = rng.choice(FIRST_NAMES_M if sex == "male" else FIRST_NAMES_F)
            last = rng.choice(LAST_NAMES)
            middle = rng.choice(LAST_NAMES)

            age = LADDER_AGES[grade]
            # Born so they reach `age` during this school year, jittered across
            # the year the way a real cohort is.
            birth = date(sy_open.year - age, 1, 1) + timedelta(days=rng.randrange(365))

            barangay = rng.choice(BARANGAYS)
            address = f"{rng.randrange(1, 400)} {barangay}, {MUNICIPALITY}"

            email = None
            if age >= 12:  # only older learners plausibly have their own address
                candidate = (
                    f"{first.split()[0].lower()}.{last.split()[-1].lower()}{i}@example.ph"
                )
                if candidate not in used_emails:
                    used_emails.add(candidate)
                    email = candidate

            rows.append(Student(
                student_number=free_student_number(),
                lrn=f"{SEED_LRN_PREFIX}{i:08d}",
                first_name=first,
                middle_name=middle,
                last_name=last,
                age=age,
                sex=sex,
                religion=rng.choice(["Roman Catholic", "Iglesia ni Cristo",
                                     "Islam", "Born Again", "Aglipayan"]),
                birth_date=birth,
                email=email,
                mobile_number=f"09{rng.randrange(10**8, 10**9)}",
                status="active",
                current_address=address,
                permanent_address=address,
                household_id=rng.choice(household_ids),
            ))

        # bulk_create bypasses Student.save(), which is what we want here:
        # student_number is assigned explicitly above, and the generator in
        # save() is a read-then-write that would serialise 180 inserts and
        # still race (see its own comment, which claims otherwise).
        Student.objects.bulk_create(rows, batch_size=200)
        return len(rows)
