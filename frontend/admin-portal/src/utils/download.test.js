import { describe, it, expect, vi } from "vitest";
import { filenameFromDisposition, parseFormWarnings, readBlobError, saveBlob } from "./download";

describe("filenameFromDisposition", () => {
  it("reads a quoted or bare filename", () => {
    expect(filenameFromDisposition('attachment; filename="SF1_Grade-7_Rizal.xlsx"', "x.xlsx")).toBe("SF1_Grade-7_Rizal.xlsx");
    expect(filenameFromDisposition("attachment; filename=SF2.xlsx", "x.xlsx")).toBe("SF2.xlsx");
  });

  it("falls back without a header", () => {
    expect(filenameFromDisposition(undefined, "school-form.xlsx")).toBe("school-form.xlsx");
    expect(filenameFromDisposition("attachment", "school-form.xlsx")).toBe("school-form.xlsx");
  });
});

describe("parseFormWarnings", () => {
  it("reads the server's JSON list", () => {
    expect(parseFormWarnings('["One.", "Two."]')).toEqual(["One.", "Two."]);
  });

  it("ignores a missing, broken or non-list header", () => {
    expect(parseFormWarnings(undefined)).toEqual([]);
    expect(parseFormWarnings("not json")).toEqual([]);
    expect(parseFormWarnings('{"a": 1}')).toEqual([]);
    expect(parseFormWarnings('["ok", 3]')).toEqual(["ok"]);
  });
});

describe("readBlobError", () => {
  it("puts a JSON body's detail on the message", async () => {
    const err = Object.assign(new Error("Request failed with status code 404"), {
      response: { status: 404, data: new Blob([JSON.stringify({ detail: "No learners in Grade 7 – Rizal." })]) },
    });
    await readBlobError(err);
    expect(err.message).toBe("No learners in Grade 7 – Rizal.");
    expect(err.response.data).toEqual({ detail: "No learners in Grade 7 – Rizal." });
  });

  it("reads a validation error's field messages", async () => {
    const err = Object.assign(new Error("Request failed with status code 400"), {
      response: { status: 400, data: new Blob([JSON.stringify({ month: ["September 2027 is outside school year 2026-2027."] })]) },
    });
    await readBlobError(err);
    expect(err.message).toContain("September 2027 is outside school year 2026-2027.");
  });

  it("leaves a non-JSON body and a network error alone", async () => {
    const html = Object.assign(new Error("Something went wrong on the server."), {
      response: { status: 500, data: new Blob(["<html>"]) },
    });
    await readBlobError(html);
    expect(html.message).toBe("Something went wrong on the server.");

    const network = new Error("Network Error");
    await readBlobError(network);
    expect(network.message).toBe("Network Error");
  });
});

describe("saveBlob", () => {
  it("clicks a temporary link to the blob, then lets it go", () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:sf1");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    saveBlob(new Blob(["x"]), "SF1.xlsx");
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a[download]")).toBeNull();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:sf1");

    click.mockRestore();
    vi.useRealTimers();
  });
});
