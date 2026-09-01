"""
Tests for document scanning.

Almost everything here runs without PaddleOCR installed and without a network
call: the pipeline is layered so that only `reader.py` touches the engine, and
every layer above it consumes a `ParsedDocument`. A hand-built ParsedDocument
is a better test input than a fixture image anyway — it is explicit about the
geometry each assertion depends on, where an image hides it.

The one test that needs paddle is marked with `importorskip`, so CI keeps
covering the anchor and reconciliation logic without a 1 GB install.
"""
from types import SimpleNamespace

import pytest
from rest_framework.test import APIRequestFactory

from accounts.permissions import HasRole
from students.ocr import groq_vision
from students.ocr.anchors import (
    BELOW,
    RIGHT,
    Anchor,
    extract_fields,
    find_label,
    resolve_anchor,
)
from students.ocr.policy import (
    EXTRACT,
    VERIFY,
    FAMILY_BIRTH_CERTIFICATE,
    FAMILY_FORM_137,
    looks_like_family,
    policy_for,
    resolve_policy,
)
from students.ocr.reconcile import (
    AGREED,
    CONFLICT,
    SINGLE,
    Claim,
    normalize_text,
    reconcile,
    values_agree,
)
from students.ocr.types import ParsedDocument, TextBlock
from students.ocr.verify import verify_document
from students.ocr.views import OCRScanView, ReconciledLedgerView, _should_fallback


def block(text, x0, y0, x1=None, y1=None, conf=0.95):
    """One text block; sizes default to something the geometry can work with."""
    return TextBlock(text=text, box=(x0, y0, x1 if x1 is not None else x0 + 80,
                                     y1 if y1 is not None else y0 + 16), confidence=conf)


def doc(*blocks, width=1000, height=1400):
    return ParsedDocument(blocks=list(blocks), width=width, height=height, engine="test")


def lines(*texts):
    """A simple stack of full-width lines, for text-only (keyword) assertions."""
    return doc(*[block(t, 0, i * 20) for i, t in enumerate(texts)])


# ─────────────────────────────────────────────────────────────────────────
# Policy — which documents earn a full extraction
# ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("code,expected", [
    ("psa_birth_certificate", EXTRACT),
    ("birth_certificate", EXTRACT),
    ("form_137_or_138", EXTRACT),
    # Form 138 is the report card: its payload is term grades, and the
    # enrollment form has no field for them.
    ("form_138", VERIFY),
    ("certificate_good_moral", VERIFY),
    ("ncae_result", VERIFY),
    ("health_record", VERIFY),
])
def test_policy_for_requirement_code(code, expected):
    assert policy_for(code)[0] == expected


def test_unknown_requirement_code_verifies_rather_than_extracts():
    # A wrong anchor set produces confidently wrong fields, which is worse
    # than no fields — so the default leans away from extraction.
    assert policy_for("something_new")[0] == VERIFY
    assert policy_for(None)[0] == VERIFY


def test_form_137_slot_routes_by_what_the_page_actually_says():
    """
    `form_137_or_138` is one requirement slot accepting either document, so
    the code alone cannot decide the policy.
    """
    f137 = lines("DepEd Form 137", "LEARNER PERMANENT RECORD", "LRN: 136789012345")
    assert resolve_policy("form_137_or_138", f137) == (EXTRACT, FAMILY_FORM_137)

    f138 = lines("DepEd Form 138", "REPORT CARD", "First Quarter 88")
    assert resolve_policy("form_137_or_138", f138) == (VERIFY, None)


def test_form_137_slot_demotes_when_neither_marker_is_present():
    assert resolve_policy("form_137_or_138", lines("a holiday photo")) == (VERIFY, None)


def test_looks_like_family_flags_a_mismatched_document():
    birth = lines("CERTIFICATE OF LIVE BIRTH", "OFFICE OF THE CIVIL REGISTRAR")
    assert looks_like_family(FAMILY_BIRTH_CERTIFICATE, birth) is True
    assert looks_like_family(FAMILY_BIRTH_CERTIFICATE, lines("GOOD MORAL")) is False
    # No markers registered for a family means no claim either way, rather
    # than a manufactured warning.
    assert looks_like_family(None, lines("anything")) is True


# ─────────────────────────────────────────────────────────────────────────
# Verify — the nine attestation documents, no model call
# ─────────────────────────────────────────────────────────────────────────

GOOD_MORAL = ("CERTIFICATE OF GOOD MORAL CHARACTER",
              "This is to certify that ANA MARIE DELA CRUZ",
              "is of good moral character.")


def test_verify_accepts_the_right_document_for_the_right_student():
    result = verify_document(lines(*GOOD_MORAL), "certificate_good_moral",
                             first_name="Ana", last_name="Dela Cruz")
    assert result["is_expected_document"] is True
    assert result["names_student"] is True
    assert result["notes"] == []


def test_verify_flags_a_document_naming_a_different_student():
    # The signal worth catching: the wrong file attached to a student's
    # record, which no amount of field extraction would ever reveal.
    result = verify_document(lines(*GOOD_MORAL), "certificate_good_moral",
                             first_name="Juan", last_name="Bautista")
    assert result["names_student"] is False
    assert any("name was not found" in n for n in result["notes"])


def test_verify_flags_the_wrong_document_type_for_the_slot():
    result = verify_document(lines(*GOOD_MORAL), "health_record",
                             first_name="Ana", last_name="Dela Cruz")
    assert result["is_expected_document"] is False
    assert any("does not look like" in n for n in result["notes"])


def test_verify_makes_no_claim_when_there_is_no_name_to_check_against():
    result = verify_document(lines(*GOOD_MORAL), "certificate_good_moral")
    assert result["names_student"] is None


def test_verify_reports_an_unreadable_page():
    result = verify_document(doc(), "certificate_good_moral", last_name="Reyes")
    assert any("No readable text" in n for n in result["notes"])


# ─────────────────────────────────────────────────────────────────────────
# Anchors — geometry, not a model
# ─────────────────────────────────────────────────────────────────────────

def test_anchor_reads_the_value_to_the_right_of_its_label():
    page = doc(block("RELIGION", 100, 500, 180, 516),
               block("CATHOLIC", 200, 500, 280, 516))
    value, confidence = resolve_anchor(page, Anchor("religion", ("RELIGION",), RIGHT))
    assert value == "CATHOLIC"
    assert confidence == pytest.approx(0.95)


def test_anchor_reads_only_the_first_line_below_its_label():
    """
    Municipal Form No. 102 prints "(First) (Middle) (Last)" as a row of
    captions with values on the line below. Without a one-line limit the
    search window spills into the next row of the form and a name comes back
    as "NIEL ASHLEY 3. DATE OF BIRTH" — the value plus the caption beneath it.
    """
    page = doc(
        block("(First)", 290, 226, 330, 242),
        block("NIEL ASHLEY", 288, 250, 380, 266),
        block("3. DATE OF BIRTH", 285, 290, 400, 306),
    )
    value, _ = resolve_anchor(page, Anchor("first_name", ("(First)",), BELOW, max_gap=4.0))
    assert value == "NIEL ASHLEY"


def test_anchor_yields_nothing_when_its_label_is_absent():
    page = doc(block("SOMETHING ELSE", 0, 0))
    assert resolve_anchor(page, Anchor("religion", ("RELIGION",), RIGHT)) == (None, 0.0)


def test_label_matching_survives_recogniser_noise_without_merging_opposites():
    # "(Firat)" is what actually comes back off security paper.
    page = doc(block("(Firat)", 290, 226), block("MARIA", 288, 250))
    assert find_label(page, ("(First)",)) is not None
    # But the pair that must never merge stays separate.
    father = doc(block("FATHER", 0, 0))
    assert find_label(father, ("MOTHER",)) is None


@pytest.mark.parametrize("noise", [
    "(First)", "1. NAME", "21. PREPARED BY", "(Middle)", "---", "12",
])
def test_form_furniture_is_not_mistaken_for_a_value(noise):
    page = doc(block("RELIGION", 100, 500, 180, 516),
               block(noise, 200, 500, 300, 516))
    assert resolve_anchor(page, Anchor("religion", ("RELIGION",), RIGHT))[0] is None


def test_anchor_pattern_rejects_a_value_of_the_wrong_shape():
    page = doc(block("SEX", 100, 500, 140, 516),
               block("Bisaya", 160, 500, 220, 516))
    anchor = Anchor("sex", ("SEX",), RIGHT, pattern=r"^(male|female|m|f)$")
    assert resolve_anchor(page, anchor)[0] is None


def test_partial_lrn_is_dropped_rather_than_guessed():
    """
    `lrn` is unique on Student, so a wrong one either collides with a real
    student or creates a phantom. Half an LRN is worse than none.
    """
    page = doc(block("LRN", 600, 40, 640, 60), block("13678901", 660, 40, 760, 60))
    fields, _ = extract_fields(page, FAMILY_FORM_137)
    assert "lrn" not in fields

    good = doc(block("LRN", 600, 40, 640, 60), block("136789012345", 660, 40, 780, 60))
    fields, _ = extract_fields(good, FAMILY_FORM_137)
    assert fields["lrn"] == "136789012345"


def test_mother_and_father_become_two_guardians():
    page = doc(
        block("MAIDEN NAME", 100, 600, 200, 616),
        block("CRISTINA REYES", 100, 630, 240, 646),
        block("NAME OF FATHER", 100, 700, 220, 716),
        block("JUAN DELA CRUZ", 100, 730, 240, 746),
    )
    fields, _ = extract_fields(page, FAMILY_BIRTH_CERTIFICATE)
    relationships = {g["relationship"] for g in fields["guardians"]}
    assert relationships == {"mother", "father"}



# ─────────────────────────────────────────────────────────────────────────
# Anchors against the real certificate layout
#
# Every box below is measured off an actual scanned PSA certificate, and the
# label text is verbatim what the recogniser returned from it — "(Firat)",
# "(Mddla)", "XX1Male", "6. MAIDEN" split from its own "NAME". The *values*
# are stand-ins: the real ones belong to a named child and must not live in
# this repo. Surnames are kept internally consistent, because that
# consistency is itself the assertion — on a correctly read certificate the
# child's middle name is the mother's maiden surname and the child's last
# name is the father's, so getting all three right by accident is unlikely.
#
# This is the regression net for the anchor tuning. Each field below was, at
# some point, silently unresolvable or wrong.
# ─────────────────────────────────────────────────────────────────────────

def real_certificate():
    return doc(
        block('1. NAME', 152, 226, 217, 243, 1.00),
        block('(Firat)', 291, 227, 327, 245, 0.92),
        block('(Mddla)', 425, 229, 470, 244, 0.93),
        block('(Last)', 568, 230, 600, 245, 0.91),
        block('For OCRG USE ONLY:', 694, 231, 814, 244, 0.95),
        block('REYES', 568, 240, 631, 261, 1.00),
        block('SANTOS', 415, 243, 488, 262, 0.99),
        block('Fopulation Referenoe No.', 695, 243, 832, 257, 0.95),
        block('JOSE MARIO', 231, 245, 344, 262, 0.99),
        block('2. SEX', 150, 264, 207, 283, 1.00),
        block('3. DATE OF BIRTH', 386, 267, 513, 284, 0.95),
        block('(day)', 534, 270, 566, 285, 0.97),
        block('(manth) (ysar)', 579, 271, 661, 285, 0.89),
        block('XX1Male', 166, 281, 254, 300, 0.74),
        block('JUNE 2011', 569, 285, 672, 302, 0.98),
        block('2 Famale', 297, 286, 354, 300, 0.84),
        block('05', 531, 286, 560, 302, 1.00),
        block('TO BE FILLED UP AT THE', 693, 290, 832, 305, 0.98),
        block('CェーLロ', 117, 301, 137, 392, 0.50),
        block('OFFICE OF THE CIVIL', 694, 302, 813, 316, 0.98),
        block('4. PLACE OF', 149, 305, 242, 322, 1.00),
        block('(Namaol Hoapital/Canic/inatitution/', 250, 306, 439, 324, 0.91),
        block('(City/Miuniclpallty)', 452, 307, 547, 326, 0.93),
        block('(Province)', 583, 309, 639, 326, 0.94),
        block('6. MAIDEN', 145, 458, 222, 475, 0.98),
        block('(Firet)', 274, 458, 308, 477, 0.82),
        block('40', 694, 458, 711, 470, 0.84),
        block('sO', 739, 458, 756, 471, 0.53),
        block('(Last)', 547, 459, 582, 477, 0.93),
        block('(Middle)', 407, 460, 451, 475, 0.93),
        block('NAME', 169, 473, 216, 491, 1.00),
        block('SANTOS', 555, 478, 625, 496, 0.91),
        block('DELA', 401, 479, 465, 500, 1.00),
        block('ANA', 275, 481, 311, 501, 1.00),
        block('7. CITIZENSHIP', 150, 504, 258, 521, 0.99),
        block('8. RELIGION', 458, 506, 546, 523, 0.99),
        block('CATHOLIC', 557, 518, 637, 536, 0.99),
        block('M', 121, 522, 138, 541, 1.00),
        block('FILIPINO', 268, 523, 350, 540, 0.98),
        block('58', 693, 528, 713, 544, 0.95),
        block('OTHER', 120, 537, 138, 624, 1.00),
        block('61', 694, 593, 710, 606, 1.00),
        block('10. OCCUPATION', 144, 594, 264, 611, 1.00),
        block('11.', 498, 596, 520, 612, 1.00),
        block('Age at the time', 531, 598, 614, 612, 0.98),
        block('HOUSEWIFE', 270, 616, 361, 633, 0.92),
        block('yeara', 641, 622, 669, 633, 0.95),
        block('12. RESIDENCE (House No., Street, Barangay)', 143, 635, 424, 655, 0.99),
        block('(City/Municipalty)', 462, 640, 550, 654, 0.92),
        block('(Pravince)', 592, 640, 646, 654, 0.99),
        block('2', 694, 647, 711, 661, 1.00),
        block('4', 751, 647, 767, 661, 0.63),
        block('12 MABINI ST, SAMPLE TOWN', 203, 653, 640, 680, 0.91),
        block('13. NAME', 143, 677, 214, 694, 0.98),
        block('(Firat)', 279, 680, 312, 695, 0.89),
        block('(Middie)', 412, 680, 456, 695, 0.95),
        block('(Laat)', 551, 680, 585, 695, 0.98),
        block('F', 120, 685, 133, 703, 1.00),
        block('REYES', 538, 690, 601, 711, 0.97),
        block('PEDRO', 238, 694, 307, 717, 0.72),
        block('LIM', 416, 694, 459, 712, 0.72),
        block('ATHER', 118, 696, 137, 789, 1.00),
        block('69', 743, 704, 759, 716, 1.00),
        block('14. CITIZENSHIP', 143, 717, 260, 734, 0.99),
        block('15. RELIGION', 459, 717, 553, 734, 0.99),
        block('CATHOLIC', 558, 722, 640, 745, 0.99),
        block('FILIPINO', 279, 725, 361, 744, 1.00),
        block('17.', 496, 747, 521, 767, 1.00),
        block('JUNE 20,9011', 475, 1086, 606, 1109, 0.92),
        block('FATHER', 267, 1087, 331, 1105, 0.99),
    )


def test_the_real_certificate_layout_resolves_every_field():
    fields, confidence = extract_fields(real_certificate(), FAMILY_BIRTH_CERTIFICATE)

    assert fields["first_name"] == "JOSE MARIO"
    assert fields["middle_name"] == "SANTOS"
    assert fields["last_name"] == "REYES"
    assert fields["sex"] == "male"
    assert fields["birth_date"] == "05 JUNE 2011"
    assert fields["religion"] == "CATHOLIC"

    by_relationship = {g["relationship"]: g["full_name"] for g in fields["guardians"]}
    assert by_relationship == {"mother": "ANA DELA SANTOS", "father": "PEDRO LIM REYES"}

    # The recogniser read the ticked sex box at 0.74; saying "high" there
    # would be the pipeline lying about its own evidence.
    assert confidence["sex"] == "low"
    assert confidence["first_name"] == "high"


def test_the_child_and_parent_name_rows_do_not_collide():
    """
    "(First) (Middle) (Last)" is printed three times on this form — for the
    child, the mother and the father — and a single global best-match label
    can only ever resolve one of them. The parents anchor on their numbered
    section headers instead.
    """
    fields, _ = extract_fields(real_certificate(), FAMILY_BIRTH_CERTIFICATE)
    names = {fields["first_name"], fields["middle_name"], fields["last_name"]}
    parents = {g["full_name"] for g in fields["guardians"]}
    assert names == {"JOSE MARIO", "SANTOS", "REYES"}
    assert not any(n in parents for n in names)


def test_the_father_anchor_ignores_the_signature_block():
    """
    The word "FATHER" appears twice: once as the vertical tab beside field 13,
    and once in the certification block at the foot of the page, where the
    neighbouring value is the parents' marriage date. Anchoring on the bare
    word picked the footer and returned "21. PREPARED BY".
    """
    fields, _ = extract_fields(real_certificate(), FAMILY_BIRTH_CERTIFICATE)
    father = next(g for g in fields["guardians"] if g["relationship"] == "father")
    assert father["full_name"] == "PEDRO LIM REYES"


def test_a_value_overlapping_its_own_caption_is_still_read():
    """
    Captions and handwritten values are not on tidy separate lines. The
    surname starts five pixels ABOVE the bottom of its own "(Last)" caption,
    and at the old tolerance it was excluded — so the anchor reached past it
    into the next row of the form and came back with a caption instead.
    """
    page = doc(block("(Last)", 568, 230, 600, 245),
               block("REYES", 568, 240, 631, 261),
               block("(manth) (ysar)", 579, 271, 661, 285))
    value, _ = resolve_anchor(page, Anchor("last_name", ("(Last)",), BELOW, max_gap=3.0))
    assert value == "REYES"


def test_the_day_of_birth_is_not_mistaken_for_a_box_number():
    """
    A lone 1-3 digit block is normally a box number printed on the form, but
    the day of birth is exactly that shape. Without the waiver the date came
    back as "JUNE 2011" — a birth date a month wide.
    """
    labelled = (block("3. DATE OF BIRTH", 386, 267, 513, 284),
                block("05", 531, 286, 560, 302),
                block("JUNE 2011", 569, 285, 672, 302))
    numeric = Anchor("birth_date", ("3. DATE OF BIRTH",), BELOW,
                     max_gap=3.5, keep_numeric=True)
    assert resolve_anchor(doc(*labelled), numeric)[0] == "05 JUNE 2011"

    # and the waiver is opt-in: without it the box number is still furniture
    plain = Anchor("birth_date", ("3. DATE OF BIRTH",), BELOW, max_gap=3.5)
    assert resolve_anchor(doc(*labelled), plain)[0] == "JUNE 2011"


def test_form_furniture_does_not_consume_the_value_budget():
    """
    "6. MAIDEN NAME" comes back as two blocks, and the stray "NAME" sits in
    the value row. Spending a max_blocks slot on it before dropping it cost
    the mother her surname.
    """
    page = doc(block("6. MAIDEN", 145, 458, 222, 475),
               block("NAME", 169, 473, 216, 491),
               block("ANA", 275, 481, 311, 501),
               block("DELA", 401, 479, 465, 500),
               block("SANTOS", 555, 478, 625, 496))
    anchor = Anchor("_mother_name", ("6. MAIDEN",), BELOW,
                    max_gap=3.0, max_blocks=3, x_window=30.0)
    assert resolve_anchor(page, anchor)[0] == "ANA DELA SANTOS"


SEX = Anchor("sex", ("2. SEX",), BELOW, max_gap=3.0, max_blocks=4, x_window=10.0,
             choices=(("female", r"f[ae]m[ae]l[ae]"), ("male", r"m[ae]l[ae]")))


def test_the_ticked_option_is_the_one_that_is_read():
    """Sex is not written on this form, it is ticked. The X is the value."""
    label = block("2. SEX", 150, 264, 207, 283)
    male = doc(label, block("XX1Male", 166, 281, 254, 300, conf=0.74),
               block("2 Famale", 297, 286, 354, 300))
    assert resolve_anchor(male, SEX)[0] == "male"

    # The same page with the mark on the other option. "Famale" is what the
    # recogniser actually returns, and it contains "male" — so option order
    # matters, and the female pattern has to win the block.
    female = doc(label, block("1 Male", 166, 281, 254, 300),
                 block("X2 Famale", 297, 286, 354, 300))
    assert resolve_anchor(female, SEX)[0] == "female"


@pytest.mark.parametrize("first,second", [
    ("1 Male", "2 Famale"),        # nothing ticked — the mark did not scan
    ("XX1Male", "X2 Famale"),      # both ticked — a smudge, or a bad scan
])
def test_an_unreadable_tick_yields_nothing_rather_than_a_guess(first, second):
    """
    Guessing a sex off an unticked box would be a silent, plausible-looking
    error in a permanent record. Nothing here means the document escalates to
    the fallback, which is the whole point of the fallback.
    """
    page = doc(block("2. SEX", 150, 264, 207, 283),
               block(first, 166, 281, 254, 300),
               block(second, 297, 286, 354, 300))
    assert resolve_anchor(page, SEX)[0] is None


# ─────────────────────────────────────────────────────────────────────────
# Reconciliation — the defect this package exists to fix
# ─────────────────────────────────────────────────────────────────────────

BC = dict(source_label="PSA Birth Certificate", family=FAMILY_BIRTH_CERTIFICATE)
F137 = dict(source_label="Form 137", family=FAMILY_FORM_137)


@pytest.mark.parametrize("field,a,b", [
    ("first_name", "Maria", "Ma."),          # Filipino abbreviation
    ("first_name", "MARIA", "Maria"),        # case
    ("middle_name", "Santos", "S."),         # initial vs spelled out
    ("last_name", "Dela Cruz", "Dela Cruz."),  # trailing punctuation
    ("last_name", "Peña", "Pena"),           # diacritics
    ("last_name", "Dela Cruz Jr.", "Dela Cruz"),  # suffix
])
def test_the_same_person_written_differently_is_not_a_conflict(field, a, b):
    # False conflicts are worse than none: they train people to ignore the
    # warning, and then the real ones get waved through too.
    assert values_agree(field, a, b) is True


@pytest.mark.parametrize("field,a,b", [
    ("last_name", "Reyes", "Reyes-Santos"),
    ("first_name", "Maria", "Mario"),
    ("birth_date", "2010-05-14", "2011-05-14"),
    ("lrn", "136789012345", "136789012346"),  # one digit = a different student
    ("sex", "male", "female"),
])
def test_genuinely_different_values_conflict(field, a, b):
    assert values_agree(field, a, b) is False


def test_normalisation_expands_abbreviations_and_drops_suffixes():
    assert normalize_text("Ma. Cristina") == "maria cristina"
    assert normalize_text("Dela Cruz, Jr.") == "dela cruz"
    assert normalize_text("Peña") == "pena"


def test_ledger_marks_agreement_conflict_and_single_source():
    ledger = reconcile({
        "first_name": [Claim("Maria", "psa_birth_certificate", **BC),
                       Claim("Ma.", "form_137_or_138", **F137)],
        "birth_date": [Claim("2010-05-14", "psa_birth_certificate", **BC),
                       Claim("2011-05-14", "form_137_or_138", **F137)],
        "lrn": [Claim("136789012345", "form_137_or_138", **F137)],
    })
    assert ledger["first_name"].verdict == AGREED
    assert ledger["birth_date"].verdict == CONFLICT
    assert ledger["lrn"].verdict == SINGLE


def test_conflicts_propose_the_authoritative_source_but_keep_both_claims():
    ledger = reconcile({
        "birth_date": [Claim("2011-05-14", "form_137_or_138", **F137),
                       Claim("2010-05-14", "psa_birth_certificate", **BC)],
    })
    entry = ledger["birth_date"]
    # A civil registry document outranks a school record on date of birth,
    # regardless of which was scanned first.
    assert entry.proposed == "2010-05-14"
    assert entry.proposed_source == "PSA Birth Certificate"
    assert len(entry.claims) == 2  # nothing is discarded


def test_lrn_authority_is_the_permanent_record_not_the_birth_certificate():
    ledger = reconcile({
        "lrn": [Claim("136789012345", "psa_birth_certificate", **BC),
                Claim("136789012399", "form_137_or_138", **F137)],
    })
    assert ledger["lrn"].proposed == "136789012399"


def test_empty_claims_never_enter_the_ledger():
    assert reconcile({"first_name": [Claim("", "x", source_label="X")]}) == {}


# ─────────────────────────────────────────────────────────────────────────
# Fallback escalation
# ─────────────────────────────────────────────────────────────────────────

def test_a_good_local_pass_does_not_call_the_cloud():
    page = doc(block("x", 0, 0, 10, 10, conf=0.95))
    fields = {"first_name": "A", "middle_name": "B", "last_name": "C",
              "sex": "male", "birth_date": "2010-01-01", "religion": "R",
              "previous_school_name": "S", "previous_school_address": "T",
              "lrn": "136789012345"}
    assert _should_fallback(fields, FAMILY_BIRTH_CERTIFICATE, page, True) is None


def test_a_thin_local_pass_escalates():
    page = doc(block("x", 0, 0, 10, 10, conf=0.95))
    assert _should_fallback({}, FAMILY_BIRTH_CERTIFICATE, page, True) is not None


def test_low_recognition_confidence_escalates():
    page = doc(block("x", 0, 0, 10, 10, conf=0.20))
    full = {n: "v" for n in ("first_name", "middle_name", "last_name", "sex",
                             "birth_date", "religion")}
    assert "confidence" in _should_fallback(full, FAMILY_BIRTH_CERTIFICATE, page, True)


def test_the_wrong_document_escalates():
    page = doc(block("x", 0, 0, 10, 10, conf=0.95))
    full = {n: "v" for n in ("first_name", "middle_name", "last_name", "sex",
                             "birth_date", "religion")}
    assert _should_fallback(full, FAMILY_BIRTH_CERTIFICATE, page, False) is not None


# ─────────────────────────────────────────────────────────────────────────
# Cloud fallback — sanitising, without the network
# ─────────────────────────────────────────────────────────────────────────

def test_fallback_sanitiser_drops_blanks_and_whitelists_sex():
    fields, _ = groq_vision.sanitize({
        "first_name": "  Maria  ", "middle_name": "", "last_name": None,
        "sex": "unknown", "confidence": "high",
    })
    assert fields == {"first_name": "Maria"}


def test_fallback_sanitiser_keeps_an_lrn_only_at_twelve_digits():
    fields, _ = groq_vision.sanitize({"lrn": "1367-8901-2345"})
    assert fields["lrn"] == "136789012345"
    assert "lrn" not in groq_vision.sanitize({"lrn": "13678"})[0]


def test_fallback_sanitiser_coerces_unknown_guardian_relationships():
    fields, _ = groq_vision.sanitize({
        "guardians": [{"full_name": "A B", "relationship": "auntie"},
                      {"full_name": "", "relationship": "mother"}],
    })
    assert fields["guardians"] == [{"full_name": "A B", "relationship": "guardian"}]


def test_fallback_reserves_far_fewer_tokens_than_it_used_to():
    # The free tier bills prompt_tokens + max_tokens as *reserved*, so the old
    # 1500 ceiling threw away ~1200 tokens of an 8000/min budget per call for
    # completions that run ~250 tokens.
    assert groq_vision.MAX_TOKENS <= 700


def test_fallback_prompt_is_told_which_document_it_is_looking_at():
    assert "maiden" in groq_vision.prompt_for(FAMILY_BIRTH_CERTIFICATE).lower()
    assert "lrn" in groq_vision.prompt_for(FAMILY_FORM_137).lower()


# ─────────────────────────────────────────────────────────────────────────
# Permissions
# ─────────────────────────────────────────────────────────────────────────

factory = APIRequestFactory()
VIEWS = [OCRScanView, ReconciledLedgerView]


def _user(role):
    return SimpleNamespace(role=role, user_id=1, pk=1, is_authenticated=True)


class TestScanPermissions:
    perm = HasRole()

    @pytest.mark.parametrize("view_cls", VIEWS)
    @pytest.mark.parametrize("role", ["super_admin", "admin", "registrar"])
    def test_allowed_roles(self, view_cls, role):
        request = factory.post("/")
        request.user = _user(role)
        assert self.perm.has_permission(request, view_cls) is True

    @pytest.mark.parametrize("view_cls", VIEWS)
    @pytest.mark.parametrize("role", ["teacher", "accounting", "guardian"])
    def test_rejected_roles(self, view_cls, role):
        request = factory.post("/")
        request.user = _user(role)
        assert self.perm.has_permission(request, view_cls) is False

    @pytest.mark.parametrize("view_cls", VIEWS)
    def test_unauthenticated_denied(self, view_cls):
        request = factory.post("/")
        request.user = SimpleNamespace(is_authenticated=False)
        assert self.perm.has_permission(request, view_cls) is False


# ─────────────────────────────────────────────────────────────────────────
# The engine wrapper — the only part that needs paddle
# ─────────────────────────────────────────────────────────────────────────

def test_reader_normalises_both_box_shapes():
    """
    A regression guard with teeth. `rec_boxes` arrives as a numpy int16 array,
    and numpy scalars fail `isinstance(v, int)` — so an element *type* check
    silently routed every axis-aligned box down the polygon path and produced
    zero-area geometry, which made every anchor unresolvable while looking
    like a recognition problem.
    """
    pytest.importorskip("numpy")
    from students.ocr.reader import _to_box
    import numpy as np

    axis_aligned = np.array([13, 31, 93, 42], dtype=np.int16)
    assert _to_box(axis_aligned) == (13.0, 31.0, 93.0, 42.0)

    quad = np.array([[13, 31], [93, 31], [93, 42], [13, 42]], dtype=np.int16)
    assert _to_box(quad) == (13.0, 31.0, 93.0, 42.0)

    assert _to_box(np.array([1, 2, 3], dtype=np.int16)) == (0.0, 0.0, 0.0, 0.0)


def test_preprocessing_shrinks_rather_than_inflates():
    """
    At the previous 2000px/quality-90 this made files *bigger* — 436 KB in,
    605 KB out on the real sample — because the page already sat under the cap
    so nothing downscaled, and it was then re-saved at higher fidelity.
    """
    pytest.importorskip("PIL")
    from io import BytesIO

    from PIL import Image

    from students.image_preprocessing import MAX_DIMENSION, preprocess_for_ocr

    buf = BytesIO()
    Image.new("RGB", (2400, 3200), (200, 190, 180)).save(buf, "JPEG", quality=95)
    out = preprocess_for_ocr(buf.getvalue())
    assert max(Image.open(BytesIO(out)).size) <= MAX_DIMENSION


def test_paddle_reader_is_the_only_module_that_imports_the_engine():
    """
    The layering that keeps everything above the reader testable in CI without
    a 1 GB dependency. If another module starts importing paddle directly,
    this is the test that should fail.
    """
    import pathlib

    ocr_dir = pathlib.Path(__file__).parent / "ocr"
    offenders = [
        path.name
        for path in ocr_dir.glob("*.py")
        if path.name != "reader.py" and "paddleocr" in path.read_text(encoding="utf-8")
    ]
    assert offenders == []
