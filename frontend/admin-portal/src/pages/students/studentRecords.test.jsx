/**
 * Student record pages after the student-service QA pass.
 *
 * - "Link account" PATCHed a field the server treats as read-only, so it
 *   announced "Guardian account linked." and saved nothing.
 * - Teachers and accounting were shown Edit on a record they can't save.
 * - Editing a student to add a household was refused as "updated by another
 *   user": the second save re-sent the updated_at the first had just changed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = {
  getStudent: vi.fn(),
  updateStudent: vi.fn(),
  getSiblingStudents: vi.fn(),
  getGuardiansByStudent: vi.fn(),
  getGuardiansByUserIds: vi.fn(),
  linkGuardianAccount: vi.fn(),
  updateGuardian: vi.fn(),
  getSiblingsByStudent: vi.fn(),
  getPreviousSchoolsByStudent: vi.fn(),
  getEnrollments: vi.fn(),
  getUsers: vi.fn(),
  getHouseholdByStudent: vi.fn(),
  createHousehold: vi.fn(),
  updateHousehold: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/studentApi", () => ({
  getStudent: pass("getStudent"),
  getStudents: vi.fn(() => Promise.resolve({ results: [] })),
  getSiblingStudents: pass("getSiblingStudents"),
  linkSibling: vi.fn(),
  unlinkSibling: vi.fn(),
  updateStudent: pass("updateStudent"),
  bulkCreateStudent: vi.fn(),
}));
vi.mock("../../api/guardianApi", () => ({
  getGuardiansByStudent: pass("getGuardiansByStudent"),
  getGuardiansByUserIds: pass("getGuardiansByUserIds"),
  linkGuardianAccount: pass("linkGuardianAccount"),
  createGuardian: vi.fn(),
  updateGuardian: pass("updateGuardian"),
  deleteGuardian: vi.fn(),
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
  createHousehold: pass("createHousehold"),
  updateHousehold: pass("updateHousehold"),
}));
vi.mock("../../api/enrollmentApi", () => ({ getEnrollments: pass("getEnrollments") }));
vi.mock("../../api/billingApi", () => ({ getStudentLedger: vi.fn() }));
vi.mock("../../api/identityApi", () => ({ getUsers: pass("getUsers"), createUser: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: StudentDetailPage } = await import("../StudentDetailPage");
const { default: StudentFormPage } = await import("../StudentFormPage");

const STUDENT = {
  student_id: 5, student_number: "2026-0005", lrn: "123456789012",
  first_name: "Ana", middle_name: null, last_name: "Cruz", suffix: null,
  sex: "female", birth_date: "2016-05-01", religion: null, email: null, mobile_number: null,
  status: "active", current_address: "Tanay", permanent_address: "Tanay",
  household: null, updated_at: "2026-09-24T08:00:00+08:00",
};
const MOTHER = {
  guardian_id: 3, student: 5, student_name: "Ana Cruz", relationship: "mother",
  full_name: "Maria Cruz", occupation: null, email_address: "maria@example.com",
  mobile_number: null, is_primary_contact: true, user_id: null,
};

function signIn(role) {
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Staff", role }));
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/students/:id" element={<StudentDetailPage />} />
        <Route path="/students/:id/edit" element={<StudentFormPage />} />
        <Route path="/students" element={<div>students list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.getStudent.mockResolvedValue(STUDENT);
  api.getGuardiansByStudent.mockResolvedValue([MOTHER]);
  api.getGuardiansByUserIds.mockResolvedValue([]);
  api.getSiblingStudents.mockResolvedValue([]);
  api.getSiblingsByStudent.mockResolvedValue([]);
  api.getPreviousSchoolsByStudent.mockResolvedValue([]);
  api.getEnrollments.mockResolvedValue({ results: [] });
  api.getHouseholdByStudent.mockResolvedValue(null);
});

describe("Link login account", () => {
  it("links through the checked endpoint, and never offers a deactivated account", async () => {
    signIn("registrar");
    api.getUsers.mockResolvedValue([
      { user_id: 40, name: "Maria Cruz", email: "maria@example.com", role: "guardian", is_active: true },
      { user_id: 41, name: "Old Account", email: "old@example.com", role: "guardian", is_active: false },
    ]);
    api.linkGuardianAccount.mockResolvedValue({ ...MOTHER, user_id: 40 });
    renderAt("/students/5");

    fireEvent.click(await screen.findByRole("tab", { name: /Guardians/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Link account/ }));
    const dialog = await screen.findByRole("dialog");
    const select = await within(dialog).findByRole("combobox");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options.some((t) => t.includes("Old Account"))).toBe(false);

    fireEvent.change(select, { target: { value: "40" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Save link/ }));

    await waitFor(() => expect(api.linkGuardianAccount).toHaveBeenCalledWith(3, 40));
    expect(await screen.findByText("Portal access")).toBeTruthy();
  });
});

describe("Edit Student", () => {
  it("is offered to a registrar", async () => {
    signIn("registrar");
    renderAt("/students/5");
    expect(await screen.findByRole("button", { name: /Edit Student/ })).toBeTruthy();
  });

  it.each(["teacher", "accounting"])("is not offered to %s, who can't save a student", async (role) => {
    signIn(role);
    renderAt("/students/5");
    await screen.findAllByText("Ana Cruz");
    expect(screen.queryByRole("button", { name: /Edit Student/ })).toBeNull();
  });
});

describe("Editing a student who has no household yet", () => {
  it("links the new household using the updated_at the first save returned", async () => {
    signIn("registrar");
    api.updateStudent
      .mockResolvedValueOnce({ ...STUDENT, updated_at: "2026-09-25T10:00:00+08:00" })
      .mockResolvedValueOnce({ ...STUDENT, household: 77, updated_at: "2026-09-25T10:00:01+08:00" });
    api.createHousehold.mockResolvedValue({ household_id: 77 });
    api.updateGuardian.mockResolvedValue(MOTHER);
    const { container } = renderAt("/students/5/edit");

    await waitFor(() => expect(api.getGuardiansByStudent).toHaveBeenCalled());
    fireEvent.click(await screen.findByTitle("Go to Household"));
    const arrangement = await waitFor(() => {
      const el = container.querySelector('select[name="living_arrangement"]');
      if (!el) throw new Error("household step not shown yet");
      return el;
    });
    fireEvent.change(arrangement, { target: { name: "living_arrangement", value: "both_parents" } });
    fireEvent.click(screen.getByTitle("Go to Review"));
    fireEvent.click(await screen.findByTitle("Update Student"));

    await waitFor(() => expect(api.updateStudent).toHaveBeenCalledTimes(2));
    const [, link] = api.updateStudent.mock.calls[1];
    expect(link.household).toBe(77);
    expect(link.updated_at).toBe("2026-09-25T10:00:00+08:00");
    expect(await screen.findByText("students list")).toBeTruthy();
  });
});
