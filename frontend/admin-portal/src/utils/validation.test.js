import { describe, it, expect } from "vitest";
import {
  collect, required, email, minLength, hasErrors,
  lrn, mobileNumber, birthDate, EARLIEST_BIRTH_YEAR,
} from "./validation";
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

// The staff form and the public applicant form both write the same `students`
// row and used to carry their own copies of these rules, which had drifted.
describe("student-record field rules", () => {
  describe("lrn", () => {
    it("accepts exactly 12 digits", () => {
      expect(lrn("136789012345")).toBeNull();
    });

    it("treats an unassigned LRN as absent, not invalid", () => {
      // A nursery applicant has no DepEd-assigned LRN yet; requiring one is
      // the field's job, not this rule's.
      expect(lrn("")).toBeNull();
      expect(lrn(null)).toBeNull();
      expect(lrn(undefined)).toBeNull();
    });

    it.each([
      ["too short", "13678"],
      ["too long", "1367890123456"],
      ["hyphenated as a human types it", "1367-8901-2345"],
      ["right length but not all digits", "13678901234X"],
      ["the old seed placeholder", "SEED00000100"],
    ])("rejects an LRN that is %s", (_label, value) => {
      expect(lrn(value)).toMatch(/12 digits/);
    });

    it("ignores surrounding whitespace", () => {
      expect(lrn("  136789012345  ")).toBeNull();
    });
  });

  describe("mobileNumber", () => {
    it("accepts 09 followed by 9 digits", () => {
      expect(mobileNumber("09171100001")).toBeNull();
    });

    it.each(["0917110000", "091711000012", "19171100001", "0917110000X"])(
      "rejects %s",
      (value) => {
        expect(mobileNumber(value)).toMatch(/must start with 09/);
      },
    );

    it("leaves absence to `required`", () => {
      expect(mobileNumber("")).toBeNull();
    });
  });

  describe("birthDate", () => {
    it("accepts a plausible past date", () => {
      expect(birthDate("2015-06-01")).toBeNull();
    });

    it("rejects a future date", () => {
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      expect(birthDate(nextYear.toISOString().slice(0, 10))).toMatch(/future/);
    });

    it("rejects a mistyped year that would land in a permanent record", () => {
      expect(birthDate(`${EARLIEST_BIRTH_YEAR - 1}-06-01`)).toMatch(/valid birth date/);
    });

    it("rejects an unparseable value", () => {
      expect(birthDate("not-a-date")).toMatch(/valid birth date/);
    });

    it("leaves absence to `required`", () => {
      expect(birthDate("")).toBeNull();
    });
  });
});
