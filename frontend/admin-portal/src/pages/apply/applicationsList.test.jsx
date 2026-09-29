/**
 * StudentApplicationsPage — the review queue.
 *
 * The queue read one page of 100 per tab and showed it as the whole list, and
 * a slow response for the tab just left could replace the one just opened.
 * Applications also carry the school year they're for: chosen when the link
 * is issued, filterable here, and handed on to the enrolment form.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getStudentApplications = vi.fn();
const createApplicationInvite = vi.fn();
const getStudentApplication = vi.fn();
const approveStudentApplication = vi.fn();
const changeApplicationSchoolYear = vi.fn();
const navigate = vi.fn();

vi.mock("../../api/applicationApi", () => ({
  createApplicationInvite: (...a) => createApplicationInvite(...a),
  getStudentApplications: (...a) => getStudentApplications(...a),
  getStudentApplication: (...a) => getStudentApplication(...a),
  claimStudentApplication: vi.fn(() => Promise.resolve({})),
  approveStudentApplication: (...a) => approveStudentApplication(...a),
  changeApplicationSchoolYear: (...a) => changeApplicationSchoolYear(...a),
  rejectStudentApplication: vi.fn(),
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
// 2026-2027 is current and 2027-2028 has been set up ahead.
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2027-2028", "2026-2027"],
    entryYears: ["2027-2028", "2026-2027"],
    yearStates: { "2027-2028": "upcoming", "2026-2027": "current" },
    yearCounts: {},
  }),
}));

const { default: StudentApplicationsPage } = await import("../StudentApplicationsPage");

function application(id, lastName) {
  return {
    student_application_id: id,
    reference: `APP-${id}`,
    first_name: "Ana",
    last_name: lastName,
    lrn: "",
    submitted_at: "2026-09-01T08:00:00Z",
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StudentApplicationsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StudentApplicationsPage — queue", () => {
  it("lists applications beyond the first page", async () => {
    getStudentApplications.mockImplementation(({ page }) =>
      Promise.resolve(
        page === 1
          ? { results: [application(1, "First")], next: "?page=2" }
          : { results: [application(2, "Second")], next: null },
      ),
    );
    renderPage();

    expect(await screen.findByText("APP-2")).toBeTruthy();
    expect(screen.getByText("APP-1")).toBeTruthy();
  });

  it("keeps the open tab's applications when the previous tab answers late", async () => {
    let finishSubmitted;
    getStudentApplications.mockImplementation(({ status }) =>
      status === "submitted"
        ? new Promise((resolve) => { finishSubmitted = resolve; })
        : Promise.resolve({ results: [application(7, "Approved")], next: null }),
    );
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "Approved" }));
    expect(await screen.findByText("APP-7")).toBeTruthy();

    finishSubmitted({ results: [application(3, "Submitted")], next: null });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText("APP-3")).toBeNull();
    expect(screen.getByText("APP-7")).toBeTruthy();
  });
});

describe("StudentApplicationsPage — school year", () => {
  beforeEach(() => {
    getStudentApplications.mockResolvedValue({ results: [], next: null });
  });

  it("opens on all years, and narrows the queue to one", async () => {
    getStudentApplications.mockResolvedValue({
      results: [{ ...application(1, "Reyes"), school_year: "2027-2028" }], next: null,
    });
    renderPage();
    expect(await screen.findByText("2027-2028")).toBeTruthy();
    expect(getStudentApplications.mock.calls[0][0]).toMatchObject({ status: "submitted", school_year: "" });

    fireEvent.click(screen.getByRole("button", { name: /All years/ }));
    fireEvent.click(screen.getByRole("option", { name: /2027-2028/ }));
    await waitFor(() => expect(getStudentApplications).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "submitted", school_year: "2027-2028" }),
    ));
  });

  it("issues a link for the upcoming year unless another is picked", async () => {
    createApplicationInvite.mockResolvedValue({
      invite_id: "abc", applicant_full_name: "Maria Santos", school_year: "2027-2028",
      access_code: "ABCD1234", apply_url: "https://school.example/apply/abc",
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Issue form link" }));
    const year = await screen.findByRole("combobox", { name: "Applying for" });
    expect(year.value).toBe("2027-2028");
    expect(within(year).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "S.Y. 2027-2028 (upcoming)", "S.Y. 2026-2027 (current)",
    ]);

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Maria" } });
    fireEvent.change(screen.getAllByRole("textbox")[1], { target: { value: "Santos" } });
    fireEvent.click(screen.getByRole("button", { name: "Issue invite" }));
    await waitFor(() => expect(createApplicationInvite).toHaveBeenCalledWith(
      expect.objectContaining({ applicant_first_name: "Maria", school_year: "2027-2028" }),
    ));
    expect(await screen.findByText("Applying for S.Y. 2027-2028")).toBeTruthy();
  });

  it("carries the year into the enrolment form on approval", async () => {
    getStudentApplications.mockResolvedValue({ results: [application(4, "Reyes")], next: null });
    getStudentApplication.mockResolvedValue({
      ...application(4, "Reyes"), status: "in_review", school_year: "2027-2028",
      payload_json: {
        student: { lrn: "123456789012" },
        applying_for: { grade_level: "Grade 7", school_level: "junior_highschool" },
      },
    });
    approveStudentApplication.mockResolvedValue({ created_student_id: 55 });
    renderPage();
    fireEvent.click(await screen.findByText("APP-4"));
    expect(await screen.findByText(/Grade 7 · S\.Y\. 2027-2028/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const params = new URLSearchParams(navigate.mock.calls[0][0].split("?")[1]);
    expect(params.get("school_year")).toBe("2027-2028");
    expect(params.get("grade_level")).toBe("Grade 7");
  });
});

describe("StudentApplicationsPage — correcting the year", () => {
  it("changes an application's year before it's approved, and enrols for that year", async () => {
    getStudentApplications.mockResolvedValue({ results: [application(4, "Reyes")], next: null });
    getStudentApplication.mockResolvedValue({
      ...application(4, "Reyes"), status: "in_review", school_year: "2026-2027",
      payload_json: { student: { lrn: "123456789012" }, applying_for: { grade_level: "Grade 7" } },
    });
    changeApplicationSchoolYear.mockResolvedValue({ school_year: "2027-2028" });
    approveStudentApplication.mockResolvedValue({ created_student_id: 55 });
    renderPage();
    fireEvent.click(await screen.findByText("APP-4"));

    const year = await screen.findByRole("combobox", { name: "Enrol for" });
    expect(year.value).toBe("2026-2027");
    fireEvent.change(year, { target: { value: "2027-2028" } });
    await waitFor(() => expect(changeApplicationSchoolYear).toHaveBeenCalledWith(4, "2027-2028"));
    expect(await screen.findByText(/Grade 7 · S\.Y\. 2027-2028/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const params = new URLSearchParams(navigate.mock.calls.at(-1)[0].split("?")[1]);
    expect(params.get("school_year")).toBe("2027-2028");
  });
});
