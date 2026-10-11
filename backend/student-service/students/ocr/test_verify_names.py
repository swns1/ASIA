"""
Does this document name *this* student?

The old rule passed a document if any one word of the student's name, of
three letters or more, appeared anywhere in it as a substring. That accepted:
a sibling's certificate (same surname), a "Dela Rosa" family for a "Dela Cruz"
student ("dela" alone), any document sharing a first name, "Ana" inside
"Mariana", and -- because "Uy" is under three letters -- never checked short
surnames at all. Now the whole surname and every given name must appear as
whole words, and a surname-only match is reported as such.
"""
import pytest

from students.ocr.types import ParsedDocument, TextBlock
from students.ocr.verify import verify_document


def page(*lines):
    return ParsedDocument(
        blocks=[TextBlock(text=t, box=(0.0, i * 20.0, 400.0, i * 20.0 + 18.0)) for i, t in enumerate(lines)],
        width=400, height=400, engine="test",
    )


def check(name_line, first, last):
    return verify_document(page("CERTIFICATE OF LIVE BIRTH", name_line), "psa_birth_certificate",
                           first_name=first, last_name=last)


@pytest.mark.parametrize("name_line", [
    "Name: JUAN SANTOS DELA CRUZ",
    "Name: JUAN SANTOS DE LA CRUZ",     # the same surname, spaced differently on paper
    "Name: JUAN SANTOS DELACRUZ",
    "DELA CRUZ, JUAN SANTOS",            # surname first, as Form 137 prints it
])
def test_the_right_student_matches(name_line):
    result = check(name_line, "Juan", "Dela Cruz")
    assert result["names_student"] is True
    assert result["name_match"] == "match"
    assert not any("name" in n for n in result["notes"])


def test_a_siblings_document_is_flagged_as_possibly_a_siblings():
    result = check("Name: PEDRO SANTOS DELA CRUZ", "Juan", "Dela Cruz")
    assert result["names_student"] is False
    assert result["name_match"] == "surname_only"
    assert any("sibling" in n for n in result["notes"])


def test_one_word_of_a_compound_surname_is_not_the_surname():
    result = check("Name: PEDRO GARCIA DELA ROSA", "Miguel", "Dela Cruz")
    assert result["names_student"] is False
    assert result["name_match"] == "none"


def test_the_same_first_name_on_someone_else_is_not_a_match():
    result = check("Name: JUAN PABLO GARCIA", "Juan", "Dela Cruz")
    assert result["names_student"] is False
    assert result["name_match"] == "given_only"


def test_names_match_as_whole_words_not_inside_other_words():
    result = check("Name: MARIANA SANTANA ROXAS", "Ana", "Lim")
    assert result["names_student"] is False
    assert result["name_match"] == "none"


def test_short_surnames_are_checked():
    assert check("Name: JUAN MIGUEL SANTOS", "Juan", "Uy")["names_student"] is False
    assert check("Name: JUAN MIGUEL UY", "Juan", "Uy")["names_student"] is True


def test_every_given_name_must_appear():
    """Sisters "Mary Grace" and "Mary Ann" share the surname and "Mary"."""
    assert check("Name: MARY ANN REYES", "Mary Grace", "Reyes")["names_student"] is False
    assert check("Name: MARY GRACE REYES", "Mary Grace", "Reyes")["names_student"] is True


def test_a_lone_initial_is_not_required_to_match():
    assert check("Name: JUAN SANTOS", "Juan M.", "Santos")["names_student"] is True


def test_abbreviation_accents_and_suffix_are_tolerated():
    assert check("Name: MA. TERESA PEÑA JR.", "Maria Teresa", "Pena")["names_student"] is True


def test_only_the_parts_supplied_are_checked():
    surname_only = verify_document(page("Name: JUAN DELA CRUZ"), "health_record", last_name="Dela Cruz")
    assert surname_only["names_student"] is True
    nothing = verify_document(page("Name: JUAN DELA CRUZ"), "health_record")
    assert nothing["names_student"] is None and nothing["name_match"] is None


def test_matched_name_reports_what_was_found():
    assert check("Name: JUAN SANTOS DELA CRUZ", "Juan", "Dela Cruz")["matched_name"] == "juan dela cruz"
    assert check("Name: PEDRO DELA CRUZ", "Juan", "Dela Cruz")["matched_name"] == "dela cruz"
    assert check("Name: MARIA REYES", "Juan", "Dela Cruz")["matched_name"] is None
