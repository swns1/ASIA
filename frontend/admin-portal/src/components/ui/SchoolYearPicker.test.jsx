import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SchoolYearPicker from "./SchoolYearPicker";
import FilterBar from "./FilterBar";

// The picker falls back to SchoolYearContext when props are omitted, but every
// test here passes options/counts/currentYear explicitly — the grouping and
// keyboard behaviour is what's under test, not the context wiring. Mocking the
// hook keeps these tests from needing a provider (and from firing its fetches).
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "2026-2027",
    setSchoolYear: vi.fn(),
    options: [],
    currentYear: "2026-2027",
    yearCounts: {},
  }),
}));

const CURRENT = "2026-2027";

// 13 years: enough to cross both the Recent/Earlier boundary (4) and the
// filter-field threshold (8), which is the case the chip row couldn't hold.
const MANY = Array.from({ length: 13 }, (_, i) => {
  const y = 2026 - i;
  return `${y}-${y + 1}`;
});

const COUNTS = MANY.reduce((acc, y, i) => ({ ...acc, [y]: i === 0 ? 20 : 400 - i * 8 }), {});

function setup(props = {}) {
  const onChange = vi.fn();
  const utils = render(
    <SchoolYearPicker
      value={CURRENT}
      onChange={onChange}
      options={MANY}
      counts={COUNTS}
      currentYear={CURRENT}
      {...props}
    />
  );
  return { onChange, ...utils };
}

const openPicker = () => fireEvent.click(screen.getByRole("button"));

describe("SchoolYearPicker — trigger", () => {
  it("shows the selected year and its real count, not the page's result count", () => {
    setup();
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("2026-2027");
    expect(btn.textContent).toContain("20");
  });

  it("reads as 'All years' when the value is empty", () => {
    setup({ value: "", allYearsCount: 1284 });
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("All years");
    expect(btn.textContent).toContain("1,284");
  });

  it("is collapsed until clicked", () => {
    setup();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
    openPicker();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox")).not.toBeNull();
  });
});

describe("SchoolYearPicker — grouping", () => {
  it("splits into Current / Recent / Earlier once there is a long tail", () => {
    setup();
    openPicker();
    expect(screen.getByText("Current")).not.toBeNull();
    expect(screen.getByText("Recent")).not.toBeNull();
    expect(screen.getByText("Earlier")).not.toBeNull();
  });

  it("collapses to just Current + Recent for a young school", () => {
    setup({ options: [CURRENT, "2025-2026", "2024-2025"] });
    openPicker();
    expect(screen.getByText("Current")).not.toBeNull();
    expect(screen.getByText("Recent")).not.toBeNull();
    expect(screen.queryByText("Earlier")).toBeNull();
  });

  it("keeps every year reachable — all 13 render, plus All years", () => {
    setup();
    openPicker();
    expect(screen.getAllByRole("option").length).toBe(MANY.length + 1);
  });

  it("puts All years last, so a real year reads as the primary choice", () => {
    setup();
    openPicker();
    const opts = screen.getAllByRole("option");
    expect(opts[opts.length - 1].textContent).toContain("All years");
  });

  it("omits All years when includeAllYears is false", () => {
    setup({ includeAllYears: false });
    openPicker();
    expect(screen.queryByText("All years")).toBeNull();
    expect(screen.getAllByRole("option").length).toBe(MANY.length);
  });

  it("marks only the selected year as selected", () => {
    setup({ value: "2020-2021" });
    openPicker();
    const selected = screen.getAllByRole("option").filter(
      (o) => o.getAttribute("aria-selected") === "true"
    );
    expect(selected.length).toBe(1);
    expect(selected[0].textContent).toContain("2020-2021");
  });
});

describe("SchoolYearPicker — jump-to-year field", () => {
  it("appears only once the list is long enough to be worth filtering", () => {
    const { unmount } = setup({ options: [CURRENT, "2025-2026", "2024-2025"] });
    openPicker();
    expect(screen.queryByPlaceholderText("Jump to year…")).toBeNull();
    unmount();

    setup();
    openPicker();
    expect(screen.getByPlaceholderText("Jump to year…")).not.toBeNull();
  });

  it("narrows the list and drops All years while searching", () => {
    setup();
    openPicker();
    fireEvent.change(screen.getByPlaceholderText("Jump to year…"), { target: { value: "2018" } });
    const opts = screen.getAllByRole("option");
    expect(opts.length).toBe(2); // 2018-2019 and 2017-2018 both contain "2018"
    expect(screen.queryByText("All years")).toBeNull();
  });

  it("explains an empty result instead of showing a blank panel", () => {
    setup();
    openPicker();
    fireEvent.change(screen.getByPlaceholderText("Jump to year…"), { target: { value: "1999" } });
    expect(screen.queryAllByRole("option").length).toBe(0);
    expect(screen.getByText(/No school year matches/)).not.toBeNull();
  });
});

describe("SchoolYearPicker — selection", () => {
  it("commits the clicked year and closes", async () => {
    const { onChange } = setup();
    openPicker();
    fireEvent.click(screen.getByRole("option", { name: /2022-2023/ }));
    expect(onChange).toHaveBeenCalledWith("2022-2023");
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("commits an empty string for All years", () => {
    const { onChange } = setup();
    openPicker();
    fireEvent.click(screen.getByRole("option", { name: /All years/ }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("SchoolYearPicker — keyboard", () => {
  it("opens on ArrowDown", () => {
    setup();
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).not.toBeNull();
  });

  it("starts the cursor on the current selection, not the top of the list", () => {
    setup({ value: "2021-2022" });
    openPicker();
    const active = screen.getByRole("listbox").getAttribute("aria-activedescendant");
    expect(document.getElementById(active).textContent).toContain("2021-2022");
  });

  it("arrows between rows without selecting, then commits on Enter", () => {
    const { onChange } = setup({ value: CURRENT });
    openPicker();
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("2025-2026");
  });

  it("skips group headers when arrowing", () => {
    setup({ value: CURRENT });
    openPicker();
    const list = screen.getByRole("listbox");
    // Current -> (Recent header) -> first recent year
    fireEvent.keyDown(list, { key: "ArrowDown" });
    const active = document.getElementById(list.getAttribute("aria-activedescendant"));
    expect(active.getAttribute("role")).toBe("option");
  });

  it("Home and End jump to the ends of the list", () => {
    setup();
    openPicker();
    const list = screen.getByRole("listbox");
    const activeText = () =>
      document.getElementById(list.getAttribute("aria-activedescendant")).textContent;

    fireEvent.keyDown(list, { key: "End" });
    expect(activeText()).toContain("All years");
    fireEvent.keyDown(list, { key: "Home" });
    expect(activeText()).toContain(CURRENT);
  });

  it("closes on Escape without selecting", async () => {
    const { onChange } = setup();
    openPicker();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("SchoolYearPicker — dismissal", () => {
  it("closes on an outside mousedown", async () => {
    setup();
    openPicker();
    expect(screen.getByRole("listbox")).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("stays open for a mousedown inside the panel", () => {
    setup();
    openPicker();
    fireEvent.mouseDown(screen.getByRole("listbox"));
    expect(screen.getByRole("listbox")).not.toBeNull();
  });
});

describe("FilterBar — scope slot", () => {
  it("renders a scope control in the search row", () => {
    render(
      <FilterBar
        searchValue=""
        onSearchChange={() => {}}
        scope={<button type="button">Scope here</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Scope here" })).not.toBeNull();
  });

  it("omits the scope area entirely when no scope is passed", () => {
    render(<FilterBar searchValue="" onSearchChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Scope here" })).toBeNull();
  });
});
