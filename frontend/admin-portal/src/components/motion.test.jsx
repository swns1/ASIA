import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import PageTransition from "./PageTransition";
import BarChart from "./charts/BarChart";
import LineChart from "./charts/LineChart";
import StackedBar from "./charts/StackedBar";
import { chartVariants } from "../utils/motion";

function atPath(path, ui) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

describe("PageTransition", () => {
  it("renders its page", () => {
    atPath("/dashboard", <PageTransition><p>Page body</p></PageTransition>);
    expect(screen.getByText("Page body")).toBeTruthy();
  });

  it("keeps the shell's flex contract", () => {
    // AppLayout sizes this element as its flex child. A plain wrapper without
    // these classes collapses every page that fills the viewport via
    // min-h-0/flex-1 — including the dashboard, whose whole no-scroll layout
    // depends on it.
    const { container } = atPath("/dashboard", <PageTransition><p>x</p></PageTransition>);
    const cls = container.firstChild.className;
    for (const c of ["flex", "min-h-0", "flex-1", "flex-col"]) {
      expect(cls, `missing ${c}`).toContain(c);
    }
  });
});

describe("chartVariants", () => {
  it("grows bars from zero width, not from opacity alone", () => {
    // scaleX is what makes a bar read as growing from its baseline; fading it
    // in would animate nothing about the quantity.
    expect(chartVariants.bar.hidden.scaleX).toBe(0);
    expect(chartVariants.bar.visible.scaleX).toBe(1);
  });

  it("draws lines with pathLength so geometry does not matter", () => {
    expect(chartVariants.line.hidden.pathLength).toBe(0);
    expect(chartVariants.line.visible.pathLength).toBe(1);
  });

  it("staggers series rather than firing them together", () => {
    expect(chartVariants.container.visible.transition.staggerChildren).toBeGreaterThan(0);
  });
});

describe("animated chart marks", () => {
  const segments = [
    { key: "a", label: "A", value: 6, color: "#0ca30c" },
    { key: "b", label: "B", value: 2, color: "#ec835a" },
  ];

  it("scales each stacked segment from its own left edge", () => {
    // Regression guard for two ways of getting this wrong, both of which
    // render without error and animate incorrectly: a CSS
    // `transform-origin: left center` (framer-motion overwrites it with 50%)
    // and `originX={0}` as a bare prop (ignored — it is a transform property
    // and must be in `style`). Either one grows bars from their centre.
    const { container } = render(<StackedBar title="t" segments={segments} />);
    const path = container.querySelector("path");
    expect(path.style.transformBox).toBe("fill-box");
    expect(path.style.transformOrigin).toBe("0% 50% 0");
  });

  it("keeps the stacked segment hoverable while animated", () => {
    const { container } = render(<StackedBar title="t" segments={segments} />);
    expect(container.querySelector("path").style.cursor).toBe("pointer");
  });

  it("scales bar-chart rows from their baseline", () => {
    const { container } = render(
      <BarChart title="t" rows={[{ key: "a", label: "A", value: 4 }]} />
    );
    const path = container.querySelector("path");
    expect(path.style.transformBox).toBe("fill-box");
    expect(path.style.transformOrigin).toBe("0% 50% 0");
  });

  it("keys marks on series identity, so data changes never replay the animation", () => {
    // A chart that re-animates on every filter change makes the data feel
    // unstable and delays the answer. Replay happens on remount, so the keys
    // must follow the series, not its current value.
    const { container, rerender } = render(<StackedBar title="t" segments={segments} />);
    const before = container.querySelector("path");
    rerender(
      <StackedBar
        title="t"
        segments={[
          { key: "a", label: "A", value: 60, color: "#0ca30c" },
          { key: "b", label: "B", value: 20, color: "#ec835a" },
        ]}
      />
    );
    expect(container.querySelector("path")).toBe(before);
  });

  it("animates line paths", () => {
    const { container } = render(
      <LineChart
        title="t"
        labels={["a", "b", "c"]}
        series={[{ key: "s", label: "S", values: [1, 2, 3] }]}
      />
    );
    // The series path is the one with a stroke and no fill.
    const line = [...container.querySelectorAll("path")].find(
      (p) => p.getAttribute("fill") === "none"
    );
    expect(line).toBeTruthy();
  });
});
