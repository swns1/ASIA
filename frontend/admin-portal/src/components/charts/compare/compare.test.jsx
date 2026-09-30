/**
 * The Compare School Years charts: the axis they share, the learner bridge's
 * arithmetic, and what each chart draws and says from a year's figures.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { clearTokenCache } from "../tokens";
import { bridgeFloor, bridgePairs, bridgeSteps } from "./bridge";
import CollectionChart from "./CollectionChart";
import ColumnPlot from "../ColumnPlot";
import FeesByGradeChart from "./FeesByGradeChart";
import LearnersByLevelChart from "./LearnersByLevelChart";
import { yearRamp } from "./palette";
import { linearAxis, niceStep } from "../scale";

beforeEach(() => {
  clearTokenCache();
});

const source = (byYear) => ({ get: (y) => byYear[y], loading: false, error: null, onRetry: () => {} });

describe("the value axis", () => {
  it("steps by 1, 2, 2.5 or 5 of a power of ten, sized for four intervals", () => {
    expect(niceStep(183.5)).toBe(200);
    expect(niceStep(22.5)).toBe(25);
    expect(niceStep(8750)).toBe(10000);
    expect(linearAxis(0, 734).ticks).toEqual([0, 200, 400, 600, 800]);
  });

  it("starts where it's asked, rounded down to a step", () => {
    expect(linearAxis(85, 100).ticks).toEqual([85, 90, 95, 100]);
    expect(linearAxis(400, 734).ticks).toEqual([400, 500, 600, 700, 800]);
  });

  it("keeps a count on whole numbers", () => {
    expect(linearAxis(0, 10).ticks).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(linearAxis(0, 10, { integer: true }).ticks).toEqual([0, 5, 10]);
    expect(linearAxis(0, 3, { integer: true }).ticks).toEqual([0, 1, 2, 3]);
  });

  it("places a value along it, clamped to its ends", () => {
    const axis = linearAxis(0, 100);
    expect(axis.at(50)).toBe(0.5);
    expect(axis.at(-5)).toBe(0);
    expect(axis.at(150)).toBe(1);
  });
});

describe("the learner bridge", () => {
  const before = { learners: 712, transferred_out: 12, came_back: { count: 606, of: 700 } };

  // Every step starts where the one before it ended, and the last one lands
  // on next year's total.
  const expectJoined = (steps, end) => {
    steps.slice(1, -1).forEach((s, i) => expect(s.from).toBe(steps[i].to));
    expect(steps.at(-2).to).toBe(end);
    expect(steps.at(-1)).toMatchObject({ total: true, to: end });
  };

  it("walks one year's learners to the next in five steps", () => {
    const steps = bridgeSteps(before, { learners: 734, new: 128 });
    expect(steps.map((s) => s.key)).toEqual(["start", "transferred", "left", "new", "end"]);
    expect(steps.map((s) => s.to - s.from)).toEqual([712, -12, -94, 128, 734]);
    expectJoined(steps, 734);
  });

  it("gives learners still pending next year a step of their own, so it still adds up", () => {
    // 606 came back, but only 572 are next year's learners yet.
    const steps = bridgeSteps(before, { learners: 700, new: 128 });
    expect(steps.map((s) => s.key)).toEqual(["start", "transferred", "left", "pending", "new", "end"]);
    expect(steps.find((s) => s.key === "pending")).toMatchObject({ from: 606, to: 572 });
    expectJoined(steps, 700);
  });

  it("and the other way: learners who transferred out and came back", () => {
    const steps = bridgeSteps(before, { learners: 740, new: 128 });
    expect(steps.find((s) => s.key === "rejoined")).toMatchObject({ from: 606, to: 612 });
    expectJoined(steps, 740);
  });

  it("starts its scale at 80% of the lowest point, to the hundred below", () => {
    expect(bridgeFloor(bridgeSteps(before, { learners: 734, new: 128 }))).toBe(400);   // 606 × 0.8 = 484.8
    const small = { learners: 23, transferred_out: 1, came_back: { count: 19, of: 22 } };
    expect(bridgeFloor(bridgeSteps(small, { learners: 24, new: 5 }))).toBe(0);
  });

  it("pairs only neighbouring years where the earlier knows who came back", () => {
    const byYear = {
      "2024-2025": { enrollment: { came_back: { count: 1, of: 1 }, new: 1 } },
      "2025-2026": { enrollment: { came_back: null, new: 1 } },
      "2026-2027": { enrollment: { came_back: null, new: 1 } },
    };
    const get = (y) => byYear[y];
    expect(bridgePairs(["2024-2025", "2025-2026", "2026-2027"], get)).toEqual([{ from: "2024-2025", to: "2025-2026" }]);
    expect(bridgePairs(["2024-2025", "2026-2027"], get)).toEqual([]);
  });
});

describe("LearnersByLevelChart", () => {
  const levels = (kindergarten, elementary) => ({
    nursery: 0, kindergarten, elementary, junior_highschool: 0, senior_highschool: 0,
  });
  const byYear = {
    "2025-2026": { enrollment: { learners: 30, by_level: levels(10, 20) } },
    "2026-2027": { enrollment: { learners: 45, by_level: levels(10, 35) } },
  };
  const years = ["2025-2026", "2026-2027"];

  it("stacks each year by level, and keys only the levels it has", () => {
    const { container } = render(<LearnersByLevelChart years={years} source={source(byYear)} />);
    const marks = [...container.querySelectorAll("svg rect title, svg path title")].map((t) => t.textContent);
    expect(marks).toEqual(["Kindergarten · 10", "Elementary · 20", "Kindergarten · 10", "Elementary · 35"]);
    expect(screen.getByText("Elementary")).toBeTruthy();
    expect(screen.queryByText("Nursery")).toBeNull();
    expect(screen.getByText("45")).toBeTruthy();
    expect(screen.getByText("Elementary added the most learners between S.Y. 2025-2026 and 2026-2027 (+15).")).toBeTruthy();
  });

  it("stands aside for its source while it loads, and when it fails", () => {
    const { container, rerender } = render(
      <LearnersByLevelChart years={years} source={{ ...source(byYear), loading: true }} />,
    );
    expect(container.querySelector("svg")).toBeNull();

    const onRetry = vi.fn();
    rerender(<LearnersByLevelChart years={years} source={{ ...source({}), error: new Error("Network Error"), onRetry }} />);
    expect(container.querySelector("svg")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("CollectionChart", () => {
  const money = {
    "2025-2026": { net_billed: "100000.00", total_collected: "100000.00" },
    "2026-2027": { net_billed: "100000.00", total_collected: "80000.00" },
  };
  const chart = () => (
    <CollectionChart years={["2025-2026", "2026-2027"]} states={{ "2026-2027": "current" }} source={source(money)} />
  );

  it("tops each column with its rate and what's left to collect", () => {
    render(chart());
    expect(screen.getByText("100.0%")).toBeTruthy();
    expect(screen.getByText("Paid up")).toBeTruthy();
    expect(screen.getByText("80.0%")).toBeTruthy();
    expect(screen.getByText("₱20K left")).toBeTruthy();
    expect(screen.getByText("S.Y. 2026-2027 is still collecting: ₱20,000.00 is outstanding so far.")).toBeTruthy();
  });

  it("clips each collected fill to its own column", () => {
    const { container } = render(chart());
    const clips = [...container.querySelectorAll("clipPath")].map((c) => c.id);
    const used = [...container.querySelectorAll("rect[clip-path]")].map((r) => r.getAttribute("clip-path"));
    expect(new Set(clips).size).toBe(2);
    expect(used).toEqual(clips.map((id) => `url(#${id})`));
  });
});

describe("FeesByGradeChart", () => {
  const fees = {
    "2025-2026": [
      { grade_level: "Grade 1", grand_total: "20000.00" },
      { grade_level: "Grade 2", grand_total: "22000.00" },
      { grade_level: "Kindergarten", grand_total: "18000.00" },
    ],
    "2026-2027": [
      { grade_level: "Grade 1", grand_total: "0" },
      { grade_level: "Grade 2", grand_total: "23100.00" },
      { grade_level: "Kindergarten", grand_total: "18900.00" },
    ],
  };
  const chart = (years = ["2025-2026", "2026-2027"]) => (
    <MemoryRouter>
      <FeesByGradeChart years={years} source={source(fees)} />
    </MemoryRouter>
  );

  it("rows every grade in grade order, with a dot per year and the change since the first", () => {
    const { container } = render(chart());
    const rows = [...container.querySelectorAll("[role=img]")].map((el) => el.getAttribute("aria-label"));
    expect(rows).toEqual([
      "Kindergarten: ₱18,000.00 in S.Y. 2025-2026, ₱18,900.00 in S.Y. 2026-2027",
      "Grade 1: ₱20,000.00 in S.Y. 2025-2026, ₱0.00 in S.Y. 2026-2027",
      "Grade 2: ₱22,000.00 in S.Y. 2025-2026, ₱23,100.00 in S.Y. 2026-2027",
    ]);
    expect(screen.getByText("+₱900")).toBeTruthy();
    expect(screen.getAllByText("5.0%")).toHaveLength(2);
    expect(screen.getByText("Since 2025-26")).toBeTruthy();
  });

  it("draws a ₱0 fee, but leaves it out of the average", () => {
    render(chart());
    expect(screen.getByText("−₱20,000")).toBeTruthy();
    expect(screen.getByText(
      "Across the 2 grades priced in both years, fees rose 5.0% on average between S.Y. 2025-2026 and 2026-2027.",
    )).toBeTruthy();
  });

  it("gives the latest year the darkest dot, however many years there are", () => {
    expect(yearRamp(5)).toHaveLength(5);
    expect(yearRamp(2)).toEqual(yearRamp(5).slice(3));
  });

  it("points to where fee schedules are set up when there are none", () => {
    render(
      <MemoryRouter>
        <FeesByGradeChart years={["2025-2026"]} source={source({})} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Billing Settings" }).getAttribute("href")).toBe("/settings?tab=fees");
  });
});

describe("at a measured size", () => {
  // jsdom can't measure; stand in a ResizeObserver that reports every
  // observed element as `width` pixels wide.
  const original = globalThis.ResizeObserver;
  let width;
  beforeEach(() => {
    globalThis.ResizeObserver = class {
      constructor(callback) { this.callback = callback; }
      observe() { this.callback([{ contentRect: { width, height: 224 } }]); }
      disconnect() {}
    };
  });
  afterEach(() => { globalThis.ResizeObserver = original; });

  it("draws a plot at the size its card gives it, so its text is set at real sizes", async () => {
    width = 520;
    const { container } = render(
      <ColumnPlot title="Plot" axis={linearAxis(0, 100)} formatTick={String} labels={[{ key: "a", label: "A" }]}>
        {() => null}
      </ColumnPlot>,
    );
    // 18 above the plot, 200 of plot, 6 below.
    await waitFor(() => expect(container.querySelector("svg").getAttribute("viewBox")).toBe("0 0 520 224"));
  });

  it("drops a column's note when it's wider than the column, keeping the rate", async () => {
    width = 290;   // five years on a phone: under 50px a column
    const years = ["2022-2023", "2023-2024", "2024-2025", "2025-2026", "2026-2027"];
    const money = Object.fromEntries(years.map((y) => [y, { net_billed: "100000.00", total_collected: "80000.00" }]));
    render(<CollectionChart years={years} states={{}} source={source(money)} />);
    await waitFor(() => expect(screen.queryAllByText("₱20K left")).toHaveLength(0));
    expect(screen.getAllByText("80.0%")).toHaveLength(5);
  });

  it("spaces the peso labels under the fees so they can't overlap", async () => {
    const fees = {
      "2025-2026": [{ grade_level: "Grade 1", grand_total: "20000.00" }],
      "2026-2027": [{ grade_level: "Grade 1", grand_total: "0" }, { grade_level: "Grade 2", grand_total: "23100.00" }],
    };
    const chart = (
      <MemoryRouter>
        <FeesByGradeChart years={["2025-2026", "2026-2027"]} source={source(fees)} />
      </MemoryRouter>
    );
    width = 600;   // room for every ₱10K
    const { unmount } = render(chart);
    await waitFor(() => expect(screen.getByText("₱10K")).toBeTruthy());
    expect(screen.getByText("₱20K")).toBeTruthy();
    unmount();

    width = 80;    // room for one
    render(chart);
    await waitFor(() => expect(screen.queryByText("₱10K")).toBeNull());
    expect(screen.queryByText("₱20K")).toBeNull();
    expect(screen.getByText("₱0")).toBeTruthy();
  });
});
