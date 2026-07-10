import { createApiClient } from "./apiClient";

const IDENTITY_AUTH_BASE = (import.meta.env.VITE_IDENTITY_API_URL || "http://localhost:8001/api/auth").replace(/\/+$/, "");
const AUDIT_API = import.meta.env.VITE_AUDIT_API_URL || `${IDENTITY_AUTH_BASE}/audit-logs/`;

const client = createApiClient({ baseURL: IDENTITY_AUTH_BASE, withCredentials: true, timeout: 10000 });

export async function fetchAuditLogs() {
  try {
    // AUDIT_API is an absolute URL — axios uses it as-is and ignores baseURL,
    // so the VITE_AUDIT_API_URL override still works exactly as before.
    const res = await client.get(AUDIT_API, { params: { page_size: 10000 } });
    const data = res.data;
    return {
      results: Array.isArray(data) ? data : data.results ?? [],
      count: data.count,
      source: "api",
    };
  } catch (err) {
    if (err.response?.status === 403) {
      throw new Error("You are not authorized to view audit records.", { cause: err });
    }
    throw new Error("Failed to load log records.", { cause: err });
  }
}
