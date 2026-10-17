"""
The school's Admissions Agreement, word for word, for the COR (cor.py).

Two editions, both "2026 Ed." and stamped "RTM, April 6, 2026": one for
Preschool to Junior High School (Nursery, Kindergarten and Grades 1-10) and
one for Senior High School, which enrolls per semester. The text is
transcribed from the school's Word files, with their bold, italics and
underlines as reportlab paragraph markup (<b>, <i>, <u>; a literal & is
&amp;). It is a legal document: a new edition is a change here, not a
setting.

One change from the Word file: 2.1's "NON- TRANSFERABLE" is closed up, as the
Senior High edition has it.
"""
from dataclasses import dataclass

STAMP = "RTM, April 6, 2026"
OPENING = "This is to confirm acceptance of the terms and conditions governing the admission and"
ENROLLMENT_OF = "enrollment of"
AS_FOLLOWS = "at <b>SOUTH LAKES INTEGRATED SCHOOL</b> as follows:"
SIGN_IN_BOX = "Please sign within the box. Your signature must not touch or cross the borders of the box."


@dataclass(frozen=True)
class Heading:
    text: str


@dataclass(frozen=True)
class Clause:
    number: str                 # "2.1"
    text: str


@dataclass(frozen=True)
class Item:
    letter: str                 # "(a)", under a clause
    text: str


@dataclass(frozen=True)
class Note:
    """An unnumbered paragraph in line with the clauses' text."""
    text: str


@dataclass(frozen=True)
class Lead:
    """An unnumbered paragraph in line with the clause numbers."""
    text: str


@dataclass(frozen=True)
class Columns:
    """A two-column table under a clause: (left, right) rows."""
    rows: tuple
    centered_head: bool = False     # the first row's titles centred over their columns


@dataclass(frozen=True)
class Signer:
    caption: str                # "Approved by:"
    title: str                  # printed under the line
    role: str                   # "principal" or "department_head", resolved per level in cor.py


@dataclass(frozen=True)
class Edition:
    key: str
    subtitle: str
    per_semester: bool          # "____ Semester, SY ____" rather than "SY ____"
    level_caption: str          # under the level's blank in the opening
    level_label: str            # under the level's line beside the signatures
    body: tuple
    acceptance: tuple           # paragraphs, all bold
    acceptance_centered: bool
    signers: tuple
    side_margin: float          # inches, the Word file's left and right margins


# The refund reasons, the same in both editions but for (c)'s capital.
def _reasons(recommendation):
    return (
        Item("(a)", "transfer of residence to another province or country;"),
        Item("(b)", "sickness, duly attested by a medical certificate, that prevents the student from attending "
                    "classes in any other school for the rest of the academic school year; and"),
        Item("(c)", recommendation),
        Note("While, the following are <u>NOT</u> considered <i>“justifiable and valid reasons”:</i>"),
        Item("(a)", "voluntary transfer to another school;"),
        Item("(b)", "lack of adjustment to school/or to teachers;"),
        Item("(c)", "misunderstandings; and"),
        Item("(d)", "lack of enthusiasm."),
        Note("It is understood that SLIS shall have the sole option to determine whether or not the reason/s for "
             "withdrawal is/are valid and justifiable."),
    )


PS_JHS_2026 = Edition(
    key="ps_jhs",
    subtitle="(Preschool – Junior High School)",
    per_semester=False,
    level_caption="GRADE/LEVEL",
    level_label="Level",
    side_margin=851 / 1440,
    body=(
        Heading("Section 1. General Provisions"),
        Clause("1.1", "No student is officially enrolled unless he/she has satisfactorily complied with the general "
                      "admission and accounting office requirements of <b>SOUTH LAKES INTEGRATED SCHOOL</b>."),
        Clause("1.2", "Enrollment is on a per school-year basis. Once enrolled, a student is considered enrolled for "
                      "the whole academic year which consists of TEN (10) months beginning on the month specified by "
                      "DepEd as BOSY (Beginning of School Year) until the month specified as EOSY (End of School "
                      "Year)."),
        Clause("1.3", "Credentials submitted upon enrollment shall be deemed part of the school records and "
                      "therefore can no longer be withdrawn after enrollment/registration."),

        Heading("Section 2. Tuition Fee and Other Fees"),
        Clause("2.1", "A reservation fee of ₱1,000.00 shall be required to secure a slot for the academic year. The "
                      "Reservation Fee is absolutely <b>NON-REFUNDABLE and NON-TRANSFERABLE</b> but shall be "
                      "deducted from the Tuition Fee upon enrollment."),
        Clause("2.2", "To be considered as officially enrolled, the Enrollment Fees should be <b>paid in full</b> on "
                      "the payment due dates as specified in the schedule of fees issued by the school."),
        Clause("2.3", "<b>Partial</b> payment of Enrollment Fees will be considered provisional enrollment and a "
                      "<b>surcharge of 10% of the total enrollment fees will be applied.</b> Full payment must be "
                      "made on or before the start of classes, otherwise the enrollment and admission of the student "
                      "shall be considered cancelled. Upon such cancellation, all payment so far made shall be "
                      "forfeited in favor of <b>SLIS</b>. Absolutely no refunds shall be made."),
        Clause("2.4", "<b>“Enrollment Fee”</b> refers to the amount due upon enrollment/registration based on the "
                      "chosen mode of Tuition Fee/Schedule of payment as signed by the Parent/Guardian."),
        Clause("2.5", "Payments of Tuition Fee may be made on an annual, semi-annual, quarterly, and monthly basis. "
                      "An Assessment Slip will be issued upon enrollment indicating the Schedule of Payment with "
                      "corresponding due dates for Semi Annual, Quarterly, and Monthly mode of payments and is "
                      "payable on the indicated due dates without need for demand and or issuance of Statement of "
                      "Account."),

        Heading("Section 3. Discounts on Tuition Fees"),
        Lead("The amount of Tuition Fees is subject to discount, as follows:"),
        Clause("3.1", "Five Percent (5%) discount is applied for annual mode payment."),
        Clause("3.2", "Ten Percent (10%) discount is applied to the lowest basic tuition fee if Three (3) siblings "
                      "are enrolled in <b>SLIS.</b>"),
        Clause("3.3", "Fifteen Percent (15%) discount is applied to the lowest basic tuition fee if Four (4) "
                      "siblings are enrolled in <b>SLIS</b>."),

        Heading("Section 4. Late Enrollees"),
        Clause("4.1", "Preschool students can be admitted up to the month of November only while Grade School "
                      "students can be admitted up to the end of first quarter only or until the month of October."),
        Clause("4.2", "The rate of Tuition Fees for late enrollees shall be as follows:"),
        Columns((
            ("Tuition Fee (Initial)", "See Tuition Fee Schedule"),
            ("Tuition (July to December)", "Proportionate to inclusive number of months of attendance"),
        )),
        Note("Registration and Miscellaneous fees shall be paid in full."),
        Columns((
            ("<u>Nature of Fees</u>", "<u>Percentage of Assessment</u>"),
            ("Registration Fee", "100%"),
            ("Miscellaneous Fee", "100%"),
        )),

        Heading("Section 5. Refunds"),
        Clause("5.1", "Refund of Tuition Fee is subject to the following conditions:"),
        Columns((
            ("<u>Time Line</u>", "<u>Percentage</u>"),
            ("Before the start of classes", "70% tuition fee only"),
            ("Start of classes up to 2nd week (14 days)", "50% tuition fee only"),
            ("Beyond two (2) weeks from the start of the classes", "0% tuition fee only"),
        )),
        Note("The above rules are applied whether or NOT the student/s has/have actually attended classes."),
        Clause("5.2", "Student/s may claim refunds beyond the second week of classes if the withdrawal is due to "
                      "valid and justifiable reasons, in which case, the student/s shall be charged with the "
                      "corresponding Tuition Fee up to and including the last month of attendance in school."),
        Note("If withdrawal is not due to valid and justifiable reasons, the student/s shall be charged with the "
             "corresponding Tuition Fee for the entire school year. NO OFFICIAL CLEARANCE will be released unless "
             "and until all or any portion of the tuition fee and/or back accounts are paid."),
        Clause("5.3", "For the purpose of this provision, <i>“justifiable and valid reasons”</i> are the following:"),
        *_reasons("Recommendation of the principal."),

        Heading("Section 6. Delayed Payments"),
        Clause("6.1", "Those who fail to settle obligations on the due dates will be charged a <b><u>Penalty Fee of "
                      "1.25% per month of delay</u></b> until full payment of the amount due."),
        Clause("6.2", "When a student fails to comply with the required financial obligations on due dates as "
                      "specified on the Schedule of Payments, he/she will not be allowed to take examinations and "
                      "quarterly grades may not be processed thus school credentials may not be released until all "
                      "unpaid accounts/fees are fully settled."),
        Clause("6.3", "The school will only accept cash payments on the last month of classes."),

        Heading("Section 7. Issuance of Bouncing Checks"),
        Clause("7.1", "If payment of Tuition Fee, or any portion thereof, is made by way of check, and the check was "
                      "dishonored by the bank upon presentment for payment/encashment for whatever reason, SLIS "
                      "shall notify the student/parent of such fact. In which case, the student/parent must replace "
                      "the said check with equivalent amount in cash plus a surcharge of <b>₱1,200.00 per check</b> "
                      "plus corresponding penalty fee if there is delay in payment. In addition to the foregoing, "
                      "SLIS shall have the right not to accept checks for future payments."),
        Clause("7.2", "If the bouncing check was issued as payment for official enrollment and no cash replenishment "
                      "has been made, such enrollment shall be deemed automatically cancelled."),

        Heading("Section 8. Outstanding Balance of Tuition and Other Fees"),
        Clause("8.1", "If any portion of the tuition or other school fees remains unpaid at the end of the school "
                      "year, the <b>Report Card/SF9</b> and <b>Student Checklist/Assessment</b> shall not be "
                      "released to the concerned student. A clearance must first be secured from the SLIS Accounting "
                      "Office prior to the release of any such school documents. Furthermore, students with "
                      "unsettled accounts will not be permitted to enroll in the succeeding school year until all "
                      "outstanding financial obligations have been fully settled."),
        Clause("8.2", "The <b>Diploma</b> and <b>Transcript of Records</b> of Senior Kindergarten, Grade 6, and "
                      "Grade 10 students, as well as the <b>Transcript of Records</b> of transferring students, shall "
                      "not be released unless all outstanding financial obligations have been fully settled."),
    ),
    acceptance=(
        "I have read and understood the foregoing terms and conditions of this Admissions Agreement and I agree to "
        "the faithful compliance thereof. My signature binds me, my spouse, my child and/or the authorized "
        "representative/guardian of my child to the terms and conditions as indicated in this Admissions "
        "Agreement.",
    ),
    acceptance_centered=False,
    signers=(Signer("Approved by:", "Principal/School Academic Head", "principal"),),
)


SHS_2026 = Edition(
    key="shs",
    subtitle="(Senior High School)",
    per_semester=True,
    level_caption="LEVEL &amp; STRAND",
    level_label="Level &amp; Strand",
    side_margin=522 / 1440,
    body=(
        Heading("Section 1. General Provisions"),
        Clause("1.1", "No student is officially enrolled unless he/she has satisfactorily complied with the general "
                      "admission and accounting requirements of <b>SOUTH LAKES INTEGRATED SCHOOL</b>."),
        Clause("1.2", "Enrollment is on a per semester basis."),
        Clause("1.3", "Credentials submitted upon enrollment shall be deemed part of the school records and "
                      "therefore can no longer be withdrawn after enrollment/registration."),

        Heading("Section 2. Tuition Fee and Other Fees"),
        Clause("2.1", "A reservation fee of ₱1,000.00 shall be required to secure a slot for the Semester. The "
                      "Reservation Fee is absolutely <b>NON-REFUNDABLE</b> and <b>NON-TRANSFERABLE</b> but shall be "
                      "deducted from the Tuition Fee upon enrollment."),
        Clause("2.2", "To be considered as officially enrolled, the Enrollment Fees should be <b>paid in full</b> on "
                      "the payment due date as specified in the schedule of fees issued by the school."),
        Clause("2.3", "<b>Partial</b> payment of Enrollment Fees will be considered provisional enrollment and "
                      "<b>surcharge of 10% of the total enrollment fees will be applied</b>. Full payment must be "
                      "made on or before the start of classes, otherwise the enrollment and admission of the student "
                      "shall be considered <b>cancelled.</b> Upon such cancellation, all payment so far made shall "
                      "be forfeited in favor of <b>SLIS</b>. Absolutely no refunds shall be made."),
        Clause("2.4", "“<b>Enrollment Fee</b>” refers to the amount due upon enrollment/registration based on the "
                      "chosen mode of Tuition Fee/Schedule of payment as signed by the Parent/Guardian."),
        Clause("2.5", "Payments of Tuition &amp; Miscellaneous Fee may be made on a full installment basis. An "
                      "Assessment Slip will be issued upon enrollment indicating the Schedule of Payment with "
                      "corresponding due dates for installment mode of payment and is payable on the indicated due "
                      "dates without need for demand and or issuance of Statement of Account."),

        Heading("Section 3. Late Enrollees"),
        Clause("3.1", "Students may be admitted as late enrollees up to the end of the first month from the opening "
                      "of classes for both the First and Second Semesters."),
        Clause("3.2", "Admission of late enrollees is subject to slot availability, completion of requirements, and "
                      "the student’s commitment to meet missed academic work. No tuition or fee reduction shall be "
                      "granted for late enrollment."),

        Heading("Section 4. Refunds"),
        Clause("4.1", "In case of cancellation of enrollment or the student opt to withdraw:"),
        Columns((
            ("<b>Timeline</b>", "<b>Percentage</b>"),
            ("Before the start of classes", "70% tuition fee only"),
            ("Start of classes up to 2nd week (14 days)", "50% tuition fee only"),
            ("Beyond two (2) weeks from the start of the classes", "0% tuition fee or refund not applicable"),
        ), centered_head=True),
        Note("The above rules are applied whether or NOT the student/s has/have actually attended classes."),
        Clause("4.2", "Student/s may claim refunds beyond the second week of classes if the withdrawal is due to "
                      "valid justifiable reasons, in which case, the student/s shall be charged with the "
                      "corresponding <b>Tuition Fee</b> up to and including the last month of attendance in "
                      "school."),
        Note("If withdrawal is not due to valid and justifiable reasons, the student/s shall be charged with the "
             "corresponding Tuition Fee for the entire school year. NO OFFICIAL CLEARANCE will be released unless "
             "and until all or any portion of the tuition fee and/or back accounts are paid."),
        Clause("4.3", "For the purpose of this provision, <i>“justifiable and valid reasons”</i> are the following:"),
        *_reasons("recommendation of the principal."),

        Heading("Section 5. Delayed Payments"),
        Clause("5.1", "Those who fail to settle obligations on the due dates will be charged a <b><u>Penalty Fee of "
                      "1.25% per month of delay</u></b> until full payment of the amount due."),
        Clause("5.2", "When a student fails to comply with the required financial obligations on due dates as "
                      "specified on the Schedule of Payments, he/she will not be allowed to take examinations and "
                      "term grades may not be processed thus school credentials may not be released until all "
                      "unpaid accounts/fees are fully settled."),
        Clause("5.3", "The school will only accept <b>cash</b> payments on the last month of classes."),

        Heading("Section 6. Issuance of Bouncing Checks"),
        Clause("6.1", "If payment of Tuition Fee, or any portion thereof, is made by way of check, and the check was "
                      "dishonored by the bank upon presentment for payment/encashment for whatever reason, SLIS "
                      "shall notify the student/parent of such a fact. In which case, the student/parent must "
                      "replace the said check with equivalent amount in cash plus a surcharge fee per checkup plus "
                      "corresponding penalty fee if there is delay in payment. In addition to the foregoing, SLIS "
                      "shall have the right not to accept checks for future Payments."),
        Clause("6.2", "If the bouncing check was issued as payment for official enrollment and no cash replenishment "
                      "has been made, such enrollment shall be deemed automatically <b>cancelled.</b>"),

        Heading("Section 7. Outstanding Balance of Tuition and Other Fees"),
        Clause("7.1", "If any portion of the tuition or other school fees remains unpaid at the end of the semester "
                      "or school year, the <b>Report Card/SF9</b> shall not be released to the concerned student. "
                      "Clearance must first be secured from the SLIS Accounting Office prior to the release of any "
                      "such school documents. Furthermore, students with unsettled accounts will not be permitted to "
                      "enroll in the succeeding semester or school year until all outstanding financial obligations "
                      "have been fully settled."),
        Clause("7.2", "The <b>Diploma</b> and <b>Transcript of Records/SF10</b> of Grade 12 graduating students, as "
                      "well as the <b>Transcript of Records/SF10</b> of transferring students, shall not be released "
                      "unless all outstanding financial obligations have been fully settled."),
    ),
    acceptance=(
        "I have read and understood the foregoing terms and conditions of this Admissions Agreement and I agree to "
        "the faithful compliance thereof.",
        "I acknowledge that it is my responsibility to ensure that my child attends all classes regularly and "
        "performs well academically, including participating in periodic follow-ups with the school.",
        "I also commit to attending Parent-Teacher Conference (PTC) activities and personally claiming my child's "
        "report card at the end of each grading period. By signing this agreement, I am binding myself, my spouse, "
        "my child, and/or the authorized representative/guardian of my child to the terms and conditions as stated "
        "in this Admissions Agreement.",
    ),
    acceptance_centered=True,
    signers=(
        Signer("Noted by:", "SHS Department Head", "department_head"),
        Signer("Approved by:", "Principal/School Academic Head", "principal"),
    ),
)


def edition_for(school_level):
    """Senior High has its own; Nursery and Kindergarten share Grades 1-10's."""
    return SHS_2026 if school_level == "senior_highschool" else PS_JHS_2026
