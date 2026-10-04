/**
 * StudentApplicationsPage — the review queue.
 *
 * The queue read one page of 100 per tab and showed it as the whole list, and
 * a slow response for the tab just left could replace the one just opened.
 * Applications also carry the school year they're for: chosen when the link
 * is issued, filterable here, and handed on to the enrolment form. And what
 * the family typed can be corrected here before approval.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getStudentApplications = vi.fn();
const createApplicationInvite = vi.fn();
const getStudentApplication = vi.fn();
const approveStudentApplication = vi.fn();
const changeApplicationSchoolYear = vi.fn();
const updateApplicationDetails = vi.fn();
const navigate = vi.fn();

vi.mock("../../api/applicationApi", () => ({
  createApplicationInvite: (...a) => createApplicationInvite(...a),
  getStudentApplications: (...a) => getStudentApplications(...a),
  getStudentApplication: (...a) => getStudentApplication(...a),
  claimStudentApplication: vi.fn(() => Promise.resolve({})),
  approveStudentApplication: (...a) => approveStudentApplication(...a),
  changeApplicationSchoolYear: (...a) => changeApplicationSchoolYear(...a),
  updateApplicationDetails: (...a) => updateApplicationDetails(...a),
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

describe("StudentApplicationsPage — correcting what the family entered", () => {
  const submitted = {
    ...application(4, "Reyes"), first_name: "Aan", status: "in_review", school_year: "2026-2027",
    revision: 2,
    payload_json: {
      student: {
        lrn: "", first_name: "Aan", middle_name: null, last_name: "Reyes", sex: "female",
        birth_date: "2014-03-02", current_address: "Purok 1", permanent_address: "Purok 1",
      },
      household: null,
      guardians: [{ relationship: "mother", full_name: "Rosa Reyes", is_primary_contact: true }],
      siblings: [],
      previous_schools: [],
      applying_for: { grade_level: "Grade 7", school_level: "junior_highschool", strand: "" },
    },
  };

  async function openEditor() {
    getStudentApplications.mockResolvedValue({ results: [application(4, "Reyes")], next: null });
    getStudentApplication.mockResolvedValue(submitted);
    renderPage();
    fireEvent.click(await screen.findByText("APP-4"));
    fireEvent.click(await screen.findByRole("button", { name: /Edit details/ }));
    return screen.findByLabelText(/First Name/);
  }

  it("saves a corrected name onto the application, then approves from it", async () => {
    updateApplicationDetails.mockImplementation((id, payload) => Promise.resolve({
      ...submitted, first_name: payload.student.first_name, revision: 3,
      payload_json: { ...submitted.payload_json, student: { ...payload.student, lrn: "123456789012" } },
    }));
    approveStudentApplication.mockResolvedValue({ created_student_id: 55 });

    const firstName = await openEditor();
    expect(firstName.value).toBe("Aan");
    fireEvent.change(firstName, { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("button", { name: "Save corrections" }));

    await waitFor(() => expect(updateApplicationDetails).toHaveBeenCalled());
    const [id, payload, revision] = updateApplicationDetails.mock.calls[0];
    expect(id).toBe(4);
    expect(revision).toBe(2);
    expect(payload.student).toMatchObject({ first_name: "Ana", last_name: "Reyes" });
    expect(payload.applying_for.grade_level).toBe("Grade 7");
    // The queue reloads so its row shows the corrected name.
    await waitFor(() => expect(getStudentApplications.mock.calls.length).toBeGreaterThan(1));

    // Back on the review, with the saved LRN ready for approval.
    expect(await screen.findByDisplayValue("123456789012")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    await waitFor(() => expect(approveStudentApplication).toHaveBeenCalledWith(4, { student: { lrn: "123456789012" } }));
    expect(navigate.mock.calls.at(-1)[0]).toContain("/enrollments/new?student=55");
  });

  it("says what's missing, on the section it's in, instead of saving", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("tab", { name: /Guardians/ }));
    fireEvent.click(screen.getByRole("button", { name: /Remove guardian|Remove/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save corrections" }));

    expect(await screen.findByText("Add at least one parent or guardian.")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Guardians/ }).getAttribute("aria-selected")).toBe("true");
    expect(updateApplicationDetails).not.toHaveBeenCalled();
  });

  it("tells them when someone else saved first, rather than overwriting it", async () => {
    updateApplicationDetails.mockRejectedValue(Object.assign(new Error("conflict"), {
      response: { status: 409, data: { code: "stale_revision" } },
    }));
    const firstName = await openEditor();
    fireEvent.change(firstName, { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("button", { name: "Save corrections" }));

    expect(await screen.findByText(/Someone else saved changes/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save corrections" })).toBeTruthy();
  });
});
