#!/usr/bin/env python3
"""
Generate seed_data.sql (Tier 2: 25 learners in S.Y. 2025-2026, 25 in
S.Y. 2026-2027 up to TODAY) and the placeholder requirement PDFs its
submission rows point at.

    python generate_seed.py --out /path/to/seed_data.sql --media DIR [--media DIR ...]

The data lives in seed_spec.py; this file only turns it into SQL, using the
same rules the services use (DO 8 grading, the billing waterfall and
installment schedule, the document gate, guardian provisioning).

Deterministic: every random value comes from an RNG seeded per learner, year
and purpose, and password hashes use fixed salts, so regenerating gives the
same file byte for byte, and adding a learner never moves anyone else's data.
"""
import argparse
import calendar
import datetime as dt
import hashlib
import json
import random
import uuid
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from seed_spec import (
    APPLICATIONS, CALENDARS, CURRENT_SY, D, DEMO_GUARDIANS, DISCOUNT_TYPES, DOC_NAMES, EARLY_BIRD_DAYS,
    ENROLLMENTS, FEE_NOTES, HOUSEHOLDS, INVITES, LADDER, LEVEL_OF, LRN_BLOCK, LRN_LIKE, LRN_WIDTH, PASSWORD, PLAN_PCT,
    PINNED_NUMBERS, PLAN_SHAPE, PLAN_TYPE, PROFILE, PROFILES, REGISTRAR, REQUIRED_ALL, REQUIRED_TRANSFEREE,
    SCHOLARSHIP_TYPES, SECTION_CREATED, SECTIONS, STAFF, SY1, SY2, TODAY, d, fee_items,
    subject_catalogue,
)

SEED = "slis-seed-tier2"


def rng(*parts):
    return random.Random("|".join(str(p) for p in (SEED,) + parts))


def q2(x):
    return D(str(x)).quantize(D("0.01"), rounding=ROUND_HALF_UP)


# ── DepEd Order 8 s.2015 (copied from enrollment-service grading/deped.py) ──
TRANSMUTATION_TABLE = [(D(a), b) for a, b in [
    ("100.00", 100), ("98.40", 99), ("96.80", 98), ("95.20", 97), ("93.60", 96),
    ("92.00", 95), ("90.40", 94), ("88.80", 93), ("87.20", 92), ("85.60", 91),
    ("84.00", 90), ("82.40", 89), ("80.80", 88), ("79.20", 87), ("77.60", 86),
    ("76.00", 85), ("74.40", 84), ("72.80", 83), ("71.20", 82), ("69.60", 81),
    ("68.00", 80), ("66.40", 79), ("64.80", 78), ("63.20", 77), ("61.60", 76),
    ("60.00", 75), ("56.00", 74), ("52.00", 73), ("48.00", 72), ("44.00", 71),
    ("40.00", 70), ("36.00", 69), ("32.00", 68), ("28.00", 67), ("24.00", 66),
    ("20.00", 65), ("16.00", 64), ("12.00", 63), ("8.00", 62), ("4.00", 61),
    ("0.00", 60),
]]


def transmute(ig):
    if ig >= TRANSMUTATION_TABLE[0][0]:
        return 100
    for lower, grade in TRANSMUTATION_TABLE:
        if ig >= lower:
            return grade
    return 60


TEMPLATES = {
    "kinder": ("Standard Kindergarten", [("Written Works", D("50.00")), ("Performance Tasks", D("50.00"))]),
    "elem": ("Standard Elementary", [("Written Works", D("30.00")), ("Performance Tasks", D("50.00")), ("Quarterly Assessment", D("20.00"))]),
    "jhs": ("Standard Junior High", [("Written Works", D("30.00")), ("Performance Tasks", D("50.00")), ("Quarterly Assessment", D("20.00"))]),
    "shs": ("Standard Senior High Core", [("Written Works", D("25.00")), ("Performance Tasks", D("50.00")), ("Quarterly Assessment", D("25.00"))]),
}
LEVEL_TEMPLATE = {"nursery": "kinder", "kindergarten": "kinder", "elementary": "elem",
                  "junior_highschool": "jhs", "senior_highschool": "shs"}
ITEMS = {
    "kinder": {
        "Written Works": [("Activity Sheet 1", 20), ("Activity Sheet 2", 20), ("Activity Sheet 3", 20)],
        "Performance Tasks": [("Performance Task 1", 30), ("Performance Task 2", 30)],
    },
    "quarter": {
        "Written Works": [("Written Work 1", 20), ("Written Work 2", 25), ("Written Work 3", 30), ("Written Work 4", 20)],
        "Performance Tasks": [("Performance Task 1", 50), ("Performance Task 2", 50), ("Performance Task 3", 40)],
        "Quarterly Assessment": [("Quarterly Assessment", 50)],
    },
    "semester": {
        "Written Works": [("Quiz 1", 20), ("Quiz 2", 25), ("Quiz 3", 20), ("Quiz 4", 30), ("Quiz 5", 25)],
        "Performance Tasks": [("Performance Task 1", 50), ("Performance Task 2", 50), ("Performance Task 3", 60)],
        "Quarterly Assessment": [("Midterm Examination", 50), ("Final Examination", 60)],
    },
}


def initial_grade(rows, components):
    """ScoreEntryViewSet.compute_grade: a component with nothing encoded is
    left out and the rest renormalised over the weight that is present."""
    weighted, encoded = D("0"), D("0")
    for name, weight in components:
        mine = [r for r in rows if r[0] == name]
        if not mine:
            continue
        total = sum((D(str(r[2])) for r in mine), D("0"))
        top = sum((D(str(r[3])) for r in mine), D("0"))
        weighted += ((total / top) * 100 * weight) / D("100")
        encoded += weight
    if encoded == 0:
        return None
    return q2(weighted * 100 / encoded)


def scores_for(target, template_key, item_key, r):
    """Raw scores whose DO 8 computation transmutes to exactly `target`."""
    components = TEMPLATES[template_key][1]
    items = ITEMS[item_key]
    lo = next(lower for lower, grade in TRANSMUTATION_TABLE if grade == target)
    higher = [lower for lower, grade in TRANSMUTATION_TABLE if grade == target + 1]
    hi = higher[0] if higher else D("100.01")
    for _ in range(50000):
        centre = r.uniform(float(lo), float(hi)) / 100
        rows = []
        for name, _w in components:
            for label, top in items[name]:
                pct = min(1.0, max(0.0, r.gauss(centre, 0.05)))
                rows.append((name, label, round(pct * top), top))
        if transmute(initial_grade(rows, components)) == target:
            return rows
    raise RuntimeError(f"could not reach {target}")


# ── Years ──
class Year:
    def __init__(self, label, c):
        self.label, self.c = label, c
        self.start, self.end = d(c["start"]), d(c["end"])
        self.quarters = {k: (d(a), d(b), t) for k, (a, b, t) in c["quarters"].items()}
        self.semesters = {k: (d(a), d(b)) for k, (a, b) in c["semesters"].items()}
        self.eb_cutoff = self.start + dt.timedelta(days=EARLY_BIRD_DAYS - 1)
        self.grad_last = d(c["graduation_last_day"])
        self.current = label == CURRENT_SY
        self.blocked = set()
        for a, b, *_ in c["holidays"] + c["days_off"] + c["breaks"]:
            cur = d(a)
            while cur <= d(b):
                self.blocked.add(cur)
                cur += dt.timedelta(days=1)

    def school_days(self, a, b):
        days, cur = [], a
        while cur <= b:
            if cur.weekday() < 5 and cur not in self.blocked:
                days.append(cur)
            cur += dt.timedelta(days=1)
        return days


YEARS = {label: Year(label, c) for label, c in CALENDARS.items()}
SUBJECTS = {sy: subject_catalogue(sy) for sy in YEARS}


def subjects_for(sy, grade, strand=None, semester=None):
    out = []
    for code, name, level, g, s, sem in SUBJECTS[sy]:
        if g != grade:
            continue
        if level == "senior_highschool" and (sem != semester or (s and s != strand)):
            continue
        out.append(code)
    return out


def adviser_emails(sy, grade, section):
    for _lvl, g, n, _s, advisers in SECTIONS[sy]:
        if g == grade and n == section:
            return [e for e, _c in advisers]
    raise KeyError((sy, grade, section))


# ── SQL helpers ──
def sql(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, Decimal)):
        return str(v)
    if isinstance(v, dt.datetime):
        return f"'{v:%Y-%m-%d %H:%M:%S}'"
    if isinstance(v, dt.date):
        return f"'{v.isoformat()}'"
    return "'" + str(v).replace("'", "''") + "'"


def values(rows, indent="  "):
    return ",\n".join(indent + "(" + ", ".join(sql(v) for v in r) + ")" for r in rows)


def at(day, hh=8, mm=0):
    return dt.datetime(day.year, day.month, day.day, hh, mm)


def ts(s):
    return dt.datetime.fromisoformat(s) if isinstance(s, str) else s


def age_on(birth, on):
    b = d(birth)
    return on.year - b.year - ((on.month, on.day) < (b.month, b.day))


def last_day(y, m):
    return dt.date(y, m, calendar.monthrange(y, m)[1])


def section(title, body):
    lines = "\n".join(f"-- {line}" if line else "--" for line in body.split("\n"))
    return f"\n-- =====================================================\n-- {title}\n{lines}\n-- =====================================================\n"


# ── Billing (mirrors billing-service billing/services.py) ──
def apply_pct(base, pct):
    return (base * pct / D("100")).quantize(D("0.01"))


def deduction_on(base, codes):
    total = D("0")
    for code in codes:
        _n, _desc, mode, value = SCHOLARSHIP_TYPES[code]
        total += apply_pct(base, value) if mode == "percentage" else value
    return min(total, base)


def spread(total, slots):
    n = len(slots)
    per = (total / D(n)).quantize(D("0.01"))
    adjust = total - per * n
    return [dict(seq=i, due=last_day(y, m), amount=per + adjust if i == n else per)
            for i, (y, m) in enumerate(slots, 1)]


def month_slots(start, count, step):
    slots, y, m = [], start.year, start.month
    for _ in range(count):
        slots.append((y, m))
        m += step
        while m > 12:
            m -= 12
            y += 1
    return slots


def build_invoice(inv_id, eid, sy, grade, plan, codes, invoice_date, generated_on, prorate_from=None, eb_on=None):
    y = YEARS[sy]
    fees = fee_items(sy, grade)
    assert fees is not None, (sy, grade, "no fee schedule")
    tuition = sum((D(a) for c, _n, a, _s in fees if c == "tuition"), D("0"))
    misc = sum((D(a) for c, _n, a, _s in fees if c == "misc"), D("0"))
    other = sum((D(a) for c, _n, a, _s in fees if c == "other"), D("0"))
    vouchers = [c for c in codes if c.startswith(("VOUCHER", "ESC", "QVR"))]
    awards = [c for c in codes if c not in vouchers]
    voucher_amt = deduction_on(tuition, vouchers)
    after_voucher = max(tuition - voucher_amt, D("0"))
    award_amt = deduction_on(after_voucher, awards)
    after_award = max(after_voucher - award_amt, D("0"))
    plan_amt = apply_pct(after_award, PLAN_PCT[plan])
    after_plan = max(after_award - plan_amt, D("0"))
    eb = (eb_on or invoice_date) <= y.eb_cutoff
    eb_amt = apply_pct(after_plan, D("5.00")) if eb else D("0")
    grand = max(after_plan - eb_amt, D("0")) + misc + other
    count, step = PLAN_SHAPE[plan]
    schedule = spread(grand, month_slots(y.start, count, step))
    if prorate_from:
        remaining = [s for s in schedule if s["due"] >= prorate_from] or [schedule[-1]]
        schedule = spread(grand, [(s["due"].year, s["due"].month) for s in remaining])
    label = {"tuition": "Tuition", "misc": "Miscellaneous", "other": "Other"}
    items = [(f"[{label[c]}] {n}", D(a).quantize(D("0.01"))) for c, n, a, s in sorted(fees, key=lambda f: (f[0], f[3]))]
    discounts = []
    if voucher_amt > 0:
        discounts.append((None, "Voucher — " + ", ".join(SCHOLARSHIP_TYPES[c][0] for c in vouchers), voucher_amt))
    if award_amt > 0:
        n = len(awards)
        discounts.append((None, f"Scholarship discount ({n} item{'s' if n != 1 else ''})", award_amt))
    if plan_amt > 0:
        code, name = PLAN_TYPE[plan]
        discounts.append((code, name, plan_amt))
    if eb_amt > 0:
        discounts.append(("EARLY_BIRD", f"Early Bird (invoiced on or before {y.eb_cutoff})", eb_amt))
    for s in schedule:
        s.update(paid=D("0"), status="pending")
    return dict(id=inv_id, eid=eid, sy=sy, no=f"INV-{generated_on.year}-{inv_id:06d}", date=invoice_date,
                plan=plan, grand=grand, items=items, discounts=discounts, schedule=schedule,
                payments=[], status="unpaid")


def apply_payments(inv, payments):
    """apply_payment(): fill live installments in due-date order. A P0.00
    installment has nothing outstanding and is skipped, so it stays pending."""
    for p in payments:
        left = p["amount"]
        for s in sorted(inv["schedule"], key=lambda x: (x["due"], x["seq"])):
            if s["status"] == "voided" or left <= 0:
                continue
            outstanding = s["amount"] - s["paid"]
            if outstanding <= 0:
                continue
            take = min(left, outstanding)
            s["paid"] += take
            s["status"] = "paid" if s["paid"] >= s["amount"] else "partially_paid"
            left -= take
        assert left == 0, (inv["no"], "overpayment", p)
        inv["payments"].append(p)
    live = [s for s in inv["schedule"] if s["status"] != "voided"]
    if inv["payments"]:
        total = sum((s["amount"] for s in live), D("0"))
        paid = sum((s["paid"] for s in live), D("0"))
        inv["status"] = "paid" if paid >= total else ("partially_paid" if paid > 0 else "unpaid")


def close_out(inv, eff):
    """close_out_invoice_for_transfer()."""
    waived = D("0")
    for s in inv["schedule"]:
        if s["due"] <= eff or s["status"] == "voided":
            continue
        outstanding = s["amount"] - s["paid"]
        if outstanding <= 0:
            continue
        waived += outstanding
        if s["paid"] > 0:
            s["amount"], s["status"] = s["paid"], "paid"
        else:
            s["status"] = "voided"
    if waived > 0:
        inv["discounts"].append((None, f"Transfer-out adjustment (effective {eff}) — remaining installments waived", waived))
    live = [s for s in inv["schedule"] if s["status"] != "voided"]
    total = sum((s["amount"] for s in live), D("0"))
    paid = sum((s["paid"] for s in live), D("0"))
    inv["status"] = "void" if total <= 0 else ("paid" if paid >= total else ("partially_paid" if paid > 0 else "unpaid"))


def flag_overdue(inv):
    """flag_overdue_installments, run on TODAY: skips void invoices."""
    if inv["status"] == "void":
        return
    for s in inv["schedule"]:
        if s["due"] < TODAY and s["status"] in ("pending", "partially_paid"):
            s["status"] = "overdue"


def payment_plan_for(E, inv, first, r):
    """(date, amount, note) per the learner's payment style, up to TODAY."""
    spec = E["pay"]
    style = spec["style"]
    sched = inv["schedule"]
    out = []
    if style == "none":
        return out
    # A fee schedule with no items (2026-2027 Grade 1) gives a P0.00 invoice and
    # P0.00 installments. student_payments has CHECK (amount_paid > 0), so a
    # zero-total invoice carries no payment rows at all.
    if inv["grand"] == 0:
        return out
    if style == "upfront":
        return [(first, inv["grand"], "Full payment upon enrollment (annual plan).")]
    if style == "custom":
        for when, amount, note in spec["list"]:
            if amount is None:
                amount = sched[0]["amount"]
            elif amount == "INST2":
                amount = sched[1]["amount"]
            out.append((d(when), D(amount), note))
        return [p for p in out if p[0] <= TODAY and p[1] > 0]
    for s in sched:
        seq, due, amount = s["seq"], s["due"], s["amount"]
        if seq == 1:
            note = "Downpayment upon enrollment (salary deduction authorised)." if style == "salary" else "Downpayment upon enrollment."
            out.append((first, amount, note))
            continue
        if style == "early":
            out.append((max(first, due - dt.timedelta(days=r.choice([1, 2, 3, 5, 7]))), amount, None))
        elif style == "late_some":
            if seq in spec["late"]:
                out.append((due + dt.timedelta(days=r.choice([6, 9, 11])), amount, "Paid after the due date."))
            else:
                out.append((max(first, due - dt.timedelta(days=r.choice([1, 2, 3, 5, 7]))), amount, None))
        elif style == "arrears":
            if due <= d(spec["through"]):
                late = r.choice([0, 3, 12, 20])
                out.append((max(first, due + dt.timedelta(days=late)), amount, "Paid late." if late > 5 else None))
            elif spec.get("partial") and due == d(spec["partial"][0]):
                _due, when, amt, note = spec["partial"]
                out.append((d(when), D(amt), note))
        elif style == "last_partial":
            if seq == len(sched):
                out.append((due - dt.timedelta(days=4), D(spec["amount"]), "Partial payment."))
            else:
                out.append((max(first, due - dt.timedelta(days=r.choice([1, 2, 3, 5, 7]))), amount, None))
        elif style == "salary":
            out.append((max(first, dt.date(due.year, due.month, 15)), amount, "Salary deduction (payroll)."))
        else:
            raise ValueError(style)
    return [p for p in out if p[0] <= TODAY and p[1] > 0]


def payment_rows(inv, plan_rows, E, r, counters):
    rows = []
    for when, amount, note in plan_rows:
        method = E["pay"]["method"]
        if E["pay"].get("switch") and when > d(E["pay"]["switch"][0]):
            method = E["pay"]["switch"][1]
        rows.append(dict(date=when, amount=amount, note=note, method=method,
                         created=at(when, 10, r.randrange(0, 59)), rng=r.random()))
    return rows


def reference_for(p, counters):
    method, when = p["method"], p["date"]
    r = random.Random(f"{SEED}|ref|{p['inv']}|{when}|{p['amount']}")
    if method == "cash":
        counters[when.year] = counters.get(when.year, 0) + 1
        return f"OR-{when.year}-{counters[when.year]:04d}"
    if method == "gcash":
        return f"GC-{r.randrange(10**9, 10**10)}"
    if method == "bank_transfer":
        return f"BT-{when:%y%m%d}-{r.randrange(1000, 9999)}"
    if method == "check":
        return f"CHK-{r.randrange(100000, 999999)} (BPI)"
    if method == "card":
        return f"CARD-XXXX{r.randrange(1000, 9999)}-{r.randrange(100000, 999999)}"
    return f"PAYROLL-{when:%Y-%m}-{r.randrange(100, 999)}"


# ── PDF placeholders ──
def pdf_bytes(lines):
    def esc(s):
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    body = ["BT", "/F1 18 Tf", "72 720 Td", f"({esc(lines[0])}) Tj", "/F1 11 Tf", "0 -30 Td", "16 TL"]
    body += [f"({esc(line)}) Tj T*" for line in lines[1:]]
    body += ["ET", "0.6 G", "54 54 504 684 re S"]
    content = "\n".join(body)
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        f"<< /Length {len(content.encode('latin-1'))} >>\nstream\n{content}\nendstream",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{obj}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


# ════════════════════════════════════════════════════════════════════════════
# BUILD
# ════════════════════════════════════════════════════════════════════════════
def lrn_of(p):
    return f"{LRN_BLOCK}{p['student_id']:0{LRN_WIDTH}d}"


def full_name(p):
    return " ".join(x for x in (p["first"], p["middle"], p["last"], p.get("suffix")) if x)


def build(hashes, media_dirs):
    out = []
    w = out.append
    by_key = {}
    for E in ENROLLMENTS:
        by_key.setdefault(E["key"], []).append(E)
    first_E = {k: min(v, key=lambda e: (d(e["enrolled_on"]), e["eids"][0])) for k, v in by_key.items()}
    approved_on = {a["student"]: ts(a["decided"]).date() for a in APPLICATIONS if a["status"] == "approved"}

    # ---------- student numbers: YYYY-NNNN by the calendar year the record was created ----------
    created_on = {}
    for p in PROFILES:
        E0 = first_E[p["key"]]
        created_on[p["key"]] = approved_on.get(p["key"], d(E0["transfer_in"][0]) if E0.get("transfer_in") else d(E0["enrolled_on"]))
    # PINNED_NUMBERS keeps the learners that are already loaded in a real
    # database on the exact student_number they were given, so adding more
    # learners never renumbers an existing record. Everyone else is numbered
    # by creation date as before, continuing after the highest pinned number
    # for their year.
    numbers, seq = {}, {}
    for key, num in PINNED_NUMBERS.items():
        yr_s, n_s = num.split("-")
        seq[int(yr_s)] = max(seq.get(int(yr_s), 0), int(n_s))
    for p in PROFILES:
        if p["key"] in PINNED_NUMBERS:
            numbers[p["key"]] = PINNED_NUMBERS[p["key"]]
    for p in sorted(PROFILES, key=lambda p: (created_on[p["key"]], p["student_id"])):
        if p["key"] in numbers:
            continue
        yr = created_on[p["key"]].year
        seq[yr] = seq.get(yr, 0) + 1
        numbers[p["key"]] = f"{yr}-{seq[yr]:04d}"
    dupes = [n for n in numbers.values() if list(numbers.values()).count(n) > 1]
    if dupes:
        raise ValueError(f"duplicate student numbers: {sorted(set(dupes))}")

    # ---------- enrollment rows ----------
    rows = []          # one per enrollments row
    for E in ENROLLMENTS:
        y = YEARS[E["sy"]]
        start = d(E["transfer_in"][0]) if E.get("transfer_in") else d(E["enrolled_on"])
        first_class = max(start, y.start)
        if E["status"] == "pending" or (E.get("cancelled") and not E.get("attended_until")):
            att_end, reason = None, "none"
        elif E.get("transfer_out"):
            att_end, reason = d(E["transfer_out"][0]), "transfer_out"
        elif E.get("dropped_on"):
            att_end, reason = d(E["dropped_on"]), "dropped"
        elif E.get("attended_until"):
            att_end, reason = d(E["attended_until"]), "cancelled"
        elif E.get("graduates"):
            att_end, reason = y.grad_last, "graduated"
        elif y.current:
            att_end, reason = TODAY, "today"
        else:
            att_end, reason = y.end, "year_end"
        if E["level"] == "senior_highschool":
            sems = [("1st", "1st_semester"), ("2nd", "2nd_semester")][:len(E["eids"])]
            for (sem, period), eid in zip(sems, E["eids"]):
                ps, pe = y.semesters[period]
                a_to = min(att_end, pe) if att_end else None
                rows.append(dict(E=E, id=eid, sem=sem, periods=[(period, ps, pe)], first_class=max(first_class, ps),
                                 att_to=a_to, reason=reason, status=E["status"]))
        else:
            rows.append(dict(E=E, id=E["eids"][0], sem=None,
                             periods=[(k, a, b) for k, (a, b, _t) in y.quarters.items()],
                             first_class=first_class, att_to=att_end, reason=reason, status=E["status"]))
    for r_ in rows:
        if r_["att_to"] is not None and r_["att_to"] < r_["first_class"]:
            r_["att_to"] = None
    stats = dict(enrollments=len(rows))

    # ---------- scores, grades, observed values ----------
    score_rows, grade_rows, narrative_rows = [], [], []
    for row in rows:
        E, y = row["E"], YEARS[row["E"]["sy"]]
        if row["att_to"] is None:
            continue
        r = rng(E["key"], E["sy"], row["id"], "grades")
        tkey = LEVEL_TEMPLATE[E["level"]]
        components = TEMPLATES[tkey][1]
        if E["level"] == "senior_highschool":
            subjects = subjects_for(E["sy"], E["grade"], E["strand"], row["sem"])
            item_key = "semester"
            all_periods = ["1st_semester", "2nd_semester"]
        else:
            subjects = subjects_for(E["sy"], E["grade"])
            item_key = "kinder" if tkey == "kinder" else "quarter"
            all_periods = list(y.quarters)
        affinity = {code: r.gauss(0, 2.2) for code in subjects}
        for period, ps, pe in row["periods"]:
            if y.current and ps > TODAY:
                continue
            window_start = max(ps, row["first_class"])
            plan_end = min(pe, y.grad_last) if row["reason"] == "graduated" else pe
            cut = plan_end
            if row["reason"] in ("transfer_out", "dropped", "cancelled"):
                cut = min(cut, row["att_to"])
            if y.current:
                cut = min(cut, TODAY)
            if window_start > cut or len(y.school_days(window_start, cut)) < 10:
                continue
            if y.current and row["reason"] == "today" and pe >= TODAY:
                state = "in_progress"
            elif row["reason"] == "dropped" and cut < plan_end:
                state = "dropped"
            elif row["reason"] in ("transfer_out", "cancelled") and cut < plan_end:
                state = "partial"
            else:
                state = "complete"
            pdays = y.school_days(window_start, plan_end)
            qi = all_periods.index(period)
            for code in subjects:
                target = round(E["ability"] + affinity[code] + r.gauss(0, 1.3) + 0.4 * qi)
                target = max(E["floor"], min(98, target))
                target = E["overrides"].get(code, {}).get(period, target)
                items = scores_for(target, tkey, item_key, r)
                step = max(1, len(pdays) // (len(items) + 1))
                kept = []
                for i, (comp, label, score, top) in enumerate(items):
                    day = pdays[-1] if comp == "Quarterly Assessment" else pdays[min(len(pdays) - 1, (i + 1) * step)]
                    if (code, period) in E["incomplete"] and comp == "Quarterly Assessment":
                        continue
                    if day > cut:
                        continue
                    kept.append((comp, label, score, top))
                    score_rows.append((row["id"], code, comp, period, label, D(score).quantize(D("0.01")),
                                       D(top).quantize(D("0.01")), at(day, 15, 30)))
                if state == "complete" and (code, period) not in E["missing"]:
                    if (code, period) in E["incomplete"]:
                        g, remark = transmute(initial_grade(kept, components)), "incomplete"
                    else:
                        g, remark = target, ("passed" if target >= 75 else "failed")
                    grade_rows.append((row["id"], code, period, D(g).quantize(D("0.01")), remark, at(plan_end, 16, 0)))
                elif state == "dropped" and kept:
                    g = transmute(initial_grade(kept, components))
                    grade_rows.append((row["id"], code, period, D(g).quantize(D("0.01")), "dropped", at(cut, 16, 0)))
            if state == "complete":
                for cat in (900, 901, 902, 903):
                    roll = E["ability"] + r.gauss(0, 3)
                    mark = "AO" if roll >= 90 else "SO" if roll >= 80 else "RO" if roll >= 74 else "NO"
                    narrative_rows.append((row["id"], cat, period, mark, at(plan_end, 16, 30)))

    # ---------- attendance ----------
    att_ranges, att_skips, att_exceptions = [], [], []
    expected_att = 0
    remarks = {
        "A": ["Fever", "Cough and colds", "Stomach ache", "Family emergency", "No reason given", "Flooded street after heavy rain"],
        "E": ["Excused: medical appointment", "Excused: dental check-up", "Excused: family event (letter from parent)",
              "Excused: represented the school in a contest"],
        "L": ["Traffic", "Late jeepney", "Overslept", "Heavy rain"],
    }
    for key, Es in by_key.items():
        for E in Es:
            y = YEARS[E["sy"]]
            mine = [row for row in rows if row["E"] is E and row["att_to"] is not None]
            if not mine:
                continue
            days = []
            for row in mine:
                a, b = row["first_class"], row["att_to"]
                if E.get("recorder_segments"):
                    segs = [(max(a, d(s)), min(b, d(e) if e else b), who) for s, e, who in E["recorder_segments"]]
                elif E.get("recorder"):
                    segs = [(a, b, E["recorder"])]
                elif E.get("internal_move"):
                    moved = d(E["internal_move"][0])
                    segs = [(a, moved - dt.timedelta(days=1), adviser_emails(E["sy"], E["grade"], E["internal_move"][1])[0]),
                            (moved, b, adviser_emails(E["sy"], E["grade"], E["section"])[0])]
                else:
                    segs = [(a, b, adviser_emails(E["sy"], E["grade"], E["section"])[0])]
                skips = {TODAY} if E.get("today") == "skip" and a <= TODAY <= b else set()
                for s, e, who in segs:
                    if s > e:
                        continue
                    att_ranges.append((row["id"], s, e, who))
                    for day in y.school_days(s, e):
                        if day in skips:
                            continue
                        days.append((row["id"], day))
                for day in sorted(skips):
                    att_skips.append((row["id"], day))
            expected_att += len(days)
            r = rng(key, E["sy"], "attendance")
            n_abs, n_exc, n_late = E["absences"]
            pool = [x for x in days if x[1] != TODAY]
            picks = []
            if E.get("dropped_on"):
                tail = pool[-25:]
                heavy = min(len(tail), int(n_abs * 0.7))
                picks = [(x, "A") for x in r.sample(tail, heavy)]
                rest = [x for x in pool if x not in {p[0] for p in picks}]
                statuses = ["A"] * (n_abs - heavy) + ["E"] * n_exc + ["L"] * n_late
                picks += list(zip(r.sample(rest, len(statuses)), statuses))
            else:
                statuses = ["A"] * n_abs + ["E"] * n_exc + ["L"] * n_late
                assert len(statuses) <= len(pool), (key, E["sy"], "more absences than school days")
                r.shuffle(statuses)
                picks = list(zip(r.sample(pool, len(statuses)), statuses))
            if E.get("today") in ("A", "E", "L"):
                today_row = next(x for x in days if x[1] == TODAY)
                picks.append((today_row, E["today"]))
            for (eid, day), status in picks:
                att_exceptions.append((eid, day, status, r.choice(remarks[status])))
    att_exceptions.sort(key=lambda x: (x[0], x[1]))
    att_ranges.sort(key=lambda x: (x[0], x[1]))

    # ---------- billing ----------
    invoices = []
    counters = {}
    for E in ENROLLMENTS:
        if E.get("inv") is None:
            continue
        y = YEARS[E["sy"]]
        r = rng(E["key"], E["sy"], "billing")
        eid = E["eids"][0]           # Senior High: billed once, on the 1st-semester row
        codes = [c for c, _a, _n in E["scholarships"]]
        inv_date = d(E["transfer_in"][0]) if E.get("transfer_in") else d(E["enrolled_on"])
        prorate = d(E["transfer_in"][0]) if E.get("transfer_in") else None
        rs = E.get("reissue")
        inv = build_invoice(E["inv"], eid, E["sy"], E["grade"], E["plan"], codes, inv_date, inv_date, prorate)
        if rs:
            # The original: downpayment only, then void at the re-issue.
            down = [(inv_date, inv["schedule"][0]["amount"], "Downpayment upon enrollment.")]
            prows = payment_rows(inv, down, E, r, counters)
            for p in prows:
                p["inv"] = inv["id"]
            apply_payments(inv, prows)
            inv["status"] = "void"
            new = build_invoice(rs["inv"], eid, E["sy"], E["grade"], rs["plan"], codes, inv_date, d(rs["on"]),
                                prorate, eb_on=inv_date)
            moved = []
            for p in inv["payments"]:
                note = f"Moved from {inv['no']} when it was re-issued as {new['no']}."
                moved.append(dict(p, note=f"{p['note']} · {note}" if p["note"] else note, inv=new["id"]))
            inv["payments"] = []
            apply_payments(new, moved)
            first_left = new["schedule"][0]["amount"] - new["schedule"][0]["paid"]
            later = [(d(rs["on"]), first_left, "Balance of the first quarterly installment.")]
            for s in new["schedule"][1:]:
                later.append((max(d(rs["on"]), s["due"] - dt.timedelta(days=r.choice([1, 2, 3, 5, 7]))), s["amount"], None))
            prows = payment_rows(new, [p for p in later if p[0] <= TODAY], E, r, counters)
            for p in prows:
                p["inv"] = new["id"]
            apply_payments(new, prows)
            flag_overdue(new)
            invoices += [inv, new]
            E["_invoice"] = new
            continue
        plan_rows = payment_plan_for(E, inv, inv_date, r)
        stop = d(E["transfer_out"][0]) if E.get("transfer_out") else d(E["dropped_on"]) if E.get("dropped_on") else None
        if stop:   # nobody pays after they've left
            plan_rows = [p for p in plan_rows if p[0] <= stop]
        prows = payment_rows(inv, plan_rows, E, r, counters)
        for p in prows:
            p["inv"] = inv["id"]
        if E.get("void_on"):
            assert not prows
            inv["status"] = "void"
        else:
            apply_payments(inv, prows)
            if E.get("transfer_out"):
                close_out(inv, d(E["transfer_out"][0]))
            flag_overdue(inv)
        invoices.append(inv)
        E["_invoice"] = inv
    # OR numbers in date order across all cash payments.
    all_payments = sorted((p for inv in invoices for p in inv["payments"]), key=lambda p: (p["date"], p["inv"], p["created"]))
    for p in all_payments:
        p["ref"] = reference_for(p, counters)

    # ---------- requirement documents ----------
    submissions, doc_files = [], []
    for p in PROFILES:
        E0 = first_E[p["key"]]
        level = E0["level"]
        entry = E0["entry"]
        needed = list(REQUIRED_ALL)
        if entry == "transferee" and level in ("elementary", "junior_highschool", "senior_highschool"):
            needed += REQUIRED_TRANSFEREE
        codes = [c for c in needed if c not in p["doc_missing"]] + p["docs"]
        r = rng(p["key"], "docs")
        base = created_on[p["key"]] if p["key"] in approved_on else d(E0["transfer_in"][0]) if E0.get("transfer_in") else d(E0["enrolled_on"])
        submitted = base - dt.timedelta(days=r.choice([1, 2, 3, 5]))
        for code in codes:
            o = p["doc_overrides"].get(code, {})
            verified = min(TODAY, submitted + dt.timedelta(days=r.choice([0, 1, 2])))
            if o.get("submitted") is False:
                submissions.append((p["student_id"], code, False, None, o.get("remark"), None, None,
                                    at(submitted, 9, 15), at(submitted, 9, 15)))
                continue
            url = None
            if o.get("image", True):
                fname = f"seed_{lrn_of(p)}_{code}.pdf"
                url = f"requirements/{fname}"
                doc_files.append((fname, pdf_bytes([
                    DOC_NAMES[code], "SAMPLE DOCUMENT - DEMO DATA ONLY", "",
                    f"Learner: {full_name(p)}", f"LRN: {lrn_of(p)}",
                    "Submitted to: South Lakes Integrated School",
                    f"Date received: {submitted:%B %d, %Y}", "",
                    "This placeholder stands in for the scanned document.",
                ])))
            remark = o.get("remark") or ("Original presented; photocopy on file." if code in REQUIRED_ALL else None)
            ver = None if o.get("verified") is False else at(verified, 14, 0)
            submissions.append((p["student_id"], code, True, url, remark, at(submitted, 9, 15), ver,
                                at(submitted, 9, 15), ver or at(submitted, 9, 15)))
    for folder in media_dirs:
        target = Path(folder) / "requirements"
        target.mkdir(parents=True, exist_ok=True)
        for fname, blob in doc_files:
            (target / fname).write_bytes(blob)

    # ================= emit SQL =================
    seed_ids = sorted(p["student_id"] for p in PROFILES)
    w(HEADER)
    w("BEGIN;\n")

    invite_uuid = {i["key"]: str(uuid.uuid5(uuid.NAMESPACE_URL, f"https://slis.test/seed/invite/{i['key']}")) for i in INVITES}
    app_ids = [a["id"] for a in APPLICATIONS]
    w(section("0. CLEAR THIS SEED'S OWN ROWS",
        "Everything downstream of a learner in the seed's LRN block goes first, child\n"
        "tables before parents. Invoices, attendance and transfers do not cascade\n"
        "from an enrollment (RESTRICT / NO ACTION, correctly), so they are removed\n"
        "explicitly. The seed's own applications and invites (fixed ids) go too;\n"
        "applications first, because the database does not cascade that FK.\n"
        "Rows for any other learner are never touched. Shared set-up (years,\n"
        "subjects, sections, calendar, fees, accounts) is insert-if-missing below."))
    w(f"""CREATE TEMP TABLE seed_learner_ids ON COMMIT DROP AS
  SELECT student_id FROM students WHERE lrn LIKE '{LRN_LIKE}';
CREATE TEMP TABLE seed_enrollment_ids ON COMMIT DROP AS
  SELECT enrollment_id FROM enrollments WHERE student_id IN (SELECT student_id FROM seed_learner_ids);

DELETE FROM student_applications WHERE student_application_id IN ({", ".join(str(x) for x in app_ids)});
DELETE FROM application_invites  WHERE invite_id IN ({", ".join(sql(u) + "::uuid" for u in invite_uuid.values())});
DELETE FROM student_invoices     WHERE enrollment_id IN (SELECT enrollment_id FROM seed_enrollment_ids);
DELETE FROM attendance_records   WHERE enrollment_id IN (SELECT enrollment_id FROM seed_enrollment_ids);
DELETE FROM enrollment_transfers WHERE enrollment_id IN (SELECT enrollment_id FROM seed_enrollment_ids);
DELETE FROM student_risk_scores  WHERE student_id    IN (SELECT student_id FROM seed_learner_ids);
DELETE FROM document_extractions WHERE student_id    IN (SELECT student_id FROM seed_learner_ids);
DELETE FROM enrollments          WHERE enrollment_id IN (SELECT enrollment_id FROM seed_enrollment_ids);
DELETE FROM students             WHERE student_id    IN (SELECT student_id FROM seed_learner_ids);
DELETE FROM households h
 WHERE h.household_id IN ({", ".join(str(x) for x in sorted(HOUSEHOLDS))})
   AND NOT EXISTS (SELECT 1 FROM students s WHERE s.household_id = h.household_id);
""")

    w(section("1. REFERENCE DATA",
        "Requirement catalogue, DepEd grading templates and the four core values.\n"
        "Must come before subjects, scores and observed values, which use them."))
    w("\\ir scripts/reference_data.sql\n")

    w(section("2. SCHOOL YEARS",
        f"{SY1} is finished (every attended enrollment completed). {SY2} is the\n"
        "current year, filled up to the day the file was generated. It becomes the\n"
        "current year only when no year is current yet."))
    w(f"""INSERT INTO school_years (label, start_date, end_date, is_current, created_at, updated_at)
VALUES ('{SY1}', '{YEARS[SY1].start}', '{YEARS[SY1].end}', FALSE, now(), now())
ON CONFLICT (label) DO NOTHING;

INSERT INTO school_years (label, start_date, end_date, is_current, created_at, updated_at)
SELECT '{SY2}', '{YEARS[SY2].start}', '{YEARS[SY2].end}',
       NOT EXISTS (SELECT 1 FROM school_years WHERE is_current), now(), now()
ON CONFLICT (label) DO NOTHING;

-- School Settings mirrors the registry's current year (the API keeps these
-- read-only for that reason); the letterhead fields are the demo school's.
UPDATE school_settings s
   SET current_school_year = y.label,
       sy_start_date       = y.start_date,
       sy_end_date         = y.end_date,
       early_bird_days     = {EARLY_BIRD_DAYS},
       school_name         = 'South Lakes Integrated School',
       school_address      = '12 Lakeview Road, Brgy. San Isidro, Marikina City, Metro Manila 1800',
       contact_email       = 'registrar@slis.test',
       contact_phone       = '(02) 8123-4567',
       updated_at          = now()
  FROM school_years y
 WHERE y.is_current;
""")

    w(section("3. SUBJECTS, PER YEAR",
        "Each year has its own curriculum. 2026-2027 uses the MATATAG names: no\n"
        "Mother Tongue in Grades 1-3, GMRC instead of EsP in Grades 1-6, Values\n"
        "Education in Grades 7-10, and Grade 10 MAPEH renamed under the same code."))
    tmpl_by_level = {lvl: TEMPLATES[k][0] for lvl, k in LEVEL_TEMPLATE.items()}
    for sy in YEARS:
        subj_rows = [(code, name, lvl, grade, strand, sem, tmpl_by_level[lvl]) for code, name, lvl, grade, strand, sem in SUBJECTS[sy]]
        w(f"-- S.Y. {sy}: {len(subj_rows)} subjects\n"
          "INSERT INTO subjects (school_year, subject_code, subject_name, school_level, grade_level, strand, semester, grading_template_id)\n"
          f"SELECT '{sy}', v.code, v.name, v.lvl, v.grade, v.strand, v.sem, t.grading_template_id\n  FROM (VALUES\n"
          + values(subj_rows, "    ") +
          "\n  ) AS v(code, name, lvl, grade, strand, sem, template)\n"
          "  JOIN grading_templates t ON t.template_name = v.template\nON CONFLICT (school_year, subject_code) DO NOTHING;\n")

    w(section("4. DISCOUNT AND SCHOLARSHIP TYPES", "Insert-if-missing; the invoices below were computed with these rates.\n"
        "QVR (the Senior High voucher) is new in Tier 2."))
    w("INSERT INTO discount_types (discount_code, discount_name, discount_mode, discount_value) VALUES\n"
      + values([(a, b, c, D(v)) for a, b, c, v in DISCOUNT_TYPES]) + "\nON CONFLICT (discount_code) DO NOTHING;\n")
    w("INSERT INTO scholarship_types (scholarship_code, scholarship_name, description, discount_mode, discount_value, is_active) VALUES\n"
      + values([(c, n, desc, m, v, True) for c, (n, desc, m, v) in SCHOLARSHIP_TYPES.items()])
      + "\nON CONFLICT (scholarship_code) DO NOTHING;\n")

    w(section("5. FEE SCHEDULES",
        f"{SY1}: all fourteen grades. {SY2}: the schedules the live database already\n"
        "has are left exactly as they are; the seed only adds the ones missing,\n"
        "and items only on schedules it created itself. Grade 9 stays without a\n"
        "schedule and Grade 1's stays without items, as in the live data."))
    for sy in YEARS:
        sched, fee_rows = [], []
        for lvl, grade in LADDER:
            items = fee_items(sy, grade)
            if items is None:
                continue
            sched.append((lvl, grade))
            for cat, name, amount, sort in items:
                fee_rows.append((lvl, grade, cat, name, D(amount).quantize(D("0.01")), sort))
        w(f"""INSERT INTO fee_schedules (school_year, school_level, grade_level, is_active, notes, updated_at)
SELECT '{sy}', v.lvl, v.grade, TRUE, {sql(FEE_NOTES[sy])}, now()
  FROM (VALUES
{values(sched, "    ")}
  ) AS v(lvl, grade)
ON CONFLICT (school_year, school_level, grade_level) DO NOTHING;

INSERT INTO fee_schedule_items (fee_schedule_id, item_category, item_name, amount, sort_order)
SELECT fs.fee_schedule_id, v.cat, v.name, v.amount, v.sort
  FROM (VALUES
{values(fee_rows, "    ")}
  ) AS v(lvl, grade, cat, name, amount, sort)
  JOIN fee_schedules fs ON fs.school_year = '{sy}' AND fs.school_level = v.lvl AND fs.grade_level = v.grade
 WHERE fs.notes = {sql(FEE_NOTES[sy])}
   AND NOT EXISTS (SELECT 1 FROM fee_schedule_items i WHERE i.fee_schedule_id = fs.fee_schedule_id);
""")

    w(section("6. ACCOUNTS",
        f"Staff and the demo guardian logins: password {PASSWORD}. Matched by email:\n"
        "created if absent; name, role, password AND is_active reset if present, so\n"
        "a re-run restores the two resigned teachers' inactive state (and\n"
        "re-activates anyone deactivated while testing). Guardian accounts for the\n"
        "other parents are created further down, the way provisioning makes them."))
    w("SELECT setval('users_user_id_seq', GREATEST((SELECT MAX(user_id) FROM users), 1));\n")
    acct = [(n, e, r_, hashes[e], a) for n, e, r_, a in STAFF] + [(n, e, "guardian", hashes[e], True) for n, e in DEMO_GUARDIANS]
    w("INSERT INTO users (name, email, role, password, is_active) VALUES\n" + values(acct)
      + "\nON CONFLICT (email) DO UPDATE\n  SET name = EXCLUDED.name, role = EXCLUDED.role, password = EXCLUDED.password,\n"
        "      is_active = EXCLUDED.is_active;\n")
    w("SELECT setval('users_user_id_seq', GREATEST((SELECT MAX(user_id) FROM users), 1));\n")

    w(section("7. ACADEMIC CALENDARS",
        "Holidays, days off, three quarter breaks (the at-risk model reads quarter\n"
        "windows from them), four grading periods (the admin home reads the current\n"
        "quarter and its due date from them), exams and school events, per year."))
    for sy, y in YEARS.items():
        c = y.c
        cal = []
        for s, e_, t in c["holidays"]:
            cal.append(("holiday", t, d(s), d(e_), None, None))
        for s, e_, t, desc in c["days_off"]:
            cal.append(("school_day_off", t, d(s), d(e_), desc, None))
        for s, e_, t in c["breaks"]:
            cal.append(("quarter_break", t, d(s), d(e_), None, None))
        for key, (s, e_, t) in c["quarters"].items():
            cal.append(("grading_period", t, d(s), d(e_), f"{t} grades are due on the last day.", key))
        for s, e_, t in c["exams"]:
            cal.append(("exam", t, d(s), d(e_), None, None))
        for typ, s, e_, t, desc in c["events"]:
            cal.append((typ, t, d(s), d(e_), desc, None))
        cal.sort(key=lambda r_: (r_[2], r_[1]))
        stats[f"events_{sy}"] = len(cal)
        w(f"""-- S.Y. {sy}: {len(cal)} events
INSERT INTO academic_calendar_events (school_year, title, event_type, start_date, end_date, description, grading_period, created_at, updated_at)
SELECT '{sy}', v.title, v.typ, v.s::date, v.e::date, v.descr, v.gp, v.cat::timestamptz, v.cat::timestamptz
  FROM (VALUES
{values([(t, typ, s, e_, desc, gp, dt.datetime(y.start.year, 4, 15, 9, 0)) for typ, t, s, e_, desc, gp in cal], "    ")}
  ) AS v(title, typ, s, e, descr, gp, cat)
 WHERE NOT EXISTS (
         SELECT 1 FROM academic_calendar_events x
          WHERE x.school_year = '{sy}' AND x.event_type = v.typ AND lower(x.title) = lower(v.title))
   AND (v.gp IS NULL OR NOT EXISTS (
         SELECT 1 FROM academic_calendar_events x
          WHERE x.school_year = '{sy}' AND x.grading_period = v.gp));
""")

    w(section("8. SECTIONS AND ADVISERS",
        "2025-2026 adds Grade 7 Pearl to Tier 1's sixteen. 2026-2027 renames Grade 3\n"
        "Mabini to Del Pilar, leaves Grade 9 Sapphire without an adviser, keeps the\n"
        "resigned Arnel Pascual on Grade 4 Luna with Carla Bernardo as co-adviser,\n"
        "adds a co-adviser to Grade 11 STEM-A, and gives Rafael Guevarra two sections."))
    for sy in YEARS:
        created = ts(SECTION_CREATED[sy])
        w(f"-- S.Y. {sy}\nINSERT INTO sections (school_year, school_level, grade_level, name, strand, created_at, updated_at) VALUES\n"
          + values([(sy, lvl, g, n, s, created, created) for lvl, g, n, s, _a in SECTIONS[sy]])
          + "\nON CONFLICT (school_year, grade_level, name) DO NOTHING;\n")
        adv = [(lvl, g, n, s, email, ts(when)) for lvl, g, n, s, advisers in SECTIONS[sy] for email, when in advisers]
        w(f"""INSERT INTO section_advisories (teacher_user_id, school_year, school_level, grade_level, section, strand, created_at)
SELECT u.user_id, '{sy}', v.lvl, v.grade, v.name, v.strand, v.cat::timestamptz
  FROM (VALUES
{values(adv, "    ")}
  ) AS v(lvl, grade, name, strand, email, cat)
  JOIN users u ON u.email = v.email
ON CONFLICT DO NOTHING;
""")

    w(section("9. HOUSEHOLDS AND LEARNERS",
        "31 learners. Siblings share a household (Maria + Paolo; Ryan, Rica + Renz).\n"
        "Carlos has no household at all. Student numbers follow the calendar year\n"
        "each record was created in, as the app numbers them."))
    w("INSERT INTO households (household_id, parent_marital_status, living_arrangement, is_4ps_beneficiary, four_ps_id)\nOVERRIDING SYSTEM VALUE VALUES\n"
      + values([(hid, *vals) for hid, vals in sorted(HOUSEHOLDS.items())]) + ";\n")
    stu = []
    for p in sorted(PROFILES, key=lambda x: x["student_id"]):
        stu.append((p["student_id"], numbers[p["key"]], lrn_of(p), p["first"], p["middle"], p["last"], p["suffix"],
                    age_on(p["birth"], TODAY), p["sex"], p["religion"], d(p["birth"]), p["email"], p["mobile"],
                    p["status"], p["current"], p["permanent"] or p["current"], p["household_id"]))
    w("INSERT INTO students (student_id, student_number, lrn, first_name, middle_name, last_name, suffix,\n"
      "  age, sex, religion, birth_date, email, mobile_number, status, current_address, permanent_address, household_id)\n"
      "OVERRIDING SYSTEM VALUE VALUES\n" + values(stu) + ";\n")
    g_rows, s_rows, p_rows = [], [], []
    for p in sorted(PROFILES, key=lambda x: x["student_id"]):
        for rel, name, occ, email, mobile, primary in p["guardians"]:
            g_rows.append((p["student_id"], rel, name, occ, email, mobile, primary))
        for name, age in p["siblings"]:
            s_rows.append((p["student_id"], name, age))
        for name, addr in p["previous"]:
            p_rows.append((p["student_id"], name, addr))
    w("INSERT INTO guardians (student_id, relationship, full_name, occupation, email_address, mobile_number, is_primary_contact) VALUES\n"
      + values(g_rows) + ";\n")
    w("INSERT INTO siblings (student_id, full_name, age) VALUES\n" + values(s_rows) + ";\n")
    w("INSERT INTO previous_schools (student_id, school_name, school_address) VALUES\n" + values(p_rows) + ";\n")

    # Guardian portal accounts, the way accounts/guardian_provisioning.py makes them.
    demo = {e for _n, e in DEMO_GUARDIANS}
    staff_emails = {e for _n, e, _r, _a in STAFF}
    prov = {}
    for p in sorted(PROFILES, key=lambda x: x["student_id"]):
        for _rel, name, _occ, email, _m, _pr in p["guardians"]:
            if email and email not in demo and email not in staff_emails and email not in prov:
                prov[email] = name
    unusable = [(name, email, "guardian", "!" + hashlib.sha256(f"slis-seed-unusable|{email}".encode()).hexdigest()[:40], True)
                for email, name in sorted(prov.items())]
    stats["guardian_accounts"] = len(unusable) + len(DEMO_GUARDIANS)
    w("-- Guardian portal accounts. Enrolling a learner runs\n"
      "-- accounts/guardian_provisioning.py: every guardian row with an email is\n"
      "-- linked to an account with that email, created if missing with an\n"
      "-- UNUSABLE password (nobody can sign in until an admin sets one). A row\n"
      "-- whose email belongs to a staff account is skipped (Bea's father).\n"
      "-- Rows without an email are linked by exact name inside the household.\n"
      "INSERT INTO users (name, email, role, password, is_active) VALUES\n" + values(unusable)
      + "\nON CONFLICT (email) DO NOTHING;\n")
    w("SELECT setval('users_user_id_seq', GREATEST((SELECT MAX(user_id) FROM users), 1));\n")
    w("UPDATE guardians g SET user_id = u.user_id\n  FROM users u\n"
      " WHERE lower(u.email) = lower(g.email_address) AND u.role = 'guardian'\n"
      f"   AND g.student_id IN ({', '.join(str(x) for x in seed_ids)});\n")
    w("UPDATE guardians g SET user_id = src.user_id\n"
      "  FROM guardians src\n"
      "  JOIN students ss ON ss.student_id = src.student_id,\n"
      "       students s\n"
      " WHERE s.student_id = g.student_id\n"
      "   AND s.household_id IS NOT NULL AND ss.household_id = s.household_id\n"
      "   AND src.student_id <> g.student_id AND src.user_id IS NOT NULL\n"
      "   AND g.user_id IS NULL AND g.email_address IS NULL\n"
      "   AND lower(regexp_replace(src.full_name, '\\s+', ' ', 'g')) = lower(regexp_replace(g.full_name, '\\s+', ' ', 'g'))\n"
      f"   AND g.student_id IN ({', '.join(str(x) for x in seed_ids)});\n")

    w(section("10. REQUIREMENT SUBMISSIONS",
        "Every required document for each learner's entry status at first\n"
        "enrollment, plus optional ones. Deliberate gaps: Daniel never handed in\n"
        "Form 137 (his enrollment stayed pending, then was cancelled); Patricia is\n"
        "missing Form 137 and her Good Moral is logged but not submitted (pending);\n"
        "Christian's transferee documents are not verified yet; Jeremiah's Form 137\n"
        "was presented in the original and has no scan. Files are placeholder PDFs\n"
        "under each service's media/requirements/ (gitignored)."))
    stats["docs"] = len(submissions)
    stats["doc_files"] = len(doc_files)
    w("INSERT INTO student_requirement_submissions (student_id, requirement_type_id, is_submitted, image_url, remarks,\n"
      "  submitted_at, verified_at, created_at, updated_at)\n"
      "SELECT v.sid, rt.requirement_type_id, v.sub, v.url, v.rem, v.sat::timestamp, v.vat::timestamp, v.cat::timestamp, v.uat::timestamp\n"
      "  FROM (VALUES\n" + values(submissions, "    ") +
      "\n  ) AS v(sid, code, sub, url, rem, sat, vat, cat, uat)\n"
      "  JOIN requirement_types rt ON rt.requirement_code = v.code;\n"
      "DO $$\nBEGIN\n  IF (SELECT count(*) FROM student_requirement_submissions WHERE student_id IN ("
      + ", ".join(str(x) for x in seed_ids) + f")) <> {len(submissions)} THEN\n"
      "    RAISE EXCEPTION 'a requirement code did not resolve';\n  END IF;\nEND $$;\n")

    w(section("11. ENROLLMENTS, TRANSFERS, OVERRIDES, SCHOLARSHIPS",
        "2025-2026 rows are completed, except Dominic (transferred_out), Mark\n"
        "(cancelled: dropped out in January) and Daniel (cancelled before classes).\n"
        "2026-2027 rows are enrolled, except Patricia (pending), Abigail\n"
        "(transferred_out) and Erica's first row (cancelled, re-enrolled the same\n"
        "day). Senior High has one row per semester."))
    enr = []
    for row in rows:
        E = row["E"]
        status = row["status"]
        enr.append((row["id"], PROFILE[E["key"]]["student_id"], E["sy"], E["level"], E["grade"], E["section"],
                    E["strand"], row["sem"], status))
    w("INSERT INTO enrollments (enrollment_id, student_id, school_year, school_level, grade_level, section, strand, semester, enrollment_status)\n"
      "OVERRIDING SYSTEM VALUE VALUES\n" + values(enr) + ";\n")
    tr = []
    for E in ENROLLMENTS:
        eid = E["eids"][0]
        if E.get("transfer_in"):
            eff, reason, origin = E["transfer_in"]
            tr.append((eid, "transfer_in", d(eff), reason, None, None, None, E["grade"], E["section"], E["strand"],
                       None, origin, REGISTRAR, at(d(eff), 9, 30)))
        if E.get("transfer_out"):
            eff, reason, dest, by = E["transfer_out"]
            tr.append((eid, "transfer_out", d(eff), reason, E["grade"], E["section"], E["strand"], None, None, None,
                       dest, None, by, at(d(eff), 15, 10)))
        if E.get("internal_move"):
            eff, from_section, reason, by = E["internal_move"]
            tr.append((eid, "internal_move", d(eff), reason, E["grade"], from_section, E["strand"], E["grade"],
                       E["section"], E["strand"], None, None, by, at(d(eff), 8, 15)))
    stats["transfers"] = len(tr)
    w("INSERT INTO enrollment_transfers (enrollment_id, transfer_type, effective_date, reason, from_grade_level, from_section,\n"
      "  from_strand, to_grade_level, to_section, to_strand, destination_school_name, origin_school_name, initiated_by, created_at)\n"
      "SELECT v.eid, v.typ, v.eff::date, v.reason, v.fg, v.fs, v.fst, v.tg, v.ts, v.tst, v.dest, v.origin, u.user_id, v.cat::timestamptz\n"
      "  FROM (VALUES\n" + values(tr, "    ") +
      "\n  ) AS v(eid, typ, eff, reason, fg, fs, fst, tg, ts, tst, dest, origin, email, cat)\n"
      "  JOIN users u ON u.email = v.email;\n")
    ov = [(E["eids"][0], E["override"][0], E["override"][1], ts(E["override"][2])) for E in ENROLLMENTS if E.get("override")]
    w("INSERT INTO enrollment_overrides (enrollment_id, override_reason, overridden_by, overridden_at)\n"
      "SELECT v.eid, v.reason, u.user_id, v.at::timestamptz\n  FROM (VALUES\n" + values(ov, "    ") +
      "\n  ) AS v(eid, reason, email, at)\n  JOIN users u ON u.email = v.email;\n")
    sch = []
    for E in ENROLLMENTS:
        for code, approved, notes in E["scholarships"]:
            sch.append((E["eids"][0], code, at(d(approved), 11, 0), notes))
    stats["scholarships"] = len(sch)
    w("INSERT INTO enrollment_scholarships (enrollment_id, scholarship_type_id, approved_at, notes)\n"
      "SELECT v.eid, st.scholarship_type_id, v.approved::timestamp, v.notes\n  FROM (VALUES\n" + values(sch, "    ") +
      "\n  ) AS v(eid, code, approved, notes)\n  JOIN scholarship_types st ON st.scholarship_code = v.code;\n")

    w(section("12. SCORE ENTRIES, GRADES AND OBSERVED VALUES",
        "Every grade is the DO 8 transmutation of its own score entries, computed the\n"
        "way the grading calculator does. In 2026-2027 only Q1 is graded; Q2 (and\n"
        "the Senior High 1st semester) has score entries up to today and no grade.\n"
        "Deliberate exceptions: incomplete (Hannah, Science Q4 2025-26), dropped\n"
        "(Mark, Q3 2025-26), Q1 EPP never posted for Grade 4 Luna (2026-27), and\n"
        "partial periods for the two transfer-outs."))
    w("CREATE TEMP TABLE seed_scores (eid bigint, code text, comp text, period text, label text, score numeric, top numeric, rec timestamp) ON COMMIT DROP;\n")
    for i in range(0, len(score_rows), 500):
        w("INSERT INTO seed_scores VALUES\n" + values(score_rows[i:i + 500]) + ";\n")
    w("""INSERT INTO score_entries (enrollment_id, subject_id, grading_component_id, grading_period, label, score, max_score, recorded_at)
SELECT s.eid, sub.subject_id, gc.grading_component_id, s.period, s.label, s.score, s.top, s.rec
  FROM seed_scores s
  JOIN enrollments e ON e.enrollment_id = s.eid
  JOIN subjects sub ON sub.subject_code = s.code AND sub.school_year = e.school_year
  JOIN grading_components gc ON gc.grading_template_id = sub.grading_template_id AND gc.component_name = s.comp;

DO $$
BEGIN
  IF (SELECT count(*) FROM seed_scores) <>
     (SELECT count(*) FROM score_entries WHERE enrollment_id IN (SELECT DISTINCT eid FROM seed_scores)) THEN
    RAISE EXCEPTION 'score entries did not all resolve to a subject and component';
  END IF;
END $$;
""")
    w("INSERT INTO grades (enrollment_id, subject_id, grading_period, numeric_grade, remarks, recorded_at)\n"
      "SELECT v.eid, sub.subject_id, v.period, v.grade, v.remarks, v.rec::timestamp\n  FROM (VALUES\n"
      + values(grade_rows, "    ") + "\n  ) AS v(eid, code, period, grade, remarks, rec)\n"
      "  JOIN enrollments e ON e.enrollment_id = v.eid\n"
      "  JOIN subjects sub ON sub.subject_code = v.code AND sub.school_year = e.school_year;\n")
    w(f"DO $$\nBEGIN\n  IF (SELECT count(*) FROM grades WHERE enrollment_id IN (SELECT enrollment_id FROM enrollments e JOIN students s USING (student_id) WHERE s.lrn LIKE '{LRN_LIKE}')) <> {len(grade_rows)} THEN\n"
      "    RAISE EXCEPTION 'grades did not all resolve to a subject';\n  END IF;\nEND $$;\n")
    w("INSERT INTO narrative_reports (enrollment_id, category_id, grading_period, rating, recorded_at) VALUES\n"
      + values(narrative_rows) + ";\n")

    w(section("13. ATTENDANCE",
        "Every school day of each enrollment's span -- weekdays, minus the year's\n"
        "holidays, days off and quarter breaks -- except the listed absences,\n"
        "excused days and late arrivals. 2026-2027 runs up to today. Recorded by\n"
        "the section's first adviser, except: Rica's rows switch recorder at her\n"
        "move to Pearl; Grade 9 Sapphire (no adviser) is taken by the registrar;\n"
        "Grade 4 Luna is Arnel Pascual's until 2026-09-17, nobody's on 09-18 (he\n"
        "had resigned), Carla Bernardo's from 09-21. Today: Grade 10 Ruby hasn't\n"
        "taken attendance and Patrick hasn't been marked in Grade 6 Aguinaldo."))
    w("CREATE TEMP TABLE seed_att_ranges (eid bigint, d_from date, d_to date, recorder text) ON COMMIT DROP;\n"
      "INSERT INTO seed_att_ranges VALUES\n" + values(att_ranges) + ";\n")
    w("CREATE TEMP TABLE seed_att_skip (eid bigint, day date) ON COMMIT DROP;\n")
    if att_skips:
        w("INSERT INTO seed_att_skip VALUES\n" + values(att_skips) + ";\n")
    w("CREATE TEMP TABLE seed_att_exceptions (eid bigint, day date, status text, remarks text) ON COMMIT DROP;\n"
      "INSERT INTO seed_att_exceptions VALUES\n" + values(att_exceptions) + ";\n")
    w(f"""INSERT INTO attendance_records (enrollment_id, date, status, remarks, recorded_by, created_at, updated_at)
SELECT r.eid, g.day, COALESCE(x.status, 'P'), x.remarks, u.user_id,
       g.day + time '07:40', g.day + time '07:40'
  FROM seed_att_ranges r
  JOIN enrollments e ON e.enrollment_id = r.eid
  CROSS JOIN LATERAL (SELECT gs::date AS day FROM generate_series(r.d_from, r.d_to, interval '1 day') gs) g
  LEFT JOIN seed_att_exceptions x ON x.eid = r.eid AND x.day = g.day
  LEFT JOIN users u ON u.email = r.recorder
 WHERE extract(isodow FROM g.day) < 6
   AND NOT EXISTS (SELECT 1 FROM seed_att_skip k WHERE k.eid = r.eid AND k.day = g.day)
   AND NOT EXISTS (
         SELECT 1 FROM academic_calendar_events ev
          WHERE ev.school_year = e.school_year
            AND ev.event_type IN ('holiday', 'school_day_off', 'quarter_break')
            AND g.day BETWEEN ev.start_date AND ev.end_date);

DO $$
BEGIN
  IF (SELECT count(*) FROM seed_att_exceptions x
       WHERE NOT EXISTS (SELECT 1 FROM attendance_records a
                          WHERE a.enrollment_id = x.eid AND a.date = x.day AND a.status = x.status)) > 0 THEN
    RAISE EXCEPTION 'an absence/late day fell outside the school days';
  END IF;
  IF (SELECT count(*) FROM attendance_records WHERE enrollment_id IN (SELECT DISTINCT eid FROM seed_att_ranges)) <> {expected_att} THEN
    RAISE EXCEPTION 'attendance count differs from the generator''s calendar (expected {expected_att})';
  END IF;
  IF EXISTS (SELECT 1 FROM attendance_records a JOIN seed_att_ranges r ON r.eid = a.enrollment_id
              WHERE a.recorded_by IS NULL) THEN
    RAISE EXCEPTION 'an attendance recorder email did not resolve';
  END IF;
END $$;
""")

    w(section("14. INVOICES, INSTALLMENTS AND PAYMENTS",
        "Computed with billing-service's own rules: the discount waterfall on tuition\n"
        "(voucher, scholarships, payment plan, Early Bird), installments counted from\n"
        "the year's start month and due on the last day of the month, remainder on the\n"
        "last one; prorated for a transfer-in; closed out on a transfer-out; a void\n"
        "only flips the invoice (its installments are left as they were); a re-issue\n"
        "voids the original and moves its payments across. Senior High is billed once\n"
        "a year, on the 1st-semester row. Installments still owed past their due date\n"
        "are overdue, as flag_overdue_installments marks them (never on void ones)."))
    inv_rows, item_rows, disc_rows, inst_rows, pay_rows = [], [], [], [], []
    for inv in sorted(invoices, key=lambda x: x["id"]):
        inv_rows.append((inv["id"], inv["eid"], inv["no"], inv["date"], inv["status"], inv["plan"],
                         inv["schedule"][0]["due"] if inv["schedule"] else None))
        for desc, amount in inv["items"]:
            item_rows.append((inv["id"], desc, amount))
        for code, desc, amount in inv["discounts"]:
            disc_rows.append((inv["id"], code, desc, amount))
        for s in inv["schedule"]:
            inst_rows.append((inv["id"], s["seq"], s["due"], s["amount"], s["paid"], s["status"]))
        for p in inv["payments"]:
            pay_rows.append((inv["id"], p["date"], p["amount"], p["method"], p["ref"], p["note"], p["created"]))
    stats.update(invoices=len(inv_rows), payments=len(pay_rows), installments=len(inst_rows))
    w("INSERT INTO student_invoices (invoice_id, enrollment_id, invoice_no, invoice_date, status, payment_plan, due_date)\n"
      "OVERRIDING SYSTEM VALUE VALUES\n" + values(inv_rows) + ";\n")
    if item_rows:
        w("INSERT INTO student_invoice_items (invoice_id, description, amount) VALUES\n" + values(item_rows) + ";\n")
    w("INSERT INTO student_invoice_discounts (invoice_id, discount_type_id, description, amount)\n"
      "SELECT v.inv, dt.discount_type_id, v.descr, v.amount\n  FROM (VALUES\n" + values(disc_rows, "    ")
      + "\n  ) AS v(inv, code, descr, amount)\n  LEFT JOIN discount_types dt ON dt.discount_code = v.code;\n")
    w("INSERT INTO invoice_installments (invoice_id, sequence, due_date, amount, amount_paid, status) VALUES\n"
      + values(inst_rows) + ";\n")
    w("INSERT INTO student_payments (invoice_id, payment_date, amount_paid, payment_method, reference_number, notes, created_at) VALUES\n"
      + values(pay_rows) + ";\n")
    w("""DO $$
DECLARE bad int;
BEGIN
  -- Items minus discounts equal the live installments on every invoice; on a
  -- live invoice the payments also equal what the installments show as paid.
  -- (A re-issued original keeps its installment marks while its payments
  -- moved to the replacement -- exactly what reissue_invoice leaves behind.)
  SELECT count(*) INTO bad
    FROM student_invoices i
   WHERE i.enrollment_id IN (SELECT e.enrollment_id FROM enrollments e JOIN students s USING (student_id)
                              WHERE s.lrn LIKE '""" + LRN_LIKE + """')
     AND (  (SELECT COALESCE(sum(amount), 0) FROM student_invoice_items x WHERE x.invoice_id = i.invoice_id)
          - (SELECT COALESCE(sum(amount), 0) FROM student_invoice_discounts x WHERE x.invoice_id = i.invoice_id))
         <> (SELECT COALESCE(sum(amount), 0) FROM invoice_installments x WHERE x.invoice_id = i.invoice_id AND x.status <> 'voided')
      OR (i.status <> 'void' AND
          (SELECT COALESCE(sum(amount_paid), 0) FROM student_payments x WHERE x.invoice_id = i.invoice_id)
          <> (SELECT COALESCE(sum(amount_paid), 0) FROM invoice_installments x WHERE x.invoice_id = i.invoice_id));
  IF bad > 0 THEN
    RAISE EXCEPTION '% seeded invoice(s) do not reconcile', bad;
  END IF;
END $$;
""")

    w(section("15. ONLINE INTAKE (S.Y. 2026-2027)",
        "Applications in every status and invites in every state. The three\n"
        "approved applications created Sofia, Miguel and Abigail. Daniel's in-review\n"
        "application matches his old student record by LRN. Access codes are hashed\n"
        f"the way the app hashes them; the one usable invite (Mia Evangelista) takes\n"
        f"code {next(i['code'] for i in INVITES if i['key'] == 'inv-active')}."))
    app_by_invite = {a["invite"]: a for a in APPLICATIONS}
    inv_rows_ = []
    for i in INVITES:
        issued = ts(i["issued"])
        a = app_by_invite.get(i["key"])
        consumed = ts(a["submitted"]) if a and a.get("submitted") else None
        inv_rows_.append((invite_uuid[i["key"]], hashes[f"invite:{i['key']}"], i.get("attempts", 0),
                          ts(i["locked"]) if i.get("locked") else None, i["first"], i["last"], i["email"], i["mobile"],
                          i["by"], issued, issued + dt.timedelta(days=3),
                          ts(i["revoked"]) if i.get("revoked") else None, consumed,
                          a["id"] if consumed else None, i["sy"]))
    stats["invites"] = len(inv_rows_)
    w("INSERT INTO application_invites (invite_id, access_code_hash, code_attempts, locked_at, applicant_first_name,\n"
      "  applicant_last_name, contact_email, contact_mobile, issued_by_user_id, issued_at, expires_at, revoked_at,\n"
      "  consumed_at, consumed_by_application_id, school_year)\n"
      "SELECT v.id::uuid, v.hash, v.attempts, v.locked::timestamptz, v.first, v.last, v.email, v.mobile, u.user_id,\n"
      "       v.issued::timestamptz, v.expires::timestamptz, v.revoked::timestamptz, v.consumed::timestamptz, v.app, v.sy\n"
      "  FROM (VALUES\n" + values(inv_rows_, "    ") +
      "\n  ) AS v(id, hash, attempts, locked, first, last, email, mobile, by_email, issued, expires, revoked, consumed, app, sy)\n"
      "  JOIN users u ON u.email = v.by_email;\n")
    app_rows = []
    for a in APPLICATIONS:
        i = next(x for x in INVITES if x["key"] == a["invite"])
        if a["status"] == "approved":
            p = PROFILE[a["student"]]
            hh = HOUSEHOLDS.get(p["household_id"])
            payload = dict(
                student=dict(lrn=lrn_of(p) if p["student_id"] not in (104, 105) else None,
                             first_name=p["first"], middle_name=p["middle"], last_name=p["last"], suffix=p["suffix"],
                             age=age_on(p["birth"], ts(a["submitted"]).date()), sex=p["sex"], religion=p["religion"],
                             birth_date=p["birth"], email=p["email"], mobile_number=p["mobile"],
                             current_address=p["current"], permanent_address=p["permanent"] or p["current"]),
                household=dict(parent_marital_status=hh[0], living_arrangement=hh[1], is_4ps_beneficiary=hh[2],
                               four_ps_id=hh[3]) if hh else None,
                guardians=[dict(relationship=rel, full_name=n, occupation=o, email_address=e, mobile_number=m,
                                is_primary_contact=pr) for rel, n, o, e, m, pr in p["guardians"]],
                siblings=[dict(full_name=n, age=ag) for n, ag in p["siblings"]],
                previous_schools=[dict(school_name=n, school_address=ad) for n, ad in p["previous"]],
            )
        else:
            payload = json.loads(json.dumps(a["payload"]))
        lvl, grade, strand = a["apply"]
        payload["applying_for"] = dict(school_level=lvl, grade_level=grade, strand=strand)
        st = payload["student"]
        matches = []
        dup = None
        if a.get("duplicate_of"):
            p = PROFILE[a["duplicate_of"]]
            dup = p["student_id"]
            matches = [dict(kind="lrn", strength="strong", student_id=p["student_id"],
                            display_name=f"{p['first']} {p['last']}", student_number=numbers[p["key"]])]
        draft = a["status"] == "draft"
        submitted = ts(a["submitted"]) if a.get("submitted") else None
        created = ts(a.get("created") or a["submitted"]) - dt.timedelta(minutes=0 if draft else 37)
        updated = ts(a.get("decided") or a.get("reviewed") or a.get("submitted") or a["created"])
        app_rows.append((
            a["id"], str(uuid.uuid5(uuid.NAMESPACE_URL, f"https://slis.test/seed/application/{a['id']}")),
            None if draft else (st.get("lrn") or None), "" if draft else st["first_name"], "" if draft else st["last_name"],
            None if draft else st.get("birth_date"), None if draft else st.get("sex"),
            None if draft else (st.get("email") or i["email"]), None if draft else (st.get("mobile_number") or i["mobile"]),
            json.dumps(payload, ensure_ascii=False), 2 if draft else 6,
            dup, json.dumps(matches, ensure_ascii=False), a["status"], submitted,
            a.get("reviewed_by"), a.get("decided_by"), ts(a["decided"]) if a.get("decided") else None, a.get("note"),
            PROFILE[a["student"]]["student_id"] if a["status"] == "approved" else None,
            created, updated, invite_uuid[a["invite"]], SY2,
        ))
    stats["applications"] = len(app_rows)
    w("INSERT INTO student_applications (student_application_id, submission_uuid, lrn, first_name, last_name, birth_date, sex,\n"
      "  contact_email, contact_mobile, payload_json, revision, duplicate_of_student_id, duplicate_matches_json, status,\n"
      "  submitted_at, reviewed_by_user_id, decided_by_user_id, decided_at, decision_note, created_student_id,\n"
      "  created_at, updated_at, invite_id, school_year)\n"
      "OVERRIDING SYSTEM VALUE\n"
      "SELECT v.id, v.uuid::uuid, v.lrn, v.first, v.last, v.birth::date, v.sex, v.email, v.mobile, v.payload::jsonb, v.rev,\n"
      "       v.dup, v.matches::jsonb, v.status, v.submitted::timestamptz, rv.user_id, dc.user_id, v.decided::timestamptz,\n"
      "       v.note, v.created_student, v.created::timestamptz, v.updated::timestamptz, v.invite::uuid, v.sy\n"
      "  FROM (VALUES\n" + values(app_rows, "    ") +
      "\n  ) AS v(id, uuid, lrn, first, last, birth, sex, email, mobile, payload, rev, dup, matches, status, submitted,\n"
      "         reviewer, decider, decided, note, created_student, created, updated, invite, sy)\n"
      "  LEFT JOIN users rv ON rv.email = v.reviewer\n"
      "  LEFT JOIN users dc ON dc.email = v.decider;\n")

    w(section("16. SEQUENCES", "Explicit ids above do not advance their sequences; move them past the rows."))
    for table, col in (("households", "household_id"), ("students", "student_id"), ("enrollments", "enrollment_id"),
                       ("student_invoices", "invoice_id"), ("student_applications", "student_application_id")):
        w(f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), GREATEST((SELECT MAX({col}) FROM {table}), 1));")
    w("\nCOMMIT;\n")

    stats.update(scores=len(score_rows), grades=len(grade_rows), narratives=len(narrative_rows),
                 attendance=expected_att, exceptions=len(att_exceptions), learners=len(PROFILES),
                 subjects={sy: len(v) for sy, v in SUBJECTS.items()})
    per_year = {}
    for row in rows:
        per_year.setdefault(row["E"]["sy"], set()).add(row["E"]["key"])
    stats["learners_per_year"] = {k: len(v) for k, v in per_year.items()}
    return "\n".join(out), stats, dict(rows=rows, invoices=invoices, numbers=numbers)


HEADER = f"""-- =============================================================
-- SLIS demo data -- Tier 2
-- Database: SLIS THESIS FINAL (PostgreSQL)
-- Run with: psql -U postgres -d "SLIS THESIS FINAL" -f seed_data.sql
--
-- 31 learners with complete profiles across two connected school years:
--   S.Y. {SY1}: 25 learners, finished (completed, plus a transfer-out, a
--               dropout and a cancellation).
--   S.Y. {SY2}: 25 learners, the current year, filled up to {TODAY}
--               (Q1 graded, Q2 in progress; enrolled, pending, cancelled,
--               transferred out).
-- 19 learners continue from one year to the next (promotions, two
-- retentions, two overrides). Plus online-intake applications and invites.
--
-- Accounts (password {PASSWORD} for all that can sign in):
--   superadmin@slis.test  super_admin   admin@slis.test         admin
--   registrar@slis.test   registrar     jocelyn.ramos@slis.test registrar
--   accounting@slis.test  accounting    arvin.lacson@slis.test  accounting
--   ramon.estrada@slis.test registrar (a 2025-26 adviser, now registrar)
--   teacher@slis.test     teacher (adviser of Grade 5 Silang)
--   arnel.pascual@slis.test, maricar.santiago@slis.test: INACTIVE (resigned)
--   maribel.reyes.seed@gmail.com, maria.dizon.seed@gmail.com,
--   perla.ibarra.seed@gmail.com, danilo.jimenez.seed@gmail.com: guardians
--
-- Re-runnable: this seed's learners (LRN block {LRN_BLOCK}...) and its
-- intake rows are cleared and rebuilt; shared set-up is only added where
-- missing; staff accounts are reset.
-- Generated by a script -- edit the generator, not this file, for changes.
-- =============================================================
"""


def password_hashes():
    """Deterministic PBKDF2 hashes (fixed salts) so the file is reproducible."""
    try:
        import django
        from django.conf import settings
        if not settings.configured:
            settings.configure(PASSWORD_HASHERS=["django.contrib.auth.hashers.PBKDF2PasswordHasher"])
        django.setup()
        from django.contrib.auth.hashers import check_password, make_password
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Django is needed to hash passwords: {exc}")
    out = {}
    for email in [e for _n, e, _r, _a in STAFF] + [e for _n, e in DEMO_GUARDIANS]:
        salt = "slisseed" + "".join(ch for ch in email if ch.isalnum())[:14]
        h = make_password(PASSWORD, salt=salt)
        assert check_password(PASSWORD, h)
        out[email] = h
    for i in INVITES:
        salt = "slisinvite" + "".join(ch for ch in i["key"] if ch.isalnum())[:12]
        h = make_password(i["code"], salt=salt)
        assert check_password(i["code"], h)
        out[f"invite:{i['key']}"] = h
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--media", action="append", default=[])
    ap.add_argument("--report", help="write a JSON summary of rows/invoices for checks")
    args = ap.parse_args()
    text, stats, detail = build(password_hashes(), args.media)
    Path(args.out).write_text(text, encoding="utf-8")
    if args.report:
        rep = dict(
            numbers=detail["numbers"],
            invoices=[dict(id=i["id"], eid=i["eid"], no=i["no"], status=i["status"], plan=i["plan"], grand=str(i["grand"]),
                           paid=str(sum((p["amount"] for p in i["payments"]), D("0"))),
                           statuses=[s["status"] for s in i["schedule"]]) for i in detail["invoices"]],
        )
        Path(args.report).write_text(json.dumps(rep, indent=1, default=str), encoding="utf-8")
    print(stats)
