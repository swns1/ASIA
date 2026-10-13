import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotificationBell from "./NotificationBell";

const ITEMS = [
  { id: "unpaid", icon: "ti-receipt-off", tone: "error", message: "12 unpaid invoices", hint: "Open Invoices to follow up", link: "/invoices?status=unpaid" },
  { id: "pending_enr", icon: "ti-clock", tone: "warning", message: "5 enrollments pending approval", link: "/enrollments?enrollment_status=pending" },
];

function renderBell(items, failed = false) {
  return render(
    <MemoryRouter>
      <p>outside</p>
      <NotificationBell items={items} failed={failed} />
    </MemoryRouter>
  );
}

describe("NotificationBell", () => {
  it("shows a red dot and names the count for screen readers when there are items", () => {
    const { container } = renderBell(ITEMS);
    const bell = screen.getByRole("button", { name: "Notifications, 2 need your attention" });
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".bg-brand-500")).not.toBeNull();
  });

  it("has no dot and says so when there is nothing", () => {
    const { container } = renderBell([]);
    fireEvent.click(screen.getByRole("button", { name: "Notifications, nothing new" }));
    expect(container.querySelector(".bg-brand-500")).toBeNull();
    expect(screen.getByText("You're all caught up")).toBeTruthy();
  });

  it("opens a list of links to where each item is handled", () => {
    renderBell(ITEMS);
    const bell = screen.getByRole("button", { name: /Notifications/ });
    fireEvent.click(bell);

    expect(bell.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: /12 unpaid invoices/ }).getAttribute("href")).toBe("/invoices?status=unpaid");
    expect(screen.getByRole("link", { name: /5 enrollments pending approval/ }).getAttribute("href")).toBe(
      "/enrollments?enrollment_status=pending"
    );
  });

  it("closes on Escape and hands focus back to the bell", async () => {
    renderBell(ITEMS);
    const bell = screen.getByRole("button", { name: /Notifications/ });
    fireEvent.click(bell);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(bell);
    await waitFor(() => expect(screen.queryByRole("link", { name: /unpaid invoices/ })).toBeNull());
  });

  it("closes on a click outside, but not on a click inside", async () => {
    renderBell(ITEMS);
    const bell = screen.getByRole("button", { name: /Notifications/ });
    fireEvent.click(bell);

    fireEvent.mouseDown(screen.getByText("Open Invoices to follow up"));
    expect(bell.getAttribute("aria-expanded")).toBe("true");

    fireEvent.mouseDown(screen.getByText("outside"));
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(screen.queryByRole("link", { name: /unpaid invoices/ })).toBeNull());
  });

  // A count that never arrived isn't nothing to do.
  it("keeps the dot and says so when nothing loaded, instead of all caught up", () => {
    const { container } = renderBell([], true);
    fireEvent.click(screen.getByRole("button", { name: "Notifications, some couldn't be checked" }));
    expect(container.querySelector(".bg-brand-500")).not.toBeNull();
    expect(screen.getByText("Couldn't check everything")).toBeTruthy();
    expect(screen.getByText("Some notifications couldn't be checked")).toBeTruthy();
    expect(screen.queryByText("You're all caught up")).toBeNull();
  });

  it("lists what did load above the notice", () => {
    renderBell(ITEMS, true);
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 2 need your attention, some couldn't be checked" }));
    expect(screen.getByRole("link", { name: /12 unpaid invoices/ })).toBeTruthy();
    expect(screen.getByText("Some notifications couldn't be checked")).toBeTruthy();
  });

  // It sits beside the school-year picker on the admin home.
  it("is drawn in the year picker's shape", () => {
    renderBell([]);
    const bell = screen.getByRole("button", { name: /Notifications/ });
    expect(bell.className).toContain("h-[42px]");
    expect(bell.className).toContain("rounded-lg");
    expect(bell.className).toContain("border-[1.5px]");
    expect(bell.className).not.toContain("rounded-full");
  });
});
