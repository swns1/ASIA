/**
 * ApplicantFormPage — kiosk behaviour only on a staff-armed device.
 *
 * Parents open the form on their own phone (QR code on the registrar's
 * screen) as well as on a school device a registrar hands over. The idle
 * reset and success countdown exist for the shared device; on a parent's
 * phone they only throw the family back to the code gate mid-form.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const verifyApplicantCode = vi.fn();
const idleReset = vi.fn();

vi.mock("../../api/applyApi", () => ({
  verifyApplicantCode: (...a) => verifyApplicantCode(...a),
  saveApplicationDraft: vi.fn(() => Promise.resolve({ token: "t", revision: 1, payload: {} })),
  submitApplication: vi.fn(),
}));
vi.mock("../../hooks/useIdleReset", () => ({
  default: (options) => idleReset(options),
}));

const { default: ApplicantFormPage } = await import("./ApplicantFormPage");

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/apply/invite-1"]}>
      <Routes>
        <Route path="/apply/:inviteId" element={<ApplicantFormPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function enterCode() {
  fireEvent.change(screen.getByPlaceholderText("e.g. AB3D9K2M"), { target: { value: "ab3d9k2m" } });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  await waitFor(() => expect(verifyApplicantCode).toHaveBeenCalledWith("invite-1", "AB3D9K2M"));
}

const lastIdleOptions = () => idleReset.mock.calls.at(-1)[0];

describe("ApplicantFormPage kiosk mode", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    idleReset.mockClear();
    verifyApplicantCode.mockReset();
    verifyApplicantCode.mockResolvedValue({
      token: "session-token",
      applicant_full_name: "Juan Dela Cruz",
      payload: {},
      revision: 0,
    });
  });

  it("on a parent's own phone, opens the form with no hand-over and no idle reset", async () => {
    renderPage();
    await enterCode();

    expect(await screen.findAllByText("Household")).not.toHaveLength(0);
    expect(screen.queryByText("Hand this device to the applicant?")).toBeNull();
    expect(lastIdleOptions().enabled).toBe(false);
    expect(sessionStorage.getItem("slis.kioskDevice")).toBeNull();
  });

  it("on a device staff hand over, signs staff out and turns the idle reset on", async () => {
    sessionStorage.setItem("access_token", "staff-token");
    renderPage();
    await enterCode();

    fireEvent.click(await screen.findByRole("button", { name: /hand over device/i }));

    await waitFor(() => expect(lastIdleOptions().enabled).toBe(true));
    expect(sessionStorage.getItem("access_token")).toBeNull();
    expect(sessionStorage.getItem("slis.kioskDevice")).toBe("1");
  });

  it("keeps an armed device in kiosk mode for the next family, after staff were signed out", async () => {
    sessionStorage.setItem("slis.kioskDevice", "1");
    renderPage();
    await enterCode();

    expect(await screen.findAllByText("Household")).not.toHaveLength(0);
    expect(screen.queryByText("Hand this device to the applicant?")).toBeNull();
    expect(lastIdleOptions().enabled).toBe(true);
  });
});
