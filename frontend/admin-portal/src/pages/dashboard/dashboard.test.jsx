import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  AttendanceBand,
  CollectionsBand,
  LevelBand,
  PipelineBand,
  RiskBand,
} from "./DashboardBands";

// These fixtures are the actual responses captured from the live database
// while building the endpoint — not invented shapes. A band that renders here
// renders against the real contract, including the awkward parts of it: a
// pipeline with a zero stage, an attendance series with holiday gaps, and a
// collections series only one month long.
const PIPELINE = { pending: 0, enrolled: 47, completed: 27, exited: 0, total: 74 };

const LEVELS = [
  { level: "nursery", label: "Nursery", count: 4 },
  { level: "kindergarten", label: "Kindergarten", count: 5 },
  { level: "elementary", label: "Elementary", count: 14 },
  { level: "junior_highschool", label: "Junior High", count: 14 },
  { level: "senior_highschool", label: "Senior High", count: 10 },
];

const RISK = {
  run_id: 10,
  computed_at: "2026-07-20T04:11:00Z",
  bands: { low: 6, moderate: 2, high: 1, critical: 5 },
  flagged: 6,
  total: 14,
};

const ATTENDANCE = [
  { week: "2026-06-08", present: 29, absent: 5, late: 1, excused: 1, total: 36, rate: 0.8286 },
  { week: "2026-06-15", present: 47, absent: 11, late: 2, excused: 0, total: 60, rate: 0.7833 },
  { week: "2026-06-22", present: 0, absent: 0, late: 0, excused: 0, total: 0, rate: null },
  { week: "2026-06-29", present: 0, absent: 0, late: 0, excused: 0, total: 0, rate: null },
  { week: "2026-07-06", present: 2, absent: 0, late: 0, excused: 1, total: 3, rate: 1.0 },
];

const FINANCIAL = {
  net_billed: "19500.00",
  total_collected: "11000.00",
  outstanding: "8500.00",
  collections_series: [{ month: "2026-05", collected: "11000.00", cumulative: "11000.00" }],
};

describe("PipelineBand", () => {
  it("renders each stage with its count", () => {
    render(<PipelineBand pipeline={PIPELINE} loading={false} schoolYear="2025-2026" />);
    // Deliberately getAllByText: a wide segment is direct-labelled AND listed
    // in the legend, so identity never rests on hue alone.
    expect(screen.getAllByText("Enrolled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("47").length).toBeGreaterThan(0);
  });

  it("still lists a stage that is currently zero", () => {
    // Pending is 0 in this run. The legend must still name it, or the reader
    // cannot tell "no pending applications" from "pending isn't tracked".
    render(<PipelineBand pipeline={PIPELINE} loading={false} schoolYear="2025-2026" />);
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

  it("shows a skeleton while loading rather than an empty chart", () => {
    const { container } = render(<PipelineBand loading schoolYear="2025-2026" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("reports an empty pipeline instead of drawing a zero-width bar", () => {
    render(
      <PipelineBand
        pipeline={{ pending: 0, enrolled: 0, completed: 0, exited: 0, total: 0 }}
        loading={false}
        schoolYear="2025-2026"
      />
    );
    expect(screen.getByText(/No enrolments recorded/i)).toBeTruthy();
  });
});

describe("LevelBand", () => {
  it("renders every school level", () => {
    render(<LevelBand levels={LEVELS} loading={false} />);
    for (const l of LEVELS) expect(screen.getByText(l.label)).toBeTruthy();
  });

  it("captions the total across levels", () => {
    render(<LevelBand levels={LEVELS} loading={false} />);
    expect(screen.getByText(/47 students enrolled/i)).toBeTruthy();
  });
});

describe("RiskBand", () => {
  it("uses school English, never the model's own band names", () => {
    // The backend stores low/moderate/high/critical. Staff must never read
    // those words — riskVocabulary is the single translation point.
    render(<RiskBand risk={RISK} loading={false} />);
    expect(screen.getAllByText("Needs urgent help").length).toBeGreaterThan(0);
    expect(screen.getAllByText("On track").length).toBeGreaterThan(0);
    expect(screen.queryByText("critical")).toBeNull();
    expect(screen.queryByText("moderate")).toBeNull();
  });

  it("leads with how many students need following up", () => {
    render(<RiskBand risk={RISK} loading={false} />);
    expect(screen.getByText(/6 of 14 students need following up/i)).toBeTruthy();
  });

  it("pairs every band with an icon, never colour alone", () => {
    // Two of the reserved status steps sit under 3:1 by design, so hue can
    // never be the only thing carrying the meaning.
    const { container } = render(<RiskBand risk={RISK} loading={false} />);
    expect(container.querySelectorAll("i.ti").length).toBeGreaterThanOrEqual(4);
  });

  it("explains itself when no assessment has been run", () => {
    render(<RiskBand risk={{ bands: {}, flagged: 0, total: 0 }} loading={false} />);
    expect(screen.getByText(/No risk assessment has been run/i)).toBeTruthy();
  });
});

describe("AttendanceBand", () => {
  it("plots the weekly rate against the target", () => {
    render(<AttendanceBand series={ATTENDANCE} loading={false} />);
    expect(screen.getByRole("img", { name: /weekly attendance rate/i })).toBeTruthy();
    expect(screen.getByText("90% target")).toBeTruthy();
  });

  it("reports the latest measured week, skipping the closed ones", () => {
    // The series ends 06-22, 06-29 (null), then 07-06 at 100%. The caption
    // must read the last MEASURED week, not the last row.
    render(<AttendanceBand series={ATTENDANCE} loading={false} />);
    expect(screen.getByText(/Latest week 100%/i)).toBeTruthy();
  });

  it("says excused absences are excluded, since the number is otherwise unexplainable", () => {
    render(<AttendanceBand series={ATTENDANCE} loading={false} />);
    expect(screen.getByText(/Excused absences are not counted/i)).toBeTruthy();
  });

  it("shows an empty state when a period has no records at all", () => {
    render(<AttendanceBand series={[]} loading={false} />);
    expect(screen.getByText(/No attendance has been recorded/i)).toBeTruthy();
  });
});

describe("CollectionsBand", () => {
  it("charts collections against what was billed", () => {
    render(<CollectionsBand summary={FINANCIAL} loading={false} />);
    expect(screen.getByRole("img", { name: /collections by month/i })).toBeTruthy();
    expect(screen.getByText(/₱11,000 collected of ₱19,500 billed/i)).toBeTruthy();
  });

  it("labels both series, since two lines share one axis", () => {
    render(<CollectionsBand summary={FINANCIAL} loading={false} />);
    expect(screen.getByText("Collected to date")).toBeTruthy();
    expect(screen.getByText("Collected that month")).toBeTruthy();
  });

  it("exposes the collected-against-billed meter", () => {
    render(<CollectionsBand summary={FINANCIAL} loading={false} />);
    const meter = screen.getByRole("progressbar");
    expect(meter.getAttribute("aria-valuenow")).toBe("56");
  });

  it("honours the hide-amounts toggle", () => {
    const { container } = render(
      <CollectionsBand summary={FINANCIAL} loading={false} showAmounts={false} />
    );
    expect(container.innerHTML).toContain("blur(8px)");
  });
});
