/**
 * Student records in dark mode: the detail page, the new / edit form and the
 * applications queue.
 *
 * The detail page and the queue render inside a dark area here, as AppLayout
 * gives them one. The form has no shell: it themes itself through ThemeArea,
 * so it is rendered at its real routes for an admin who chose dark. Each test
 * walks the page far enough to run its dark-only branches (the brand panel,
 * the dark card shadows, the status colours with no exact token).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeContext } from "../../hooks/useTheme";

const api = {
  getStudent: vi.fn(),
  getSiblingStudents: vi.fn(),
  getGuardiansByStudent: vi.fn(),
  getSiblingsByStudent: vi.fn(),
  getPreviousSchoolsByStudent: vi.fn(),
  getEnrollments: vi.fn(),
  getStudentLedger: vi.fn(),
  getHouseholdByStudent: vi.fn(),
  getStudentApplications: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/studentApi", () => ({
  getStudent: pass("getStudent"),
  getStudents: vi.fn(() => Promise.resolve({ results: [] })),
  getSiblingStudents: pass("getSiblingStudents"),
  linkSibling: vi.fn(),
  unlinkSibling: vi.fn(),
  updateStudent: vi.fn(),
  bulkCreateStudent: vi.fn(),
}));
vi.mock("../../api/guardianApi", () => ({
  getGuardiansByStudent: pass("getGuardiansByStudent"),
  getGuardiansByUserIds: vi.fn(() => Promise.resolve([])),
  linkGuardianAccount: vi.fn(),
  createGuardian: vi.fn(), updateGuardian: vi.fn(), deleteGuardian: vi.fn(),
}));
vi.mock("../../api/siblingApi", () => ({
  getSiblingsByStudent: pass("getSiblingsByStudent"),
  createSibling: vi.fn(), updateSibling: vi.fn(), deleteSibling: vi.fn(),
}));
vi.mock("../../api/previousSchoolApi", () => ({
  getPreviousSchoolsByStudent: pass("getPreviousSchoolsByStudent"),
  createPreviousSchool: vi.fn(), updatePreviousSchool: vi.fn(), deletePreviousSchool: vi.fn(),
}));
vi.mock("../../api/householdApi", () => ({
  getHouseholdByStudent: pass("getHouseholdByStudent"),
  createHousehold: vi.fn(), updateHousehold: vi.fn(),
}));
vi.mock("../../api/enrollmentApi", () => ({ getEnrollments: pass("getEnrollments") }));
vi.mock("../../api/billingApi", () => ({ getStudentLedger: pass("getStudentLedger") }));
vi.mock("../../api/identityApi", () => ({ getUsers: vi.fn(() => Promise.resolve([])), createUser: vi.fn() }));
vi.mock("../../api/applicationApi", () => ({
  createApplicationInvite: vi.fn(),
  getStudentApplications: pass("getStudentApplications"),
  getStudentApplication: vi.fn(),
  claimStudentApplication: vi.fn(() => Promise.resolve({})),
  approveStudentApplication: vi.fn(),
  changeApplicationSchoolYear: vi.fn(),
  updateApplicationDetails: vi.fn(),
  rejectStudentApplication: vi.fn(),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2026-2027"],
    entryYears: ["2026-2027"],
    yearStates: { "2026-2027": "current" },
    yearCounts: {},
  }),
}));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: StudentDetailPage } = await import("../StudentDetailPage");
const { default: StudentFormPage } = await import("../StudentFormPage");
const { default: StudentApplicationsPage } = await import("../StudentApplicationsPage");

const STUDENT = {
  student_id: 12, student_number: "2026-0012", lrn: "123456789012",
  first_name: "Ana", middle_name: null, last_name: "Cruz", suffix: null,
  sex: "female", birth_date: "2016-05-01", religion: "Catholic",
  email: "ana@example.com", mobile_number: "09171234567",
  status: "active", current_address: "Tanay", permanent_address: "Tanay",
  household: null, updated_at: "2026-09-24T08:00:00+08:00",
};
const GUARDIANS = [
  { guardian_id: 3, relationship: "mother", full_name: "Maria Cruz", occupation: "Nurse",
    email_address: "maria@example.com", mobile_number: null, is_primary_contact: true, user_id: 40 },
  { guardian_id: 4, relationship: "father", full_name: "Jose Cruz", occupation: null,
    email_address: null, mobile_number: null, is_primary_contact: false, user_id: null },
];
const LEDGER = {
  total_billed: "30000.00", total_paid: "30000.00", total_balance: "0.00",
  school_years: [{
    school_year: "2026-2027", grade_level: "Grade 4", school_level: "elementary",
    section: "Sampaguita", enrollment_status: "enrolled",
    year_billed: "30000.00", year_paid: "30000.00", year_balance: "0.00",
    invoices: [{ invoice_id: 9, invoice_no: "INV-0009", status: "paid", net_amount: "30000.00",
      total_paid: "30000.00", invoice_date: "2026-06-01", payment_plan: "full_payment" }],
  }],
};

const themeOf = (el) => el.closest("[data-theme]")?.getAttribute("data-theme") ?? null;

function signInAs(role) {
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Staff", role }));
}

// What AppLayout gives a converted page in dark mode.
function renderDark(ui, path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeContext.Provider value="dark">
        <div data-theme="dark">
          <Routes>
            <Route path="/students/:id" element={ui} />
            <Route path="*" element={ui} />
          </Routes>
        </div>
      </ThemeContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  api.getStudent.mockResolvedValue(STUDENT);
  api.getGuardiansByStudent.mockResolvedValue(GUARDIANS);
  api.getSiblingStudents.mockResolvedValue([
    { student_id: 13, first_name: "Ben", last_name: "Cruz", student_number: "2026-0013", lrn: null },
    { student_id: 14, first_name: "Cara", last_name: "Cruz", student_number: "2026-0014", lrn: null },
  ]);
  api.getSiblingsByStudent.mockResolvedValue([{ sibling_id: 1, full_name: "Dan Cruz", age: 4 }]);
  api.getPreviousSchoolsByStudent.mockResolvedValue([
    { previous_school_id: 1, school_name: "Tanay Elementary", school_address: "Tanay" },
  ]);
  api.getEnrollments.mockResolvedValue({ results: [
    { enrollment_id: 7, grade_level: "Grade 4", section: "Sampaguita", school_year: "2026-2027",
      semester: null, strand: null, enrollment_status: "enrolled" },
    { enrollment_id: 6, grade_level: "Grade 3", section: "Rosal", school_year: "2025-2026",
      semester: null, strand: null, enrollment_status: "transferred_out" },
  ] });
  api.getStudentLedger.mockResolvedValue(LEDGER);
  api.getHouseholdByStudent.mockResolvedValue(null);
  api.getStudentApplications.mockResolvedValue({ results: [
    { student_application_id: 1, reference: "APP-1", first_name: "Ana", last_name: "Reyes",
      lrn: "", school_year: "2026-2027", submitted_at: "2026-09-01T08:00:00Z", duplicate_of_student_id: 5 },
  ], next: null });
});

describe("Student detail in dark mode", { timeout: 20_000 }, () => {
  it("draws the profile header as the brand panel and every tab's content", async () => {
    signInAs("admin");
    renderDark(<StudentDetailPage />, "/students/12");

    const name = (await screen.findAllByText("Ana Cruz")).find((el) => el.tagName === "DIV" && !el.closest("nav"));
    expect(themeOf(name)).toBe("dark");
    // The lead block takes the brand panel's dark classes and its backdrop.
    const hero = name.closest(".dark\\:bg-brand-950");
    expect(hero).not.toBeNull();
    expect(hero.querySelector('[aria-hidden="true"].-z-10')).not.toBeNull();
    expect(within(hero).getByText("09171234567")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Guardians/ }));
    expect(await screen.findByText("Maria Cruz")).toBeTruthy();
    expect(screen.getByText("Primary Contact")).toBeTruthy();
    expect(screen.getByText("Portal access")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Siblings/ }));
    expect(await screen.findByText("Ben Cruz")).toBeTruthy();
    expect(screen.getByText("Dan Cruz")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Prev\. Schools/ }));
    expect(await screen.findByText("Tanay Elementary")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Enrollments/ }));
    expect(await screen.findByText("Transferred Out")).toBeTruthy();
    expect(screen.getByText("Enrolled")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Financial History/ }));
    expect(await screen.findByText("INV-0009")).toBeTruthy();
    expect(screen.getByText("Settled")).toBeTruthy();
    expect(screen.getByText("Total Paid")).toBeTruthy();
  });
});

describe("Student form in dark mode (ThemeArea)", { timeout: 20_000 }, () => {
  const renderForm = (path) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/students/new" element={<StudentFormPage />} />
          <Route path="/students/:id/edit" element={<StudentFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

  beforeEach(() => localStorage.setItem("asia.dev.theme", "dark"));

  it("goes dark on /students/new for an admin", async () => {
    signInAs("admin");
    renderForm("/students/new");
    const title = await screen.findByRole("heading", { name: "New Student Registration" });
    expect(themeOf(title)).toBe("dark");
    expect(screen.getByText("Student Information")).toBeTruthy();
  });

  it("goes dark on /students/12/edit for an admin", async () => {
    signInAs("admin");
    renderForm("/students/12/edit");
    const title = await screen.findByRole("heading", { name: "Edit Student" });
    expect(themeOf(title)).toBe("dark");
    expect(await screen.findByDisplayValue("123456789012")).toBeTruthy();
  });

  it("stays light for a registrar", async () => {
    signInAs("registrar");
    renderForm("/students/new");
    const title = await screen.findByRole("heading", { name: "New Student Registration" });
    expect(themeOf(title)).toBeNull();
  });
});

describe("Student applications in dark mode", () => {
  it("lists the queue and opens the issue window", async () => {
    signInAs("admin");
    renderDark(<StudentApplicationsPage />, "/student-applications");

    const ref = await screen.findByText("APP-1");
    expect(themeOf(ref)).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: /Issue form link/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Contact Email")).toBeTruthy();
  });
});
