import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import OcrReviewModal from "./OcrReviewModal";
import { buildReviewRows, currentValue, displayValue, fieldLabel } from "./ocrFields";

// These tests are about one property: a scan produces claims, and no claim
// reaches the form without someone ticking it. What this replaced showed a
// field *count* and one Apply button, then spread the result over form state —
// so in edit mode, where the form is pre-filled from the database, a single
// click could replace a saved LRN, name and birth date with no way back.

const EMPTY_STUDENT = {
  first_name: "", middle_name: "", last_name: "", lrn: "", birth_date: "",
};

function result(overrides = {}) {
  return {
    success: true,
    policy: "extract",
    source_engine: "paddle",
    mean_confidence: 0.92,
    is_expected_document: true,
    extracted: { first_name: "Maria", last_name: "Dela Cruz" },
    field_confidence: { first_name: "high", last_name: "high" },
    ledger: {},
    warnings: [],
    ...overrides,
  };
}

function rowFor(label) {
  return screen.getByRole("row", { name: new RegExp(label, "i") });
}

describe("ocrFields", () => {
  it("labels fields in words a registrar would use", () => {
    expect(fieldLabel("lrn")).toBe("LRN");
    expect(fieldLabel("birth_date")).toBe("Date of birth");
    expect(fieldLabel("something_new")).toBe("something new");
  });

  it("flattens guardians into a readable line rather than [object Object]", () => {
    const value = displayValue("guardians", [
      { relationship: "mother", full_name: "Cristina Reyes" },
      { relationship: "father", full_name: "Juan Dela Cruz" },
    ]);
    expect(value).toBe("mother: Cristina Reyes · father: Juan Dela Cruz");
  });

  it("reads the guardians already on the form the same way", () => {
    const current = currentValue("guardians", null, [
      { relationship: "mother", full_name: "Cristina Reyes" },
      { relationship: "father", full_name: "" },
    ]);
    expect(current).toBe("mother: Cristina Reyes");
  });
});

describe("buildReviewRows — the defaults are the safety mechanism", () => {
  it("ticks a field that fills a blank", () => {
    const [row] = buildReviewRows({
      extracted: { first_name: "Maria" },
      student: EMPTY_STUDENT,
      guardians: [],
    });
    expect(row.checked).toBe(true);
    expect(row.verdict).toBe("new");
  });

  it("leaves a field UNTICKED when it would overwrite what is on the form", () => {
    // The edit-mode data-loss path. It should cost a deliberate click.
    const [row] = buildReviewRows({
      extracted: { first_name: "Maria" },
      student: { ...EMPTY_STUDENT, first_name: "Mariel" },
      guardians: [],
    });
    expect(row.checked).toBe(false);
    expect(row.overwrites).toBe(true);
  });

  it("leaves a field UNTICKED when another document disagrees", () => {
    const [row] = buildReviewRows({
      extracted: { birth_date: "2011-05-14" },
      ledger: {
        birth_date: {
          verdict: "conflict",
          claims: [
            { value: "2010-05-14", source_label: "PSA Birth Certificate", source_code: "psa" },
            { value: "2011-05-14", source_label: "Form 137", source_code: "f137" },
          ],
        },
      },
      student: EMPTY_STUDENT,
      guardians: [],
    });
    expect(row.checked).toBe(false);
    expect(row.isConflict).toBe(true);
  });

  it("marks an identical value as no change rather than an overwrite", () => {
    const [row] = buildReviewRows({
      extracted: { first_name: "Maria" },
      student: { ...EMPTY_STUDENT, first_name: "Maria" },
      guardians: [],
    });
    expect(row.unchanged).toBe(true);
    expect(row.overwrites).toBe(false);
    expect(row.checked).toBe(true);
  });
});

describe("OcrReviewModal", () => {
  function open(props = {}) {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <OcrReviewModal
        documentName="PSA Birth Certificate"
        result={result()}
        student={EMPTY_STUDENT}
        guardians={[]}
        onApply={onApply}
        onClose={onClose}
        {...props}
      />
    );
    return { onApply, onClose };
  }

  it("shows the actual values, not just a count", () => {
    open();
    expect(screen.getByText("Maria")).toBeTruthy();
    expect(screen.getByText("Dela Cruz")).toBeTruthy();
  });

  it("shows what the form currently holds beside each incoming value", () => {
    open({ student: { ...EMPTY_STUDENT, first_name: "Mariel" } });
    const row = rowFor("First name");
    expect(within(row).getByText("Mariel")).toBeTruthy();
    expect(within(row).getByText("Maria")).toBeTruthy();
  });

  it("says a field is empty rather than rendering nothing", () => {
    open();
    expect(screen.getAllByText("empty").length).toBeGreaterThan(0);
  });

  it("applies only the ticked fields", () => {
    const { onApply } = open();
    fireEvent.click(screen.getByLabelText("Apply First name"));  // untick
    fireEvent.click(screen.getByRole("button", { name: /Add .*to form/ }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: "Maria" }),
      ["last_name"]
    );
  });

  it("cannot apply when nothing is ticked", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: /Add .*to form/ }).disabled).toBe(true);
  });

  it("surfaces every claim on a conflicting field", () => {
    open({
      result: result({
        extracted: { birth_date: "2011-05-14" },
        field_confidence: { birth_date: "medium" },
        ledger: {
          birth_date: {
            verdict: "conflict",
            claims: [
              { value: "2010-05-14", source_label: "PSA Birth Certificate", source_code: "psa" },
              { value: "2011-05-14", source_label: "Form 137", source_code: "f137" },
            ],
          },
        },
      }),
    });
    expect(screen.getByText(/disagree with another document/i)).toBeTruthy();
    expect(screen.getByText(/PSA Birth Certificate:/)).toBeTruthy();
    expect(screen.getByText(/Form 137:/)).toBeTruthy();
    // and it stays unticked
    expect(screen.getByLabelText("Apply Date of birth").checked).toBe(false);
  });

  it("shows server warnings about the wrong document", () => {
    open({
      result: result({
        is_expected_document: false,
        warnings: ["This may not be the document type it was filed under."],
      }),
    });
    expect(screen.getByText(/may not be the document type/i)).toBeTruthy();
  });

  it("says which reader produced the result", () => {
    open();
    expect(screen.getByText(/local reader/i)).toBeTruthy();

    render(
      <OcrReviewModal documentName="d" result={result({ source_engine: "groq" })}
                      student={EMPTY_STUDENT} guardians={[]} onApply={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getAllByText(/backup reader/i).length).toBeGreaterThan(0);
  });

  it("says so plainly when nothing was readable", () => {
    open({ result: result({ extracted: {}, field_confidence: {} }) });
    expect(screen.getByText(/Nothing readable was found/i)).toBeTruthy();
  });
});
