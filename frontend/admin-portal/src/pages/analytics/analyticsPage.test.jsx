/**
 * AnalyticsPage — that what's on screen is always the answer for what's
 * selected. Every request here is per-selection, and the reader can change
 * the selection (or the student) faster than the server answers, so these
 * tests resolve requests out of order on purpose.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getRiskAssessmentLatest = vi.fn();
const getRiskAssessmentTrend = vi.fn();
const runRiskAssessment = vi.fn();

vi.mock("../../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => ({ role: "registrar" }),
}));
vi.mock("../../api/enrollmentApi", () => ({
  getSubjects: () => Promise.resolve({ results: [] }),
  getAiCluster: () => Promise.resolve(null),
  callGemini: () => Promise.resolve({ interpretation: "" }),
  runRiskAssessment: (...a) => runRiskAssessment(...a),
  getRiskAssessmentLatest: (...a) => getRiskAssessmentLatest(...a),
  getRiskAssessmentTrend: (...a) => getRiskAssessmentTrend(...a),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ options: ["2026-2027"], currentYear: "2026-2027" }),
}));

const { default: AnalyticsPage } = await import("../AnalyticsPage");

// A promise the test settles when it chooses, to put answers out of order.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function score(id, name, level) {
  return {
    student_id: id, student_name: name, risk_level: level, risk_score: 80,
    average_grade: 72, attendance_rate: 0.9, reasons: [], signals_present: 4,
  };
}

function runOf(scores, period = "1st_quarter") {
  const by_level = { low: 0, moderate: 0, high: 0, critical: 0 };
  scores.forEach((s) => (by_level[s.risk_level] += 1));
  return {
    run_id: 1, school_year: "2026-2027", grading_period: period, student_count: scores.length, scores,
    created_at: "2026-09-29T08:00:00Z",
    summary: { by_level, flagged_count: by_level.high + by_level.critical, by_grade_level: [], by_section: [], by_reason: [] },
  };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>
  );

const flush = () => act(() => Promise.resolve());

beforeEach(() => {
  getRiskAssessmentLatest.mockReset();
  getRiskAssessmentTrend.mockReset();
  runRiskAssessment.mockReset();
});

describe("AnalyticsPage", () => {
  it("shows the newest selection's result even when an older answer arrives last", async () => {
    const first = deferred();
    const second = deferred();
    getRiskAssessmentLatest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderPage();

    fireEvent.change(screen.getByLabelText("Grading period"), { target: { value: "2nd_quarter" } });
    await act(async () => second.resolve(runOf([score(1, "Cruz, Ana", "critical")], "2nd_quarter")));
    await act(async () =>
      first.resolve(runOf([score(1, "Cruz, Ana", "critical"), score(2, "Reyes, Bea", "high")]))
    );

    expect(screen.getByText(/Showing 1 student ·/)).toBeTruthy();
    expect(screen.queryByText(/Showing 2 students/)).toBeNull();
  });

  it("drops the last error when the reader moves to another selection", async () => {
    getRiskAssessmentLatest.mockResolvedValue(runOf([score(1, "Cruz, Ana", "critical")]));
    runRiskAssessment.mockRejectedValue({ response: { data: { detail: "No students with grade data found." } } });
    renderPage();
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText("No students with grade data found.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Grading period"), { target: { value: "2nd_quarter" } });
    await flush();
    expect(screen.queryByText("No students with grade data found.")).toBeNull();
  });

  it("never shows one student's history under another's name", async () => {
    getRiskAssessmentLatest.mockResolvedValue(
      runOf([score(1, "Cruz, Ana", "critical"), score(2, "Reyes, Bea", "high")])
    );
    const ana = deferred();
    const bea = deferred();
    getRiskAssessmentTrend.mockReturnValueOnce(ana.promise).mockReturnValueOnce(bea.promise);
    const point = (level) => ({
      run_id: 7, created_at: "2026-09-29T08:00:00Z", grading_period: "1st_quarter", risk_score: 50, risk_level: level,
    });

    renderPage();
    await flush();
    fireEvent.click(screen.getByRole("tab", { name: /Students to follow up/ }));
    const table = await screen.findByRole("table");
    fireEvent.click(within(table).getByText("Cruz, Ana"));
    fireEvent.click(within(table).getByText("Reyes, Bea"));

    // Bea's answer first, then Ana's slower one.
    await act(async () => bea.resolve({ points: [point("high")] }));
    await act(async () => ana.resolve({ points: [point("critical")] }));

    const title = document.querySelector("svg title").textContent;
    expect(title).toBe("Reyes, Bea: Needs attention on " + new Date("2026-09-29T08:00:00Z")
      .toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  });
});
