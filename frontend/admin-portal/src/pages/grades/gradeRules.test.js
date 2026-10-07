import { describe, it, expect } from "vitest";
import { formatGrade, percentageScore, periodsFor, summarizeGrades } from "./gradeRules";

const Q = ["1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"];
const MATH = { subject_id: 1, subject_name: "Mathematics" };
const SCI  = { subject_id: 2, subject_name: "Science" };
const grade = (subject, period, numeric_grade) => ({ subject, grading_period: period, numeric_grade: String(numeric_grade) });
const year = (subject, values) => values.map((v, i) => grade(subject, Q[i], v));

describe("summarizeGrades", () => {
  it("gives a subject a final rating only once every period has a grade", () => {
    const s = summarizeGrades([MATH, SCI], [...year(1, [80, 70, 85, 90]), ...year(2, [88, 86])], Q);

    expect(s.rows[0].final).toBe(81.25);
    expect(s.rows[0].remark).toBe("passed");
    expect(s.rows[1].final).toBeNull();
    expect(s.rows[1].remark).toBeNull();
    expect(s.allFinal).toBe(false);
    expect(s.generalAverage).toBeNull();
  });

  it("counts passed and failed per subject, not per quarter grade", () => {
    // Mathematics fails two quarters but passes the year; Science fails it.
    const s = summarizeGrades([MATH, SCI], [...year(1, [72, 70, 85, 90]), ...year(2, [74, 73, 75, 72])], Q);

    expect(s.passed.map((x) => x.subject_name)).toEqual(["Mathematics"]);
    expect(s.failed.map((x) => x.subject_name)).toEqual(["Science"]);
    expect(s.generalAverage).toBeCloseTo((79.25 + 73.5) / 2);
  });

  it("averages each period over the subjects graded in it, and says how far grading has got", () => {
    const s = summarizeGrades([MATH, SCI], [...year(1, [80, 90]), ...year(2, [70])], Q);

    expect(s.periodAverages).toEqual({ "1st_quarter": 75, "2nd_quarter": 90, "3rd_quarter": null, "4th_quarter": null });
    expect(s.progress.map((p) => p.graded)).toEqual([2, 1, 0, 0]);
  });

  it("takes a senior high semester's one grade as its final rating", () => {
    const periods = periodsFor({ school_level: "senior_highschool", semester: "1st" });
    const s = summarizeGrades([MATH], [grade(1, "1st_semester", 74)], periods);

    expect(periods).toEqual(["1st_semester"]);
    expect(s.rows[0].final).toBe(74);
    expect(s.rows[0].remark).toBe("failed");
  });
});

describe("percentageScore", () => {
  it("is summed scores over summed maximums, as DepEd Order 8 and the server compute it", () => {
    // A mean of per-item percentages would say 70; the 50-point test counts more.
    expect(percentageScore([{ score: "10", max_score: "10" }, { score: "20", max_score: "50" }])).toBeCloseTo(50);
  });

  it("is null, not zero, with nothing encoded", () => {
    expect(percentageScore([])).toBeNull();
  });
});

describe("formatGrade", () => {
  it("drops the decimals of a whole grade and keeps two otherwise", () => {
    expect(formatGrade("86.00")).toBe("86");
    expect(formatGrade(81.2)).toBe("81.20");
    expect(formatGrade(null)).toBe("—");
  });
});
