/**
 * RequirementsPage — a school year's learners and the required documents
 * each still owes, laid out like the other list pages: a status band whose
 * legend is the filter, then search and menus, then the list.
 *
 * What a learner owes is the activation gate's own rule, worked out by the
 * server (/enrollments/documents/), so the page never calls someone complete
 * whom the gate would hold back. Opening a learner shows the shared checklist
 * scoped to what their placement asks for.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getDocumentStatus: vi.fn(),
  getStudent: vi.fn(),
};
const panelProps = vi.fn();

vi.mock("../../api/enrollmentApi", () => ({
  getDocumentStatus: (...a) => api.getDocumentStatus(...a),
}));
vi.mock("../../api/studentApi", () => ({
  getStudent: (...a) => api.getStudent(...a),
}));
vi.mock("../../components/requirements/RequirementDocumentsPanel", () => ({
  default: (props) => {
    panelProps(props);
    return <div data-testid="checklist">Checklist for {props.studentId}</div>;
  },
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2026-2027", "2025-2026"],
    yearCounts: {},
    yearStates: { "2026-2027": "current", "2025-2026": "open" },
  }),
}));

const { default: RequirementsPage } = await import("../RequirementsPage");

const row = (over) => ({
  student_id: 1, first_name: "Ana", middle_name: "Reyes", last_name: "Cruz", suffix: null,
  lrn: "1001", student_number: "S-1", enrollment_id: 10, enrollment_status: "enrolled",
  school_level: "junior_highschool", grade_level: "Grade 7", section: "Rizal",
  entry_status: "continuing", required: 2, submitted: 2, missing: [],
  ...over,
});
const COMPLETE = row({});
const MISSING = row({
  student_id: 2, first_name: "Ben", middle_name: null, last_name: "Uy", lrn: "1002", student_number: "S-2",
  enrollment_id: 11, enrollment_status: "pending", entry_status: "transferee", required: 4, submitted: 3,
  missing: [{ requirement_type_id: 12, requirement_name: "Form 137/138" }],
});
const SUMMARY = { learners: 431, complete: 415, missing: 16 };

const calls = () => api.getDocumentStatus.mock.calls.map((c) => c[0]);
const lastCall = () => calls().at(-1);
const legend = () => within(screen.getByRole("group", { name: "Filter by documents" }));
const menuButton = (label) => screen.queryByRole("button", { name: new RegExp(`^${label}:`) });
const pick = (label, item) => {
  fireEvent.click(menuButton(label));
  fireEvent.click(screen.getByRole("menuitemradio", { name: item }));
};
const searchBox = () => screen.getByRole("searchbox", { name: /search learners/i });
const settled = () => screen.findByText("Cruz, Ana R.");

function renderAt(url = "/requirements") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <RequirementsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Reg", role: "registrar" }));
  api.getDocumentStatus.mockImplementation(async (p) => {
    const all = [COMPLETE, MISSING];
    let results = all;
    if (p.documents === "missing") results = [MISSING];
    if (p.documents === "complete") results = [COMPLETE];
    if (p.student) results = all.filter((r) => String(r.student_id) === String(p.student));
    return { count: results.length, next: null, previous: null, results, summary: SUMMARY };
  });
});

describe("Requirements — status band", () => {
  it("splits the year's learners by whether their documents are in", async () => {
    renderAt();
    await settled();

    expect(legend().getByRole("button", { name: "All 431" }).getAttribute("aria-pressed")).toBe("true");
    expect(legend().getByRole("button", { name: "Complete 415" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "Missing documents 16" })).toBeTruthy();
    expect(screen.getByText("learners in S.Y. 2026-2027")).toBeTruthy();
    expect(lastCall()).toEqual({ school_year: "2026-2027", page: 1, page_size: 20 });
  });

  it("lists who is missing documents from the legend, and clears on a second click", async () => {
    renderAt();
    await settled();
    const missing = legend().getByRole("button", { name: "Missing documents 16" });

    fireEvent.click(missing);

    await waitFor(() => expect(screen.queryByText("Cruz, Ana R.")).toBeNull());
    expect(lastCall()).toMatchObject({ documents: "missing", page: 1 });
    expect(screen.getByRole("heading", { name: "Missing documents" })).toBeTruthy();
    // The band still counts the whole year.
    expect(legend().getByRole("button", { name: "All 431" })).toBeTruthy();

    fireEvent.click(missing);

    expect(await screen.findByText("Cruz, Ana R.")).toBeTruthy();
    expect(lastCall().documents).toBeUndefined();
    expect(screen.getByRole("heading", { name: "All learners" })).toBeTruthy();
  });

  it("says what each learner still owes, and why", async () => {
    renderAt();
    await settled();

    const owing = screen.getByText("Uy, Ben").closest("tr");
    expect(within(owing).getByText("Missing 1 of 4")).toBeTruthy();
    expect(within(owing).getByText("Form 137/138")).toBeTruthy();
    expect(within(owing).getByText("Transferee")).toBeTruthy();
    expect(within(owing).getByText("Pending")).toBeTruthy();

    const done = screen.getByText("Cruz, Ana R.").closest("tr");
    expect(within(done).getByText("Complete")).toBeTruthy();
    expect(within(done).getByText("2 of 2 in")).toBeTruthy();
  });

  it("is glad, not puzzled, when nobody is missing anything", async () => {
    api.getDocumentStatus.mockImplementation(async (p) => ({
      count: p.documents === "missing" ? 0 : 1, next: null, previous: null,
      results: p.documents === "missing" ? [] : [COMPLETE],
      summary: { learners: 1, complete: 1, missing: 0 },
    }));
    renderAt();
    await settled();

    fireEvent.click(legend().getByRole("button", { name: "Missing documents 0" }));

    expect(await screen.findByText("Nobody is missing documents")).toBeTruthy();
  });

  it("says the list failed rather than showing nobody", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.getDocumentStatus.mockRejectedValue(new Error("Network Error"));
    renderAt();

    expect(await screen.findByRole("button", { name: /try again|retry/i })).toBeTruthy();
    expect(screen.queryByText(/No learners in S\.Y\./)).toBeNull();
  });
});

describe("Requirements — filter menus and search", () => {
  it("offers one year at a time", async () => {
    renderAt();
    await settled();

    fireEvent.click(menuButton("School year"));
    expect(screen.getAllByRole("menuitemradio").map((i) => i.textContent)).not.toContain("All years");
    fireEvent.click(screen.getByRole("menuitemradio", { name: /S\.Y\. 2025-2026/ }));

    await waitFor(() => expect(lastCall().school_year).toBe("2025-2026"));
  });

  it("offers Grade once a level is picked, and counts the band for both", async () => {
    renderAt();
    await settled();
    expect(menuButton("Grade")).toBeNull();

    pick("Level", "Junior High");
    await waitFor(() => expect(lastCall().school_level).toBe("junior_highschool"));
    pick("Grade", "Grade 7");

    await waitFor(() => expect(lastCall()).toMatchObject({ school_level: "junior_highschool", grade_level: "Grade 7" }));
    expect(await screen.findByText("learners in S.Y. 2026-2027 · Junior High · Grade 7")).toBeTruthy();
  });

  it("searches 300ms after typing stops", async () => {
    renderAt();
    await settled();
    const before = calls().length;

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.change(searchBox(), { target: { value: "uy" } });
      act(() => vi.advanceTimersByTime(299));
      expect(calls().length).toBe(before);

      act(() => vi.advanceTimersByTime(1));
      await act(async () => {});
      expect(lastCall()).toMatchObject({ page: 1, search: "uy" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Requirements — one learner's checklist", () => {
  it("opens on what the learner's placement asks for, and goes back to the list", async () => {
    renderAt();
    await settled();

    fireEvent.click(screen.getByText("Uy, Ben").closest("tr"));

    expect(await screen.findByTestId("checklist")).toBeTruthy();
    expect(panelProps.mock.lastCall[0]).toMatchObject({
      studentId: 2,
      context: { schoolLevel: "junior_highschool", entryStatus: "transferee" },
    });
    expect(screen.getByRole("heading", { name: "Uy, Ben" })).toBeTruthy();
    expect(screen.getByText("LRN 1002 · Grade 7 · Rizal · Transferee")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "All learners" }));
    expect(await screen.findByText("Cruz, Ana R.")).toBeTruthy();
  });

  it("recounts the list and band when a document changes, not when the checklist loads", async () => {
    renderAt();
    await settled();
    fireEvent.click(screen.getByText("Uy, Ben").closest("tr"));
    await screen.findByTestId("checklist");
    const onChange = panelProps.mock.lastCall[0].onChange;
    const before = calls().length;

    act(() => onChange({ total: 4, submitted: 3, requiredMissing: 1 })); // loaded
    expect(calls().length).toBe(before);

    act(() => onChange({ total: 4, submitted: 4, requiredMissing: 0 })); // uploaded
    await waitFor(() => expect(calls().length).toBe(before + 1));
  });

  it("opens from a link on the learner's row for that year", async () => {
    renderAt("/requirements?student=2&school_year=2025-2026");

    expect(await screen.findByTestId("checklist")).toBeTruthy();
    expect(calls()).toContainEqual({ school_year: "2025-2026", student: "2", page_size: 1 });
    expect(panelProps.mock.lastCall[0].context).toEqual({ schoolLevel: "junior_highschool", entryStatus: "transferee" });
    expect(api.getStudent).not.toHaveBeenCalled();
  });

  it("still opens a learner with no place that year, on the whole catalogue", async () => {
    api.getStudent.mockResolvedValue({ student_id: 9, first_name: "Cora", last_name: "Lim", lrn: "1009" });
    renderAt("/requirements?student=9");

    expect(await screen.findByTestId("checklist")).toBeTruthy();
    expect(api.getStudent).toHaveBeenCalledWith("9");
    expect(panelProps.mock.lastCall[0].context).toBeNull();
    expect(screen.getByText(/Not enrolled for S\.Y\. 2026-2027/)).toBeTruthy();
  });
});
