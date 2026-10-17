// The Certificate of Registration reads only what a guardian may: the
// enrollment (with its learner) and the enrollment's own subject list. It used
// to ask /students/ and /subjects/, which refuse guardians, so a parent who
// missed the enrollment email had no copy to print.
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CORPrintPage from "./CORPrintPage";
import { getEnrollmentSubjects } from "../../api/enrollmentApi";
import { getStudent } from "../../api/studentApi";

vi.mock("../../utils/pdfExport", () => ({ downloadAsPDF: vi.fn() }));
vi.mock("../../api/studentApi", () => ({ getStudent: vi.fn() }));
vi.mock("../../api/enrollmentApi", () => ({
  getEnrollment: vi.fn(() => Promise.resolve({
    enrollment_id: 200, school_year: "2026-2027", school_level: "elementary",
    grade_level: "Grade 4", section: "Sampaguita", strand: null, semester: null,
    enrollment_status: "enrolled",
    student_detail: {
      student_id: 100, student_number: "S-100", lrn: "109876543210",
      first_name: "Maria", middle_name: "Santos", last_name: "Reyes",
      sex: "Female", birth_date: "2016-05-14",
    },
  })),
  getEnrollmentSubjects: vi.fn(() => Promise.resolve([
    { subject_id: 1, subject_code: "G4-ENG", subject_name: "English", strand: null, semester: null },
    { subject_id: 2, subject_code: "G4-MATH", subject_name: "Mathematics", strand: null, semester: null },
  ])),
}));
vi.mock("../../api/billingApi", () => ({ getSchoolSettings: vi.fn(() => Promise.resolve(null)) }));

function renderCOR() {
  render(
    <MemoryRouter initialEntries={["/guardian/child/200", "/print/cor/200"]} initialIndex={1}>
      <Routes>
        <Route path="/guardian/child/:enrollmentId" element={<div>Child page</div>} />
        <Route path="/print/cor/:enrollmentId" element={<CORPrintPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => { window.opener = null; });

describe("CORPrintPage", () => {
  it("prints the learner from the enrollment and the enrollment's own subjects", async () => {
    renderCOR();

    expect(await screen.findByText("Reyes, Maria, Santos")).toBeTruthy();
    expect(screen.getByText("109876543210")).toBeTruthy();
    expect(screen.getByText("English")).toBeTruthy();
    expect(screen.getByText("Mathematics")).toBeTruthy();
    expect(getEnrollmentSubjects).toHaveBeenCalledWith("200");
    // Staff-only: a guardian is refused it.
    expect(getStudent).not.toHaveBeenCalled();
  });

  it("goes back to the child page when opened in place", async () => {
    renderCOR();

    fireEvent.click(await screen.findByRole("button", { name: /Back/ }));

    expect(await screen.findByText("Child page")).toBeTruthy();
  });

  it("closes the tab staff opened it in", async () => {
    window.opener = {};
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    renderCOR();

    fireEvent.click(await screen.findByRole("button", { name: /Close/ }));

    expect(close).toHaveBeenCalled();
    close.mockRestore();
  });
});
