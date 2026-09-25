const CURRENT_USER_KEY = "current_user";

// Fired whenever the stored user changes, so the sidebar and the guardian top
// bar can redraw. They used to read sessionStorage once per render and never
// hear about a change -- editing your own name left the old one on screen
// until you signed in again. See hooks/useCurrentUser.js.
export const CURRENT_USER_EVENT = "slis:current-user";

function identityAuthBaseUrl() {
  return (import.meta.env.VITE_IDENTITY_API_URL || "http://localhost:8001/api/auth").replace(/\/+$/, "");
}

export function setCurrentUser(user) {
  if (!user) {
    sessionStorage.removeItem(CURRENT_USER_KEY);
  } else {
    sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  }
  window.dispatchEvent(new Event(CURRENT_USER_EVENT));
}

export function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    sessionStorage.removeItem(CURRENT_USER_KEY);
    return null;
  }
}

export function requestLogoutAudit() {
  const token = sessionStorage.getItem("access_token") || "";
  fetch(`${identityAuthBaseUrl()}/logout/`, {
    method: "POST",
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => {});
}

export function clearAuthSession() {
  requestLogoutAudit();
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("refresh_token");
  sessionStorage.removeItem(CURRENT_USER_KEY);
}

/**
 * The claims inside a JWT, or throws if it isn't one.
 *
 * A JWT segment is base64url: `-` and `_` where base64 has `+` and `/`, and no
 * padding. atob() rejects both of those characters. Today's tokens happen
 * never to contain them, but a new claim (a name, say) would make atob throw
 * and every valid session read as signed out.
 */
export function decodeJwtPayload(token) {
  const segment = String(token).split(".")[1];
  if (!segment) throw new Error("not a JWT");
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function isTokenValid() {
  const token = sessionStorage.getItem("access_token");
  if (!token) return false;
  try {
    const payload = decodeJwtPayload(token);
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// Role sets matching the backend permission matrix. STAFF_ALL is every staff
// role — used to keep guardians out of routes that any staff member may see
// but a parent must not (e.g. dashboard, students, the printable pages).
export const STAFF_ADMIN     = ["super_admin", "admin"];
export const ACADEMIC_STAFF  = ["super_admin", "admin", "registrar"];
export const GRADE_ROLES     = ["super_admin", "admin", "registrar", "teacher"];
export const BILLING_ROLES   = ["super_admin", "admin", "accounting"];
// Who may READ invoices and a student's financial history. The registrar
// isn't billing staff, but sees what a family owes while enrolling them and
// generates or closes out the invoice as part of that work -- the same split
// billing-service's BILLING_READ_ROLES / registrar_actions make.
export const BILLING_READ_ROLES = [...BILLING_ROLES, "registrar"];
export const STAFF_ALL       = ["super_admin", "admin", "registrar", "teacher", "accounting"];

export function isAdminRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return ["admin", "super_admin", "superadmin"].includes(normalized);
}

// Mirrors identity-service's SUPER_ADMIN_ROLES. Only a super admin may edit,
// delete or grant a super admin account; the Users page uses this to stop
// offering those actions to a plain admin, who would only meet a 403.
export function isSuperAdminRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return ["super_admin", "superadmin"].includes(normalized);
}

const PORTAL_LABELS = {
  super_admin: "Admin Portal",
  admin: "Admin Portal",
  registrar: "Registrar Portal",
  teacher: "Teacher Portal",
  accounting: "Accounting Portal",
  guardian: "Guardian Portal",
};

export function portalLabelFor(role) {
  return PORTAL_LABELS[String(role || "").trim().toLowerCase()] || "Staff Portal";
}

export function canViewAuditTrail(user = getCurrentUser()) {
  return isAdminRole(user?.role);
}

export function hasAnyRole(user, roles) {
  if (!roles || roles.length === 0) return true;
  const normalized = String(user?.role || "").trim().toLowerCase();
  return roles.map((r) => r.toLowerCase()).includes(normalized);
}

// Where to send a logged-in user who lacks access to the route they hit.
// Guardians go to their own portal; everyone else to the staff dashboard.
// (Sending a guardian to /dashboard would loop, since that route is staff-only.)
export function homeFor(user) {
  return user?.role === "guardian" ? "/guardian" : "/dashboard";
}