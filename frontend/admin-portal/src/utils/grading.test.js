/**
 * Tests for utils/grading.js — the DepEd period and attendance mapping behind
 * every printed report card and permanent record.
 *
 * The defect these exist for: Nursery and Kindergarten declared a grading
 * period literally named "annual". No such period exists — the backend's
 * Grade.GRADING_PERIOD_CHOICES has only the four quarters and two semesters,
 * so nothing could ever be stored under it, and both screens where a teacher
 * enters an early-years grade write quarters.
 *
 * The only consumers of LEVEL_CONFIG are the SF9 and SF10 print pages, which
 * do `cfg.periods.map(p => sg[p] ?? null)`. `sg["annual"]` was always
 * undefined, so every subject row, the Final column and the General Average
 * printed as an em dash on a Kindergarten report card even with all four
 * quarters encoded — and nothing failed, which is why it survived.
 *
 * VALID_PERIODS below is a deliberate copy of the backend enum rather than an
 * import (there is no shared schema between the two). The first test exists to
 * make that copy load-bearing: if the two ever diverge again, it fails here
 * rather than on a printed form.
 */
import { describe, it, expect } from "vitest";

import { LEVEL_CONFIG, levelConfig, attIndex, GRADE_ORDER } from "./grading";

// backend/enrollment-service/grades/models.py :: Grade.GRADING_PERIOD_CHOICES
const VALID_PERIODS = [
  "1st_quarter",
  "2nd_quarter",
  "3rd_quarter",
  "4th_quarter",
  "1st_semester",
  "2nd_semester",
];

// backend/enrollment-service/enrollments/models.py :: SCHOOL_LEVEL_CHOICES
const SCHOOL_LEVELS = [
  "nursery",
  "kindergarten",
  "elementary",
  "junior_highschool",
  "senior_highschool",
];

describe("LEVEL_CONFIG", () => {
  it("only names grading periods the backend can actually store", () => {
    // The regression, stated directly. "annual" was not a typo — it was a
    // period that never existed on either side.
    for (const [level, cfg] of Object.entries(LEVEL_CONFIG)) {
      for (const period of cfg.periods) {
        expect(VALID_PERIODS, `${level} declares an unstorable period`).toContain(period);
      }
    }
  });

  it("covers every school level an enrollment can carry", () => {
    // levelConfig() falls back to elementary for an unknown key, so a missing
    // level is silent rather than loud.
    for (const level of SCHOOL_LEVELS) {
      expect(Object.keys(LEVEL_CONFIG)).toContain(level);
    }
  });

  it("gives each level as many column headings as it has periods", () => {
    for (const [level, cfg] of Object.entries(LEVEL_CONFIG)) {
      expect(cfg.cols.length, `${level} headings do not match its periods`)
        .toBe(cfg.periods.length);
    }
  });

  it("grades the early years on the same four quarters teachers enter", () => {
    for (const level of ["nursery", "kindergarten"]) {
      expect(levelConfig(level).periods).toEqual([
        "1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter",
      ]);
    }
  });

  it("keeps senior high on semesters", () => {
    expect(levelConfig("senior_highschool").periods)
      .toEqual(["1st_semester", "2nd_semester"]);
  });

  it("falls back to the quarterly config for an unrecognised level", () => {
    expect(levelConfig("undeclared").periods).toEqual(LEVEL_CONFIG.elementary.periods);
    expect(levelConfig(undefined).periods).toEqual(LEVEL_CONFIG.elementary.periods);
  });
});

describe("attIndex", () => {
  // vitest.config.js pins TZ to Asia/Manila precisely so date-only strings
  // behave here the way they do for the school.
  it("puts the opening months of the school year in the first quarter", () => {
    // The regression: the school year runs June-March, but this mapped Q1 to
    // Aug-Oct and swept June and July into the FINAL bucket via its default
    // return — filing the first two months of the year as fourth-quarter
    // attendance on the permanent record.
    expect(attIndex("2025-06-15", "quarterly")).toBe(0);
    expect(attIndex("2025-07-15", "quarterly")).toBe(0);
  });

  it("maps each quarter to its own three-month block", () => {
    const cases = [
      ["2025-06-02", 0], ["2025-08-29", 0],
      ["2025-09-01", 1], ["2025-11-28", 1],
      ["2025-12-01", 2], ["2026-01-30", 2],
      ["2026-02-02", 3], ["2026-03-31", 3],
    ];
    for (const [day, expected] of cases) {
      expect(attIndex(day, "quarterly"), day).toBe(expected);
    }
  });

  it("splits a semester year at the same June-March boundary", () => {
    expect(attIndex("2025-06-15", "semester")).toBe(0);
    expect(attIndex("2025-10-15", "semester")).toBe(0);
    expect(attIndex("2025-11-15", "semester")).toBe(1);
    expect(attIndex("2026-03-15", "semester")).toBe(1);
  });

  it("returns an index inside the column range for every month", () => {
    // The guard against another silent fall-through: whatever the month, the
    // result has to be a real column on the form.
    for (let month = 1; month <= 12; month += 1) {
      const day = `2025-${String(month).padStart(2, "0")}-15`;
      expect(attIndex(day, "quarterly")).toBeGreaterThanOrEqual(0);
      expect(attIndex(day, "quarterly")).toBeLessThan(4);
      expect(attIndex(day, "semester")).toBeGreaterThanOrEqual(0);
      expect(attIndex(day, "semester")).toBeLessThan(2);
    }
  });
});

describe("GRADE_ORDER", () => {
  it("runs the full ladder from Nursery to Grade 12", () => {
    expect(GRADE_ORDER[0]).toBe("Nursery");
    expect(GRADE_ORDER[GRADE_ORDER.length - 1]).toBe("Grade 12");
    expect(GRADE_ORDER).toHaveLength(14);
    expect(new Set(GRADE_ORDER).size).toBe(GRADE_ORDER.length);
  });
});
