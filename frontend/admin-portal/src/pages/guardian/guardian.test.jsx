/**
 * Guardian portal — the two pages a parent actually sees.
 *
 * These had no tests at all, and the reason is worth recording: until the
 * seed data grew a `role='guardian'` user linked to a guardians row, there
 * was no way to log into /guardian on a clean database, so nothing here was
 * ever exercised by hand either. That is how the stuck-skeleton bug below
 * survived.
 *
 * The focus is failure behaviour rather than happy-path markup. Both pages
 * fetch several endpoints independently and used to collapse every failure
 * into `null`, which every empty state then rendered as reassurance — a
 * parent with an unpaid balance was told "No billing records found."
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const getReportCard = vi.fn();
const getAttendanceSummary = vi.fn();
const getStudentLedger = vi.fn();
const fetchRequirementSummary = vi.fn();
const getEnrollments = vi.fn();

vi.mock("../../api/enrollmentApi", () => ({
  getReportCard: (...a) => getReportCard(...a),
  getEnrollments: (...a) => getEnrollments(...a),
}));
vi.mock("../../api/attendanceApi", () => ({
  getAttendanceSummary: (...a) => getAttendanceSummary(...a),
}));
vi.mock("../../api/billingApi", () => ({
  getStudentLedger: (...a) => getStudentLedger(...a),
}));
vi.mock("../../api/requirementApi", () => ({
  fetchRequirementSummary: (...a) => fetchRequirementSummary(...a),
}));

const { default: GuardianChildPage } = await import("../GuardianChildPage");
const { default: GuardianHomePage } = await import("../GuardianHomePage");

// Shapes taken from the real endpoints, trimmed to what these pages read.
const REPORT_CARD = {
  student: {
    student_id: 100,
    first_name: "Maria",
    middle_name: "Santos",
    last_name: "Reyes",
    suffix: null,
  },
  enrollment: {
    grade_level: "Kindergarten",
    section: "Sunflower",
    school_level: "kindergarten",
    school_year: "2025-2026",
  },
  grading_periods: [{ key: "q1", label: "1st Quarter" }],
  subjects: [
    { subject_id: 1, subject_name: "Reading", grades: { q1: { numeric_grade: 92 } }, average: 92 },
  ],
  overall_gpa: 92,
};

const ATTENDANCE = { totals: { present: 40, absent: 2, late: 1, excused: 0, total: 43 } };

const LEDGER = {
  total_billed: "19500.00",
  total_paid: "11000.00",
  total_balance: "8500.00",
  school_years: [],
};

const REQUIREMENTS = [
  { requirement_type_id: 1, name: "Birth Certificate", is_submitted: true },
  { requirement_type_id: 2, name: "Form 138", is_submitted: false },
];

function renderChildPage() {
  return render(
    <MemoryRouter initialEntries={["/guardian/child/200"]}>
      <Routes>
        <Route path="/guardian/child/:enrollmentId" element={<GuardianChildPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderHomePage() {
  return render(
    <MemoryRouter>
      <GuardianHomePage />
    </MemoryRouter>,
  );
}

/** Switches tabs the way a parent does. */
function openTab(name) {
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(name) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  getReportCard.mockResolvedValue(REPORT_CARD);
  getAttendanceSummary.mockResolvedValue(ATTENDANCE);
  getStudentLedger.mockResolvedValue(LEDGER);
  fetchRequirementSummary.mockResolvedValue(REQUIREMENTS);
  getEnrollments.mockResolvedValue({ results: [] });
});

describe("GuardianChildPage — one failed call can't strand the other sections", () => {
  it("settles attendance, billing and documents when the report card fails", async () => {
    // The bug: these three fetches were chained after `await getReportCard()`
    // inside the same try block, so a rejection jumped to catch before their
    // .finally() handlers were ever created — leaving three unrelated tabs as
    // skeletons for the life of the page. Each tab must now reach a settled
    // state and say what happened.
    getReportCard.mockRejectedValue(new Error("grading service is down"));

    renderChildPage();

    expect(await screen.findByText(/grading service is down/)).toBeTruthy();

    // Attendance is independent of the report card, so it should have loaded
    // normally — a real rate, not a skeleton and not a failure.
    openTab("Attendance");
    expect(await screen.findByText(/% attendance rate/)).toBeTruthy();

    // Billing and documents genuinely cannot be fetched without student_id,
    // so they must say so — the bug left them as skeletons instead.
    for (const tab of ["Billing", "Documents"]) {
      openTab(tab);
      // eslint-disable-next-line no-await-in-loop
      expect(await screen.findByText("This section couldn't be loaded")).toBeTruthy();
    }
  });

  it("fetches attendance even though the report card failed", async () => {
    // Attendance is keyed off the enrollment id, which the URL already has —
    // it never needed the report card, but used to be blocked behind it.
    getReportCard.mockRejectedValue(new Error("nope"));

    renderChildPage();

    await waitFor(() => {
      expect(getAttendanceSummary).toHaveBeenCalledWith({ enrollment: "200" });
    });
  });

  it("does not attempt billing or documents without a student id", async () => {
    // Both are keyed off student_id, which only the report card carries.
    getReportCard.mockRejectedValue(new Error("nope"));

    renderChildPage();

    await waitFor(() => expect(getReportCard).toHaveBeenCalled());
    expect(getStudentLedger).not.toHaveBeenCalled();
    expect(fetchRequirementSummary).not.toHaveBeenCalled();
  });

  it("offers a retry when the page-level load fails", async () => {
    // Previously the only recovery from a transient failure was a full reload.
    getReportCard.mockRejectedValueOnce(new Error("transient"));

    renderChildPage();

    const retry = await screen.findByRole("button", { name: /Try again/ });
    fireEvent.click(retry);

    await waitFor(() => expect(getReportCard).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Maria Santos Reyes")).toBeTruthy();
  });

  it("renders the child and their grades on the happy path", async () => {
    renderChildPage();

    expect(await screen.findByText("Maria Santos Reyes")).toBeTruthy();
    expect(screen.getByText("Reading")).toBeTruthy();
  });
});

describe("GuardianChildPage — a failed fetch is never reported as 'nothing owed'", () => {
  it("says the billing section failed rather than 'No billing records found'", async () => {
    // The worst of the three: a 403 or 500 rendered as reassurance, on the one
    // screen where a wrong reassurance costs the parent money.
    getStudentLedger.mockRejectedValue(new Error("403"));

    renderChildPage();
    await screen.findByText("Maria Santos Reyes");
    openTab("Billing");

    expect(await screen.findByText("This section couldn't be loaded")).toBeTruthy();
    expect(screen.queryByText(/No billing records found/)).toBeNull();
    expect(screen.getByText(/Do not treat this as a zero balance/)).toBeTruthy();
  });

  it("says the attendance section failed rather than 'No attendance records yet'", async () => {
    getAttendanceSummary.mockRejectedValue(new Error("500"));

    renderChildPage();
    await screen.findByText("Maria Santos Reyes");
    openTab("Attendance");

    expect(await screen.findByText("This section couldn't be loaded")).toBeTruthy();
    expect(screen.queryByText(/No attendance records yet/)).toBeNull();
  });

  it("still shows a genuinely empty attendance record as empty", async () => {
    // The distinction the `failed` flag exists to preserve: loaded-and-empty
    // must keep reading as empty, not as an error.
    getAttendanceSummary.mockResolvedValue({ totals: { total: 0 } });

    renderChildPage();
    await screen.findByText("Maria Santos Reyes");
    openTab("Attendance");

    expect(await screen.findByText(/No attendance records yet/)).toBeTruthy();
    expect(screen.queryByText("This section couldn't be loaded")).toBeNull();
  });

  it("does not summarise a failed ledger as 'Nothing due'", async () => {
    // The summary strip above the tabs answers "do I owe anything?" first,
    // so it has to fail the same honest way the Billing tab does.
    getStudentLedger.mockRejectedValue(new Error("403"));

    renderChildPage();
    await screen.findByText("Maria Santos Reyes");

    expect(await screen.findByText("Couldn't load")).toBeTruthy();
    expect(screen.queryByText("Nothing due")).toBeNull();
  });

  it("shows no summary strip when the report card itself failed", async () => {
    getReportCard.mockRejectedValue(new Error("grading service is down"));

    renderChildPage();
    await screen.findByText(/grading service is down/);

    expect(screen.queryByText("Nothing due")).toBeNull();
    expect(screen.queryByText("Not posted yet")).toBeNull();
    expect(screen.queryByText("Latest grades")).toBeNull();
  });

  it("summarises what is due when the ledger has an open installment", async () => {
    getStudentLedger.mockResolvedValue({
      ...LEDGER,
      school_years: [{
        school_year: "2025-2026",
        invoices: [{
          invoice_no: "INV-1",
          installments: [{ installment_id: 1, sequence: 1, status: "pending", balance: "2500.00", amount: "2500.00", due_date: "2999-01-15" }],
        }],
      }],
    });

    renderChildPage();
    await screen.findByText("Maria Santos Reyes");

    expect(await screen.findByText("Next payment")).toBeTruthy();
    expect(screen.getByText("₱2,500.00")).toBeTruthy();
  });

  it("renders the billing totals when the ledger loads", async () => {
    renderChildPage();
    await screen.findByText("Maria Santos Reyes");
    await waitFor(() => expect(getStudentLedger).toHaveBeenCalledWith(100));

    openTab("Billing");

    expect(await screen.findByText("₱8,500.00")).toBeTruthy();
  });
});

describe("GuardianHomePage", () => {
  it("does not tell a parent their account is unlinked when the request failed", async () => {
    // `children` stays empty on failure, which used to fall through to the
    // "contact the registrar" empty state — sending a parent to phone the
    // school about a transient server error.
    getEnrollments.mockRejectedValue(new Error("server exploded"));

    renderHomePage();

    expect(await screen.findByText(/server exploded/)).toBeTruthy();
    expect(screen.queryByText("No linked students yet")).toBeNull();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
  });

  it("still shows the empty state when the parent genuinely has no children", async () => {
    getEnrollments.mockResolvedValue({ results: [] });

    renderHomePage();

    expect(await screen.findByText("No linked students yet")).toBeTruthy();
  });

  it("collapses a child's multiple enrollments into one card", async () => {
    // Student 110 in the seed has two enrollments (a completed 2024-2025 and
    // an enrolled 2025-2026); a parent should see one child, not two.
    const child = { full_name: "Bianca Soriano", lrn: "136700000110" };
    getEnrollments.mockResolvedValue({
      results: [
        {
          enrollment_id: 210, student_id: 110, school_year: "2024-2025",
          enrollment_status: "completed", grade_level: "Grade 4", section: "A",
          school_level: "elementary", student_detail: child,
        },
        {
          enrollment_id: 215, student_id: 110, school_year: "2025-2026",
          enrollment_status: "enrolled", grade_level: "Grade 4", section: "A",
          school_level: "elementary", student_detail: child,
        },
      ],
    });

    renderHomePage();

    await screen.findByText("Bianca Soriano");
    expect(screen.getAllByText("Bianca Soriano").length).toBe(1);
  });

  it("links a child card to their current enrollment, not a past one", async () => {
    // pickPrimary prefers an active enrollment over the most recent — a parent
    // opening a child should land on this year, not last year's completed row.
    const child = { full_name: "Bianca Soriano", lrn: "136700000110" };
    getEnrollments.mockResolvedValue({
      results: [
        {
          enrollment_id: 210, student_id: 110, school_year: "2024-2025",
          enrollment_status: "completed", grade_level: "Grade 4", section: "A",
          school_level: "elementary", student_detail: child,
        },
        {
          enrollment_id: 215, student_id: 110, school_year: "2025-2026",
          enrollment_status: "enrolled", grade_level: "Grade 4", section: "A",
          school_level: "elementary", student_detail: child,
        },
      ],
    });

    renderHomePage();

    await screen.findByText("Bianca Soriano");
    const card = screen.getByRole("button", { name: /Bianca Soriano/ });
    expect(card.textContent).toContain("2025-2026");
    expect(card.textContent).not.toContain("2024-2025");
  });
});
