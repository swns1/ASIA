import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import BarChart from "./BarChart";
import LineChart from "./LineChart";
import Meter from "./Meter";
import Sparkline from "./Sparkline";
import StackedBar from "./StackedBar";
import { barPath, columnPath, linePath, niceMax } from "./geometry";
import { clearTokenCache } from "./tokens";

beforeEach(() => {
  // token() memoizes per module, and jsdom resolves no custom properties, so
  // a stale cache would leak between suites.
  clearTokenCache();
});

describe("token fallbacks", () => {
  it("match styles/tokens.css exactly", () => {
    // tokens.js carries hex fallbacks for environments with no live
    // stylesheet. They are a mirror, not a second source of truth — but a
    // mirror drifts silently, and a drifted fallback is how a chart quietly
    // renders an un-audited colour. This test is the thing that stops it:
    // it reads the real stylesheet and compares.
    // Resolved from the project root: under vitest `import.meta.url` is an
    // http URL, not a file one, so fileURLToPath cannot be used here.
    const root = process.cwd();
    const css = readFileSync(join(root, "src/styles/tokens.css"), "utf8");
    const js = readFileSync(join(root, "src/components/charts/tokens.js"), "utf8");

    const fallbacks = [...js.matchAll(/"(--color-[a-z0-9-]+)":\s*"(#[0-9a-fA-F]{3,8})"/g)];
    expect(fallbacks.length).toBeGreaterThan(8);

    for (const [, name, hex] of fallbacks) {
      const declared = css.match(
        new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`)
      );
      expect(declared, `${name} is not declared in tokens.css`).toBeTruthy();
      expect(hex.toLowerCase(), `${name} fallback has drifted from tokens.css`)
        .toBe(declared[1].toLowerCase());
    }
  });
});

describe("geometry: barPath / columnPath", () => {
  it("rounds only the data end, leaving the baseline square", () => {
    // Two arcs, not four — a fully rounded bar stops reading as measured
    // from its baseline.
    expect((barPath(0, 0, 100, 20).match(/a /g) || []).length).toBe(2);
    expect((columnPath(0, 0, 20, 100).match(/a /g) || []).length).toBe(2);
  });

  it("degrades to a plain rectangle when the radius is zero", () => {
    expect(barPath(0, 0, 100, 20, 0)).not.toContain("a ");
    expect(barPath(0, 0, 100, 20, 0)).toContain("Z");
  });

  it("clamps the radius to the mark instead of drawing inverted arcs", () => {
    // A 1px-wide bar asked for a 4px radius: the arc must shrink to 1, and no
    // segment length may go negative — that is what produces the folded-over
    // paths you see when a chart is fed a near-zero value.
    const d = barPath(0, 0, 1, 20);
    expect(d).toContain("a 1 1");
    expect(d).not.toMatch(/[hv] -\d/);
  });
});

describe("geometry: linePath", () => {
  const pts = (...ys) => ys.map((y, x) => (y == null ? null : { x, y }));

  it("draws one subpath for a continuous run", () => {
    expect(linePath(pts(1, 2, 3))).toHaveLength(1);
  });

  it("breaks into separate subpaths across a gap", () => {
    // The whole point: a null is "not measured", and joining across it would
    // draw a line through days that were never recorded.
    const paths = linePath(pts(1, 2, null, 4, 5));
    expect(paths).toHaveLength(2);
    expect(paths.every((d) => d.startsWith("M"))).toBe(true);
  });

  it("treats NaN as a gap too", () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 1, y: NaN }, { x: 2, y: 3 }])).toHaveLength(2);
  });

  it("returns nothing for an all-null series", () => {
    expect(linePath(pts(null, null))).toEqual([]);
  });
});

describe("geometry: niceMax", () => {
  it("rounds up to a readable axis bound", () => {
    expect(niceMax(7)).toBe(10);
    expect(niceMax(23)).toBe(50);
    expect(niceMax(0.4)).toBe(0.5);
  });

  it("never returns zero, so an empty axis cannot divide by it", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-5)).toBe(1);
    expect(niceMax(NaN)).toBe(1);
  });
});

describe("Sparkline", () => {
  it("renders nothing for a single point", () => {
    // One point is a dot claiming to be a trend.
    const { container } = render(<Sparkline values={[5]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders a path once there are two points", () => {
    const { container } = render(<Sparkline values={[1, 5]} />);
    expect(container.querySelector("path")).not.toBeNull();
  });

  it("survives a flat series without dividing by a zero span", () => {
    const { container } = render(<Sparkline values={[3, 3, 3]} />);
    expect(container.querySelector("path").getAttribute("d")).not.toContain("NaN");
  });

  it("is hidden from assistive tech, since the tile states the trend in text", () => {
    const { container } = render(<Sparkline values={[1, 2]} />);
    expect(container.querySelector("svg").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("LineChart", () => {
  const labels = ["W1", "W2", "W3"];

  it("names the plot for assistive tech", () => {
    render(<LineChart labels={labels} title="Attendance rate"
      series={[{ key: "a", label: "Rate", values: [1, 2, 3] }]} />);
    expect(screen.getByRole("img", { name: "Attendance rate" })).toBeTruthy();
  });

  it("shows an empty state rather than empty axes when all values are null", () => {
    render(<LineChart labels={labels} title="t" emptyMessage="No attendance yet"
      series={[{ key: "a", label: "Rate", values: [null, null, null] }]} />);
    expect(screen.getByText("No attendance yet")).toBeTruthy();
  });

  it("omits the legend for a single series", () => {
    // The title already names it; a one-entry legend is noise.
    const { container } = render(<LineChart labels={labels} title="t"
      series={[{ key: "a", label: "Rate", values: [1, 2, 3] }]} />);
    expect(container.textContent).not.toContain("Rate");
  });

  it("always shows a legend for two or more series", () => {
    render(<LineChart labels={labels} title="t" series={[
      { key: "a", label: "Collected", values: [1, 2, 3] },
      { key: "b", label: "Billed", values: [3, 2, 1] },
    ]} />);
    expect(screen.getByText("Collected")).toBeTruthy();
    expect(screen.getByText("Billed")).toBeTruthy();
  });

  it("draws a threshold as the only dashed line", () => {
    const { container } = render(<LineChart labels={labels} title="t"
      threshold={{ value: 2, label: "Target" }}
      series={[{ key: "a", label: "Rate", values: [1, 2, 3] }]} />);
    const dashed = [...container.querySelectorAll("line")]
      .filter((l) => l.getAttribute("stroke-dasharray"));
    expect(dashed).toHaveLength(1);
  });
});

describe("StackedBar", () => {
  const segs = [
    { key: "low", label: "On track", value: 6, color: "#0ca30c" },
    { key: "high", label: "Needs attention", value: 2, color: "#ec835a" },
  ];

  it("renders one mark per non-zero segment", () => {
    const { container } = render(<StackedBar segments={segs} title="Risk mix" />);
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("drops zero-value segments rather than drawing a zero-width mark", () => {
    const { container } = render(
      <StackedBar title="t" segments={[...segs, { key: "z", label: "None", value: 0, color: "#000" }]} />
    );
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("shows the empty state when every segment is zero", () => {
    render(<StackedBar title="t" emptyMessage="Nothing assessed"
      segments={[{ key: "a", label: "A", value: 0, color: "#000" }]} />);
    expect(screen.getByText("Nothing assessed")).toBeTruthy();
  });
});

describe("BarChart", () => {
  const rows = [
    { key: "nursery", label: "Nursery", value: 4 },
    { key: "shs", label: "Senior High", value: 0 },
  ];

  it("keeps zero-valued categories on the axis", () => {
    // An empty level is a real reading; dropping it would reshape the axis
    // between refreshes and move every other bar.
    render(<BarChart rows={rows} title="Levels" />);
    expect(screen.getByText("Senior High")).toBeTruthy();
  });

  it("uses one hue for every bar rather than a value ramp", () => {
    const { container } = render(<BarChart rows={[
      { key: "a", label: "A", value: 10 },
      { key: "b", label: "B", value: 4 },
    ]} title="t" />);
    const fills = [...container.querySelectorAll("path")].map((p) => p.getAttribute("fill"));
    expect(new Set(fills).size).toBe(1);
  });
});

describe("Meter", () => {
  it("exposes a progressbar with a meaningful name", () => {
    render(<Meter label="Collected" value={50} max={200} valueText="₱50" targetText="₱200" />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(bar.getAttribute("aria-label")).toContain("₱50");
  });

  it("clamps past the limit instead of overflowing its track", () => {
    render(<Meter label="x" value={300} max={200} valueText="300" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("reports zero rather than NaN when there is no target yet", () => {
    render(<Meter label="x" value={10} max={0} valueText="10" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });
});
