import { describe, it, expect, beforeEach } from "vitest";
import {
  setCurrentUser,
  getCurrentUser,
  isTokenValid,
  isAdminRole,
  canViewAuditTrail,
} from "./auth";

function makeToken(expSecondsFromNow) {
  const payload = { exp: Math.floor(Date.now() / 1000) + expSecondsFromNow };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

beforeEach(() => {
  sessionStorage.clear();
});

describe("isTokenValid", () => {
  it("returns false when there is no token", () => {
    expect(isTokenValid()).toBe(false);
  });

  it("returns true for a token that has not expired", () => {
    sessionStorage.setItem("access_token", makeToken(60));
    expect(isTokenValid()).toBe(true);
  });

  it("returns false for an expired token", () => {
    sessionStorage.setItem("access_token", makeToken(-60));
    expect(isTokenValid()).toBe(false);
  });

  it("returns false for a malformed token instead of throwing", () => {
    sessionStorage.setItem("access_token", "not-a-real-jwt");
    expect(isTokenValid()).toBe(false);
  });
});

describe("isAdminRole", () => {
  it("treats admin, super_admin, and superadmin (any case) as admin roles", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("SUPER_ADMIN")).toBe(true);
    expect(isAdminRole("superadmin")).toBe(true);
  });

  it("does not treat other roles as admin", () => {
    expect(isAdminRole("teacher")).toBe(false);
    expect(isAdminRole("registrar")).toBe(false);
    expect(isAdminRole("accounting")).toBe(false);
    expect(isAdminRole("")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});

describe("canViewAuditTrail", () => {
  it("defers to the currently stored user when none is passed explicitly", () => {
    setCurrentUser({ role: "admin" });
    expect(canViewAuditTrail()).toBe(true);

    setCurrentUser({ role: "teacher" });
    expect(canViewAuditTrail()).toBe(false);
  });
});

describe("getCurrentUser / setCurrentUser", () => {
  it("round-trips a user object through sessionStorage", () => {
    setCurrentUser({ id: 1, role: "admin", name: "Ada" });
    expect(getCurrentUser()).toEqual({ id: 1, role: "admin", name: "Ada" });
  });

  it("returns null when nothing is stored", () => {
    expect(getCurrentUser()).toBeNull();
  });
});
