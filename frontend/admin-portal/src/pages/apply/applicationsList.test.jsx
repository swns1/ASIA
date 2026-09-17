/**
 * StudentApplicationsPage — the review queue.
 *
 * The queue read one page of 100 per tab and showed it as the whole list, and
 * a slow response for the tab just left could replace the one just opened.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getStudentApplications = vi.fn();

vi.mock("../../api/applicationApi", () => ({
  createApplicationInvite: vi.fn(),
  getStudentApplications: (...a) => getStudentApplications(...a),
  getStudentApplication: vi.fn(),
  claimStudentApplication: vi.fn(),
  approveStudentApplication: vi.fn(),
  rejectStudentApplication: vi.fn(),
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
