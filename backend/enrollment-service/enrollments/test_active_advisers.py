"""
The one "does this section have an adviser?" rule (with_active_teacher).

Teachers today treated a deactivated adviser as no adviser while the home
pages' no-adviser queue, reading the sections list's `adviser_count`, still
counted them, so the same page could show two different answers. Both now go
through with_active_teacher; `adviser_count` keeps counting every row, since a
deactivated adviser's row still ties a section down.

No database here (the users table is identity-service's, `managed = False`):
the query is checked as SQL, the serializer through its getters.
"""
from types import SimpleNamespace

from enrollments.models import SectionAdvisory, with_active_teacher
from enrollments.serializers import SectionSerializer


def test_only_advisers_with_an_active_account_count():
    sql = str(with_active_teacher(SectionAdvisory.objects.all()).query)
    assert '"users"' in sql
    assert "is_active" in sql


def test_sections_list_reports_active_advisers_beside_every_adviser():
    section = SimpleNamespace(school_year_id="2026-2027", grade_level="Grade 9", name="Sapphire")
    key = ("2026-2027", "Grade 9", "Sapphire")
    serializer = SectionSerializer(context={
        "adviser_counts": {key: 1},          # a deactivated adviser's row...
        "active_adviser_counts": {},         # ...who can't take attendance
    })
    assert serializer.get_adviser_count(section) == 1
    assert serializer.get_active_adviser_count(section) == 0
    assert "active_adviser_count" in SectionSerializer.Meta.fields
