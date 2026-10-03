"""
The data behind seed_data.sql, Tier 2.

Everything a person would want to change lives here: the two school years and
their calendars, each year's curriculum and fees, staff, sections and
advisers, every learner's profile and every enrollment they have, and the
online-intake invites and applications. generate_seed.py turns it into SQL.

S.Y. 2025-2026 is finished (25 learners). S.Y. 2026-2027 is the current year,
filled up to TODAY (25 learners). Tier 1's ten learners are the core of both.
"""
import datetime as dt
from decimal import Decimal

D = Decimal
TODAY = dt.date(2026, 9, 30)   # "today" for the current year: attendance, overdue, what is due
LRN_BLOCK = "136700000"
PASSWORD = "SlisDemo2026!"
EARLY_BIRD_DAYS = 7
SY1, SY2 = "2025-2026", "2026-2027"


def d(s):
    return dt.date.fromisoformat(s) if isinstance(s, str) else s


# ════════════════════════════════════════════════════════════════════════════
# SCHOOL YEARS AND CALENDARS
# ════════════════════════════════════════════════════════════════════════════
CALENDARS = {
    SY1: dict(
        start="2025-06-01", end="2026-03-31",
        holidays=[
            ("2025-06-06", "2025-06-06", "Eid'l Adha (Feast of Sacrifice)"),
            ("2025-06-12", "2025-06-12", "Independence Day"),
            ("2025-08-21", "2025-08-21", "Ninoy Aquino Day"),
            ("2025-08-25", "2025-08-25", "National Heroes Day"),
            ("2025-10-31", "2025-10-31", "All Saints' Day Eve"),
            ("2025-11-01", "2025-11-01", "All Saints' Day"),
            ("2025-11-30", "2025-11-30", "Bonifacio Day"),
            ("2025-12-08", "2025-12-08", "Feast of the Immaculate Conception"),
            ("2025-12-24", "2025-12-24", "Christmas Eve"),
            ("2025-12-25", "2025-12-25", "Christmas Day"),
            ("2025-12-30", "2025-12-30", "Rizal Day"),
            ("2025-12-31", "2025-12-31", "Last Day of the Year"),
            ("2026-01-01", "2026-01-01", "New Year's Day"),
            ("2026-02-17", "2026-02-17", "Chinese New Year"),
            ("2026-02-25", "2026-02-25", "EDSA People Power Revolution Anniversary"),
            ("2026-03-20", "2026-03-20", "Eid'l Fitr (Feast of Ramadan)"),
        ],
        days_off=[
            ("2025-10-17", "2025-10-17", "Teachers' In-Service Training", "No classes; faculty in-service training."),
            ("2025-12-20", "2026-01-04", "Christmas Break", "Classes resume on January 5, 2026."),
        ],
        breaks=[
            ("2025-08-25", "2025-08-29", "End of 1st Quarter Break"),
            ("2025-11-24", "2025-11-28", "Semestral Break"),
            ("2026-01-26", "2026-01-30", "End of 3rd Quarter Break"),
        ],
        quarters={
            "1st_quarter": ("2025-06-02", "2025-08-22", "1st Quarter"),
            "2nd_quarter": ("2025-09-01", "2025-11-21", "2nd Quarter"),
            "3rd_quarter": ("2025-12-01", "2026-01-23", "3rd Quarter"),
            "4th_quarter": ("2026-02-02", "2026-03-31", "4th Quarter"),
        },
        semesters={"1st_semester": ("2025-06-02", "2025-11-21"), "2nd_semester": ("2025-12-01", "2026-03-31")},
        exams=[
            ("2025-08-20", "2025-08-22", "1st Quarter Examinations"),
            ("2025-11-19", "2025-11-21", "2nd Quarter Examinations"),
            ("2026-01-21", "2026-01-23", "3rd Quarter Examinations"),
            ("2026-03-25", "2026-03-27", "4th Quarter Examinations"),
        ],
        events=[
            ("enrollment", "2025-05-05", "2025-05-30", "Enrollment Period", "Regular enrollment for S.Y. 2025-2026."),
            ("event", "2025-06-02", "2025-06-02", "Opening of Classes", None),
            ("event", "2025-07-31", "2025-07-31", "Nutrition Month Culminating Program", None),
            ("event", "2025-08-15", "2025-08-15", "Buwan ng Wika Celebration", None),
            ("other", "2025-09-05", "2025-09-05", "Parent-Teacher Conference (1st Quarter Cards)", "Release of 1st quarter report cards."),
            ("event", "2025-10-24", "2025-10-24", "United Nations Day Celebration", None),
            ("event", "2025-12-19", "2025-12-19", "Christmas Program", None),
            ("event", "2026-02-13", "2026-02-13", "School Foundation Day", None),
            ("event", "2026-03-28", "2026-03-28", "Graduation Rites (Grade 12)", None),
            ("event", "2026-03-30", "2026-03-30", "Moving-Up and Recognition Ceremony", None),
        ],
        graduation_last_day="2026-03-27",
    ),
    SY2: dict(
        start="2026-06-01", end="2027-03-31",
        holidays=[
            ("2026-06-12", "2026-06-12", "Independence Day"),
            ("2026-08-21", "2026-08-21", "Ninoy Aquino Day"),
            ("2026-08-31", "2026-08-31", "National Heroes Day"),
            ("2026-11-01", "2026-11-01", "All Saints' Day"),
            ("2026-11-02", "2026-11-02", "All Souls' Day (Special Non-Working Day)"),
            ("2026-11-30", "2026-11-30", "Bonifacio Day"),
            ("2026-12-08", "2026-12-08", "Feast of the Immaculate Conception"),
            ("2026-12-24", "2026-12-24", "Christmas Eve"),
            ("2026-12-25", "2026-12-25", "Christmas Day"),
            ("2026-12-30", "2026-12-30", "Rizal Day"),
            ("2026-12-31", "2026-12-31", "Last Day of the Year"),
            ("2027-01-01", "2027-01-01", "New Year's Day"),
            ("2027-02-25", "2027-02-25", "EDSA People Power Revolution Anniversary"),
            ("2027-03-10", "2027-03-10", "Eid'l Fitr (Feast of Ramadan) - date subject to proclamation"),
            ("2027-03-25", "2027-03-25", "Maundy Thursday"),
            ("2027-03-26", "2027-03-26", "Good Friday"),
        ],
        days_off=[
            ("2026-07-23", "2026-07-23", "Class Suspension: Tropical Storm Signal No. 2",
             "Classes suspended by the city government; no attendance taken."),
            ("2026-10-16", "2026-10-16", "Teachers' In-Service Training", "No classes; faculty in-service training."),
            ("2026-12-19", "2027-01-03", "Christmas Break", "Classes resume on January 4, 2027."),
        ],
        breaks=[
            ("2026-08-24", "2026-08-28", "End of 1st Quarter Break"),
            ("2026-11-23", "2026-11-27", "Semestral Break"),
            ("2027-01-25", "2027-01-29", "End of 3rd Quarter Break"),
        ],
        quarters={
            "1st_quarter": ("2026-06-01", "2026-08-21", "1st Quarter"),
            "2nd_quarter": ("2026-09-01", "2026-11-20", "2nd Quarter"),
            "3rd_quarter": ("2026-12-01", "2027-01-22", "3rd Quarter"),
            "4th_quarter": ("2027-02-01", "2027-03-31", "4th Quarter"),
        },
        semesters={"1st_semester": ("2026-06-01", "2026-11-20"), "2nd_semester": ("2026-12-01", "2027-03-31")},
        exams=[
            ("2026-08-18", "2026-08-20", "1st Quarter Examinations"),
            ("2026-11-17", "2026-11-19", "2nd Quarter Examinations"),
            ("2027-01-19", "2027-01-21", "3rd Quarter Examinations"),
            ("2027-03-22", "2027-03-24", "4th Quarter Examinations"),
        ],
        events=[
            ("enrollment", "2026-05-04", "2026-05-29", "Enrollment Period", "Regular enrollment for S.Y. 2026-2027."),
            ("event", "2026-06-01", "2026-06-01", "Opening of Classes", None),
            ("event", "2026-07-31", "2026-07-31", "Nutrition Month Culminating Program", None),
            ("event", "2026-08-14", "2026-08-14", "Buwan ng Wika Celebration", None),
            ("other", "2026-09-04", "2026-09-04", "Parent-Teacher Conference (1st Quarter Cards)", "Release of 1st quarter report cards."),
            ("event", "2026-10-23", "2026-10-23", "United Nations Day Celebration", None),
            ("event", "2026-12-18", "2026-12-18", "Christmas Program", None),
            ("event", "2027-02-12", "2027-02-12", "School Foundation Day", None),
            ("event", "2027-03-27", "2027-03-27", "Graduation Rites (Grade 12)", None),
            ("event", "2027-03-29", "2027-03-29", "Moving-Up and Recognition Ceremony", None),
        ],
        graduation_last_day="2027-03-24",
    ),
}
CURRENT_SY = SY2   # filled up to TODAY


# ════════════════════════════════════════════════════════════════════════════
# CURRICULUM, per year
# S.Y. 2026-2027 moves to the MATATAG names: Mother Tongue is dropped in
# Grades 1-3, EsP becomes GMRC (Grades 1-6) and Values Education (Grades 7-10),
# and Grade 10 MAPEH keeps its code under a new name. Same code, different
# year, different subject: every query has to join on code AND year.
# ════════════════════════════════════════════════════════════════════════════
def subject_catalogue(sy):
    rows = []   # (code, name, level, grade, strand, semester)
    early = [("LLC", "Language, Literacy and Communication"), ("MATH", "Mathematics"),
             ("UPNE", "Understanding the Physical and Natural Environment"),
             ("PHMD", "Physical Health and Motor Development"), ("SED", "Socio-Emotional Development")]
    for grade, level, prefix in (("Nursery", "nursery", "N"), ("Kindergarten", "kindergarten", "K")):
        for code, name in early:
            rows.append((f"{prefix}-{code}", name, level, grade, None, None))
    if sy == SY1:
        values_el = ("ESP", "Edukasyon sa Pagpapakatao")
        values_jhs = ("ESP", "Edukasyon sa Pagpapakatao")
        lower = [("MT", "Mother Tongue"), ("FIL", "Filipino"), ("ENG", "English"), ("MATH", "Mathematics"),
                 ("AP", "Araling Panlipunan"), ("MAPEH", "MAPEH"), values_el]
    else:
        values_el = ("GMRC", "Good Manners and Right Conduct")
        values_jhs = ("VE", "Values Education")
        lower = [("FIL", "Filipino"), ("ENG", "English"), ("MATH", "Mathematics"),
                 ("AP", "Araling Panlipunan"), ("MAPEH", "MAPEH"), values_el]
    upper = [("FIL", "Filipino"), ("ENG", "English"), ("MATH", "Mathematics"), ("SCI", "Science"),
             ("AP", "Araling Panlipunan"), ("MAPEH", "MAPEH"),
             ("EPP", "Edukasyong Pantahanan at Pangkabuhayan"), values_el]
    jhs = [("FIL", "Filipino"), ("ENG", "English"), ("MATH", "Mathematics"), ("SCI", "Science"),
           ("AP", "Araling Panlipunan"), ("MAPEH", "MAPEH"),
           ("TLE", "Technology and Livelihood Education"), values_jhs]
    for n in (1, 2, 3):
        subjects = lower + ([("SCI", "Science")] if n == 3 else [])
        for code, name in subjects:
            rows.append((f"G{n}-{code}", f"{name} {n}", "elementary", f"Grade {n}", None, None))
    for n in (4, 5, 6):
        for code, name in upper:
            rows.append((f"G{n}-{code}", f"{name} {n}", "elementary", f"Grade {n}", None, None))
    for n in (7, 8, 9, 10):
        for code, name in jhs:
            label = f"{name} {n}"
            if sy == SY2 and n == 10 and code == "MAPEH":
                label = "Music, Arts, Physical Education and Health 10"
            rows.append((f"G{n}-{code}", label, "junior_highschool", f"Grade {n}", None, None))
    shs = {
        ("Grade 11", "1st"): [
            ("G11-ORALCOM", "Oral Communication in Context", None),
            ("G11-KOMPAN", "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino", None),
            ("G11-GENMATH", "General Mathematics", None),
            ("G11-ELS", "Earth and Life Science", None),
            ("G11-PERDEV", "Personal Development", None),
            ("G11-PEH1", "Physical Education and Health 1", None),
            ("G11-STEM-PRECAL", "Pre-Calculus", "STEM"),
            ("G11-ABM-ORGMAN", "Organization and Management", "ABM"),
        ],
        ("Grade 11", "2nd"): [
            ("G11-RWS", "Reading and Writing Skills", None),
            ("G11-PAGBASA", "Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik", None),
            ("G11-STATPROB", "Statistics and Probability", None),
            ("G11-PHYSCI", "Physical Science", None),
            ("G11-PHILO", "Introduction to the Philosophy of the Human Person", None),
            ("G11-PEH2", "Physical Education and Health 2", None),
            ("G11-STEM-BASCAL", "Basic Calculus", "STEM"),
            ("G11-ABM-BUSMATH", "Business Mathematics", "ABM"),
        ],
        ("Grade 12", "1st"): [
            ("G12-21LIT", "21st Century Literature from the Philippines and the World", None),
            ("G12-CPAR", "Contemporary Philippine Arts from the Regions", None),
            ("G12-UCSP", "Understanding Culture, Society and Politics", None),
            ("G12-EMPTECH", "Empowerment Technologies", None),
            ("G12-PEH3", "Physical Education and Health 3", None),
            ("G12-STEM-GENPHYS1", "General Physics 1", "STEM"),
            ("G12-STEM-GENCHEM1", "General Chemistry 1", "STEM"),
            ("G12-ABM-FABM1", "Fundamentals of Accountancy, Business and Management 1", "ABM"),
            ("G12-ABM-BUSFIN", "Business Finance", "ABM"),
        ],
        ("Grade 12", "2nd"): [
            ("G12-MIL", "Media and Information Literacy", None),
            ("G12-PR2", "Practical Research 2", None),
            ("G12-III", "Inquiries, Investigations and Immersion", None),
            ("G12-PEH4", "Physical Education and Health 4", None),
            ("G12-STEM-GENPHYS2", "General Physics 2", "STEM"),
            ("G12-STEM-GENBIO2", "General Biology 2", "STEM"),
            ("G12-ABM-APPECON", "Applied Economics", "ABM"),
            ("G12-ABM-BUSETHICS", "Business Ethics and Social Responsibility", "ABM"),
        ],
    }
    for (grade, sem), subjects in shs.items():
        for code, name, strand in subjects:
            rows.append((code, name, "senior_highschool", grade, strand, sem))
    return rows


LADDER = [("nursery", "Nursery"), ("kindergarten", "Kindergarten")] + \
    [("elementary", f"Grade {n}") for n in range(1, 7)] + \
    [("junior_highschool", f"Grade {n}") for n in range(7, 11)] + \
    [("senior_highschool", "Grade 11"), ("senior_highschool", "Grade 12")]
LEVEL_OF = {g: lvl for lvl, g in LADDER}


# ════════════════════════════════════════════════════════════════════════════
# FEES, per year: (category, name, amount, sort)
# 2025-2026 is the seed's own. 2026-2027 mirrors the schedules that already
# exist in the live database (Nursery-G12 minus G3/G5/G9; G1 has NO items).
# The seed adds G3 and G5 and deliberately leaves G9 without a schedule and
# G1 without items, exactly as the live data has them.
# ════════════════════════════════════════════════════════════════════════════
def fee_items(sy, grade):
    """None = the year has no fee schedule for the grade; [] = a schedule
    with no items (invoices come out at P0.00)."""
    if sy == SY1:
        if grade in ("Nursery", "Kindergarten"):
            return [("tuition", "Tuition Fee", 17000, 1), ("misc", "Miscellaneous Fee", 2000, 2), ("misc", "Books & Materials", 1500, 3)]
        if grade in ("Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"):
            return [("tuition", "Tuition Fee", 19000, 1), ("misc", "Miscellaneous Fee", 2500, 2), ("misc", "Books & Materials", 1800, 3)]
        if grade == "Grade 6":
            return [("tuition", "Tuition Fee", 19000, 1), ("misc", "Miscellaneous Fee", 2500, 2), ("misc", "Books & Materials", 2000, 3)]
        if grade in ("Grade 7", "Grade 8", "Grade 9", "Grade 10"):
            return [("tuition", "Tuition Fee", 23000, 1), ("misc", "Miscellaneous Fee", 3000, 2), ("misc", "Books & Materials", 2500, 3), ("other", "Student Activities", 500, 4)]
        if grade == "Grade 11":
            return [("tuition", "Tuition Fee", 27000, 1), ("misc", "Miscellaneous Fee", 3500, 2), ("misc", "Books & Materials", 3000, 3), ("other", "Lab Fee", 1000, 4)]
        return [("tuition", "Tuition Fee", 27000, 1), ("misc", "Miscellaneous Fee", 3500, 2), ("misc", "Books & Materials", 3000, 3), ("other", "Research Fee", 1500, 4)]
    if grade == "Grade 9":
        return None
    if grade == "Grade 1":
        return []
    if grade in ("Nursery", "Kindergarten"):
        return [("tuition", "Tuition Fee", 18000, 1), ("misc", "Miscellaneous Fee", 2000, 2), ("misc", "Books & Materials", 1500, 3)]
    if grade in ("Grade 2", "Grade 3", "Grade 4", "Grade 5"):
        return [("tuition", "Tuition Fee", 20000, 1), ("misc", "Miscellaneous Fee", 2500, 2), ("misc", "Books & Materials", 1800, 3)]
    if grade == "Grade 6":
        return [("tuition", "Tuition Fee", 20000, 1), ("misc", "Miscellaneous Fee", 2500, 2), ("misc", "Books & Materials", 2000, 3)]
    if grade in ("Grade 7", "Grade 8", "Grade 10"):
        return [("tuition", "Tuition Fee", 24000, 1), ("misc", "Miscellaneous Fee", 3000, 2), ("misc", "Books & Materials", 2500, 3), ("other", "Student Activities", 500, 4)]
    if grade == "Grade 11":
        return [("tuition", "Tuition Fee", 28000, 1), ("misc", "Miscellaneous Fee", 3500, 2), ("misc", "Books & Materials", 3000, 3), ("other", "Lab Fee", 1000, 4)]
    return [("tuition", "Tuition Fee", 28000, 1), ("misc", "Miscellaneous Fee", 3500, 2), ("misc", "Books & Materials", 3000, 3), ("other", "Research Fee", 1500, 4)]


FEE_NOTES = {SY1: "S.Y. 2025-2026 rates.", SY2: "S.Y. 2026-2027 rates (added by the seed data)."}

DISCOUNT_TYPES = [
    ("EARLY_BIRD", "Early Bird (first 7 days of S.Y.)", "percentage", "5.00"),
    ("SEMI_ANNUAL_PLAN", "Semi-Annual Payment Plan", "percentage", "3.00"),
    ("ANNUAL_PLAN", "Annual Payment Plan", "percentage", "5.00"),
    ("MONTHLY_PLAN", "Monthly Payment Plan", "percentage", "0.00"),
    ("QUARTERLY_PLAN", "Quarterly Payment Plan", "percentage", "0.00"),
    ("ESC_BILLING", "ESC Subsidy (Billing)", "fixed_amount", "14000.00"),
    ("4PS_BILLING", "4Ps Discount 20%", "percentage", "20.00"),
    ("HONOR_BILLING", "Academic Honor Discount 10%", "percentage", "10.00"),
    ("SIBLING_BILLING", "Sibling Discount 5%", "percentage", "5.00"),
]
SCHOLARSHIP_TYPES = {
    "ESC": ("Education Service Contracting (ESC)", "Gov subsidy for JHS/SHS", "fixed_amount", D("14000.00")),
    "4PS": ("4Ps Beneficiary Discount", "DSWD Pantawid Pamilya", "percentage", D("20.00")),
    "HONOR": ("Academic Excellence Award", "Top 10 of previous year", "percentage", D("10.00")),
    "SIBLING": ("Sibling Discount", "5% off for 2nd+ sibling", "percentage", D("5.00")),
    "EMPLOYEE": ("Staff / Employee Child Discount", "For children of staff", "percentage", D("15.00")),
    # New in Tier 2: the Senior High voucher for ESC completers. A code
    # starting with QVR is a voucher to billing, so it is applied first.
    "QVR": ("Senior High School Voucher Program (QVR)", "DepEd SHS VP for JHS ESC completers (NCR private-school rate)",
            "fixed_amount", D("22500.00")),
}
PLAN_PCT = {"monthly": D("0"), "quarterly": D("0"), "semi_annual": D("3.00"), "annual": D("5.00")}
PLAN_TYPE = {"semi_annual": ("SEMI_ANNUAL_PLAN", "Semi-Annual Payment Plan"),
             "annual": ("ANNUAL_PLAN", "Annual Payment Plan")}
PLAN_SHAPE = {"monthly": (10, 1), "quarterly": (4, 3), "semi_annual": (2, 5), "annual": (1, 1)}


# ════════════════════════════════════════════════════════════════════════════
# STAFF  (name, email, role, is_active)
# The seed now sets is_active explicitly, so a re-run restores it.
# ════════════════════════════════════════════════════════════════════════════
STAFF = [
    ("Amelia Concepcion", "superadmin@slis.test", "super_admin", True),
    ("Rodel Manalastas", "admin@slis.test", "admin", True),
    ("Lorna Villareal", "registrar@slis.test", "registrar", True),
    ("Jocelyn Ramos", "jocelyn.ramos@slis.test", "registrar", True),
    ("Edwin Salcedo", "accounting@slis.test", "accounting", True),
    ("Arvin Lacson", "arvin.lacson@slis.test", "accounting", True),
    ("Teresa Aquino", "teacher@slis.test", "teacher", True),
    ("Cristina Bautista", "cristina.bautista@slis.test", "teacher", True),
    ("Rowena De Leon", "rowena.deleon@slis.test", "teacher", True),
    ("Josefina Tolentino", "josefina.tolentino@slis.test", "teacher", True),
    # Advised Grade 2 Bonifacio in 2025-2026, then moved to the registrar's
    # office in June 2026: a past adviser who is no longer a teacher.
    ("Ramon Estrada", "ramon.estrada@slis.test", "registrar", True),
    ("Aileen Manalo", "aileen.manalo@slis.test", "teacher", True),
    # Resigned 2026-09-18, mid-year. Still on Grade 4 Luna's 2026-2027
    # advisory (kept and flagged, not removed), with a co-adviser covering.
    ("Arnel Pascual", "arnel.pascual@slis.test", "teacher", False),
    ("Emmanuel Robles", "emmanuel.robles@slis.test", "teacher", True),
    ("Grace Villanueva", "grace.villanueva@slis.test", "teacher", True),
    ("Dennis Ocampo", "dennis.ocampo@slis.test", "teacher", True),
    # Resigned May 2026 after advising Grade 9 Sapphire in 2025-2026. Her
    # section has NO adviser in 2026-2027 yet.
    ("Maricar Santiago", "maricar.santiago@slis.test", "teacher", False),
    ("Jonathan Dimaculangan", "jonathan.dimaculangan@slis.test", "teacher", True),
    ("Kristine Mendoza", "kristine.mendoza@slis.test", "teacher", True),
    ("Rafael Guevarra", "rafael.guevarra@slis.test", "teacher", True),
    ("Angelica Ferrer", "angelica.ferrer@slis.test", "teacher", True),
    ("Noel Sarmiento", "noel.sarmiento@slis.test", "teacher", True),
    ("Carla Bernardo", "carla.bernardo@slis.test", "teacher", True),
    ("Victor Ilagan", "victor.ilagan@slis.test", "teacher", True),
    ("Hazel Castro", "hazel.castro@slis.test", "teacher", True),
    ("Joel Panganiban", "joel.panganiban@slis.test", "teacher", True),
    ("Rhea Dimalanta", "rhea.dimalanta@slis.test", "teacher", True),   # hired 2026, no section
]
# Guardian portal logins that can actually sign in (password above). Every
# other guardian with an email gets an account the way enrollment-service's
# provisioning makes one: linked, with an unusable password.
DEMO_GUARDIANS = [
    ("Maribel Santos Reyes", "maribel.reyes.seed@gmail.com"),     # Maria + Paolo
    ("Maria Chua Dizon", "maria.dizon.seed@gmail.com"),           # Jasmine
    ("Perla Gonzales Ibarra", "perla.ibarra.seed@gmail.com"),     # Ryan, Rica, Renz (email on one child only)
    ("Danilo Perez Jimenez", "danilo.jimenez.seed@gmail.com"),    # Patrick: arrears in both years
]
REGISTRAR = "registrar@slis.test"
REGISTRAR2 = "jocelyn.ramos@slis.test"
SUPERADMIN = "superadmin@slis.test"

# ════════════════════════════════════════════════════════════════════════════
# SECTIONS AND ADVISERS per year: (level, grade, name, strand, [(email, created)])
# The first adviser listed records attendance.
# ════════════════════════════════════════════════════════════════════════════
A25 = "2025-05-05 09:00:00"
A26 = "2026-05-06 09:00:00"
SECTIONS = {
    SY1: [
        ("nursery", "Nursery", "Rose", None, [("cristina.bautista@slis.test", A25)]),
        ("kindergarten", "Kindergarten", "Sunflower", None, [("rowena.deleon@slis.test", A25)]),
        ("elementary", "Grade 1", "Rizal", None, [("josefina.tolentino@slis.test", A25)]),
        ("elementary", "Grade 2", "Bonifacio", None, [("ramon.estrada@slis.test", A25)]),
        ("elementary", "Grade 3", "Mabini", None, [("aileen.manalo@slis.test", A25)]),
        ("elementary", "Grade 4", "Luna", None, [("arnel.pascual@slis.test", A25)]),
        ("elementary", "Grade 5", "Silang", None, [("teacher@slis.test", A25)]),
        ("elementary", "Grade 6", "Aguinaldo", None, [("emmanuel.robles@slis.test", A25)]),
        ("junior_highschool", "Grade 7", "Diamond", None, [("grace.villanueva@slis.test", A25)]),
        ("junior_highschool", "Grade 7", "Pearl", None, [("joel.panganiban@slis.test", A25)]),
        ("junior_highschool", "Grade 8", "Emerald", None, [("dennis.ocampo@slis.test", A25)]),
        ("junior_highschool", "Grade 9", "Sapphire", None, [("maricar.santiago@slis.test", A25)]),
        ("junior_highschool", "Grade 10", "Ruby", None, [("jonathan.dimaculangan@slis.test", A25)]),
        ("senior_highschool", "Grade 11", "STEM-A", "STEM", [("kristine.mendoza@slis.test", A25)]),
        ("senior_highschool", "Grade 11", "ABM-A", "ABM", [("rafael.guevarra@slis.test", A25)]),
        ("senior_highschool", "Grade 12", "STEM-A", "STEM", [("angelica.ferrer@slis.test", A25)]),
        ("senior_highschool", "Grade 12", "ABM-A", "ABM", [("noel.sarmiento@slis.test", A25)]),
    ],
    SY2: [
        ("nursery", "Nursery", "Rose", None, [("cristina.bautista@slis.test", A26)]),
        ("kindergarten", "Kindergarten", "Sunflower", None, [("rowena.deleon@slis.test", A26)]),
        ("elementary", "Grade 1", "Rizal", None, [("josefina.tolentino@slis.test", A26)]),
        ("elementary", "Grade 2", "Bonifacio", None, [("hazel.castro@slis.test", A26)]),
        # Renamed from Mabini: carry-over from 2025-2026 would add a second
        # Grade 3 section called Mabini rather than recognise the rename.
        ("elementary", "Grade 3", "Del Pilar", None, [("aileen.manalo@slis.test", A26)]),
        ("elementary", "Grade 4", "Luna", None, [("arnel.pascual@slis.test", A26),
                                                  ("carla.bernardo@slis.test", "2026-09-21 08:00:00")]),
        ("elementary", "Grade 5", "Silang", None, [("teacher@slis.test", A26)]),
        ("elementary", "Grade 6", "Aguinaldo", None, [("emmanuel.robles@slis.test", A26)]),
        ("junior_highschool", "Grade 7", "Diamond", None, [("grace.villanueva@slis.test", A26)]),
        ("junior_highschool", "Grade 7", "Pearl", None, [("joel.panganiban@slis.test", A26)]),
        ("junior_highschool", "Grade 8", "Emerald", None, [("dennis.ocampo@slis.test", A26)]),
        ("junior_highschool", "Grade 9", "Sapphire", None, []),     # no adviser yet
        ("junior_highschool", "Grade 10", "Ruby", None, [("jonathan.dimaculangan@slis.test", A26)]),
        ("senior_highschool", "Grade 11", "STEM-A", "STEM", [("kristine.mendoza@slis.test", A26),
                                                             ("victor.ilagan@slis.test", A26)]),
        ("senior_highschool", "Grade 11", "ABM-A", "ABM", [("rafael.guevarra@slis.test", A26)]),
        ("senior_highschool", "Grade 12", "STEM-A", "STEM", [("angelica.ferrer@slis.test", A26)]),
        ("senior_highschool", "Grade 12", "ABM-A", "ABM", [("rafael.guevarra@slis.test", A26)]),
    ],
}
SECTION_CREATED = {SY1: "2025-05-02 09:00:00", SY2: "2026-05-04 09:00:00"}


# ════════════════════════════════════════════════════════════════════════════
# HOUSEHOLDS  household_id -> (marital status, living arrangement, 4Ps, 4Ps ID)
# ════════════════════════════════════════════════════════════════════════════
HOUSEHOLDS = {
    100: ("married", "both_parents", False, None),
    104: ("single_parent", "mother_only", True, "4PS-SEED-002"),
    105: ("married", "both_parents", False, None),
    110: ("married", "both_parents", False, None),
    111: ("married", "both_parents", False, None),
    112: ("single_parent", "mother_only", True, "4PS-SEED-008"),
    113: ("annulled", "mother_only", False, None),
    114: ("married", "both_parents", True, "4PS-SEED-004"),
    115: ("separated", "father_only", False, None),
    116: ("widowed", "mother_only", False, None),
    117: ("married", "both_parents", False, None),
    120: ("married", "both_parents", False, None),
    125: ("married", "mother_only", False, None),
    126: ("married", "both_parents", False, None),
    127: ("married", "both_parents", False, None),
    128: ("married", "both_parents", False, None),
    129: ("widowed", "mother_only", True, "4PS-SEED-006"),
    131: ("married", "others", False, None),
    138: ("married", "both_parents", False, None),
    140: ("married", "both_parents", False, None),
    141: ("separated", "guardian", True, "4PS-SEED-007"),
    143: ("separated", "father_only", False, None),
    147: ("married", "relative", False, None),
    148: ("married", "both_parents", False, None),
    151: ("married", "both_parents", False, None),
    155: ("married", "both_parents", False, None),
    156: ("married", "independent", False, None),
    # ── Tier 2.5 households (157-176) ──
    157: ("married", "both_parents", False, None),          # Rosales twins
    159: ("married", "both_parents", False, None),
    160: ("married", "both_parents", False, None),
    161: ("married", "both_parents", False, None),
    162: ("married", "both_parents", False, None),
    163: ("single_parent", "mother_only", True, "4PS-SEED-009"),
    164: ("married", "both_parents", False, None),
    165: ("married", "relative", False, None),              # aunt is the guardian
    166: ("married", "both_parents", False, None),
    167: ("married", "both_parents", False, None),
    168: ("married", "both_parents", False, None),
    169: ("married", "both_parents", True, "4PS-SEED-010"),
    170: ("separated", "mother_only", False, None),
    171: ("married", "both_parents", False, None),
    172: ("married", "both_parents", False, None),
    173: ("married", "both_parents", False, None),
    174: ("widowed", "mother_only", True, "4PS-SEED-011"),
    175: ("married", "both_parents", False, None),
    176: ("married", "both_parents", False, None),
}

REQUIRED_ALL = ["psa_birth_certificate", "health_record"]
REQUIRED_TRANSFEREE = ["form_137_or_138", "certificate_good_moral"]
DOC_NAMES = {
    "psa_birth_certificate": "PSA Birth Certificate", "health_record": "Health Record",
    "form_137_or_138": "Form 137/138", "certificate_good_moral": "Certificate of Good Moral",
    "birth_certificate": "Birth Certificate", "form_138": "Form 138",
    "clearance_previous_school": "Clearance from Previous School", "esc_transferee_qc": "ESC Transferee QC",
    "ncae_result": "NCAE Result", "recommendation_letter": "Recommendation Letter",
    "alien_certificate": "Alien Certificate of Registration (ACR I-Card)",
    "esc_completers": "ESC Certificate (JHS Completer)", "certificate_non_sf9": "Certificate (no SF9 issued)",
}


# ════════════════════════════════════════════════════════════════════════════
# LEARNER PROFILES
# guardians: (relationship, name, occupation, email, mobile, is_primary)
# docs: optional documents on top of what the entry status requires.
# doc_overrides: code -> dict(submitted=False | image=False | verified=False, remark=...)
# doc_missing: required codes that were never handed in.
# ════════════════════════════════════════════════════════════════════════════
def P(**kw):
    kw.setdefault("suffix", None)
    kw.setdefault("email", None)
    kw.setdefault("mobile", None)
    kw.setdefault("permanent", None)
    kw.setdefault("siblings", [])
    kw.setdefault("previous", [])
    kw.setdefault("docs", [])
    kw.setdefault("doc_overrides", {})
    kw.setdefault("doc_missing", [])
    return kw


PROFILES = [
    # ── Tier 1 ────────────────────────────────────────────────────────────
    P(key="paolo", student_id=152, household_id=100, first="Paolo", middle="Santos", last="Reyes", sex="male",
      religion="Roman Catholic", birth="2021-09-08", status="active",
      current="Blk 1 Lot 2 Sampaguita St., Brgy. San Jose, Quezon City",
      siblings=[("Roberto Santos Reyes Jr.", 11)],
      previous=[("Little Seeds Learning Center", "Brgy. San Jose, Quezon City")], docs=["birth_certificate"],
      guardians=[("mother", "Maribel Santos Reyes", "Public School Teacher", "maribel.reyes.seed@gmail.com", "09171100001", True),
                 ("father", "Roberto Cruz Reyes", "Civil Engineer", "roberto.reyes.seed@gmail.com", "09181100001", False)]),
    P(key="maria", student_id=100, household_id=100, first="Maria", middle="Santos", last="Reyes", sex="female",
      religion="Roman Catholic", birth="2020-03-15", status="active",
      current="Blk 1 Lot 2 Sampaguita St., Brgy. San Jose, Quezon City",
      siblings=[("Roberto Santos Reyes Jr.", 11)],
      previous=[("Little Seeds Learning Center", "Brgy. San Jose, Quezon City")], docs=["birth_certificate"],
      guardians=[("mother", "Maribel Santos Reyes", "Public School Teacher", "maribel.reyes.seed@gmail.com", "09171100001", True),
                 ("father", "Roberto Cruz Reyes", "Civil Engineer", "roberto.reyes.seed@gmail.com", "09181100001", False)]),
    P(key="bianca", student_id=110, household_id=110, first="Bianca", middle="Reyes", last="Soriano", sex="female",
      religion="Roman Catholic", birth="2015-03-20", status="active",
      current="14 Tulip St., Brgy. San Vicente, Pasig City", siblings=[("Carlo Reyes Soriano", 8)],
      previous=[("Little Stars Day Care Center", "Brgy. San Vicente, Pasig City"),
                ("San Vicente Elementary School", "Brgy. San Vicente, Pasig City")],
      docs=["form_138", "clearance_previous_school"],
      guardians=[("mother", "Liza Reyes Soriano", "Elementary School Teacher", "liza.soriano.seed@gmail.com", "09321100011", True),
                 ("father", "Ernesto Villar Soriano", "Seafarer", "ernesto.soriano.seed@gmail.com", "09331100211", False)]),
    P(key="patrick", student_id=115, household_id=115, first="Patrick", middle="Salazar", last="Jimenez", sex="male",
      religion="Iglesia ni Cristo", birth="2015-01-22", status="active",
      current="19 Sunflower St., Brgy. Payatas, Quezon City",
      siblings=[("Princess Salazar Jimenez", 14), ("Paul Salazar Jimenez", 7)],
      previous=[("Payatas Elementary School", "Brgy. Payatas, Quezon City")],
      guardians=[("father", "Danilo Perez Jimenez", "Electrician", "danilo.jimenez.seed@gmail.com", "09401100016", True),
                 ("mother", "Rosalinda Perez Salazar", "Sari-sari Store Owner", "rosalinda.salazar.seed@gmail.com", "09411100216", False)]),
    P(key="jasmine", student_id=114, household_id=114, first="Jasmine", middle="Chua", last="Dizon", sex="female",
      religion="Roman Catholic", birth="2014-09-15", email="jasmine.dizon.seed@gmail.com", mobile="09171234601",
      status="active", current="62 Rose St., Brgy. Dela Paz, Antipolo City",
      siblings=[("Joy Chua Dizon", 17), ("Jerome Chua Dizon", 9), ("Janelle Chua Dizon", 4)],
      previous=[("Dela Paz Elementary School", "Brgy. Dela Paz, Antipolo City")], docs=["form_138"],
      guardians=[("mother", "Maria Chua Dizon", "Market Vendor", "maria.dizon.seed@gmail.com", "09381100015", True),
                 ("father", "Ramil Santos Dizon", "Tricycle Driver", None, "09391100215", False)]),
    P(key="marco", student_id=111, household_id=111, first="Marco", middle="Dela Cruz", last="Valdez", sex="male",
      religion="Roman Catholic", birth="2014-07-11", mobile="09221234618", status="active",
      current="5 Dahlia St., Brgy. Bagong Barrio, Caloocan City", siblings=[("Mika Dela Cruz Valdez", 10)],
      previous=[("Sunshine Preschool", "Brgy. Bagong Barrio, Caloocan City"),
                ("Bagong Barrio Elementary School", "Brgy. Bagong Barrio, Caloocan City")],
      docs=["birth_certificate"],
      guardians=[("mother", "Nora Dela Cruz Valdez", "Homemaker", "nora.valdez.seed@gmail.com", "09331100012", True),
                 ("father", "Antonio Garcia Valdez", "Construction Foreman", "antonio.valdez.seed@gmail.com", "09341100012", False)]),
    P(key="joshua", student_id=125, household_id=125, first="Joshua", middle="Buenaventura", last="Medina", sex="male",
      religion="Roman Catholic", birth="2012-09-14", email="joshua.medina.seed@gmail.com", mobile="09201234616",
      status="active", current="101 Sampaguita Ave., Brgy. Pasong Tamo, Quezon City",
      permanent="Purok 4, Brgy. Caritan Centro, Tuguegarao City, Cagayan",
      siblings=[("Jeremy Buenaventura Medina", 20)],
      previous=[("Pasong Tamo Elementary School", "Brgy. Pasong Tamo, Quezon City"),
                ("Tuguegarao City National High School", "Brgy. Caritan Centro, Tuguegarao City, Cagayan")],
      docs=["clearance_previous_school", "form_138"],
      guardians=[("mother", "Lorna Buenaventura Medina", "Bookkeeper", "lorna.medina.seed@gmail.com", "09521100226", True),
                 ("father", "Alfredo Ramos Medina", "OFW (Welder, Saudi Arabia)", "alfredo.medina.seed@gmail.com", "09521100026", False)]),
    P(key="natasha", student_id=128, household_id=128, first="Natasha", middle="Guerrero", last="Flores", sex="female",
      religion="Roman Catholic", birth="2010-11-03", email="natasha.f.seed@gmail.com", mobile="09211234605",
      status="active", current="5 Acacia St., Brgy. Calauan, Laguna", siblings=[("Nathaniel Guerrero Flores", 13)],
      previous=[("Calauan Central Elementary School", "Brgy. Calauan, Laguna"),
                ("Calauan National High School", "Brgy. Balayhangin, Calauan, Laguna")],
      docs=["esc_transferee_qc", "clearance_previous_school"],
      guardians=[("mother", "Rita Guerrero Flores", "High School Teacher", "rita.flores.seed@gmail.com", "09551100029", True),
                 ("father", "Benjamin Castro Flores", "Rice Farmer", None, "09561100229", False)]),
    P(key="gabriel", student_id=147, household_id=147, first="Gabriel", middle="Cayabyab", last="Maceda", sex="male",
      religion="Born Again", birth="2009-05-31", email="gabriel.maceda.seed@gmail.com", mobile="09261234617",
      status="active", current="44 Spruce St., Brgy. Catmon, Malabon City",
      permanent="Purok 2, Brgy. San Nicolas, Tarlac City, Tarlac",
      siblings=[("Gabrielle Cayabyab Maceda", 14), ("Genesis Cayabyab Maceda", 11)],
      previous=[("Catmon National High School", "Brgy. Catmon, Malabon City")], docs=["ncae_result"],
      guardians=[("guardian", "Erlinda Maceda Cruz", "Canteen Operator (aunt)", "erlinda.cruz.seed@gmail.com", "09781100248", True),
                 ("father", "Artemio Lopez Maceda", "Farmer", None, "09781100048", False),
                 ("mother", "Susana Cayabyab Maceda", "Farmer", None, "09791100248", False)]),
    P(key="andrea", student_id=140, household_id=140, first="Andrea", middle="Padua", last="Lagman", sex="female",
      religion="Roman Catholic", birth="2008-04-21", email="andrea.l.seed@gmail.com", mobile="09251234609",
      status="graduated", current="12 Pine St., Brgy. Plainview, Mandaluyong City",
      siblings=[("Alfonso Padua Lagman Jr.", 22)],
      previous=[("Mandaluyong City National High School", "Plainview, Mandaluyong City")],
      docs=["recommendation_letter", "ncae_result", "clearance_previous_school"],
      guardians=[("mother", "Gloria Padua Lagman", "Accountant", "gloria.lagman.seed@gmail.com", "09701100041", True),
                 ("father", "Alfonso Reyes Lagman", "Businessman", "alfonso.lagman.seed@gmail.com", "09711100041", False)]),

    # ── New in S.Y. 2025-2026 ─────────────────────────────────────────────
    # Lives with his grandmother and uncle; no household record at all, and
    # nobody is flagged as the primary contact.
    P(key="carlos", student_id=103, household_id=None, first="Carlos", middle="Ong", last="Tan", sex="male",
      religion="Roman Catholic", birth="2019-08-30", status="active",
      current="78 Bonifacio St., Brgy. San Isidro, Caloocan City",
      permanent="Brgy. 88 San Jose, Tacloban City, Leyte",
      previous=[("Tacloban Day Care Center", "Brgy. 88 San Jose, Tacloban City, Leyte")],
      guardians=[("guardian", "Remedios Ong Tan", "Retired Nurse (grandmother)", "remedios.tan.seed@gmail.com", "09221100004", False),
                 ("guardian", "Alfonso Ong Tan", "Businessman (uncle)", None, "09231100004", False)]),
    P(key="kristine", student_id=112, household_id=112, first="Kristine", middle="Aguilar", last="Mercado", sex="female",
      religion="Born Again", birth="2018-11-28", status="active",
      current="77 Rosal St., Brgy. Pinyahan, Quezon City", siblings=[("Kurt Aguilar Mercado", 4)],
      previous=[("Happy Kids Nursery", "Brgy. Pinyahan, Quezon City"),
                ("Pinyahan Elementary School", "Brgy. Pinyahan, Quezon City")],
      docs=["form_138"],
      guardians=[("mother", "Susan Aguilar Mercado", "Market Vendor", "susan.mercado.seed@gmail.com", "09351100013", True)]),
    P(key="dominic", student_id=113, household_id=113, first="Dominic", middle="Fuentes", last="Pascual", sex="male",
      religion="Roman Catholic", birth="2017-04-03", status="transferred",
      current="31 Orchid St., Brgy. Manggahan, Pasig City", siblings=[("Diane Fuentes Pascual", 13)],
      previous=[("St. Joseph Elementary School", "Brgy. Manggahan, Pasig City")],
      docs=["clearance_previous_school"],
      guardians=[("mother", "Elvira Fuentes Pascual", "Nurse", "elvira.pascual.seed@gmail.com", "09361100014", True)]),
    P(key="hannah", student_id=116, household_id=116, first="Hannah", middle="Morales", last="Beltran", sex="female",
      religion="Roman Catholic", birth="2017-06-30", status="active",
      current="43 Jasmine St., Brgy. Western Bicutan, Taguig City",
      siblings=[("Harold Morales Beltran", 15), ("Hazel Morales Beltran", 12)],
      previous=[("Taguig Elementary School", "Brgy. Western Bicutan, Taguig City")], docs=["form_138"],
      guardians=[("mother", "Cynthia Morales Beltran", "Call Center Agent", "cynthia.beltran.seed@gmail.com", "09411100017", True)]),
    # Three enrolled siblings, one parent login. Their mother's email is on
    # Ryan's guardian row only (the split-email case provisioning handles by
    # matching her exact name inside the household).
    P(key="ryan", student_id=117, household_id=117, first="Ryan", middle="Gonzales", last="Ibarra", sex="male",
      religion="Roman Catholic", birth="2016-10-18", status="active",
      current="7 Sampaguita Rd., Brgy. Sto. Niño, Marikina City",
      previous=[("Sto. Niño Elementary School", "Brgy. Sto. Niño, Marikina City")],
      guardians=[("mother", "Perla Gonzales Ibarra", "Public School Teacher", "perla.ibarra.seed@gmail.com", "09421100018", True),
                 ("father", "Hernan Castro Ibarra", "Police Officer", None, "09431100018", False)]),
    P(key="rica", student_id=153, household_id=117, first="Rica", middle="Gonzales", last="Ibarra", sex="female",
      religion="Roman Catholic", birth="2013-05-09", status="active",
      current="7 Sampaguita Rd., Brgy. Sto. Niño, Marikina City",
      previous=[("Sto. Niño Elementary School", "Brgy. Sto. Niño, Marikina City")], docs=["form_138"],
      guardians=[("mother", "Perla Gonzales Ibarra", "Public School Teacher", None, "09421100018", True),
                 ("father", "Hernan Castro Ibarra", "Police Officer", None, "09431100018", False)]),
    P(key="renz", student_id=154, household_id=117, first="Renz", middle="Gonzales", last="Ibarra", sex="male",
      religion="Roman Catholic", birth="2011-02-14", mobile="09171234654", status="active",
      current="7 Sampaguita Rd., Brgy. Sto. Niño, Marikina City",
      previous=[("Sto. Niño Elementary School", "Brgy. Sto. Niño, Marikina City"),
                ("Marikina High School", "Brgy. Sta. Elena, Marikina City")],
      docs=["form_138", "recommendation_letter"],
      guardians=[("mother", "Perla Gonzales Ibarra", "Public School Teacher", None, "09421100018", True),
                 ("father", "Hernan Castro Ibarra", "Police Officer", None, "09431100018", False)]),
    P(key="mark", student_id=127, household_id=127, first="Mark", middle="Aquino", last="Navarro", sex="male",
      religion="Iglesia ni Cristo", birth="2013-06-17", status="dropped",
      current="18 Bamboo St., Brgy. Pinagbuhatan, Pasig City",
      permanent="Brgy. Poblacion, Catbalogan City, Samar",
      siblings=[("Mary Aquino Navarro", 16), ("Mikee Aquino Navarro", 6)],
      previous=[("Pinagbuhatan Elementary School", "Brgy. Pinagbuhatan, Pasig City")],
      guardians=[("mother", "Josie Aquino Navarro", "Seamstress", "josie.navarro.seed@gmail.com", "09541100028", True),
                 ("father", "Marcelo Reyes Navarro", "Construction Worker", None, "09551100028", False)]),
    # Enrolled pending (no Form 137), then cancelled before classes. Applies
    # again online for 2026-2027 and trips the duplicate check.
    P(key="daniel", student_id=129, household_id=129, first="Daniel", middle="Paglinawan", last="Ramirez", sex="male",
      religion="Born Again", birth="2011-08-22", status="inactive",
      current="88 Narra Ave., Brgy. Barangka Drive, Mandaluyong City",
      siblings=[("Denise Paglinawan Ramirez", 10)],
      previous=[("Barangka Elementary School", "Brgy. Barangka Drive, Mandaluyong City")],
      doc_missing=["form_137_or_138"],
      guardians=[("mother", "Ligaya Paglinawan Ramirez", "Laundrywoman", "ligaya.ramirez.seed@gmail.com", "09571100030", True)]),
    P(key="christine", student_id=126, household_id=126, first="Christine", middle="Roca", last="Briones", sex="female",
      religion="Roman Catholic", birth="2010-02-28", email="christine.briones.seed@gmail.com", mobile="09201234604",
      status="active", current="34 Catmon St., Brgy. Malinao, Pasig City",
      previous=[("Malinao Elementary School", "Brgy. Malinao, Pasig City"),
                ("Rizal High School", "Brgy. Caniogan, Pasig City")],
      docs=["form_138", "esc_transferee_qc"],
      guardians=[("mother", "Carmen Roca Briones", "Pharmacist", "carmen.briones.seed@gmail.com", "09531100027", True),
                 ("father", "Rogelio Santos Briones", "Jeepney Operator", "rogelio.briones.seed@gmail.com", "09541100027", False)]),
    # Child of accounting staff Arvin Lacson. His guardian row carries his
    # STAFF email, so provisioning cannot link it to a guardian account.
    P(key="bea", student_id=155, household_id=155, first="Bea", middle="Santos", last="Lacson", sex="female",
      religion="Roman Catholic", birth="2009-07-19", email="bea.lacson.seed@gmail.com", mobile="09271234655",
      status="active", current="21 Molave St., Brgy. Concepcion Uno, Marikina City",
      siblings=[("Bryan Santos Lacson", 9)],
      previous=[("Concepcion Integrated School", "Brgy. Concepcion Uno, Marikina City")], docs=["ncae_result", "esc_completers"],
      guardians=[("father", "Arvin Lacson", "Accounting Staff, South Lakes Integrated School", "arvin.lacson@slis.test", "09281100055", True),
                 ("mother", "Joanna Santos Lacson", "Nurse", "joanna.lacson.seed@gmail.com", "09291100055", False)]),
    P(key="raphael", student_id=143, household_id=143, first="Raphael", middle="Corpus", last="Avila", sex="male",
      religion="Protestant", birth="2009-03-07", mobile="09301234643", status="active",
      current="78 Cedar St., Brgy. Wack-Wack, Mandaluyong City",
      previous=[("Wack-Wack National High School", "Wack-Wack, Mandaluyong City")], docs=["ncae_result"],
      guardians=[("father", "Bernard Corpus Avila", "Taxi Driver", "bernard.avila.seed@gmail.com", "09741100044", True)]),
    # Graduated with an unpaid balance; lives with his grandmother. His Form
    # 137 was presented in the original and never scanned (no file).
    P(key="jeremiah", student_id=141, household_id=141, first="Jeremiah", middle="Villegas", last="Santos", sex="male",
      religion="Roman Catholic", birth="2007-08-14", mobile="09261234610", status="graduated",
      current="34 Oak St., Brgy. Addition Hills, Mandaluyong City",
      siblings=[("Jenny Villegas Santos", 12)],
      previous=[("Addition Hills National High School", "Addition Hills, Mandaluyong City")],
      doc_overrides={"form_137_or_138": dict(image=False, remark="Original presented and kept in the learner's folder; not scanned.")},
      guardians=[("guardian", "Natividad Villegas Santos", "Retired (grandmother)", None, "09721100042", True),
                 ("mother", "Rosita Villegas Santos", "Domestic Helper (Hong Kong)", "rosita.santos.seed@gmail.com", "09731100042", False)]),
    # Foreign national (Korean father): Alien Certificate of Registration.
    # Parents live abroad; she boards near the school.
    P(key="jiwoo", student_id=156, household_id=156, first="Ji-woo", middle="Marquez", last="Kim", sex="female",
      religion="Protestant", birth="2008-01-25", email="jiwoo.kim.seed@gmail.com", mobile="09281234656",
      status="graduated", current="Unit 5B, 90 Birch St., Brgy. Hagdang Bato, Mandaluyong City",
      permanent="302-1102, 45 Banpo-daero, Seocho-gu, Seoul, South Korea",
      previous=[("Seoul Foreign School", "Seodaemun-gu, Seoul, South Korea"),
                ("Hagdang Bato National High School", "Hagdang Bato, Mandaluyong City")],
      docs=["alien_certificate", "certificate_non_sf9", "recommendation_letter"],
      guardians=[("father", "Kim Min-jun", "Engineer (Seoul)", "minjun.kim.seed@gmail.com", "+821012345678", True),
                 ("mother", "Samantha Bañez Marquez", "Nurse (Seoul)", "samantha.marquez.seed@gmail.com", "09281100045", False),
                 ("guardian", "Milagros Bañez Marquez", "Dormitory Owner (aunt)", "milagros.marquez.seed@gmail.com", "09751100045", False)]),
    # Transferred in on 2026-01-05, so his student number carries 2026.
    P(key="nino", student_id=151, household_id=151, first="Niño", middle="Peñaranda", last="Magalang", sex="male",
      religion="Roman Catholic", birth="2016-01-15", status="active",
      current="28 Redwood St., Brgy. Tumana, Marikina City",
      permanent="Purok 7, Brgy. Talomo, Davao City, Davao del Sur",
      siblings=[("Niña Peñaranda Magalang", 7)],
      previous=[("Davao City Central Elementary School", "Brgy. Poblacion, Davao City")],
      docs=["clearance_previous_school"],
      guardians=[("father", "Ricardo Peñaranda Magalang", "Electrical Engineer", "ricardo.magalang.seed@gmail.com", "09821100052", True),
                 ("mother", "Liezl Castro Magalang", "Online Seller", "liezl.magalang.seed@gmail.com", "09831100052", False)]),

    # ── New in S.Y. 2026-2027 ─────────────────────────────────────────────
    P(key="sofia", student_id=104, household_id=104, first="Sofia", middle="Lim", last="Aquino", sex="female",
      religion="Iglesia ni Cristo", birth="2022-03-14", status="active",
      current="22 Mango St., Brgy. Bagong Silang, Valenzuela City",
      guardians=[("mother", "Maricel Lim Aquino", "Seamstress", "maricel.aquino.seed@gmail.com", "09241100005", True)]),
    P(key="miguel", student_id=105, household_id=105, first="Miguel", middle="Ramos", last="Fernandez", sex="male",
      religion="Roman Catholic", birth="2021-04-10", status="active",
      current="9 Kalaw St., Brgy. 669, Ermita, Manila", siblings=[("Mateo Ramos Fernandez", 9)],
      previous=[("Kiddie Kingdom Learning Center", "Ermita, Manila")], docs=["birth_certificate"],
      guardians=[("father", "Rodrigo Ramos Fernandez", "Security Supervisor", "rodrigo.fernandez.seed@gmail.com", "09251100006", True),
                 ("mother", "Leonora Diaz Fernandez", "Bank Teller", "leonora.fernandez.seed@gmail.com", "09261100006", False)]),
    # Walk-in transferee, PENDING: Form 137 never handed in and the Good Moral
    # certificate is logged but not yet submitted.
    P(key="patricia", student_id=120, household_id=120, first="Patricia", middle="Lim", last="Villafuerte", sex="female",
      religion="Roman Catholic", birth="2018-05-17", status="active",
      current="3 Mariposa St., Brgy. Silangan, San Mateo, Rizal",
      previous=[("San Mateo Central Elementary School", "Brgy. Silangan, San Mateo, Rizal")],
      doc_missing=["form_137_or_138"],
      doc_overrides={"certificate_good_moral": dict(submitted=False, remark="Awaiting the signed original from San Mateo Central ES.")},
      guardians=[("mother", "Felicidad Lim Villafuerte", "Homemaker", "felicidad.villafuerte.seed@gmail.com", "09461100021", True),
                 ("father", "Rolando Cruz Villafuerte", "Welder", None, "09471100021", False)]),
    P(key="christian", student_id=131, household_id=131, first="Christian", middle="Padilla", last="Tolentino", sex="male",
      religion="Roman Catholic", birth="2013-10-30", mobile="09221234606", status="active",
      current="23 Molave St., Brgy. Bagumbayan, Quezon City",
      permanent="Brgy. 62 Sagkahan, Tacloban City, Leyte",
      siblings=[("Clarisse Padilla Tolentino", 10)],
      previous=[("Sagkahan Elementary School", "Tacloban City, Leyte"),
                ("Tacloban City National High School", "Tacloban City, Leyte")],
      docs=["form_138"],
      doc_overrides={code: dict(verified=False) for code in ("form_137_or_138", "certificate_good_moral", "form_138")},
      guardians=[("father", "Cesar Padilla Tolentino", "Driver", "cesar.tolentino.seed@gmail.com", "09601100032", True),
                 ("mother", "Marites Padilla Tolentino", "Barangay Health Worker", None, "09611100032", False)]),
    P(key="abigail", student_id=138, household_id=138, first="Abigail", middle="Ramos", last="Fajardo", sex="female",
      religion="Born Again", birth="2010-06-29", email="abigail.f.seed@gmail.com", mobile="09241234608", status="transferred",
      current="71 Atis St., Brgy. San Juan, Cainta, Rizal",
      previous=[("San Juan Elementary School", "Brgy. San Juan, Cainta, Rizal"),
                ("Cainta Catholic College", "Cainta, Rizal")],
      docs=["form_138"],
      guardians=[("mother", "Anita Ramos Fajardo", "Teacher", "anita.fajardo.seed@gmail.com", "09681100039", True),
                 ("father", "Leo Santos Fajardo", "IT Consultant", "leo.fajardo.seed@gmail.com", "09691100039", False)]),
    P(key="erica", student_id=148, household_id=148, first="Erica", middle="Palma", last="Guerrero", sex="female",
      religion="Roman Catholic", birth="2008-09-11", email="erica.g.seed@gmail.com", mobile="09301234614",
      status="active", current="66 Willow St., Brgy. Tañong, Malabon City",
      previous=[("Tañong National High School", "Tañong, Malabon City")], docs=["ncae_result"],
      guardians=[("mother", "Rosario Palma Guerrero", "Market Vendor", "rosario.guerrero.seed@gmail.com", "09791100049", True),
                 ("father", "Emilio Santos Guerrero", "Fisherman", None, "09801100049", False)]),

    # ── Tier 2.5 (2025-2026 volume) ───────────────────────────────────────
    # Twenty more learners for the finished year, aimed at the thin spots:
    # Grade 7 Diamond had nobody at all, and six sections held one learner.
    # Households 157-176; student_id 157-176 (LRN 136700000157..176).

    # Nursery Rose. Twins sharing a household; both get the sibling discount.
    P(key="althea", student_id=157, household_id=157, first="Althea", middle="Lumibao", last="Rosales", sex="female",
      religion="Roman Catholic", birth="2021-07-19", status="active",
      current="23 Camia St., Brgy. Holy Spirit, Quezon City",
      siblings=[("Aldrin Lumibao Rosales", 4)],
      guardians=[("mother", "Divina Lumibao Rosales", "Barangay Health Worker", "divina.rosales.seed@gmail.com", "09171100057", True),
                 ("father", "Alberto Cruz Rosales", "Delivery Rider", None, "09181100057", False)]),
    P(key="aldrin", student_id=158, household_id=157, first="Aldrin", middle="Lumibao", last="Rosales", sex="male",
      religion="Roman Catholic", birth="2021-07-19", status="active",
      current="23 Camia St., Brgy. Holy Spirit, Quezon City",
      siblings=[("Althea Lumibao Rosales", 4)],
      guardians=[("mother", "Divina Lumibao Rosales", "Barangay Health Worker", "divina.rosales.seed@gmail.com", "09171100057", True),
                 ("father", "Alberto Cruz Rosales", "Delivery Rider", None, "09181100057", False)]),
    # Kindergarten Sunflower.
    P(key="elijah", student_id=159, household_id=159, first="Elijah", middle="Bermudez", last="Lazaro", sex="male",
      religion="Born Again", birth="2020-05-02", status="active",
      current="7 Ilang-Ilang St., Brgy. Bagumbayan, Taguig City",
      previous=[("Bright Beginnings Child Care", "Brgy. Bagumbayan, Taguig City")], docs=["birth_certificate"],
      guardians=[("mother", "Charity Bermudez Lazaro", "Call Center Agent", "charity.lazaro.seed@gmail.com", "09191100059", True),
                 ("father", "Noel Pineda Lazaro", "Security Guard", None, "09201100059", False)]),
    P(key="samantha", student_id=160, household_id=160, first="Samantha", middle="Ocampo", last="Prieto", sex="female",
      religion="Roman Catholic", birth="2020-11-28", status="active",
      current="Blk 9 Lot 14 Mabuhay Homes, Brgy. Santolan, Pasig City",
      siblings=[("Sebastian Ocampo Prieto", 9)],
      guardians=[("mother", "Rowena Ocampo Prieto", "Pharmacist", "rowena.prieto.seed@gmail.com", "09211100060", True),
                 ("father", "Gerardo Lim Prieto", "Branch Manager", "gerardo.prieto.seed@gmail.com", "09221100060", False)]),
    # Grade 1 Rizal.
    P(key="lucas", student_id=161, household_id=161, first="Lucas", middle="Tiongson", last="Benitez", sex="male",
      religion="Roman Catholic", birth="2019-08-14", status="active",
      current="45 Acacia Lane, Brgy. Ugong, Valenzuela City",
      previous=[("Valenzuela Learning Village", "Brgy. Ugong, Valenzuela City")], docs=["birth_certificate"],
      guardians=[("mother", "Editha Tiongson Benitez", "Seamstress", "editha.benitez.seed@gmail.com", "09231100061", True),
                 ("father", "Rolando Diaz Benitez", "Carpenter", None, "09241100061", False)]),
    P(key="chloe", student_id=162, household_id=162, first="Chloe", middle="Sarmiento", last="Padilla", sex="female",
      religion="Seventh-day Adventist", birth="2019-04-06", status="active",
      current="12 Narra St., Brgy. Kapitolyo, Pasig City",
      guardians=[("mother", "Grace Sarmiento Padilla", "Dentist", "grace.padilla.seed@gmail.com", "09251100062", True),
                 ("father", "Emmanuel Reyes Padilla", "Architect", "emmanuel.padilla.seed@gmail.com", "09261100062", False)]),
    # Grade 2 Bonifacio. 4Ps household, pays in arrears.
    P(key="angelo", student_id=163, household_id=163, first="Angelo", middle="Bagtas", last="Mariano", sex="male",
      religion="Roman Catholic", birth="2018-02-11", status="active",
      current="Purok 3, Brgy. Bagong Silang, Caloocan City",
      siblings=[("Angelica Bagtas Mariano", 12), ("Anton Bagtas Mariano", 6)],
      previous=[("Bagong Silang Elementary School", "Brgy. Bagong Silang, Caloocan City")], docs=["form_138"],
      guardians=[("mother", "Luzviminda Bagtas Mariano", "Laundrywoman", "luz.mariano.seed@gmail.com", "09271100063", True)]),
    # Grade 3 Mabini.
    P(key="trisha", student_id=164, household_id=164, first="Trisha", middle="Yabut", last="Carreon", sex="female",
      religion="Roman Catholic", birth="2017-06-23", status="active",
      current="88 Rizal Ave., Brgy. Concepcion, Marikina City",
      siblings=[("Tristan Yabut Carreon", 14)],
      previous=[("Concepcion Integrated School", "Brgy. Concepcion, Marikina City")], docs=["form_138"],
      guardians=[("mother", "Maricel Yabut Carreon", "Bank Teller", "maricel.carreon.seed@gmail.com", "09281100064", True),
                 ("father", "Dante Flores Carreon", "Mechanic", None, "09291100064", False)]),
    # Grade 4 Luna. Guardian is an aunt; parents are both OFWs.
    P(key="miguelito", student_id=165, household_id=165, first="Miguelito", middle="Agbayani", last="Ventura", sex="male",
      suffix="Jr.", religion="Roman Catholic", birth="2016-10-30", status="active",
      current="3 Lilac St., Brgy. Fairview, Quezon City",
      permanent="Purok 5, Brgy. Lacub, Batac City, Ilocos Norte",
      previous=[("Fairview Elementary School", "Brgy. Fairview, Quezon City")], docs=["form_138"],
      guardians=[("guardian", "Soledad Ventura Agbayani", "Retired Teacher (aunt)", "soledad.agbayani.seed@gmail.com", "09301100065", True),
                 ("father", "Miguelito Ventura Sr.", "OFW (Caregiver, Canada)", None, "09311100065", False)]),
    # Grade 5 Silang. Honour student, pays annually.
    P(key="danica", student_id=166, household_id=166, first="Danica", middle="Espiritu", last="Llanes", sex="female",
      religion="Roman Catholic", birth="2015-12-05", email="danica.llanes.seed@gmail.com", mobile="09321234666",
      status="active", current="19 Molave St., Brgy. Addition Hills, Mandaluyong City",
      previous=[("Addition Hills Integrated School", "Brgy. Addition Hills, Mandaluyong City")], docs=["form_138"],
      guardians=[("mother", "Imelda Espiritu Llanes", "Accountant", "imelda.llanes.seed@gmail.com", "09321100066", True),
                 ("father", "Ferdinand Cruz Llanes", "IT Consultant", "ferdinand.llanes.seed@gmail.com", "09331100066", False)]),
    # Grade 6 Aguinaldo.
    P(key="kenneth", student_id=167, household_id=167, first="Kenneth", middle="Villaruel", last="Obispo", sex="male",
      religion="Iglesia ni Cristo", birth="2014-03-17", status="active",
      current="55 Sampaloc St., Brgy. Pinagkaisahan, Makati City",
      siblings=[("Kathleen Villaruel Obispo", 16)],
      previous=[("Pinagkaisahan Elementary School", "Brgy. Pinagkaisahan, Makati City")], docs=["form_138"],
      guardians=[("father", "Reynaldo Santos Obispo", "Plumber", "reynaldo.obispo.seed@gmail.com", "09341100067", True),
                 ("mother", "Juliet Villaruel Obispo", "Househelp", None, "09351100067", False)]),
    # ── Grade 7 Diamond: the section nobody was enrolled in ──
    P(key="francine", student_id=168, household_id=168, first="Francine", middle="Dimaano", last="Zulueta", sex="female",
      religion="Roman Catholic", birth="2013-09-09", email="francine.zulueta.seed@gmail.com", mobile="09361234668",
      status="active", current="21 Gumamela St., Brgy. Malanday, Marikina City",
      previous=[("Malanday Elementary School", "Brgy. Malanday, Marikina City")], docs=["form_138"],
      guardians=[("mother", "Perpetua Dimaano Zulueta", "Nurse", "perpetua.zulueta.seed@gmail.com", "09361100068", True),
                 ("father", "Isagani Lopez Zulueta", "Radiologic Technologist", "isagani.zulueta.seed@gmail.com", "09371100068", False)]),
    P(key="jerome", student_id=169, household_id=169, first="Jerome", middle="Pagaduan", last="Estolas", sex="male",
      religion="Roman Catholic", birth="2013-11-21", status="active",
      current="Blk 4 Lot 7 Riverside, Brgy. Nangka, Marikina City",
      siblings=[("Jenny Pagaduan Estolas", 17), ("Jayson Pagaduan Estolas", 10)],
      previous=[("Nangka Elementary School", "Brgy. Nangka, Marikina City")], docs=["form_138"],
      guardians=[("mother", "Nenita Pagaduan Estolas", "Market Vendor", "nenita.estolas.seed@gmail.com", "09381100069", True),
                 ("father", "Rodolfo Marquez Estolas", "Tricycle Driver", None, "09391100069", False)]),
    P(key="shaina", student_id=170, household_id=170, first="Shaina", middle="Hernandez", last="Basco", sex="female",
      religion="Roman Catholic", birth="2013-05-30", status="active",
      current="66 Dao St., Brgy. Tandang Sora, Quezon City",
      previous=[("Tandang Sora Elementary School", "Brgy. Tandang Sora, Quezon City")],
      docs=["form_138", "clearance_previous_school"],
      guardians=[("mother", "Analiza Hernandez Basco", "Beautician", "analiza.basco.seed@gmail.com", "09401100070", True)]),
    P(key="dexter", student_id=171, household_id=171, first="Dexter", middle="Calimlim", last="Udarbe", sex="male",
      religion="Roman Catholic", birth="2013-01-08", status="active",
      current="9 Kalachuchi St., Brgy. San Roque, Antipolo City",
      previous=[("San Roque Elementary School", "Brgy. San Roque, Antipolo City")], docs=["form_138"],
      guardians=[("father", "Efren Calimlim Udarbe", "Welder", "efren.udarbe.seed@gmail.com", "09411100071", True),
                 ("mother", "Loreta Bautista Udarbe", "Homemaker", None, "09421100071", False)]),
    # Grade 8 Emerald. ESC grantee.
    P(key="rowena", student_id=172, household_id=172, first="Rowena", middle="Alcantara", last="Delos Santos", sex="female",
      religion="Roman Catholic", birth="2012-04-25", email="rowena.ds.seed@gmail.com", mobile="09431234672",
      status="active", current="31 Mahogany St., Brgy. Commonwealth, Quezon City",
      previous=[("Commonwealth High School", "Brgy. Commonwealth, Quezon City")],
      docs=["form_138", "esc_transferee_qc"],
      guardians=[("mother", "Vilma Alcantara Delos Santos", "Public School Teacher", "vilma.ds.seed@gmail.com", "09431100072", True),
                 ("father", "Ricardo Cruz Delos Santos", "Barangay Councilor", None, "09441100072", False)]),
    # Grade 9 Sapphire.
    P(key="jayvee", student_id=173, household_id=173, first="Jayvee", middle="Rivera", last="Catapang", sex="male",
      religion="Born Again", birth="2011-07-13", email="jayvee.catapang.seed@gmail.com", mobile="09451234673",
      status="active", current="14 Bougainvillea St., Brgy. Pasong Putik, Quezon City",
      siblings=[("Jewel Rivera Catapang", 8)],
      previous=[("Pasong Putik National High School", "Brgy. Pasong Putik, Quezon City")], docs=["form_138"],
      guardians=[("mother", "Corazon Rivera Catapang", "Sari-sari Store Owner", "corazon.catapang.seed@gmail.com", "09451100073", True),
                 ("father", "Benito Lazaro Catapang", "Jeepney Operator", "benito.catapang.seed@gmail.com", "09461100073", False)]),
    # Grade 10 Ruby. Failed Mathematics on the year: retained, so her
    # 2026-2027 row repeats Grade 10 (no override needed to repeat).
    P(key="maricel", student_id=174, household_id=174, first="Maricel", middle="Dizon", last="Fabros", sex="female",
      religion="Roman Catholic", birth="2010-09-02", status="active",
      current="Purok 2, Brgy. Payatas B, Quezon City",
      siblings=[("Marvin Dizon Fabros", 19)],
      previous=[("Payatas B National High School", "Brgy. Payatas B, Quezon City")], docs=["form_138"],
      guardians=[("mother", "Teresita Dizon Fabros", "Scrap Dealer", "teresita.fabros.seed@gmail.com", "09471100074", True)]),
    # Grade 11 STEM-A.
    P(key="kiara", student_id=175, household_id=175, first="Kiara", middle="Montemayor", last="Salonga", sex="female",
      religion="Roman Catholic", birth="2009-10-16", email="kiara.salonga.seed@gmail.com", mobile="09481234675",
      status="active", current="5 Jasmine St., Brgy. Greenhills, San Juan City",
      previous=[("San Juan National High School", "Brgy. Greenhills, San Juan City")],
      docs=["form_138", "ncae_result"],
      guardians=[("mother", "Cecilia Montemayor Salonga", "Dermatologist", "cecilia.salonga.seed@gmail.com", "09481100075", True),
                 ("father", "Gilbert Reyes Salonga", "Civil Engineer", "gilbert.salonga.seed@gmail.com", "09491100075", False)]),
    # Grade 12 ABM-A. Graduates at the end of 2025-2026, so no 2026-2027 row.
    P(key="vincent", student_id=176, household_id=176, first="Vincent", middle="Panganiban", last="Herrera", sex="male",
      religion="Roman Catholic", birth="2008-12-01", email="vincent.herrera.seed@gmail.com", mobile="09501234676",
      status="graduated", current="40 Champaca St., Brgy. Project 6, Quezon City",
      siblings=[("Veronica Panganiban Herrera", 15)],
      previous=[("Project 6 National High School", "Brgy. Project 6, Quezon City")],
      docs=["form_138", "ncae_result"],
      guardians=[("father", "Armando Santos Herrera", "Logistics Supervisor", "armando.herrera.seed@gmail.com", "09501100076", True),
                 ("mother", "Marilou Panganiban Herrera", "Insurance Agent", None, "09511100076", False)]),
]
PROFILE = {p["key"]: p for p in PROFILES}

# ════════════════════════════════════════════════════════════════════════════
# PINNED STUDENT NUMBERS
# These 31 learners (Tier 1 + Tier 2) are already loaded in the real database,
# so their student_number is frozen here. Student numbers are otherwise handed
# out in enrollment-date order, which means a newly added learner enrolling in
# May 2025 would renumber everyone after them. Pinning keeps every existing
# record's visible identifier stable; new learners continue after the highest
# pinned number for their year.
# Do NOT edit these. Add new learners without an entry and they get the next
# free number.
# ════════════════════════════════════════════════════════════════════════════
PINNED_NUMBERS = {
    "marco": "2025-0001",
    "maria": "2025-0002",
    "paolo": "2025-0003",
    "daniel": "2025-0004",
    "jiwoo": "2025-0005",
    "bianca": "2025-0006",
    "dominic": "2025-0007",
    "natasha": "2025-0008",
    "hannah": "2025-0009",
    "ryan": "2025-0010",
    "christine": "2025-0011",
    "rica": "2025-0012",
    "renz": "2025-0013",
    "jasmine": "2025-0014",
    "bea": "2025-0015",
    "kristine": "2025-0016",
    "jeremiah": "2025-0017",
    "raphael": "2025-0018",
    "gabriel": "2025-0019",
    "mark": "2025-0020",
    "patrick": "2025-0021",
    "andrea": "2025-0022",
    "carlos": "2025-0023",
    "joshua": "2025-0024",
    "nino": "2026-0001",
    "sofia": "2026-0002",
    "miguel": "2026-0003",
    "abigail": "2026-0004",
    "erica": "2026-0005",
    "christian": "2026-0006",
    "patricia": "2026-0007",
}



# ════════════════════════════════════════════════════════════════════════════
# ENROLLMENTS
#
# One entry per learner per year. `eids` holds one id, or one per semester
# for Senior High (a finished year has both; the current year only the 1st).
# Ids 200-211 and invoices 300-309 are Tier 1's and stay where they were.
#
# status   completed | enrolled | pending | cancelled | transferred_out
# entry    new | transferee | continuing (documents follow it)
# pay      method + style: early | late_some | arrears | last_partial | upfront | salary | custom | none
# grades   ability (base transmuted grade), floor, overrides {code: {period: grade}},
#          incomplete {(code, period)}, missing {(code, period)}
# absences (A, E, L) over the whole enrollment
# ════════════════════════════════════════════════════════════════════════════
def E(**kw):
    kw.setdefault("strand", None)
    kw.setdefault("status", "completed")
    kw.setdefault("scholarships", [])
    kw.setdefault("floor", 80)
    kw.setdefault("overrides", {})
    kw.setdefault("incomplete", set())
    kw.setdefault("missing", set())
    kw.setdefault("absences", (2, 1, 2))
    kw.setdefault("today", None)          # None | "A" | "L" | "E" | "skip"
    return kw


ENROLLMENTS = [
    # ═════════════ S.Y. 2025-2026 (finished) ═════════════
    # Tier 1, unchanged in substance.
    E(key="paolo", sy=SY1, eids=[200], inv=300, level="nursery", grade="Nursery", section="Rose",
      enrolled_on="2025-05-20", entry="new", ability=89, plan="monthly",
      scholarships=[("SIBLING", "2025-05-20", "Second child enrolled; sister Maria Santos Reyes is in Kindergarten.")],
      pay=dict(method="gcash", style="early"), absences=(4, 3, 4)),
    E(key="maria", sy=SY1, eids=[201], inv=301, level="kindergarten", grade="Kindergarten", section="Sunflower",
      enrolled_on="2025-05-20", entry="new", ability=92, plan="quarterly",
      pay=dict(method="gcash", style="early"), absences=(2, 2, 1)),
    E(key="bianca", sy=SY1, eids=[202], inv=302, level="elementary", grade="Grade 5", section="Silang",
      enrolled_on="2025-05-26", entry="transferee", ability=87, plan="semi_annual",
      pay=dict(method="cash", style="early"), absences=(3, 1, 2)),
    E(key="patrick", sy=SY1, eids=[203], inv=303, level="elementary", grade="Grade 5", section="Silang",
      enrolled_on="2025-06-09", entry="transferee", ability=79, floor=75, plan="monthly",
      overrides={"G5-MATH": {"1st_quarter": 73, "2nd_quarter": 76, "3rd_quarter": 78, "4th_quarter": 79}},
      pay=dict(method="cash", style="arrears", through="2025-11-30",
               partial=("2025-12-31", "2026-01-09", "1000.00", "Partial payment; promised to settle the balance in February.")),
      absences=(12, 3, 9)),
    E(key="jasmine", sy=SY1, eids=[204], inv=304, level="elementary", grade="Grade 6", section="Aguinaldo",
      enrolled_on="2025-06-03", entry="transferee", ability=96, plan="monthly",
      scholarships=[("4PS", "2025-06-03", "4Ps household ID 4PS-SEED-004 verified against the DSWD list."),
                    ("HONOR", "2025-06-03", "With High Honors, Grade 5 (Dela Paz Elementary School).")],
      pay=dict(method="cash", style="late_some", late={5, 8}), absences=(0, 2, 1)),
    E(key="marco", sy=SY1, eids=[205], inv=305, level="elementary", grade="Grade 6", section="Aguinaldo",
      enrolled_on="2025-05-15", entry="transferee", ability=84, plan="annual",
      pay=dict(method="bank_transfer", style="upfront"), absences=(4, 1, 5)),
    E(key="joshua", sy=SY1, eids=[206], inv=306, level="junior_highschool", grade="Grade 8", section="Emerald",
      enrolled_on="2025-09-01", entry="transferee", ability=85, plan="monthly",
      transfer_in=("2025-09-01", "Family moved back to Quezon City from Tuguegarao City.", "Tuguegarao City National High School"),
      pay=dict(method="gcash", style="last_partial", amount="2000.00"), absences=(3, 1, 2)),
    E(key="natasha", sy=SY1, eids=[207], inv=307, level="junior_highschool", grade="Grade 10", section="Ruby",
      enrolled_on="2025-05-28", entry="transferee", ability=91, plan="quarterly",
      scholarships=[("ESC", "2025-05-28", "ESC grantee; certificate from Calauan National High School.")],
      pay=dict(method="bank_transfer", style="early"), absences=(1, 2, 2)),
    E(key="gabriel", sy=SY1, eids=[208, 209], inv=308, level="senior_highschool", grade="Grade 11", section="STEM-A",
      strand="STEM", enrolled_on="2025-06-05", entry="transferee", ability=87, plan="semi_annual",
      pay=dict(method="check", style="early"), absences=(4, 2, 6)),
    E(key="andrea", sy=SY1, eids=[210, 211], inv=309, level="senior_highschool", grade="Grade 12", section="STEM-A",
      strand="STEM", enrolled_on="2025-06-09", entry="transferee", ability=92, plan="monthly", graduates=True,
      pay=dict(method="card", style="early", switch=("2025-07-01", "gcash")), absences=(2, 3, 1)),

    # New in 2025-2026.
    # Started Grade 1 six weeks late with no transfer (family arrived from
    # Tacloban): the invoice's June installment is already past due the day
    # it is created.
    E(key="carlos", sy=SY1, eids=[212], inv=310, level="elementary", grade="Grade 1", section="Rizal",
      enrolled_on="2025-07-14", entry="new", ability=84, plan="monthly",
      pay=dict(method="gcash", style="early"), absences=(5, 2, 3)),
    # Failed Mathematics on the year (average 73.25): retained in Grade 2.
    E(key="kristine", sy=SY1, eids=[213], inv=311, level="elementary", grade="Grade 2", section="Bonifacio",
      enrolled_on="2025-06-04", entry="transferee", ability=78, floor=75, plan="monthly",
      overrides={"G2-MATH": {"1st_quarter": 73, "2nd_quarter": 74, "3rd_quarter": 72, "4th_quarter": 74},
                 "G2-FIL": {"1st_quarter": 75, "2nd_quarter": 76, "3rd_quarter": 75, "4th_quarter": 77}},
      scholarships=[("4PS", "2025-06-04", "4Ps household ID 4PS-SEED-008 (DSWD certification on file).")],
      pay=dict(method="cash", style="arrears", through="2026-02-28",
               partial=("2026-03-31", "2026-03-25", "1000.00", "Partial; the rest after the 4Ps cash grant.")),
      absences=(9, 2, 7)),
    # Transferred out to Cebu on 2025-11-14: Q1 graded, Q2 scores stop there,
    # the invoice is closed out (later installments voided and waived).
    E(key="dominic", sy=SY1, eids=[214], inv=312, level="elementary", grade="Grade 3", section="Mabini",
      enrolled_on="2025-05-27", entry="transferee", ability=86, plan="quarterly", status="transferred_out",
      transfer_out=("2025-11-14", "Family relocating to Cebu City for the father's new job.",
                    "Cebu City Central School", REGISTRAR2),
      pay=dict(method="cash", style="early"), absences=(2, 1, 1)),
    # Science 3, Q4 marked incomplete (hospitalised for dengue, missed the
    # quarterly exam): the year outcome is "incomplete", which blocks
    # promotion, so her 2026-2027 enrollment carries an override.
    E(key="hannah", sy=SY1, eids=[215], inv=313, level="elementary", grade="Grade 3", section="Mabini",
      enrolled_on="2025-05-29", entry="transferee", ability=88, plan="semi_annual",
      incomplete={("G3-SCI", "4th_quarter")},
      pay=dict(method="gcash", style="early"), absences=(8, 4, 1)),
    E(key="ryan", sy=SY1, eids=[216], inv=314, level="elementary", grade="Grade 4", section="Luna",
      enrolled_on="2025-06-02", entry="transferee", ability=85, plan="monthly",
      scholarships=[("SIBLING", "2025-06-02", "Youngest of three enrolled Ibarra siblings.")],
      pay=dict(method="gcash", style="early"), absences=(2, 1, 3)),
    # Moved from Diamond to Pearl on 2025-10-06 (internal move).
    E(key="rica", sy=SY1, eids=[217], inv=315, level="junior_highschool", grade="Grade 7", section="Pearl",
      enrolled_on="2025-06-02", entry="transferee", ability=87, plan="monthly",
      internal_move=("2025-10-06", "Diamond", "Section rebalancing: Diamond was over capacity.", REGISTRAR2),
      scholarships=[("SIBLING", "2025-06-02", "Second of three enrolled Ibarra siblings.")],
      pay=dict(method="gcash", style="early"), absences=(1, 2, 2)),
    E(key="renz", sy=SY1, eids=[218], inv=316, level="junior_highschool", grade="Grade 9", section="Sapphire",
      enrolled_on="2025-06-02", entry="transferee", ability=94, plan="monthly",
      scholarships=[("HONOR", "2025-06-02", "With Honors, Grade 8 (Marikina High School).")],
      pay=dict(method="bank_transfer", style="early"), absences=(0, 1, 1)),
    # Dropped out: stopped attending after 2026-01-16. Enrollment cancelled
    # (SF9 prints a cancelled enrollment as "Dropped"), Q3 marked dropped,
    # and the invoice is still live with Jan-Mar overdue.
    E(key="mark", sy=SY1, eids=[219], inv=317, level="junior_highschool", grade="Grade 7", section="Pearl",
      enrolled_on="2025-06-06", entry="transferee", ability=78, floor=75, plan="monthly", status="cancelled",
      dropped_on="2026-01-16",
      pay=dict(method="cash", style="arrears", through="2025-12-31"), absences=(14, 1, 7)),
    # Pending (no Form 137), cancelled before classes; invoice voided unpaid.
    E(key="daniel", sy=SY1, eids=[220], inv=318, level="junior_highschool", grade="Grade 9", section="Sapphire",
      enrolled_on="2025-05-22", entry="transferee", ability=83, plan="monthly", status="cancelled",
      cancelled=("2025-06-01", "Family chose a public high school closer to home."),
      void_on="2025-06-01", pay=dict(method="cash", style="none")),
    # Invoiced monthly, then re-issued as quarterly on 2025-06-20: the old
    # invoice is void (its installment 1 still shows as paid), the
    # downpayment moved to the new one.
    E(key="christine", sy=SY1, eids=[221], inv=319, level="junior_highschool", grade="Grade 10", section="Ruby",
      enrolled_on="2025-06-02", entry="transferee", ability=90, plan="monthly",
      reissue=dict(on="2025-06-20", inv=320, plan="quarterly"),
      pay=dict(method="card", style="early"), absences=(1, 1, 0)),
    E(key="bea", sy=SY1, eids=[222, 223], inv=321, level="senior_highschool", grade="Grade 11", section="ABM-A",
      strand="ABM", enrolled_on="2025-06-03", entry="transferee", ability=89, plan="monthly",
      scholarships=[("EMPLOYEE", "2025-06-03", "Daughter of Arvin Lacson (Accounting).")],
      pay=dict(method="others", style="salary"), absences=(1, 1, 2)),
    # Failed Business Mathematics (2nd semester): repeats Grade 11 ABM.
    E(key="raphael", sy=SY1, eids=[224, 225], inv=322, level="senior_highschool", grade="Grade 11", section="ABM-A",
      strand="ABM", enrolled_on="2025-06-05", entry="transferee", ability=79, floor=75, plan="semi_annual",
      overrides={"G11-ABM-BUSMATH": {"2nd_semester": 72}},
      pay=dict(method="cash", style="early"), absences=(10, 2, 8)),
    E(key="jeremiah", sy=SY1, eids=[226, 227], inv=323, level="senior_highschool", grade="Grade 12", section="ABM-A",
      strand="ABM", enrolled_on="2025-06-05", entry="transferee", ability=82, plan="monthly", graduates=True,
      scholarships=[("4PS", "2025-06-05", "4Ps household ID 4PS-SEED-007.")],
      pay=dict(method="cash", style="arrears", through="2026-01-31"), absences=(5, 2, 4)),
    E(key="jiwoo", sy=SY1, eids=[228, 229], inv=324, level="senior_highschool", grade="Grade 12", section="STEM-A",
      strand="STEM", enrolled_on="2025-05-23", entry="transferee", ability=95, plan="annual", graduates=True,
      scholarships=[("HONOR", "2025-05-23", "With High Honors, Grade 11.")],
      pay=dict(method="card", style="upfront"), absences=(1, 0, 1)),
    # Transfer-in on 2026-01-05. Quarterly, prorated: only the March
    # installment is left, so it carries the whole year's fees.
    E(key="nino", sy=SY1, eids=[230], inv=325, level="elementary", grade="Grade 4", section="Luna",
      enrolled_on="2026-01-05", entry="transferee", ability=83, plan="quarterly",
      transfer_in=("2026-01-05", "Family moved from Davao City to Marikina.", "Davao City Central Elementary School"),
      pay=dict(method="gcash", style="custom", list=[("2026-01-05", "5000.00", "Initial payment upon enrollment."),
                                                     ("2026-02-20", "10000.00", None)]),
      absences=(1, 1, 1)),

    # ═════════════ S.Y. 2026-2027 (current, up to TODAY) ═════════════
    E(key="paolo", sy=SY2, eids=[400], inv=500, level="kindergarten", grade="Kindergarten", section="Sunflower",
      enrolled_on="2026-05-18", entry="continuing", status="enrolled", ability=90, plan="monthly",
      scholarships=[("SIBLING", "2026-05-18", "Younger sibling; sister Maria Santos Reyes is in Grade 1.")],
      pay=dict(method="gcash", style="early"), absences=(1, 1, 2)),
    # Grade 1's 2026-2027 fee schedule has no items: a P0.00 invoice whose
    # P0.00 installments still go overdue.
    E(key="maria", sy=SY2, eids=[401], inv=501, level="elementary", grade="Grade 1", section="Rizal",
      enrolled_on="2026-05-18", entry="continuing", status="enrolled", ability=92, plan="monthly",
      pay=dict(method="gcash", style="none"), absences=(1, 0, 1)),
    E(key="bianca", sy=SY2, eids=[402], inv=502, level="elementary", grade="Grade 6", section="Aguinaldo",
      enrolled_on="2026-05-25", entry="continuing", status="enrolled", ability=88, plan="semi_annual",
      pay=dict(method="cash", style="early"), absences=(2, 1, 1)),
    E(key="patrick", sy=SY2, eids=[403], inv=503, level="elementary", grade="Grade 6", section="Aguinaldo",
      enrolled_on="2026-06-15", entry="continuing", status="enrolled", ability=78, floor=75, plan="monthly",
      overrides={"G6-MATH": {"1st_quarter": 74}, "G6-SCI": {"1st_quarter": 75}},
      pay=dict(method="cash", style="custom", list=[("2026-06-15", None, "Downpayment upon enrollment."),
                                                    ("2026-08-10", "1000.00", "Partial payment for July.")]),
      absences=(6, 1, 5), today="skip"),
    E(key="jasmine", sy=SY2, eids=[404], inv=504, level="junior_highschool", grade="Grade 7", section="Diamond",
      enrolled_on="2026-05-20", entry="continuing", status="enrolled", ability=95, plan="monthly",
      scholarships=[("4PS", "2026-05-20", "4Ps household ID 4PS-SEED-004, re-verified for 2026-2027."),
                    ("HONOR", "2026-05-20", "With Highest Honors, Grade 6 (S.Y. 2025-2026).")],
      pay=dict(method="cash", style="early"), absences=(0, 1, 0)),
    E(key="marco", sy=SY2, eids=[405], inv=505, level="junior_highschool", grade="Grade 7", section="Pearl",
      enrolled_on="2026-05-14", entry="continuing", status="enrolled", ability=84, plan="annual",
      pay=dict(method="bank_transfer", style="upfront"), absences=(2, 0, 3), today="L"),
    # Grade 9 has no 2026-2027 fee schedule, so Joshua has no invoice; his
    # section has no adviser, so the registrar takes attendance.
    E(key="joshua", sy=SY2, eids=[406], inv=None, level="junior_highschool", grade="Grade 9", section="Sapphire",
      enrolled_on="2026-05-29", entry="continuing", status="enrolled", ability=85, plan="monthly",
      pay=dict(method="gcash", style="none"), absences=(2, 1, 1), recorder=REGISTRAR),
    E(key="natasha", sy=SY2, eids=[407], inv=506, level="senior_highschool", grade="Grade 11", section="ABM-A",
      strand="ABM", enrolled_on="2026-05-27", entry="continuing", status="enrolled", ability=90, plan="quarterly",
      scholarships=[("QVR", "2026-05-27", "SHS voucher for an ESC completer; QVR certificate no. QVR-2026-118204.")],
      pay=dict(method="bank_transfer", style="early"), absences=(1, 0, 1)),
    E(key="gabriel", sy=SY2, eids=[408], inv=507, level="senior_highschool", grade="Grade 12", section="STEM-A",
      strand="STEM", enrolled_on="2026-05-26", entry="continuing", status="enrolled", ability=87, plan="semi_annual",
      pay=dict(method="check", style="early"), absences=(2, 1, 3)),
    E(key="carlos", sy=SY2, eids=[409], inv=508, level="elementary", grade="Grade 2", section="Bonifacio",
      enrolled_on="2026-05-21", entry="continuing", status="enrolled", ability=85, plan="monthly",
      pay=dict(method="gcash", style="early"), absences=(2, 1, 1)),
    # Retained in Grade 2 (no override needed for repeating a grade).
    E(key="kristine", sy=SY2, eids=[410], inv=509, level="elementary", grade="Grade 2", section="Bonifacio",
      enrolled_on="2026-06-08", entry="continuing", status="enrolled", ability=80, floor=76, plan="monthly",
      scholarships=[("4PS", "2026-06-08", "4Ps household ID 4PS-SEED-008.")],
      pay=dict(method="cash", style="custom", list=[("2026-06-08", None, "Downpayment upon enrollment."),
                                                    ("2026-08-14", "INST2", "Paid late (July).")]),
      absences=(4, 1, 3), today="A"),
    # Promoted Grade 3 -> 4 over an "incomplete" year outcome: override.
    # Her adviser resigned 2026-09-18; the co-adviser records from 09-21, and
    # EPP's Q1 grades were never posted (scores only).
    E(key="hannah", sy=SY2, eids=[411], inv=510, level="elementary", grade="Grade 4", section="Luna",
      enrolled_on="2026-05-28", entry="continuing", status="enrolled", ability=88, plan="quarterly",
      override=("Completed the Science 3 removal examination on 2026-05-20 (score 82); promotion to Grade 4 approved by the principal.",
                SUPERADMIN, "2026-05-28 10:15:00"),
      missing={("G4-EPP", "1st_quarter")},
      pay=dict(method="cash", style="early"), absences=(1, 1, 0),
      recorder_segments=[("2026-06-01", "2026-09-17", "arnel.pascual@slis.test"),
                         ("2026-09-21", None, "carla.bernardo@slis.test")]),
    E(key="ryan", sy=SY2, eids=[412], inv=511, level="elementary", grade="Grade 5", section="Silang",
      enrolled_on="2026-05-19", entry="continuing", status="enrolled", ability=86, plan="monthly",
      scholarships=[("SIBLING", "2026-05-19", "Youngest of three enrolled Ibarra siblings.")],
      pay=dict(method="gcash", style="early"), absences=(1, 1, 1)),
    E(key="nino", sy=SY2, eids=[413], inv=512, level="elementary", grade="Grade 5", section="Silang",
      enrolled_on="2026-05-26", entry="continuing", status="enrolled", ability=84, plan="quarterly",
      pay=dict(method="gcash", style="early"), absences=(1, 0, 2)),
    E(key="rica", sy=SY2, eids=[414], inv=513, level="junior_highschool", grade="Grade 8", section="Emerald",
      enrolled_on="2026-05-19", entry="continuing", status="enrolled", ability=88, plan="monthly",
      scholarships=[("SIBLING", "2026-05-19", "Second of three enrolled Ibarra siblings.")],
      pay=dict(method="gcash", style="early"), absences=(0, 1, 1)),
    # Grade 10 Ruby hasn't taken attendance today.
    E(key="renz", sy=SY2, eids=[415], inv=514, level="junior_highschool", grade="Grade 10", section="Ruby",
      enrolled_on="2026-05-19", entry="continuing", status="enrolled", ability=94, plan="semi_annual",
      scholarships=[("HONOR", "2026-05-19", "With High Honors, Grade 9 (S.Y. 2025-2026).")],
      pay=dict(method="bank_transfer", style="early"), absences=(0, 0, 1), today="skip"),
    E(key="christine", sy=SY2, eids=[416], inv=515, level="senior_highschool", grade="Grade 11", section="STEM-A",
      strand="STEM", enrolled_on="2026-05-22", entry="continuing", status="enrolled", ability=89, plan="quarterly",
      pay=dict(method="card", style="early"), absences=(1, 0, 1)),
    # Strand shift ABM (Grade 11) -> STEM (Grade 12): override.
    E(key="bea", sy=SY2, eids=[417], inv=516, level="senior_highschool", grade="Grade 12", section="STEM-A",
      strand="STEM", enrolled_on="2026-06-02", entry="continuing", status="enrolled", ability=87, plan="monthly",
      override=("Strand shift from ABM to STEM approved by the principal after a summer bridging class in General "
                "Chemistry; the learner intends to take up nursing.", SUPERADMIN, "2026-06-02 09:40:00"),
      scholarships=[("EMPLOYEE", "2026-06-02", "Daughter of Arvin Lacson (Accounting).")],
      pay=dict(method="others", style="salary"), absences=(1, 1, 1)),
    # Repeats Grade 11 ABM (failed Business Mathematics on the year).
    E(key="raphael", sy=SY2, eids=[418], inv=517, level="senior_highschool", grade="Grade 11", section="ABM-A",
      strand="ABM", enrolled_on="2026-06-10", entry="continuing", status="enrolled", ability=78, floor=75, plan="monthly",
      pay=dict(method="cash", style="custom", list=[("2026-06-10", None, "Downpayment upon enrollment.")]),
      absences=(7, 1, 6)),
    # Came through the online application (approved).
    E(key="sofia", sy=SY2, eids=[419], inv=518, level="nursery", grade="Nursery", section="Rose",
      enrolled_on="2026-05-18", entry="new", status="enrolled", ability=88, plan="monthly",
      scholarships=[("4PS", "2026-05-18", "4Ps household ID 4PS-SEED-002.")],
      pay=dict(method="gcash", style="early"), absences=(3, 2, 1)),
    E(key="miguel", sy=SY2, eids=[420], inv=519, level="kindergarten", grade="Kindergarten", section="Sunflower",
      enrolled_on="2026-05-19", entry="new", status="enrolled", ability=86, plan="quarterly",
      pay=dict(method="bank_transfer", style="early"), absences=(2, 1, 0)),
    # Pending: the document gate blocks "enrolled" (Form 137/138 and Good
    # Moral missing). Not invoiced, no attendance.
    E(key="patricia", sy=SY2, eids=[421], inv=None, level="elementary", grade="Grade 3", section="Del Pilar",
      enrolled_on="2026-09-21", entry="transferee", status="pending", ability=84, plan="monthly",
      pay=dict(method="cash", style="none")),
    # Transfer-in on 2026-08-17: prorated Aug-Mar; no Q1 grade (4 days in Q1).
    E(key="christian", sy=SY2, eids=[422], inv=520, level="junior_highschool", grade="Grade 8", section="Emerald",
      enrolled_on="2026-08-17", entry="transferee", status="enrolled", ability=83, plan="monthly",
      transfer_in=("2026-08-17", "Family relocated to Quezon City after typhoon damage to their home in Tacloban.",
                   "Tacloban City National High School"),
      pay=dict(method="cash", style="custom", list=[("2026-08-17", None, "Downpayment upon enrollment.")]),
      absences=(1, 1, 1)),
    # Came through the online application; transferred out 2026-09-11 with
    # August still unpaid.
    E(key="abigail", sy=SY2, eids=[423], inv=521, level="junior_highschool", grade="Grade 10", section="Ruby",
      enrolled_on="2026-05-27", entry="transferee", status="transferred_out", ability=88, plan="monthly",
      transfer_out=("2026-09-11", "Family emigrating to Canada.", "(abroad) Bishop McNally High School, Calgary, Alberta",
                    REGISTRAR),
      pay=dict(method="gcash", style="custom", list=[("2026-05-27", None, "Downpayment upon enrollment."),
                                                     ("2026-07-28", "INST2", None)]),
      absences=(1, 0, 1)),
    # Placed in ABM-A by mistake on 2026-05-30, cancelled 06-03 after two
    # days of attendance, re-enrolled in STEM-A the same day. Two rows in one
    # year; the first invoice voided (unpaid).
    E(key="erica", sy=SY2, eids=[424], inv=522, level="senior_highschool", grade="Grade 12", section="ABM-A",
      strand="ABM", enrolled_on="2026-05-30", entry="transferee", status="cancelled", ability=86, plan="monthly",
      cancelled=("2026-06-03", "Placed in the wrong strand at enrollment; re-enrolled in Grade 12 STEM-A."),
      attended_until="2026-06-02", void_on="2026-06-03", pay=dict(method="card", style="none"),
      absences=(0, 0, 0)),
    E(key="erica", sy=SY2, eids=[425], inv=523, level="senior_highschool", grade="Grade 12", section="STEM-A",
      strand="STEM", enrolled_on="2026-06-03", entry="continuing", status="enrolled", ability=86, plan="monthly",
      pay=dict(method="card", style="early"), absences=(1, 0, 2)),

    # ═════════════ Tier 2.5: more S.Y. 2025-2026 (finished) ═════════════
    # enrollment_id 231-258, invoice_id 326-349.
    # Nursery Rose: twins, both on the sibling discount (the second child).
    E(key="althea", sy=SY1, eids=[231], inv=326, level="nursery", grade="Nursery", section="Rose",
      enrolled_on="2025-05-26", entry="new", ability=87, plan="monthly",
      pay=dict(method="gcash", style="early"), absences=(5, 3, 4)),
    E(key="aldrin", sy=SY1, eids=[232], inv=327, level="nursery", grade="Nursery", section="Rose",
      enrolled_on="2025-05-26", entry="new", ability=85, plan="monthly",
      scholarships=[("SIBLING", "2025-05-26", "Twin brother of Althea Lumibao Rosales (Nursery).")],
      pay=dict(method="gcash", style="early"), absences=(6, 2, 5)),
    # Kindergarten Sunflower.
    E(key="elijah", sy=SY1, eids=[233], inv=328, level="kindergarten", grade="Kindergarten", section="Sunflower",
      enrolled_on="2025-06-02", entry="new", ability=86, plan="quarterly",
      pay=dict(method="cash", style="early"), absences=(3, 2, 2)),
    E(key="samantha", sy=SY1, eids=[234], inv=329, level="kindergarten", grade="Kindergarten", section="Sunflower",
      enrolled_on="2025-05-19", entry="new", ability=93, plan="annual",
      pay=dict(method="bank_transfer", style="upfront"), absences=(1, 1, 2)),
    # Grade 1 Rizal.
    E(key="lucas", sy=SY1, eids=[235], inv=330, level="elementary", grade="Grade 1", section="Rizal",
      enrolled_on="2025-05-30", entry="new", ability=83, plan="monthly",
      pay=dict(method="gcash", style="late_some", late={4, 7}), absences=(6, 3, 4)),
    E(key="chloe", sy=SY1, eids=[236], inv=331, level="elementary", grade="Grade 1", section="Rizal",
      enrolled_on="2025-05-21", entry="new", ability=94, plan="semi_annual",
      pay=dict(method="card", style="early"), absences=(2, 1, 1)),
    # Grade 2 Bonifacio: 4Ps, chronic arrears, ends the year still owing.
    E(key="angelo", sy=SY1, eids=[237], inv=332, level="elementary", grade="Grade 2", section="Bonifacio",
      enrolled_on="2025-06-11", entry="transferee", ability=80, floor=75, plan="monthly",
      scholarships=[("4PS", "2025-06-11", "4Ps household ID 4PS-SEED-009 (DSWD certification on file).")],
      pay=dict(method="cash", style="arrears", through="2025-12-31",
               partial=("2026-01-31", "2026-02-06", "800.00", "Partial; the balance after the next cash grant.")),
      absences=(11, 4, 8)),
    # Grade 3 Mabini.
    E(key="trisha", sy=SY1, eids=[238], inv=333, level="elementary", grade="Grade 3", section="Mabini",
      enrolled_on="2025-05-23", entry="transferee", ability=90, plan="quarterly",
      pay=dict(method="bank_transfer", style="early"), absences=(2, 2, 1)),
    # Grade 4 Luna: aunt pays by salary deduction is not applicable here, so
    # a plain quarterly payer who settles each installment a few days early.
    E(key="miguelito", sy=SY1, eids=[239], inv=334, level="elementary", grade="Grade 4", section="Luna",
      enrolled_on="2025-06-06", entry="transferee", ability=82, plan="quarterly",
      pay=dict(method="cash", style="early"), absences=(7, 3, 5)),
    # Grade 5 Silang: honour student, annual plan paid in full up front.
    E(key="danica", sy=SY1, eids=[240], inv=335, level="elementary", grade="Grade 5", section="Silang",
      enrolled_on="2025-05-16", entry="transferee", ability=96, plan="annual",
      scholarships=[("HONOR", "2025-05-16", "With Highest Honors, Grade 4 (Addition Hills Integrated School).")],
      pay=dict(method="bank_transfer", style="upfront"), absences=(1, 0, 1)),
    # Grade 6 Aguinaldo.
    E(key="kenneth", sy=SY1, eids=[241], inv=336, level="elementary", grade="Grade 6", section="Aguinaldo",
      enrolled_on="2025-06-04", entry="transferee", ability=84, plan="monthly",
      pay=dict(method="gcash", style="early"), absences=(4, 2, 3)),
    # ── Grade 7 Diamond: four learners for the section that had none ──
    E(key="francine", sy=SY1, eids=[242], inv=337, level="junior_highschool", grade="Grade 7", section="Diamond",
      enrolled_on="2025-05-20", entry="transferee", ability=93, plan="semi_annual",
      scholarships=[("HONOR", "2025-05-20", "With Honors, Grade 6 (Malanday Elementary School).")],
      pay=dict(method="bank_transfer", style="early"), absences=(1, 1, 2)),
    E(key="jerome", sy=SY1, eids=[243], inv=338, level="junior_highschool", grade="Grade 7", section="Diamond",
      enrolled_on="2025-06-09", entry="transferee", ability=79, floor=75, plan="monthly",
      scholarships=[("4PS", "2025-06-09", "4Ps household ID 4PS-SEED-010.")],
      pay=dict(method="cash", style="arrears", through="2026-01-31"), absences=(13, 5, 9)),
    E(key="shaina", sy=SY1, eids=[244], inv=339, level="junior_highschool", grade="Grade 7", section="Diamond",
      enrolled_on="2025-05-27", entry="transferee", ability=88, plan="monthly",
      pay=dict(method="gcash", style="late_some", late={3, 6, 9}), absences=(3, 2, 2)),
    # Transferred out to Cagayan de Oro on 2026-02-06: Q1-Q3 graded, Q4 stops,
    # the invoice is closed out and the remaining installments waived.
    E(key="dexter", sy=SY1, eids=[245], inv=340, level="junior_highschool", grade="Grade 7", section="Diamond",
      enrolled_on="2025-06-02", entry="transferee", ability=85, plan="monthly", status="transferred_out",
      transfer_out=("2026-02-06", "Family relocating to Cagayan de Oro City.",
                    "Cagayan de Oro City National High School", REGISTRAR),
      pay=dict(method="cash", style="early"), absences=(4, 2, 3)),
    # Grade 8 Emerald: ESC grantee (fixed 14,000 off tuition).
    E(key="rowena", sy=SY1, eids=[246], inv=341, level="junior_highschool", grade="Grade 8", section="Emerald",
      enrolled_on="2025-05-22", entry="transferee", ability=91, plan="quarterly",
      scholarships=[("ESC", "2025-05-22", "ESC grantee; certificate from Commonwealth High School.")],
      pay=dict(method="bank_transfer", style="early"), absences=(2, 1, 1)),
    # Grade 9 Sapphire.
    E(key="jayvee", sy=SY1, eids=[247], inv=342, level="junior_highschool", grade="Grade 9", section="Sapphire",
      enrolled_on="2025-06-05", entry="transferee", ability=86, plan="monthly",
      pay=dict(method="gcash", style="early"), absences=(5, 2, 4)),
    # Grade 10 Ruby: fails Mathematics on the year (average below 75), so she
    # repeats Grade 10 in 2026-2027.
    E(key="maricel", sy=SY1, eids=[248], inv=343, level="junior_highschool", grade="Grade 10", section="Ruby",
      enrolled_on="2025-06-13", entry="transferee", ability=78, floor=75, plan="monthly",
      overrides={"G10-MATH": {"1st_quarter": 72, "2nd_quarter": 74, "3rd_quarter": 73, "4th_quarter": 74}},
      scholarships=[("4PS", "2025-06-13", "4Ps household ID 4PS-SEED-011.")],
      pay=dict(method="cash", style="arrears", through="2026-02-28"), absences=(15, 3, 10)),
    # Grade 11 STEM-A (two semester rows).
    E(key="kiara", sy=SY1, eids=[249, 250], inv=344, level="senior_highschool", grade="Grade 11", section="STEM-A",
      strand="STEM", enrolled_on="2025-05-19", entry="transferee", ability=94, plan="semi_annual",
      scholarships=[("HONOR", "2025-05-19", "With High Honors, Grade 10 (San Juan National High School).")],
      pay=dict(method="card", style="early"), absences=(1, 1, 1)),
    # Grade 12 ABM-A: graduates at the end of the year.
    E(key="vincent", sy=SY1, eids=[251, 252], inv=345, level="senior_highschool", grade="Grade 12", section="ABM-A",
      strand="ABM", enrolled_on="2025-05-24", entry="transferee", ability=88, plan="quarterly", graduates=True,
      pay=dict(method="bank_transfer", style="early"), absences=(3, 2, 2)),

    # ═════════════ Tier 2.5: continuations into S.Y. 2026-2027 ═════════════
    # enrollment_id 426-440, invoice_id 524-538. Fourteen of the twenty
    # continue; Dexter transferred out, Vincent graduated, and four others
    # did not come back (they count as leavers in the year comparison).
    E(key="althea", sy=SY2, eids=[426], inv=524, level="kindergarten", grade="Kindergarten", section="Sunflower",
      enrolled_on="2026-05-20", entry="continuing", status="enrolled", ability=88, plan="monthly",
      pay=dict(method="gcash", style="early"), absences=(2, 1, 1)),
    E(key="aldrin", sy=SY2, eids=[427], inv=525, level="kindergarten", grade="Kindergarten", section="Sunflower",
      enrolled_on="2026-05-20", entry="continuing", status="enrolled", ability=86, plan="monthly",
      scholarships=[("SIBLING", "2026-05-20", "Twin brother of Althea Lumibao Rosales (Kindergarten).")],
      pay=dict(method="gcash", style="early"), absences=(2, 2, 1)),
    # Grade 1's 2026-2027 schedule has no items, so this is another P0 invoice.
    E(key="elijah", sy=SY2, eids=[428], inv=526, level="elementary", grade="Grade 1", section="Rizal",
      enrolled_on="2026-05-26", entry="continuing", status="enrolled", ability=87, plan="monthly",
      pay=dict(method="cash", style="none"), absences=(1, 1, 1)),
    E(key="samantha", sy=SY2, eids=[429], inv=527, level="elementary", grade="Grade 1", section="Rizal",
      enrolled_on="2026-05-15", entry="continuing", status="enrolled", ability=93, plan="monthly",
      pay=dict(method="bank_transfer", style="none"), absences=(0, 1, 1)),
    E(key="lucas", sy=SY2, eids=[430], inv=528, level="elementary", grade="Grade 2", section="Bonifacio",
      enrolled_on="2026-05-29", entry="continuing", status="enrolled", ability=84, plan="monthly",
      pay=dict(method="gcash", style="early"), absences=(2, 1, 2), today="L"),
    E(key="chloe", sy=SY2, eids=[431], inv=529, level="elementary", grade="Grade 2", section="Bonifacio",
      enrolled_on="2026-05-18", entry="continuing", status="enrolled", ability=94, plan="semi_annual",
      pay=dict(method="card", style="early"), absences=(1, 0, 1)),
    E(key="angelo", sy=SY2, eids=[432], inv=530, level="elementary", grade="Grade 3", section="Del Pilar",
      enrolled_on="2026-06-12", entry="continuing", status="enrolled", ability=81, floor=76, plan="monthly",
      scholarships=[("4PS", "2026-06-12", "4Ps household ID 4PS-SEED-009, re-verified for 2026-2027.")],
      pay=dict(method="cash", style="custom", list=[("2026-06-12", None, "Downpayment upon enrollment.")]),
      absences=(5, 2, 4), today="A"),
    E(key="trisha", sy=SY2, eids=[433], inv=531, level="elementary", grade="Grade 4", section="Luna",
      enrolled_on="2026-05-22", entry="continuing", status="enrolled", ability=91, plan="quarterly",
      pay=dict(method="bank_transfer", style="early"), absences=(1, 1, 1)),
    E(key="miguelito", sy=SY2, eids=[434], inv=532, level="elementary", grade="Grade 5", section="Silang",
      enrolled_on="2026-06-05", entry="continuing", status="enrolled", ability=83, plan="quarterly",
      pay=dict(method="cash", style="early"), absences=(3, 1, 2)),
    E(key="danica", sy=SY2, eids=[435], inv=533, level="elementary", grade="Grade 6", section="Aguinaldo",
      enrolled_on="2026-05-15", entry="continuing", status="enrolled", ability=96, plan="annual",
      scholarships=[("HONOR", "2026-05-15", "With Highest Honors, Grade 5 (S.Y. 2025-2026).")],
      pay=dict(method="bank_transfer", style="upfront"), absences=(0, 1, 0)),
    E(key="kenneth", sy=SY2, eids=[436], inv=534, level="junior_highschool", grade="Grade 7", section="Diamond",
      enrolled_on="2026-06-03", entry="continuing", status="enrolled", ability=85, plan="monthly",
      pay=dict(method="gcash", style="early"), absences=(2, 1, 2)),
    E(key="francine", sy=SY2, eids=[437], inv=535, level="junior_highschool", grade="Grade 8", section="Emerald",
      enrolled_on="2026-05-19", entry="continuing", status="enrolled", ability=93, plan="semi_annual",
      scholarships=[("HONOR", "2026-05-19", "With Honors, Grade 7 (S.Y. 2025-2026).")],
      pay=dict(method="bank_transfer", style="early"), absences=(1, 0, 1)),
    # Grade 8 Emerald. Enrolled late (mid-June) and straight into arrears:
    # only the downpayment has been paid, so July onwards is overdue.
    E(key="jerome", sy=SY2, eids=[438], inv=536, level="junior_highschool", grade="Grade 8", section="Emerald",
      enrolled_on="2026-06-15", entry="continuing", status="enrolled", ability=80, floor=75, plan="monthly",
      pay=dict(method="cash", style="custom", list=[("2026-06-15", None, "Downpayment upon enrollment.")]),
      absences=(6, 2, 5)),
    # Repeats Grade 10 after failing Mathematics in 2025-2026.
    E(key="maricel", sy=SY2, eids=[439], inv=537, level="junior_highschool", grade="Grade 10", section="Ruby",
      enrolled_on="2026-06-18", entry="continuing", status="enrolled", ability=80, floor=76, plan="monthly",
      scholarships=[("4PS", "2026-06-18", "4Ps household ID 4PS-SEED-011.")],
      pay=dict(method="cash", style="custom", list=[("2026-06-18", None, "Downpayment upon enrollment."),
                                                    ("2026-08-21", "1500.00", "Partial payment for July.")]),
      absences=(8, 2, 6)),
    # Grade 11 STEM -> Grade 12 STEM, promoted from the completed 2nd semester.
    E(key="kiara", sy=SY2, eids=[440], inv=538, level="senior_highschool", grade="Grade 12", section="STEM-A",
      strand="STEM", enrolled_on="2026-05-21", entry="continuing", status="enrolled", ability=94, plan="semi_annual",
      scholarships=[("HONOR", "2026-05-21", "With High Honors, Grade 11 (S.Y. 2025-2026).")],
      pay=dict(method="card", style="early"), absences=(1, 1, 0)),
]


# ════════════════════════════════════════════════════════════════════════════
# ONLINE INTAKE, S.Y. 2026-2027
# Invites expire 3 days after issue (APPLICATION_INVITE_TTL_SECONDS default).
# Access codes are listed so the applicant flow can be tried with the one
# still-usable invite.
# ════════════════════════════════════════════════════════════════════════════
INVITES = [
    # key, first, last, email, mobile, sy, issued_by, issued_at, extra
    dict(key="app-sofia", first="Sofia", last="Aquino", email="maricel.aquino.seed@gmail.com", mobile="09241100005",
         sy=SY2, by=REGISTRAR, issued="2026-05-04 09:30:00", code="HK7M2QXA"),
    dict(key="app-miguel", first="Miguel", last="Fernandez", email="rodrigo.fernandez.seed@gmail.com", mobile="09251100006",
         sy=SY2, by=REGISTRAR2, issued="2026-05-08 14:00:00", code="P3RTW8NB"),
    dict(key="app-abigail", first="Abigail", last="Fajardo", email="anita.fajardo.seed@gmail.com", mobile="09681100039",
         sy=SY2, by=REGISTRAR, issued="2026-05-18 10:10:00", code="ZC4YD9KE"),
    dict(key="app-andres", first="Andres", last="Santiago", email="teresita.santiago.seed@gmail.com", mobile="09301100010",
         sy=SY2, by=REGISTRAR2, issued="2026-09-22 15:20:00", code="M6VQ2HJT"),
    dict(key="app-daniel", first="Daniel", last="Ramirez", email="ligaya.ramirez.seed@gmail.com", mobile="09571100030",
         sy=SY2, by=REGISTRAR, issued="2026-09-21 08:45:00", code="R8XN4FLW"),
    dict(key="app-isabella", first="Isabella", last="Villanueva", email="eduardo.villanueva.seed@gmail.com", mobile="09261100007",
         sy=SY2, by=REGISTRAR, issued="2026-05-28 11:00:00", code="T2GB7SPC"),
    dict(key="app-juan", first="Juan", last="Dela Cruz", email="lourdes.delacruz.seed@gmail.com", mobile="09191100002",
         sy=SY2, by=REGISTRAR2, issued="2026-09-29 16:30:00", code="W9DK3MZR"),
    # Invites nobody used.
    dict(key="inv-expired", first="Camille", last="Espinoza", email=None, mobile="09291100009",
         sy=None, by=REGISTRAR, issued="2026-04-20 09:00:00", code="E5HP8QTA"),                     # before year tagging
    dict(key="inv-revoked", first="Rafael", last="Castilo", email="josefina.castillo.seed@gmail.com", mobile="09271100008",
         sy=SY2, by=REGISTRAR2, issued="2026-08-03 10:00:00", code="J4NW6XCB",
         revoked="2026-08-03 10:12:00"),                                                            # misspelt surname
    dict(key="inv-locked", first="Vincent", last="Batungbakal", email="violeta.b.seed@gmail.com", mobile="09621100034",
         sy=SY2, by=REGISTRAR, issued="2026-09-28 13:00:00", code="B7LS2VYD",
         attempts=5, locked="2026-09-28 13:26:00"),
    dict(key="inv-active", first="Mia", last="Evangelista", email="myrna.evangelista.seed@gmail.com", mobile="09611100033",
         sy=SY2, by=REGISTRAR2, issued="2026-09-28 16:00:00", code="Q2FJ8RNK"),

    # ── Tier 2.5 invites ──
    dict(key="app-liam", first="Liam", last="Bautista", email="grace.bautista.seed@gmail.com", mobile="09521100081",
         sy=SY2, by=REGISTRAR, issued="2026-09-25 09:15:00", code="A3KD7WQM"),
    dict(key="app-nadine", first="Nadine", last="Coller", email="rosario.coller.seed@gmail.com", mobile="09531100082",
         sy=SY2, by=REGISTRAR2, issued="2026-09-23 11:40:00", code="F8TG2XPV"),
    dict(key="app-ezekiel", first="Ezekiel", last="Mangubat", email="pedro.mangubat.seed@gmail.com", mobile="09541100083",
         sy=SY2, by=REGISTRAR, issued="2026-09-18 14:05:00", code="N5QW9BJR"),
    dict(key="app-amara", first="Amara", last="Sitoy", email="jocelyn.sitoy.seed@gmail.com", mobile="09551100084",
         sy=SY2, by=REGISTRAR2, issued="2026-09-14 08:50:00", code="L2VC6HDS"),
    dict(key="app-rafaela", first="Rafaela", last="Lumanog", email="arturo.lumanog.seed@gmail.com", mobile="09561100085",
         sy=SY2, by=REGISTRAR, issued="2026-06-02 10:20:00", code="Y7MB4KFT"),
    dict(key="app-tobias", first="Tobias", last="Carandang", email="milagros.carandang.seed@gmail.com", mobile="09571100086",
         sy=SY2, by=REGISTRAR2, issued="2026-09-29 09:05:00", code="D4JS8NRW"),
    # Issued but never opened: expires tomorrow.
    dict(key="inv-fresh", first="Beatriz", last="Olivares", email="consuelo.olivares.seed@gmail.com", mobile="09581100087",
         sy=SY2, by=REGISTRAR, issued="2026-09-30 08:00:00", code="G6PX3VLC"),
    # Second invite for a family whose first code expired unused.
    dict(key="inv-stale", first="Emilio", last="Rubio", email=None, mobile="09591100088",
         sy=SY2, by=REGISTRAR2, issued="2026-08-11 15:30:00", code="H9ZN5TQB"),
]

APPLICATIONS = [
    # approved -> the created student already exists in PROFILES
    dict(id=700, invite="app-sofia", status="approved", student="sofia", apply=("nursery", "Nursery", None),
         submitted="2026-05-06 19:42:00", decided="2026-05-12 10:05:00", decided_by=REGISTRAR),
    dict(id=701, invite="app-miguel", status="approved", student="miguel", apply=("kindergarten", "Kindergarten", None),
         submitted="2026-05-10 21:15:00", reviewed_by=REGISTRAR2, reviewed="2026-05-11 08:30:00",
         decided="2026-05-15 09:20:00", decided_by=REGISTRAR2),
    dict(id=702, invite="app-abigail", status="approved", student="abigail", apply=("junior_highschool", "Grade 10", None),
         submitted="2026-05-20 20:03:00", decided="2026-05-25 13:40:00", decided_by=REGISTRAR),
    # submitted, not yet looked at: a Grade 5 transferee
    dict(id=703, invite="app-andres", status="submitted", apply=("elementary", "Grade 5", None),
         submitted="2026-09-24 20:11:00",
         payload=dict(
             student=dict(lrn="136700000109", first_name="Andres", middle_name="Florendo", last_name="Santiago",
                          suffix=None, age=10, sex="male", religion="Roman Catholic", birth_date="2016-05-07",
                          email=None, mobile_number=None,
                          current_address="88 Gen. Luna St., Brgy. Pacita, San Pedro, Laguna",
                          permanent_address="88 Gen. Luna St., Brgy. Pacita, San Pedro, Laguna"),
             household=dict(parent_marital_status="married", living_arrangement="both_parents",
                            is_4ps_beneficiary=False, four_ps_id=None),
             guardians=[dict(relationship="mother", full_name="Teresita Florendo Santiago", occupation="Laundrywoman",
                             email_address="teresita.santiago.seed@gmail.com", mobile_number="09301100010", is_primary_contact=True),
                        dict(relationship="father", full_name="Andres Cruz Santiago Sr.", occupation="Jeepney Driver",
                             email_address=None, mobile_number="09311100010", is_primary_contact=False)],
             siblings=[dict(full_name="Angela Florendo Santiago", age=13)],
             previous_schools=[dict(school_name="Pacita Complex Elementary School",
                                    school_address="Brgy. Pacita, San Pedro, Laguna")])),
    # in review: a former learner re-applying; the LRN is a strong duplicate
    dict(id=704, invite="app-daniel", status="in_review", apply=("junior_highschool", "Grade 10", None),
         submitted="2026-09-22 19:30:00", reviewed_by=REGISTRAR2, reviewed="2026-09-25 09:10:00",
         duplicate_of="daniel",
         payload=dict(
             student=dict(lrn="136700000129", first_name="Daniel", middle_name="Paglinawan", last_name="Ramirez",
                          suffix=None, age=15, sex="male", religion="Born Again", birth_date="2011-08-22",
                          email="daniel.ramirez.seed@gmail.com", mobile_number="09571234629",
                          current_address="88 Narra Ave., Brgy. Barangka Drive, Mandaluyong City",
                          permanent_address="88 Narra Ave., Brgy. Barangka Drive, Mandaluyong City"),
             household=dict(parent_marital_status="widowed", living_arrangement="mother_only",
                            is_4ps_beneficiary=True, four_ps_id="4PS-SEED-006"),
             guardians=[dict(relationship="mother", full_name="Ligaya Paglinawan Ramirez", occupation="Laundrywoman",
                             email_address="ligaya.ramirez.seed@gmail.com", mobile_number="09571100030", is_primary_contact=True)],
             siblings=[dict(full_name="Denise Paglinawan Ramirez", age=10)],
             previous_schools=[dict(school_name="Barangka National High School",
                                    school_address="Brgy. Barangka Ilaya, Mandaluyong City")])),
    # rejected: too young for Nursery
    dict(id=705, invite="app-isabella", status="rejected", apply=("nursery", "Nursery", None),
         submitted="2026-05-30 18:25:00", decided="2026-06-02 10:00:00", decided_by=REGISTRAR,
         note="Too young for Nursery this school year: learners must be 4 years old by August 31, 2026. "
              "Please apply again for S.Y. 2027-2028.",
         payload=dict(
             student=dict(lrn=None, first_name="Isabella", middle_name="Torres", last_name="Villanueva", suffix=None,
                          age=3, sex="female", religion="Roman Catholic", birth_date="2023-01-10", email=None,
                          mobile_number=None, current_address="56 Quezon Blvd., Brgy. Sta. Mesa, Manila",
                          permanent_address="56 Quezon Blvd., Brgy. Sta. Mesa, Manila"),
             household=dict(parent_marital_status="widowed", living_arrangement="father_only",
                            is_4ps_beneficiary=False, four_ps_id=None),
             guardians=[dict(relationship="father", full_name="Eduardo Torres Villanueva", occupation="OFW (on leave)",
                             email_address="eduardo.villanueva.seed@gmail.com", mobile_number="09261100007",
                             is_primary_contact=True)],
             siblings=[], previous_schools=[])),
    # draft: opened yesterday evening, only the name filled in; invite not consumed
    dict(id=706, invite="app-juan", status="draft", apply=("elementary", "Grade 1", None),
         created="2026-09-29 18:05:00",
         payload=dict(
             student=dict(lrn=None, first_name="Juan", middle_name="Cruz", last_name="Dela Cruz", suffix=None,
                          age=None, sex="male", religion=None, birth_date=None, email=None, mobile_number=None,
                          current_address="", permanent_address=""),
             household=None, guardians=[], siblings=[], previous_schools=[])),

    # ── Tier 2.5 applications ──
    # submitted: Nursery applicant for the current year, nothing done yet.
    dict(id=707, invite="app-liam", status="submitted", apply=("nursery", "Nursery", None),
         submitted="2026-09-26 20:30:00",
         payload=dict(
             student=dict(lrn=None, first_name="Liam", middle_name="Perez", last_name="Bautista", suffix=None,
                          age=4, sex="male", religion="Roman Catholic", birth_date="2022-03-04", email=None,
                          mobile_number=None, current_address="18 Dalandan St., Brgy. Talon Dos, Las Piñas City",
                          permanent_address="18 Dalandan St., Brgy. Talon Dos, Las Piñas City"),
             household=dict(parent_marital_status="married", living_arrangement="both_parents",
                            is_4ps_beneficiary=False, four_ps_id=None),
             guardians=[dict(relationship="mother", full_name="Grace Perez Bautista", occupation="Bookkeeper",
                             email_address="grace.bautista.seed@gmail.com", mobile_number="09521100081", is_primary_contact=True),
                        dict(relationship="father", full_name="Noel Ramos Bautista", occupation="Warehouse Staff",
                             email_address=None, mobile_number="09521100181", is_primary_contact=False)],
             siblings=[], previous_schools=[])),
    # in_review: Grade 4 transferee, registrar has opened it.
    dict(id=708, invite="app-nadine", status="in_review", apply=("elementary", "Grade 4", None),
         submitted="2026-09-24 19:05:00", reviewed_by=REGISTRAR, reviewed="2026-09-28 10:30:00",
         payload=dict(
             student=dict(lrn="136700000182", first_name="Nadine", middle_name="Ferrer", last_name="Coller", suffix=None,
                          age=9, sex="female", religion="Roman Catholic", birth_date="2017-02-18", email=None,
                          mobile_number=None, current_address="7 Ipil St., Brgy. Sto. Niño, Parañaque City",
                          permanent_address="7 Ipil St., Brgy. Sto. Niño, Parañaque City"),
             household=dict(parent_marital_status="separated", living_arrangement="mother_only",
                            is_4ps_beneficiary=False, four_ps_id=None),
             guardians=[dict(relationship="mother", full_name="Rosario Ferrer Coller", occupation="Flight Attendant",
                             email_address="rosario.coller.seed@gmail.com", mobile_number="09531100082", is_primary_contact=True)],
             siblings=[dict(full_name="Nathan Ferrer Coller", age=6)],
             previous_schools=[dict(school_name="Sto. Niño Parochial School",
                                    school_address="Brgy. Sto. Niño, Parañaque City")])),
    # rejected: applied for Grade 11 STEM without the Grade 10 record.
    dict(id=709, invite="app-ezekiel", status="rejected", apply=("senior_highschool", "Grade 11", "STEM"),
         submitted="2026-09-19 21:10:00", reviewed_by=REGISTRAR2, reviewed="2026-09-21 09:00:00",
         decided="2026-09-24 14:20:00", decided_by=REGISTRAR,
         note="No Form 137 or certificate of completion for Grade 10 was attached, and the previous school could "
              "not confirm enrollment. The family may re-apply once the records are released.",
         payload=dict(
             student=dict(lrn="136700000183", first_name="Ezekiel", middle_name="Obiena", last_name="Mangubat",
                          suffix=None, age=16, sex="male", religion="Born Again", birth_date="2010-06-12",
                          email="ezekiel.mangubat.seed@gmail.com", mobile_number="09541234683",
                          current_address="92 Maharlika St., Brgy. Bagong Pag-asa, Quezon City",
                          permanent_address="92 Maharlika St., Brgy. Bagong Pag-asa, Quezon City"),
             household=dict(parent_marital_status="married", living_arrangement="both_parents",
                            is_4ps_beneficiary=False, four_ps_id=None),
             guardians=[dict(relationship="father", full_name="Pedro Obiena Mangubat", occupation="Taxi Driver",
                             email_address="pedro.mangubat.seed@gmail.com", mobile_number="09541100083", is_primary_contact=True)],
             siblings=[], previous_schools=[dict(school_name="(unconfirmed) Bagong Pag-asa High School",
                                                 school_address="Brgy. Bagong Pag-asa, Quezon City")])),
    # submitted: Kindergarten applicant, 4Ps household.
    dict(id=710, invite="app-amara", status="submitted", apply=("kindergarten", "Kindergarten", None),
         submitted="2026-09-15 18:45:00",
         payload=dict(
             student=dict(lrn=None, first_name="Amara", middle_name="Dagohoy", last_name="Sitoy", suffix=None,
                          age=5, sex="female", religion="Roman Catholic", birth_date="2021-01-27", email=None,
                          mobile_number=None, current_address="Purok 6, Brgy. Pinyahan, Quezon City",
                          permanent_address="Purok 6, Brgy. Pinyahan, Quezon City"),
             household=dict(parent_marital_status="single_parent", living_arrangement="mother_only",
                            is_4ps_beneficiary=True, four_ps_id="4PS-SEED-012"),
             guardians=[dict(relationship="mother", full_name="Jocelyn Dagohoy Sitoy", occupation="Street Sweeper",
                             email_address="jocelyn.sitoy.seed@gmail.com", mobile_number="09551100084", is_primary_contact=True)],
             siblings=[dict(full_name="Arvin Dagohoy Sitoy", age=11)], previous_schools=[])),
    # draft abandoned in June: half filled in, never submitted.
    dict(id=711, invite="app-rafaela", status="draft", apply=("elementary", "Grade 2", None),
         created="2026-06-02 19:20:00",
         payload=dict(
             student=dict(lrn=None, first_name="Rafaela", middle_name="Sison", last_name="Lumanog", suffix=None,
                          age=7, sex="female", religion="Roman Catholic", birth_date="2019-05-19", email=None,
                          mobile_number=None, current_address="3 Mangga St., Brgy. Sangandaan, Caloocan City",
                          permanent_address=""),
             household=dict(parent_marital_status="married", living_arrangement="both_parents",
                            is_4ps_beneficiary=False, four_ps_id=None),
             guardians=[dict(relationship="father", full_name="Arturo Sison Lumanog", occupation="Baker",
                             email_address="arturo.lumanog.seed@gmail.com", mobile_number="09561100085", is_primary_contact=True)],
             siblings=[], previous_schools=[])),
    # submitted yesterday: Grade 8 transferee whose LRN matches nobody.
    dict(id=712, invite="app-tobias", status="submitted", apply=("junior_highschool", "Grade 8", None),
         submitted="2026-09-29 22:05:00",
         payload=dict(
             student=dict(lrn="136700000186", first_name="Tobias", middle_name="Almeda", last_name="Carandang",
                          suffix=None, age=13, sex="male", religion="Roman Catholic", birth_date="2013-03-28",
                          email=None, mobile_number="09571234686",
                          current_address="25 Guijo St., Brgy. Pansol, Quezon City",
                          permanent_address="Purok 1, Brgy. Lumbang, Calauan, Laguna"),
             household=dict(parent_marital_status="widowed", living_arrangement="mother_only",
                            is_4ps_beneficiary=False, four_ps_id=None),
             guardians=[dict(relationship="mother", full_name="Milagros Almeda Carandang", occupation="Nursing Aide",
                             email_address="milagros.carandang.seed@gmail.com", mobile_number="09571100086", is_primary_contact=True)],
             siblings=[dict(full_name="Trixie Almeda Carandang", age=16)],
             previous_schools=[dict(school_name="Calauan National High School",
                                    school_address="Brgy. Balayhangin, Calauan, Laguna")])),
]
