const CURRENT_USER_KEY = "current_user";

function identityAuthBaseUrl() {
  return (import.meta.env.VITE_IDENTITY_API_URL || "http://localhost:8001/api/auth").replace(/\/+$/, "");
}

export function setCurrentUser(user) {
  if (!user) {
    sessionStorage.removeItem(CURRENT_USER_KEY);
    return;
  }
  sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
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

export function isTokenValid() {
  const token = sessionStorage.getItem("access_token");
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function isAdminRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return ["admin", "super_admin", "superadmin"].includes(normalized);
}

export function canViewAuditTrail(user = getCurrentUser()) {
  return isAdminRole(user?.role);
}