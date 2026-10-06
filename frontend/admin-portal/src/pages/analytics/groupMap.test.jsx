import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import GroupMap from "./GroupMap";
import { groupShapes, isFaint, mapAxes } from "./mapFrame";

// The group map is the one picture of what the grouping did, and it is read
// by people who have never seen a scatter plot. So these tests hold it to what
// it promises a reader: every student it can place is on it, the ones it
// can't are counted, colour says weakest / in between / strongest, groups
// sharing a colour differ in shape, the amber still shows, and nothing on it
// names the method.

const RED = "#a32d2d";
const AMBER = "#fab219";
const GREEN = "#0ca30c";

function student(id, grade, attendance, overrides = {}) {
  return {
    student_id: id,
    student_name: `Student ${id}`,
    student_number: `2026-000${id}`,
    grade,
    attendance_rate: attendance,
    avg_narrative: 2.5,
    subject_name: "Overall",
    ...overrides,
  };
}

const RESULT = {
  interpretation: "",
  meta: { school_year: "2026-2027", grading_period: "1st_quarter", subject: "Overall", n_clusters: 3, total_students: 5 },
  clusters: [
    {
      cluster_id: 0, label: "Needs Support", band: "low", color: RED, student_count: 2,
      avg_grade: 72, avg_attendance: 0.8, avg_narrative: 2,
      students: [student(1, 70, 0.78), student(2, 74, 0.82)],
    },
    {
      cluster_id: 1, label: "Average", band: "middle", color: AMBER, student_count: 2,
      avg_grade: 82, avg_attendance: 0.9, avg_narrative: 2.5,
      students: [student(3, 81, 0.9), student(4, 83, null)],
    },
    {
      cluster_id: 2, label: "High Achieving", band: "high", color: GREEN, student_count: 1,
      avg_grade: 93, avg_attendance: 0.97, avg_narrative: 3,
      students: [student(5, 93, 0.97, { avg_narrative: 3 })],
    },
  ],
};

const dotsOf = (container, color) => [...container.querySelectorAll(`circle[r="5"][fill="${color}"]`)];

describe("GroupMap", () => {
  it("draws every student it can place, and counts the ones it can't", () => {
    const { container } = render(<GroupMap result={RESULT} />);
    // Student 4 has no attendance rate yet, so has no place on the map.
    expect(container.querySelectorAll('circle[r="5"]').length).toBe(4);
    expect(screen.getByText(/1 student doesn't have enough attendance recorded yet/)).toBeTruthy();
  });

  it("colours the weakest group red, the middle amber and the strongest green", () => {
    const { container } = render(<GroupMap result={RESULT} />);
    expect(dotsOf(container, RED).length).toBe(2);
    expect(dotsOf(container, AMBER).length).toBe(1);
    expect(dotsOf(container, GREEN).length).toBe(1);
    // ...and says so beside the legend.
    expect(screen.getByText(/standing on grades, attendance and behavior/)).toBeTruthy();
    for (const word of ["Weakest", "In between", "Strongest"]) expect(screen.getByText(word)).toBeTruthy();
  });

  it("names each group in the legend and beside its average", () => {
    render(<GroupMap result={RESULT} />);
    // Once as a legend button, once as the label on the plot.
    expect(screen.getAllByText("Needs Support").length).toBe(2);
    expect(screen.getAllByText("High Achieving").length).toBe(2);
    expect(screen.getByRole("button", { name: /Average\s*2/ })).toBeTruthy();
  });

  it("outlines the amber so its marks keep an edge on the light surface", () => {
    const { container } = render(<GroupMap result={RESULT} />);
    expect(dotsOf(container, AMBER)[0].getAttribute("stroke")).not.toBe("#fdfcfb");
    // A colour that holds its own edge keeps the usual surface ring.
    expect(dotsOf(container, RED)[0].getAttribute("stroke")).toBe("#fdfcfb");
  });

  it("tells groups sharing a colour apart by shape", () => {
    const four = {
      ...RESULT,
      meta: { ...RESULT.meta, n_clusters: 4 },
      clusters: [
        RESULT.clusters[0],
        { ...RESULT.clusters[1], label: "Developing" },
        {
          cluster_id: 3, label: "Steady", band: "middle", color: AMBER, student_count: 1,
          avg_grade: 86, avg_attendance: 0.95, avg_narrative: 2.5,
          students: [student(6, 86, 0.95)],
        },
        RESULT.clusters[2],
      ],
    };
    const { container } = render(<GroupMap result={four} />);
    const plot = container.querySelector("svg[role='img']");
    // The second amber group draws squares; everything else stays circles.
    expect(plot.querySelectorAll(`rect[fill="${AMBER}"]`).length).toBe(2); // its student + its average
    expect(dotsOf(container, AMBER).length).toBe(1);
    expect(screen.getByText(/told apart by shape/)).toBeTruthy();
  });

  it("picks one group out from the legend and greys the rest", () => {
    const { container } = render(<GroupMap result={RESULT} />);
    const button = screen.getByRole("button", { name: /Needs Support/ });
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(dotsOf(container, RED).length).toBe(2);
    expect(dotsOf(container, GREEN).length).toBe(0);
    // Picking it again brings every group back.
    fireEvent.click(button);
    expect(dotsOf(container, GREEN).length).toBe(1);
  });

  it("shows the nearest student's group, figures and behavior on hover", () => {
    const { container } = render(<GroupMap result={RESULT} />);
    container.querySelector("svg[role='img']").getBoundingClientRect = () => ({
      left: 0, top: 0, width: 760, height: 340, right: 760, bottom: 340, x: 0, y: 0,
    });
    const dot = dotsOf(container, RED).find((c) => Number(c.getAttribute("cx")) < 240);
    fireEvent.mouseMove(container.querySelector('rect[fill="transparent"]'), {
      clientX: Number(dot.getAttribute("cx")) + 3,
      clientY: Number(dot.getAttribute("cy")),
    });
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Student 1");
    expect(tip.textContent).toContain("Needs Support");
    expect(tip.textContent).toContain("Average 70.0 · Attendance 78%");
    expect(tip.textContent).toContain("Behavior 2.5 of 3");
  });

  it("never names the method", () => {
    const { container } = render(<GroupMap result={RESULT} />);
    expect(container.textContent).not.toMatch(/cluster|centroid|silhouette|k-means/i);
  });

  it("says so when no student has attendance yet", () => {
    const bare = {
      ...RESULT,
      clusters: RESULT.clusters.map((c) => ({
        ...c,
        avg_attendance: null,
        students: c.students.map((s) => ({ ...s, attendance_rate: null })),
      })),
    };
    render(<GroupMap result={bare} />);
    expect(screen.getByText(/needs both grades and attendance/i)).toBeTruthy();
  });
});

describe("mapFrame", () => {
  it("outlines only a colour too light to hold its edge on the surface", () => {
    expect(isFaint(AMBER)).toBe(true);
    expect(isFaint(RED)).toBe(false);
    expect(isFaint(GREEN)).toBe(false);
    expect(isFaint("not a colour")).toBe(false);
  });

  it("shapes groups sharing a band in standing order, and leaves the rest circles", () => {
    const shapes = groupShapes([
      { cluster_id: 0, band: "low" },
      { cluster_id: 1, band: "low" },
      { cluster_id: 2, band: "middle" },
      { cluster_id: 3, band: "high" },
      { cluster_id: 4, band: "high" },
    ]);
    expect([...shapes.values()]).toEqual(["circle", "square", "circle", "circle", "square"]);
  });

  it("starts each axis below the lowest figure instead of pinning it to the frame", () => {
    const axes = mapAxes(
      [{ grade: 47.7, attendance: 0.42 }, { grade: 91, attendance: 0.98 }],
      { width: 500, height: 300, pad: { left: 50, right: 20, top: 30, bottom: 44 } },
    );
    expect(axes.xTicks[0]).toBe(40);
    expect(axes.yTicks[0]).toBe(40);
    expect(axes.x(47.7)).toBeGreaterThan(axes.x(40));
    expect(axes.xTicks).toContain(75);
  });
});
