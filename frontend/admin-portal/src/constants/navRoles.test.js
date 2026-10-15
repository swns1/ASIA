/**
 * The sidebar may only offer a page to roles its route lets in, and a page
 * that exists to change school settings opens only for the roles the server
 * lets change them. Grading Setup used to be in a teacher's menu and route
 * while the server (IsAdminRegistrarOrReadOnly) refused every save of theirs,
 * so a teacher filled in forms that could only fail.
 */
import { describe, it, expect } from "vitest";
import appSource from "../App.jsx?raw";
import * as auth from "../utils/auth";
import { NAV } from "./sidebarNav";

// path -> roles, read from App.jsx's <Route path="…" element={<P roles={NAME}>…
const ROUTE_ROLES = Object.fromEntries(
  [...appSource.matchAll(/<Route path="([^"]+)"\s+element=\{<P roles=\{([A-Z_]+)\}>/g)]
    .map(([, path, name]) => [path, auth[name]]),
);

const NAV_ITEMS = NAV.flatMap((group) => group.items);

describe("sidebar and route roles", () => {
  it("reads the routes' roles from App.jsx", () => {
    // A rewrite of the route lines must not leave the checks below vacuous.
    expect(Object.keys(ROUTE_ROLES).length).toBeGreaterThan(20);
  });

  it.each(NAV_ITEMS.map((item) => [item.label, item]))("%s shows only to roles its route lets in", (_label, item) => {
    const routeRoles = ROUTE_ROLES[item.path];
    expect(Array.isArray(routeRoles), `no route with auth.js roles for ${item.path}`).toBe(true);
    const shownTo = item.allowedRoles ?? auth.STAFF_ALL;
    expect(shownTo.filter((role) => !routeRoles.includes(role))).toEqual([]);
  });

  it("opens Grading Setup only to the roles the server lets change grading rules", () => {
    // enrollment-service grading/ and grades/ category views:
    // IsAdminRegistrarOrReadOnly -- super_admin, admin, registrar write.
    expect([...ROUTE_ROLES["/grading-templates"]].sort()).toEqual(["admin", "registrar", "super_admin"]);
    expect(NAV_ITEMS.find((i) => i.path === "/grading-templates").allowedRoles).toBe(auth.ACADEMIC_STAFF);
  });
});
