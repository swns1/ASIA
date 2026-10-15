"""
The official receipt for one payment: its figures, and the emailed copy.

receipt_figures() is the single source for what a receipt says. The print
page (ReceiptPrintPage.jsx) reads it from GET /api/payments/{id}/ as
`receipt`, and the emailed receipt (email_views.py) is rendered from it, so
the paper and the email can't disagree. It used to be worked out in the
browser only.
"""
from decimal import Decimal

from django.utils.html import escape

_ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
_GROUPS = [(10 ** 9, "Billion"), (10 ** 6, "Million"), (10 ** 3, "Thousand")]


def receipt_no(payment_id) -> str:
    return f"PAY-{int(payment_id):06d}"


def _below_thousand(n: int) -> str:
    if n == 0:
        return ""
    if n < 20:
        return _ONES[n]
    if n < 100:
        return _TENS[n // 10] + (f"-{_ONES[n % 10]}" if n % 10 else "")
    rest = _below_thousand(n % 100)
    return f"{_ONES[n // 100]} Hundred" + (f" {rest}" if rest else "")


def amount_in_words(amount) -> str:
    """'One Thousand Two Hundred Fifty Pesos and 50/100 Only'.

    Splits the fixed-point string instead of subtracting floats, so 0.29
    can't come out as 28 centavos."""
    whole_str, cents_str = f"{Decimal(amount):.2f}".split(".")
    whole, cents = int(whole_str), int(cents_str)
    parts, rest = [], whole
    for size, name in _GROUPS:
        if rest >= size:
            parts.append(f"{_below_thousand(rest // size)} {name}")
            rest %= size
    if rest:
        parts.append(_below_thousand(rest))
    words = " ".join(parts) or "Zero"
    peso = "Peso" if whole == 1 else "Pesos"
    centavos = f" and {cents_str}/100" if cents else ""
    return f"{words} {peso}{centavos} Only"


def _money(value: Decimal) -> str:
    return f"{value:.2f}"


def receipt_figures(payment) -> dict:
    """
    The account as it stood when THIS payment was made. The invoice's
    current total paid and balance are today's figures, so a receipt
    reprinted or resent later would otherwise count every later payment as
    "previously paid". Payments are ordered by date, then id, the order they
    were applied in. Amounts are 2-decimal strings, like every other amount
    the API returns.
    """
    invoice = payment.invoice
    net = (
        sum((Decimal(i.amount) for i in invoice.items.all()), Decimal("0"))
        - sum((Decimal(d.amount) for d in invoice.discounts.all()), Decimal("0"))
    )
    this_key = (payment.payment_date, payment.payment_id)
    previously = sum(
        (Decimal(p.amount_paid) for p in invoice.payments.all()
         if (p.payment_date, p.payment_id) < this_key),
        Decimal("0"),
    )
    this_payment = Decimal(payment.amount_paid)
    balance = max(Decimal("0"), net - previously - this_payment)
    return {
        "receipt_no":      receipt_no(payment.payment_id),
        "net_amount":      _money(net),
        "previously_paid": _money(previously),
        "this_payment":    _money(this_payment),
        "balance_after":   _money(balance),
        "amount_in_words": amount_in_words(this_payment),
    }


def _peso(value) -> str:
    return f"₱ {Decimal(value):,.2f}"


def render_receipt_email(*, payment, figures, detail, school_name, school_address="",
                         guardian_name=None):
    """(subject, text, html) for the emailed copy of a receipt.

    `detail` is the enrollment detail of the invoice (serializers.
    enrollment_details_for). Every value is escaped before it goes into the
    HTML -- names and the reference number are free text. Addressed to the
    guardian when there is one to write to, else to the learner."""
    detail = detail or {}
    student_name = detail.get("student_name") or "the learner"
    greeting = guardian_name or detail.get("student_name") or "Parent / Guardian"
    whose = f"for {student_name}" if guardian_name else ""
    grade_section = " – ".join(v for v in [detail.get("grade_level"), detail.get("section")] if v)
    # Not strftime's %-d: Windows (the LAN deployment) doesn't support it.
    d = payment.payment_date
    date = f"{d:%B} {d.day}, {d.year}" if d else ""
    subject = f"Official Receipt {figures['receipt_no']} – {student_name}"

    details = [
        ("Receipt No.",     figures["receipt_no"]),
        ("Date",            date),
        ("Student",         detail.get("student_name")),
        ("Student No.",     detail.get("student_number")),
        ("LRN",             detail.get("lrn")),
        ("Grade & Section", grade_section),
        ("School Year",     detail.get("school_year")),
        ("Invoice No.",     payment.invoice.invoice_no),
        ("Payment Method",  payment.get_payment_method_display()),
    ]
    if payment.reference_number:
        details.append(("Reference No.", payment.reference_number))
    summary = [
        ("Total Amount Due",  _peso(figures["net_amount"])),
        ("Previously Paid",   f"− {_peso(figures['previously_paid'])}"),
        ("This Payment",      f"− {_peso(figures['this_payment'])}"),
        ("Remaining Balance", _peso(figures["balance_after"])),
    ]
    amount = _peso(figures["this_payment"])
    footer = " · ".join(v for v in [school_name, "Accounting Office", school_address] if v)

    text = "\n".join([
        f"Dear {greeting},",
        "",
        f"We have received a payment of {amount} {whose}".rstrip() + ". Thank you.",
        f"({figures['amount_in_words']})",
        "",
        *(f"{label}: {value or '—'}" for label, value in details),
        "",
        "Account summary as of this payment",
        *(f"{label}: {value}" for label, value in summary),
        "",
        f"This email is a copy of the official receipt issued by {school_name}. "
        "Please keep it for your records. For questions about your account, "
        "contact our Accounting office.",
        "",
        footer,
    ])

    def rows(pairs, bold_last=False):
        out = []
        for n, (label, value) in enumerate(pairs):
            weight = "800" if bold_last and n == len(pairs) - 1 else "600"
            out.append(
                f'<tr><td style="color:#7a5050;padding:6px 0;width:45%;">{escape(label)}</td>'
                f'<td style="color:#1a0a0a;font-weight:{weight};text-align:right;">'
                f'{escape(value or "—")}</td></tr>'
            )
        return "".join(out)

    whose_html = f" for <strong>{escape(student_name)}</strong>" if guardian_name else ""
    html = f"""
            <div style="font-family:'DM Sans',sans-serif;max-width:560px;margin:0 auto;background:#fff8f6;border:1px solid #fde2de;border-radius:16px;padding:36px;">
              <div style="text-align:center;margin-bottom:28px;">
                <h1 style="font-family:Georgia,serif;color:#1a0a0a;font-size:26px;margin:0 0 6px;">{escape(school_name)}</h1>
                <p style="color:#7a5050;font-size:13px;margin:0;">Official Receipt · {escape(figures["receipt_no"])}</p>
              </div>

              <p style="color:#1a0a0a;font-size:15px;">Dear <strong>{escape(greeting)}</strong>,</p>
              <p style="color:#4a3a3a;font-size:14px;line-height:1.7;">
                We have received a payment{whose_html}. Thank you.
              </p>

              <div style="background:#ffffff;border:1px solid #fde2de;border-radius:12px;padding:20px 24px;margin:24px 0;text-align:center;">
                <div style="color:#7a5050;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">Amount Received</div>
                <div style="color:#1a0a0a;font-size:28px;font-weight:800;margin:6px 0;">{escape(amount)}</div>
                <div style="color:#4a3a3a;font-size:13px;">{escape(figures["amount_in_words"])}</div>
              </div>

              <div style="background:#ffffff;border:1px solid #fde2de;border-radius:12px;padding:20px 24px;margin:0 0 16px;">
                <table style="width:100%;font-size:13px;border-collapse:collapse;">{rows(details)}</table>
              </div>

              <div style="background:#ffffff;border:1px solid #fde2de;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
                <p style="color:#7a5050;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Account summary as of this payment</p>
                <table style="width:100%;font-size:13px;border-collapse:collapse;">{rows(summary, bold_last=True)}</table>
              </div>

              <p style="color:#4a3a3a;font-size:14px;line-height:1.7;">
                This email is a copy of the official receipt issued by {escape(school_name)}.
                Please keep it for your records. For questions about your account,
                contact our Accounting office.
              </p>

              <p style="color:#7a5050;font-size:13px;margin-top:32px;border-top:1px solid #fde2de;padding-top:20px;">
                {escape(footer)}
              </p>
            </div>
        """
    return subject, text, html
