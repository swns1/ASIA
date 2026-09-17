import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Button from "./Button";
import Alert from "./Alert";
import ErrorState from "./ErrorState";
import Table, { TableRow, TableCell } from "./Table";
import Modal from "./Modal";
import { StatusBadge } from "./Badge";
import { Field, Input, Textarea } from "../FormField";
import { STUDENT_STATUS_MAP } from "../../constants/statusMaps";

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
];

describe("Button", () => {
  it("is disabled and marked busy while loading", () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole("button");
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
  });

  it("renders as a link when given a route", () => {
    render(
      <MemoryRouter>
        <Button to="/students">All students</Button>
      </MemoryRouter>
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe("/students");
  });

  it("falls back to a button when a link would be disabled", () => {
    render(
      <MemoryRouter>
        <Button to="/students" disabled>
          All students
        </Button>
      </MemoryRouter>
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button").disabled).toBe(true);
  });
});

describe("StatusBadge", () => {
  it("renders the label from the domain map", () => {
    render(<StatusBadge status="graduated" map={STUDENT_STATUS_MAP} />);
    expect(screen.queryByText("Graduated")).not.toBeNull();
  });

  it("humanises an unknown status instead of rendering blank", () => {
    render(<StatusBadge status="on_leave" map={STUDENT_STATUS_MAP} />);
    expect(screen.queryByText("On Leave")).not.toBeNull();
  });
});

describe("Alert", () => {
  it("announces problems assertively", () => {
    render(<Alert variant="error">Could not save</Alert>);
    expect(screen.getByRole("alert").textContent).toContain("Could not save");
  });

  it("uses a polite role for confirmations", () => {
    render(<Alert variant="success">Saved</Alert>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Saved");
  });
});

describe("ErrorState", () => {
  it("explains a permission failure and offers no retry", () => {
    render(
      <ErrorState error={{ response: { status: 403 } }} subject="students" onRetry={() => {}} />
    );
    expect(screen.queryByText("You don't have access to this")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("offers a retry for a network failure", () => {
    const onRetry = vi.fn();
    render(<ErrorState error={{}} subject="students" onRetry={onRetry} />);
    expect(screen.queryByText("Can't reach the server")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("Table states", () => {
  it("shows the error state instead of the empty state when a load fails", () => {
    // The regression this guards: four list pages used to swallow failures and
    // render "no records", so an outage looked like an empty database.
    render(
      <Table
        columns={COLUMNS}
        error={{ response: { status: 500 } }}
        onRetry={() => {}}
        isEmpty
        empty={{ title: "No students yet" }}
        errorSubject="students"
      />
    );
    expect(screen.queryByText("No students yet")).toBeNull();
    expect(screen.queryByText("Something went wrong on our end")).not.toBeNull();
  });

  it("shows the empty state when there is genuinely no data", () => {
    render(<Table columns={COLUMNS} isEmpty empty={{ title: "No students yet" }} />);
    expect(screen.queryByText("No students yet")).not.toBeNull();
  });

  it("activates a clickable row from the keyboard", () => {
    const onClick = vi.fn();
    render(
      <Table columns={COLUMNS}>
        <TableRow onClick={onClick}>
          <TableCell>Ana</TableCell>
          <TableCell>Active</TableCell>
        </TableRow>
      </Table>
    );
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onClick).toHaveBeenCalled();
  });

  // TeacherAdvisoriesPage puts Edit/Remove buttons inside a clickable row.
  // Enter on "Remove" used to reach the row's handler, which opened Edit and
  // cancelled the button's own activation.
  it("leaves Enter on a button inside the row to that button", () => {
    const onRow = vi.fn();
    render(
      <Table columns={COLUMNS}>
        <TableRow onClick={onRow}>
          <TableCell>Ana</TableCell>
          <TableCell>
            <button type="button">Remove</button>
          </TableCell>
        </TableRow>
      </Table>
    );
    const remove = screen.getByRole("button", { name: "Remove" });
    const notCancelled = fireEvent.keyDown(remove, { key: "Enter" });
    expect(onRow).not.toHaveBeenCalled();
    expect(notCancelled).toBe(true);
  });
});

describe("Field accessibility", () => {
  it("associates the label with its control and exposes the error", () => {
    render(
      <Field label="Email address" error="Enter a valid email address" required>
        <Input />
      </Field>
    );

    // getByLabelText only resolves if htmlFor/id are wired up — the app
    // previously had no label association anywhere.
    const input = screen.getByLabelText(/email address/i);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-required")).toBe("true");

    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy).textContent).toContain(
      "Enter a valid email address"
    );
  });
});

describe("Modal", () => {
  it("exposes a dialog with an accessible name and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Delete student?" description="This cannot be undone." onClose={onClose}>
        <p>body</p>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(
      document.getElementById(dialog.getAttribute("aria-labelledby")).textContent
    ).toBe("Delete student?");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores Escape while an action is in flight", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Deleting…" onClose={onClose} loading>
        <p>body</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  // A host that keeps the field's text in the same component that renders the
  // Modal hands it a new inline onClose on every keystroke. The focus trap used
  // to re-run on that and pull focus back to the autofocus button, so the
  // "Reject application" note could not be typed past its first letter.
  it("keeps focus in the field being typed into when the host re-renders", () => {
    function RejectNote() {
      const [note, setNote] = useState("");
      return (
        <Modal
          title="Reject?"
          onClose={() => {}}
          footer={<Button data-autofocus>Cancel</Button>}
        >
          <Field label="Reason">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Modal>
      );
    }
    render(<RejectNote />);
    const box = screen.getByLabelText("Reason");
    box.focus();
    fireEvent.change(box, { target: { value: "M" } });
    fireEvent.change(box, { target: { value: "Missing form" } });
    expect(document.activeElement).toBe(box);
    expect(box.value).toBe("Missing form");
  });

  it("uses the latest onClose for Escape", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Modal title="Edit" onClose={first}><p>body</p></Modal>);
    rerender(<Modal title="Edit" onClose={second}><p>body</p></Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
