"""
Advisory duplicate detection — see the plan's decision 8: this only ever
flags for the registrar, never blocks a submission.

A hard block on a match (LRN especially) would turn the public submit
endpoint into an unauthenticated oracle answering "is this child already a
student here?" — try a guessed LRN, an identical-looking 201 vs. a block
tells you which. A neutral, byte-identical response regardless of what was
found closes that off (see intake/views.py's submit action). Blocking on
name + birth date is also just wrong for twins, who share both.
"""
from students.models import Student

from .models import StudentApplication


def _norm(value):
    return (value or "").strip().casefold()


def find_matches(student_payload):
    """Returns a list of {kind, strength, student_id|application_id,
    display_name, student_number|reference} dicts. Never raises; an empty
    payload or missing fields just yields no matches."""
    lrn = _norm(student_payload.get("lrn"))
    first_name = _norm(student_payload.get("first_name"))
    last_name = _norm(student_payload.get("last_name"))
    birth_date = student_payload.get("birth_date")

    matches = []

    if lrn:
        for s in Student.objects.filter(lrn__iexact=lrn):
            matches.append({
                "kind": "lrn", "strength": "strong",
                "student_id": s.student_id,
                "display_name": f"{s.first_name} {s.last_name}".strip(),
                "student_number": s.student_number,
            })

    if first_name and last_name and birth_date:
        qs = Student.objects.filter(
            first_name__iexact=first_name, last_name__iexact=last_name, birth_date=birth_date,
        )
        for s in qs:
            if any(m["student_id"] == s.student_id for m in matches):
                continue
            matches.append({
                "kind": "name_dob", "strength": "strong",
                "student_id": s.student_id,
                "display_name": f"{s.first_name} {s.last_name}".strip(),
                "student_number": s.student_number,
            })

    if last_name and birth_date:
        qs = Student.objects.filter(last_name__iexact=last_name, birth_date=birth_date)
        seen = {m["student_id"] for m in matches}
        for s in qs:
            if s.student_id in seen:
                continue
            matches.append({
                "kind": "surname_dob", "strength": "weak",
                "student_id": s.student_id,
                "display_name": f"{s.first_name} {s.last_name}".strip(),
                "student_number": s.student_number,
            })

    pending_qs = StudentApplication.objects.filter(
        status__in=[StudentApplication.SUBMITTED, StudentApplication.IN_REVIEW],
    )
    if lrn:
        for a in pending_qs.filter(lrn__iexact=lrn):
            matches.append({
                "kind": "lrn_pending", "strength": "weak",
                "application_id": a.student_application_id,
                "display_name": f"{a.first_name} {a.last_name}".strip(),
                "reference": a.reference,
            })
    if first_name and last_name and birth_date:
        for a in pending_qs.filter(first_name__iexact=first_name, last_name__iexact=last_name, birth_date=birth_date):
            matches.append({
                "kind": "name_dob_pending", "strength": "weak",
                "application_id": a.student_application_id,
                "display_name": f"{a.first_name} {a.last_name}".strip(),
                "reference": a.reference,
            })

    return matches


def strongest_student_id(matches):
    """The single `students` row (never an application) to set
    duplicate_of_student_id to, if any strong match exists."""
    for m in matches:
        if m["strength"] == "strong" and "student_id" in m:
            return m["student_id"]
    return None
