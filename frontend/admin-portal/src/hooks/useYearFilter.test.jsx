/**
 * useYearFilter — the one set of school-year rules every year-scoped page
 * shares. Eight pages used to keep their own copy, and between them they
 * behaved five different ways.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let currentYear;
vi.mock("../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ currentYear }),
}));

const { default: useYearFilter } = await import("./useYearFilter");

function setup({ url = "/page", options } = {}) {
  const wrapper = ({ children }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(() => useYearFilter(options), { wrapper });
}

const year = (r) => r.current[0];
const pick = (r, y) => act(() => r.current[1](y));
const isDefault = (r) => r.current[2];

beforeEach(() => {
  currentYear = "2026-2027";
});

describe("useYearFilter — where a page opens", () => {
  it("opens on the current school year", () => {
    const { result } = setup();
    expect(year(result)).toBe("2026-2027");
    expect(isDefault(result)).toBe(true);
  });

  it("opens on the year in the link, which Dashboard cards use", () => {
    const { result } = setup({ url: "/page?school_year=2024-2025" });
    expect(year(result)).toBe("2024-2025");
    expect(isDefault(result)).toBe(false);
  });

  it("ignores an empty year in the link", () => {
    const { result } = setup({ url: "/page?school_year=" });
    expect(year(result)).toBe("2026-2027");
  });
});

describe("useYearFilter — the current year arriving late", () => {
  it("follows it when School Settings loads after the first render", () => {
    const { result, rerender } = setup();
    currentYear = "2025-2026";
    rerender();
    expect(year(result)).toBe("2025-2026");
    expect(isDefault(result)).toBe(true);
  });

  it("does not override a year someone already picked", () => {
    const { result, rerender } = setup();
    pick(result, "2023-2024");
    currentYear = "2025-2026";
    rerender();
    expect(year(result)).toBe("2023-2024");
  });

  it("does not override the year the link named", () => {
    const { result, rerender } = setup({ url: "/page?school_year=2024-2025" });
    currentYear = "2025-2026";
    rerender();
    expect(year(result)).toBe("2024-2025");
  });
});

describe("useYearFilter — picking", () => {
  it("treats an empty pick as All years", () => {
    const { result } = setup();
    pick(result, "");
    expect(year(result)).toBe("");
    expect(isDefault(result)).toBe(false);
  });

  it("keeps one specific year when All years isn't allowed", () => {
    const { result } = setup({ options: { allowAll: false } });
    pick(result, "");
    expect(year(result)).toBe("2026-2027");
  });

  it("goes back to the current year on null, the way Clear filters uses it", () => {
    const { result, rerender } = setup({ url: "/page?school_year=2024-2025" });
    pick(result, null);
    expect(year(result)).toBe("2026-2027");
    expect(isDefault(result)).toBe(true);

    // And it is following the current year again, not a copy of it.
    currentYear = "2027-2028";
    rerender();
    expect(year(result)).toBe("2027-2028");
  });

  it("keeps the setter stable, so pages can pass it straight to onChange", () => {
    const { result, rerender } = setup();
    const first = result.current[1];
    rerender();
    expect(result.current[1]).toBe(first);
  });
});

describe("useYearFilter — a pick stays on its page", () => {
  it("does not change the year on another page", () => {
    const enrollments = setup();
    const grades = setup();
    pick(enrollments.result, "2023-2024");
    expect(year(enrollments.result)).toBe("2023-2024");
    expect(year(grades.result)).toBe("2026-2027");
  });

  it("opens on the current year again after leaving and coming back", () => {
    const first = setup();
    pick(first.result, "2023-2024");
    first.unmount();
    expect(year(setup().result)).toBe("2026-2027");
  });
});
