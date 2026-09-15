import { describe, it, expect } from "vitest";
import { peso, fmtDate, todayISO } from "./format";
import { gradeBand, attendanceBand, GRADE_OUTSTANDING, GRADE_PASSING } from "./grading";

describe("peso", () => {
  it("always shows two decimals", () => {
    expect(peso(8500)).toBe("₱8,500.00");
    expect(peso("8500.5")).toBe("₱8,500.50");
  });

  it("treats an absent amount as zero rather than NaN", () => {
    // Ledger fields arrive as strings and are sometimes omitted entirely.
    expect(peso(null)).toBe("₱0.00");
    expect(peso(undefined)).toBe("₱0.00");
    expect(peso("")).toBe("₱0.00");
  });
});

describe("fmtDate", () => {
  it("formats a short date", () => {
    expect(fmtDate("2026-01-05")).toBe("Jan 5, 2026");
  });

  it("falls back to an em dash by default", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("")).toBe("—");
  });

  it("takes a caller-supplied fallback, for pages that branch on absence", () => {
    // GuardianChildPage composes dates into sentences and wants null so it
    // can substitute its own wording.
    expect(fmtDate(null, null)).toBeNull();
    expect(fmtDate(undefined, "No due date")).toBe("No due date");
  });
});

describe("todayISO", () => {
  it("returns a date-only string, matching the API's date fields", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// These cut-offs were re-encoded in four files. The tests pin the boundaries
// specifically, since an off-by-one at 75 is the difference between a learner
// reading as passing and failing.
describe("grade and attendance bands", () => {
  it("uses the DepEd passing mark and top descriptor band", () => {
    expect(GRADE_PASSING).toBe(75);
    expect(GRADE_OUTSTANDING).toBe(90);
  });

  it.each([
    [95, "success"],
    [90, "success"],
    [89, "info"],
    [75, "info"],
    [74, "error"],
    [0, "error"],
    [null, "muted"],
  ])("bands a grade of %s as %s", (grade, band) => {
    expect(gradeBand(grade)).toBe(band);
  });

  it("warns rather than informs in attendance's middle band", () => {
    // A 75-89 grade is unremarkable; 75-89% attendance is actionable.
    expect(attendanceBand(89)).toBe("warning");
    expect(gradeBand(89)).toBe("info");
  });

  it.each([
    [100, "success"],
    [90, "success"],
    [75, "warning"],
    [74, "error"],
    [null, "muted"],
  ])("bands an attendance rate of %s as %s", (rate, band) => {
    expect(attendanceBand(rate)).toBe(band);
  });
});
