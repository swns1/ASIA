const IDENTITY_AUTH_BASE = (import.meta.env.VITE_IDENTITY_API_URL || "http://localhost:8001/api/auth").replace(/\/+$/, "");
const AUDIT_API = import.meta.env.VITE_AUDIT_API_URL || `${IDENTITY_AUTH_BASE}/audit-logs/`;

export async function fetchAuditLogs() {
  const token = sessionStorage.getItem("access_token") || "";
  const separator = AUDIT_API.includes("?") ? "&" : "?";
  const res = await fetch(`${AUDIT_API}${separator}page_size=10000`, {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (res.status === 403) {
    throw new Error("You are not authorized to view audit records.");
  }

  if (!res.ok) {
    throw new Error("Failed to load log records.");
  }

  const data = await res.json();
  return {
    results: Array.isArray(data) ? data : data.results ?? [],
    count: data.count,
    source: "api",
  };
}