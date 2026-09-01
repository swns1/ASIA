import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import RiskTable from "./RiskTable";
import RiskChart from "./RiskCharts";
import {
  buildRiskCSV,
  chartBlurb,
  confidenceFor,
  formatAttendance,
  formatDelta,
  formatGrade,
  riskLevelMeta,
  viewUsesBands,
} from "./riskVocabulary";

// The page's whole purpose is that a non-technical reader can act on it, so
// these tests are mostly about what the words say — that a band renders as
// "Needs urgent help" rather than "critical", that the columns show the real
// grade rather than the inverted risk contribution, and that a student with no
// recorded data sorts last instead of to the top of the follow-up list.

function row(overrides = {}) {
  return {
    student_id: 1,
    enrollment_id: 10,
    student_name: "Dela Cruz, Ana",
    student_number: "SEED-0001",
    grade_level: "Grade 4",
    section: "Sampaguita",
    risk_score: 82.4,
    risk_level: "critical",
    average_grade: 72.5,
    attendance_rate: 0.86,
    grade_delta: -6.2,
    failing_subject_count: 2,
    signals_present: 4,
    reasons: [
      { code: "failing_subjects", text: "Failing 2 subjects — Math 68, Science 72", severity: "high" },
      { code: "chronic_absence", text: "Missed 14% of school days (25 of 180 days)", severity: "high" },
      { code: "grades_dropping", text: "Average dropped 6.2 points since the 1st quarter", severity: "medium" },
    ],
    ...overrides,
  };
}

function runWith(scores) {
  const by_level = { low: 0, moderate: 0, high: 0, critical: 0 };
  scores.forEach((s) => {
    by_level[s.risk_level] += 1;
  });
  return {
    run_id: 1,
    school_year: "2025-2026",
    grading_period: "1st_quarter",
    student_count: scores.length,
    scores,
    summary: {
      by_level,
      flagged_count: by_level.high + by_level.critical,
      by_grade_level: [
        { name: "Grade 4", total: scores.length, flagged: by_level.high + by_level.critical, by_level },
      ],
      by_section: [
        { name: "Sampaguita", total: scores.length, flagged: by_level.high + by_level.critical, by_level },
      ],
      by_reason: [
        { code: "failing_subjects", count: 2 },
        { code: "chronic_absence", count: 1 },
      ],
    },
  };
}

describe("riskVocabulary", () => {
  it("never shows the stored enum to a reader", () => {
    expect(riskLevelMeta("low").label).toBe("On track");
    expect(riskLevelMeta("moderate").label).toBe("Watch");
    expect(riskLevelMeta("high").label).toBe("Needs attention");
    expect(riskLevelMeta("critical").label).toBe("Needs urgent help");
  });

  it("falls back readably for an unknown level", () => {
    expect(riskLevelMeta("wat").label).toBe("Unknown");
    expect(riskLevelMeta(undefined).label).toBe("Unknown");
  });

  it("renders an em dash rather than null for missing figures", () => {
    expect(formatGrade(null)).toBe("—");
    expect(formatAttendance(null)).toBe("—");
    expect(formatDelta(null)).toBe("—");
  });

  it("formats the real figures, not risk contributions", () => {
    expect(formatGrade(88.25)).toBe("88.3");
    expect(formatAttendance(0.864)).toBe("86%");
    expect(formatDelta(-6.2)).toBe("−6.2");
    expect(formatDelta(3)).toBe("+3.0");
    expect(formatDelta(0.01)).toBe("no change");
  });

  it("reports how much of the picture a score was built from", () => {
    expect(confidenceFor(4).key).toBe("complete");
    expect(confidenceFor(2).key).toBe("partial");
    expect(confidenceFor(1).key).toBe("limited");
    expect(confidenceFor(0).key).toBe("limited");
  });

  it("only offers a band legend on the charts that draw bands", () => {
    expect(viewUsesBands("mix")).toBe(true);
    expect(viewUsesBands("map")).toBe(true);
    expect(viewUsesBands("reasons")).toBe(false);
    expect(viewUsesBands("grades")).toBe(false);
  });

  it("describes every chart it offers", () => {
    ["mix", "grade_level", "section", "reasons", "grades", "map"].forEach((view) => {
      expect(chartBlurb(view)).not.toBe("");
    });
  });
});

describe("CSV export", () => {
  it("exports the plain-language values, not the internal components", () => {
    const csv = buildRiskCSV([row()]);
    const [header, body] = csv.split("\r\n");

    expect(header).toContain("Status");
    expect(header).toContain("Why flagged");
    expect(header).not.toContain("component");

    expect(body).toContain("Needs urgent help");
    expect(body).toContain("72.5");
    expect(body).toContain("86%");
    expect(body).toContain("Failing 2 subjects");
  });

  it("quotes fields containing commas so the columns stay aligned", () => {
    const csv = buildRiskCSV([row()]);
    // "Dela Cruz, Ana" must survive as one field.
    expect(csv).toContain('"Dela Cruz, Ana"');
  });

  it("leaves missing figures blank rather than writing null", () => {
    const csv = buildRiskCSV([row({ average_grade: null, attendance_rate: null, grade_delta: null })]);
    expect(csv).not.toContain("null");
  });
});

describe("RiskTable", () => {
  it("shows the real grade and attendance under headers that name them", () => {
    render(<RiskTable run={runWith([row()])} />);

    const header = screen.getByRole("row", { name: /student/i });
    expect(within(header).getByText("Average")).toBeTruthy();
    expect(within(header).getByText("Attendance")).toBeTruthy();

    // 72.5 is the actual average — the old table showed 100 - grade here.
    expect(screen.getByText("72.5")).toBeTruthy();
    expect(screen.getByText("86%")).toBeTruthy();
  });

  it("explains why each student is flagged", () => {
    render(<RiskTable run={runWith([row()])} />);
    expect(screen.getByText(/Failing 2 subjects/)).toBeTruthy();
    expect(screen.getByText(/Missed 14% of school days/)).toBeTruthy();
  });

  it("collapses extra reasons behind a control rather than truncating them", () => {
    render(<RiskTable run={runWith([row()])} />);
    expect(screen.queryByText(/Average dropped 6.2 points/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "+1 more" }));
    expect(screen.getByText(/Average dropped 6.2 points/)).toBeTruthy();
  });

  it("defaults to the students who actually need following up", () => {
    const run = runWith([row(), row({ student_id: 2, student_name: "Reyes, Bea", risk_level: "low" })]);
    render(<RiskTable run={run} />);

    expect(screen.getByText("Dela Cruz, Ana")).toBeTruthy();
    expect(screen.queryByText("Reyes, Bea")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Everyone/ }));
    expect(screen.getByText("Reyes, Bea")).toBeTruthy();
  });

  it("says so plainly when nobody needs following up", () => {
    render(<RiskTable run={runWith([row({ risk_level: "low" })])} />);
    expect(screen.getByText("Nobody needs following up")).toBeTruthy();
  });

  it("sorts students with no recorded data last in both directions", () => {
    const run = runWith([
      row({ student_id: 1, student_name: "Aquino, Ana", average_grade: 91 }),
      row({ student_id: 2, student_name: "Bautista, Ben", average_grade: null }),
      row({ student_id: 3, student_name: "Cruz, Cara", average_grade: 68 }),
    ]);
    const { container } = render(<RiskTable run={run} />);

    // Read the name cell itself rather than the row's text: the row also
    // contains the avatar initials, which would prefix every name.
    const names = () =>
      Array.from(container.querySelectorAll("tbody tr")).map(
        (tr) => tr.querySelector("td span.font-semibold").textContent.split(",")[0]
      );

    fireEvent.click(screen.getByRole("button", { name: /Average/ }));
    expect(names().at(-1)).toBe("Bautista");

    // Flipping the direction must not float the missing value to the top:
    // a blank is absent, not "the smallest".
    fireEvent.click(screen.getByRole("button", { name: /Average/ }));
    expect(names().at(-1)).toBe("Bautista");
  });

  it("names an unidentified student rather than rendering a blank row", () => {
    render(<RiskTable run={runWith([row({ student_name: null, student_number: null })])} />);
    expect(screen.getByText("Student #1")).toBeTruthy();
  });

  it("hands the whole row back on select, so the detail panel has the reasons", () => {
    const onSelect = vi.fn();
    render(<RiskTable run={runWith([row()])} onSelectStudent={onSelect} />);
    fireEvent.click(screen.getByText("Dela Cruz, Ana"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ student_id: 1 }));
  });

  it("filters by search across name, number and section", () => {
    const run = runWith([
      row(),
      row({ student_id: 2, student_name: "Reyes, Bea", section: "Rosal", student_number: "SEED-0002" }),
    ]);
    render(<RiskTable run={run} />);

    fireEvent.change(screen.getByLabelText("Search students"), { target: { value: "rosal" } });
    expect(screen.getByText("Reyes, Bea")).toBeTruthy();
    expect(screen.queryByText("Dela Cruz, Ana")).toBeNull();
  });
});

describe("RiskChart", () => {
  const run = runWith([row(), row({ student_id: 2, student_name: "Reyes, Bea", risk_level: "low", average_grade: 91 })]);

  it.each(["mix", "grade_level", "section", "reasons", "grades", "map"])(
    "renders the %s view without crashing",
    (view) => {
      const { container } = render(<RiskChart view={view} run={run} />);
      expect(container.querySelector("svg")).toBeTruthy();
    }
  );

  it("says what is missing rather than drawing an empty chart", () => {
    const empty = runWith([row({ average_grade: null, attendance_rate: null })]);
    render(<RiskChart view="map" run={empty} />);
    expect(screen.getByText(/needs both grades and attendance/i)).toBeTruthy();
  });

  it("opens a student from the grades-vs-attendance map", () => {
    const onSelect = vi.fn();
    const { container } = render(<RiskChart view="map" run={run} onSelectStudent={onSelect} />);
    const hitTargets = container.querySelectorAll('circle[fill="transparent"]');
    expect(hitTargets.length).toBe(2);
    fireEvent.click(hitTargets[0]);
    expect(onSelect).toHaveBeenCalled();
  });

  it("marks the passing line on the grade spread", () => {
    render(<RiskChart view="grades" run={run} />);
    expect(screen.getByText("Passing mark (75)")).toBeTruthy();
  });

  it("leaves the thin-data reason out of the why-flagged chart", () => {
    // "Not enough records yet" is a caveat about the data, not a reason to
    // intervene, so it must not compete for space with the real drivers.
    const withNoise = runWith([row()]);
    withNoise.summary.by_reason = [
      { code: "limited_data", count: 9 },
      { code: "failing_subjects", count: 2 },
    ];
    render(<RiskChart view="reasons" run={withNoise} />);
    expect(screen.queryByText("Not enough records yet")).toBeNull();
    expect(screen.getByText("Failing one or more subjects")).toBeTruthy();
  });
});
