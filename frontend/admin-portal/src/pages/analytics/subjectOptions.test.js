import { describe, it, expect } from "vitest";
import { subjectOptionLabel } from "./subjectOptions";

const english3 = { subject_name: "English", grade_level: "Grade 3", strand: null, semester: null };
const genMath = { subject_name: "General Mathematics", grade_level: "Grade 11", strand: "ABM", semester: "1st" };

describe("subjectOptionLabel", () => {
  it("names the grade when no grade is picked, so repeated subjects can be told apart", () => {
    expect(subjectOptionLabel(english3, "")).toBe("English — Grade 3");
  });

  it("drops the grade once one is picked", () => {
    expect(subjectOptionLabel(english3, "Grade 3")).toBe("English");
  });

  it("adds senior high's strand and semester, which repeat within a grade", () => {
    expect(subjectOptionLabel(genMath, "")).toBe("General Mathematics — Grade 11 · ABM · 1st sem");
    expect(subjectOptionLabel(genMath, "Grade 11")).toBe("General Mathematics — ABM · 1st sem");
  });
});
