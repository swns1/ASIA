import { describe, it, expect } from "vitest";
import { collect, required, email, minLength, hasErrors } from "./validation";
import { describeApiError, fieldErrorsFrom, firstMessageFrom } from "./apiError";

describe("validation", () => {
  it("reports every problem at once, not just the first", () => {
    // The behaviour this exists to fix: forms used to surface one message at a
    // time, so fixing a form was a guess-and-resubmit loop.
    const errors = collect({
      name: required("", "Full name"),
      email: required("", "Email address") ?? email(""),
      password: required("", "Password") ?? minLength("", 8, "Password"),
    });

    expect(Object.keys(errors).sort()).toEqual(["email", "name", "password"]);
    expect(hasErrors(errors)).toBe(true);
  });

  it("passes a fully valid form", () => {
    const errors = collect({
      name: required("Maria Santos", "Full name"),
      email: required("maria@school.edu", "Email") ?? email("maria@school.edu"),
      password: minLength("longenough", 8, "Password"),
    });
    expect(hasErrors(errors)).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(email("maria@school")).toMatch(/valid email/i);
    expect(email("maria@school.edu")).toBeNull();
  });

  it("treats an empty optional value as absent, not invalid", () => {
    // `required` owns emptiness; format checks must not double-report it.
    expect(email("")).toBeNull();
    expect(minLength("", 8, "Password")).toBeNull();
  });

  it("enforces a minimum length", () => {
    expect(minLength("short", 8, "Password")).toMatch(/at least 8/);
  });
});

describe("describeApiError", () => {
  it("distinguishes a network failure from a server failure", () => {
    const offline = describeApiError({}, { subject: "students" });
    expect(offline.kind).toBe("network");
    expect(offline.canRetry).toBe(true);

    const server = describeApiError({ response: { status: 503 } }, { subject: "students" });
    expect(server.kind).toBe("server");
    expect(server.canRetry).toBe(true);
  });

  it("does not offer retry for permission or auth failures", () => {
    expect(describeApiError({ response: { status: 403 } }).canRetry).toBe(false);
    expect(describeApiError({ response: { status: 401 } }).canRetry).toBe(false);
  });

  it("names what failed to load so the message reads naturally", () => {
    const { message } = describeApiError({}, { subject: "invoices" });
    expect(message).toContain("invoices");
  });
});

describe("fieldErrorsFrom", () => {
  it("flattens DRF field errors into a field->message map", () => {
    const errors = fieldErrorsFrom({
      response: { data: { email: ["This email is already registered."], name: ["Required."] } },
    });
    expect(errors).toEqual({
      email: "This email is already registered.",
      name: "Required.",
    });
  });

  it("ignores the non-field `detail` key", () => {
    expect(fieldErrorsFrom({ response: { data: { detail: "Nope." } } })).toEqual({});
  });

  it("still surfaces `detail` as the headline message", () => {
    expect(firstMessageFrom({ response: { data: { detail: "Nope." } } })).toBe("Nope.");
  });
});
