/**
 * enrollmentReadiness — the enrollment form's "Before you submit" checklist.
 *
 * The checklist is display only, but it must agree with the page's own
 * validationError gate: an item may only read "done" when that gate would not
 * block on it. Each case below is one of validationError's conditions.
 */
import { describe, it, expect } from "vitest";
import { readinessChecks, canSwitchToPending } from "./enrollmentReadiness";

const STUDENT = { student_id: 9, first_name: "Ana", last_name: "Cruz" };
const FORM = {
  school_year: "2026-2027",
  school_level: "elementary",
  grade_level: "Grade 4",
  section: "Rizal",
  strand: "",
  semester: "",
  enrollment_status: "enrolled",
};
const RETURNING = {
  is_new_student: false,
  admin_override_required: false,
  blocking_reasons: [],
  documents_assessed: true,
  missing_docs: [],
};

function checks(overrides = {}) {
  return readinessChecks({
    isEdit: false,
    student: STUDENT,
    form: FORM,
    isSHS: false,
    eligibility: RETURNING,
    eligibilityLoading: false,
    overrideMode: false,
    overrideReason: "",
    nextAllowedGrade: "Grade 4",
    studentLastGrade: "Grade 3",
    isTransferIn: false,
    transferInDate: "2026-09-25",
    transferInSchoolName: "",
    transferInSchoolAddress: "",
    gradePlacementChanged: false,
    gradePlacementReason: "",
    ...overrides,
  });
}
const byId = (list, id) => list.find((c) => c.id === id);

describe("readinessChecks", () => {
  it("is all done for a clean returning student", () => {
    const list = checks();
    expect(list.map((c) => c.id)).toEqual(["student", "grade", "placement", "docs"]);
    expect(list.every((c) => c.state === "ok")).toBe(true);
    expect(byId(list, "grade").detail).toBe("Grade 3 → Grade 4");
  });

  it("asks for a student before anything else is judged", () => {
    const list = checks({ student: null, eligibility: null });
    expect(byId(list, "student").state).toBe("todo");
    expect(byId(list, "grade")).toBeUndefined();
    expect(byId(list, "docs")).toBeUndefined();
  });

  it("flags an empty section, then Senior High semester and strand", () => {
    expect(byId(checks({ form: { ...FORM, section: "  " } }), "placement").state).toBe("todo");
    const shs = { ...FORM, school_level: "senior_highschool", grade_level: "Grade 11" };
    expect(byId(checks({ isSHS: true, form: { ...shs, semester: "" } }), "placement").title).toBe("Pick a semester");
    expect(byId(checks({ isSHS: true, form: { ...shs, semester: "1st" } }), "placement").title).toBe("Pick a strand");
    expect(byId(checks({ isSHS: true, form: { ...shs, semester: "1st", strand: "STEM" } }), "placement").state).toBe("ok");
  });

  // Missing documents only block "enrolled" (validationError and the server
  // gate agree on this), so they are a warning there and a note elsewhere.
  it("warns about missing documents only when the status is Enrolled", () => {
    const eligibility = { ...RETURNING, missing_docs: [{ requirement_type_id: 1, requirement_name: "Form 138" }] };
    expect(byId(checks({ eligibility }), "docs").state).toBe("warn");
    const pending = checks({ eligibility, form: { ...FORM, enrollment_status: "pending" } });
    expect(byId(pending, "docs").state).toBe("info");
    expect(byId(pending, "docs").detail).toMatch(/Fine for Pending/);
  });

  it("never reports unassessed documents as complete", () => {
    const list = checks({ eligibility: { ...RETURNING, documents_assessed: false } });
    expect(byId(list, "docs").state).toBe("info");
  });

  it("blocks on failed subjects until an override with a reason", () => {
    const blocked = { ...RETURNING, admin_override_required: true, blocking_reasons: ["Math: failed"] };
    expect(byId(checks({ eligibility: blocked }), "grade").state).toBe("block");
    expect(byId(checks({ eligibility: blocked, overrideMode: true }), "grade").state).toBe("warn");
    expect(byId(checks({ eligibility: blocked, overrideMode: true, overrideReason: "Approved" }), "grade").state).toBe("ok");
  });

  it("warns when the grade differs from the next allowed one", () => {
    const list = checks({ form: { ...FORM, grade_level: "Grade 5" } });
    expect(byId(list, "grade").state).toBe("warn");
    expect(byId(list, "grade").title).toBe("Must enroll in Grade 4");
  });

  it("treats a new student as eligible for any grade", () => {
    const list = checks({ eligibility: { ...RETURNING, is_new_student: true }, nextAllowedGrade: null, studentLastGrade: null });
    expect(byId(list, "grade").title).toBe("New student");
  });

  it("shows a loading item while eligibility is fetched", () => {
    const list = checks({ eligibilityLoading: true });
    expect(byId(list, "grade").state).toBe("loading");
    expect(byId(list, "docs")).toBeUndefined();
  });

  it("requires all three transfer-in details", () => {
    expect(byId(checks({ isTransferIn: true }), "transfer").state).toBe("todo");
    const done = checks({ isTransferIn: true, transferInSchoolName: "Iloilo NHS", transferInSchoolAddress: "Iloilo City" });
    expect(byId(done, "transfer").state).toBe("ok");
  });

  it("on an edit, asks for a reason only when placement changed", () => {
    const base = { isEdit: true, eligibility: null };
    expect(byId(checks(base), "placement-reason")).toBeUndefined();
    expect(byId(checks({ ...base, gradePlacementChanged: true }), "placement-reason").state).toBe("warn");
    expect(byId(checks({ ...base, gradePlacementChanged: true, gradePlacementReason: "Typo" }), "placement-reason").state).toBe("ok");
    // Edits skip the eligibility items, as the page does.
    expect(byId(checks(base), "grade")).toBeUndefined();
  });
});

describe("canSwitchToPending", () => {
  const missing = { ...RETURNING, missing_docs: [{ requirement_type_id: 1, requirement_name: "Form 138" }] };

  it("offers the switch when documents are what stands in the way", () => {
    expect(canSwitchToPending({ isEdit: false, form: FORM, eligibility: missing })).toBe(true);
  });

  it("does not offer it once already Pending, on edits, or with nothing missing", () => {
    expect(canSwitchToPending({ isEdit: false, form: { ...FORM, enrollment_status: "pending" }, eligibility: missing })).toBe(false);
    expect(canSwitchToPending({ isEdit: true, form: FORM, eligibility: missing })).toBe(false);
    expect(canSwitchToPending({ isEdit: false, form: FORM, eligibility: RETURNING })).toBe(false);
    expect(canSwitchToPending({ isEdit: false, form: FORM, eligibility: { ...missing, documents_assessed: false } })).toBe(false);
  });
});
