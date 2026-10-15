/**
 * A teacher's Analytics: their own sections in the picked year. No school
 * level or grade to choose (the server picks the check that covered their
 * section); with several sections, a tile per section narrows the page to
 * one; and a learner's history is asked for that year only.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getMySections = vi.fn();
const getSubjects = vi.fn();
const getRiskAssessmentLatest = vi.fn();
const getRiskAssessmentTrend = vi.fn();

vi.mock("../../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => ({ role: "teacher" }),
}));
vi.mock("../../api/enrollmentApi", () => ({
  getMySections: (...a) => getMySections(...a),
  getSubjects: (...a) => getSubjects(...a),
  getAiCluster: () => Promise.resolve(null),
  callGemini: () => Promise.resolve({ interpretation: "" }),
  runRiskAssessment: vi.fn(),
  getRiskAssessmentLatest: (...a) => getRiskAssessmentLatest(...a),
  getRiskAssessmentTrend: (...a) => getRiskAssessmentTrend(...a),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ options: ["2026-2027", "2025-2026"], currentYear: "2026-2027" }),
}));

const { default: AnalyticsPage } = await import("../AnalyticsPage");

let nextId = 1;
const advisory = (school_year, grade_level, section, student_count = 30) => ({
  advisory: { advisory_id: nextId++, school_year, school_level: "junior_highschool", grade_level, section },
  student_count, students: [],
});

const RUN = {
  run_id: 1, school_year: "2026-2027", grading_period: "1st_quarter", student_count: 1,
  created_at: "2026-09-29T08:00:00Z",
  scores: [{
    student_id: 5, student_name: "Cruz, Ana", risk_level: "high", risk_score: 70,
    average_grade: 74, attendance_rate: 0.9, reasons: [], signals_present: 4,
  }],
  summary: { by_level: { low: 0, moderate: 0, high: 1, critical: 0 }, flagged_count: 1,
    by_grade_level: [], by_section: [], by_reason: [] },
};

const renderPage = () => render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
const flush = () => act(() => Promise.resolve());

describe("AnalyticsPage for a teacher", () => {
  beforeEach(() => {
    [getMySections, getSubjects, getRiskAssessmentLatest, getRiskAssessmentTrend].forEach((f) => f.mockReset());
    getRiskAssessmentLatest.mockResolvedValue(RUN);
    getRiskAssessmentTrend.mockResolvedValue({ points: [] });
  });

  it("shows the teacher's one section as a picked tile, with no level or grade pickers", async () => {
    getMySections.mockResolvedValue([advisory("2026-2027", "Grade 7", "Rizal", 31), advisory("2025-2026", "Grade 6", "Luna")]);
    renderPage();
    await flush();

    const tiles = within(screen.getByRole("group", { name: "Show" })).getAllByRole("button");
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual(["Grade 7 – Rizal, 31 learners"]);
    expect(tiles[0].getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByLabelText("School level")).toBeNull();
    expect(screen.queryByLabelText("Grade level")).toBeNull();
    expect(screen.queryByRole("tab", { name: /Performance groups/ })).toBeNull();
    expect(getSubjects).not.toHaveBeenCalled();
    expect(getRiskAssessmentLatest.mock.lastCall[0]).toMatchObject({ school_year: "2026-2027", advisory_id: undefined });
  });

  it("narrows to one of several sections, and back to all of them", async () => {
    const rizal = advisory("2026-2027", "Grade 7", "Rizal", 31);
    getMySections.mockResolvedValue([rizal, advisory("2026-2027", "Grade 8", "Luna", 29)]);
    renderPage();
    await flush();

    const group = screen.getByRole("group", { name: "Show" });
    const all = within(group).getByRole("button", { name: "All my sections, 60 learners" });
    expect(all.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(group).getByRole("button", { name: "Grade 7 – Rizal, 31 learners" }));
    await flush();
    expect(getRiskAssessmentLatest.mock.lastCall[0]).toMatchObject({ advisory_id: String(rizal.advisory.advisory_id) });
    expect(all.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(all);
    await flush();
    expect(getRiskAssessmentLatest.mock.lastCall[0].advisory_id).toBeUndefined();
  });

  it("asks for a learner's history in the picked year", async () => {
    getMySections.mockResolvedValue([advisory("2026-2027", "Grade 7", "Rizal")]);
    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("tab", { name: /Students to follow up/ }));
    fireEvent.click(within(await screen.findByRole("table")).getByText("Cruz, Ana"));
    await flush();

    expect(getRiskAssessmentTrend).toHaveBeenCalledWith(5, "2026-2027");
  });

  it("says so when the teacher advises no section in the year", async () => {
    getMySections.mockResolvedValue([advisory("2025-2026", "Grade 6", "Luna")]);
    getRiskAssessmentLatest.mockRejectedValue(Object.assign(new Error("nope"), { response: { status: 404 } }));
    renderPage();
    await flush();

    expect(await screen.findByText("You advise no section in 2026-2027")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Show" })).toBeNull();
  });
});
