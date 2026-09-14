/**
 * The student wizard's step list.
 *
 * "documents" used to lead this list. It existed so OCR could extract a birth
 * certificate and prefill the fields below it; extraction was retired (see
 * backend students/ocr/policy.py), which left a step that collected files
 * against a student who did not exist yet, showed a false "Needs a second
 * look" on every scan, and swallowed upload failures into a console warning
 * while telling the user the student had been created.
 *
 * Documents now live on the enrollment and on /requirements, both through
 * RequirementDocumentsPanel. This pins the step list so the wizard cannot
 * quietly grow the step back, and so the step indices `validate()` returns
 * stay in range.
 */
import { describe, it, expect } from "vitest";
import { STEPS } from "./formShapes";

describe("student wizard steps", () => {
  it("no longer collects documents", () => {
    expect(STEPS.map((s) => s.id)).not.toContain("documents");
  });

  it("is the six steps the form renders", () => {
    expect(STEPS.map((s) => s.id)).toEqual([
      "student", "household", "guardians", "siblings", "schools", "review",
    ]);
  });

  it("gives every step an id, a label and an icon", () => {
    for (const step of STEPS) {
      expect(step.id).toBeTruthy();
      expect(step.label).toBeTruthy();
      expect(step.icon).toMatch(/^ti-/);
    }
  });
});
