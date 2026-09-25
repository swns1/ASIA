import { createApiClient } from "./apiClient";

const IDENTITY_AUTH_BASE = (import.meta.env.VITE_IDENTITY_API_URL || "http://localhost:8001/api/auth").replace(/\/+$/, "");
const AUDIT_API = import.meta.env.VITE_AUDIT_API_URL || `${IDENTITY_AUTH_BASE}/audit-logs/`;
const AUDIT_FACETS_API = `${AUDIT_API.replace(/\/+$/, "")}/facets/`;

const client = createApiClient({ baseURL: IDENTITY_AUTH_BASE, withCredentials: true, timeout: 10000 });

function toFriendlyError(err) {
  if (err.response?.status === 403) {
    return new Error("You are not authorized to view audit records.", { cause: err });
  }
  if (err.response?.status === 429) {
    return new Error("Too many requests right now. Wait a moment, then try again.", { cause: err });
  }
  return new Error("Failed to load log records.", { cause: err });
}

/**
 * One page of audit records. Every filter is applied server-side — this used
 * to request page_size=10000 and filter in the browser, which downloaded the
 * whole table on each load and silently truncated once the log outgrew it.
 *
 * Accepts: page, page_size, status, role, module, date, time_from, time_to,
 * search, ordering.
 */
export async function fetchAuditLogs(params = {}) {
  try {
    // AUDIT_API is an absolute URL — axios uses it as-is and ignores baseURL,
    // so the VITE_AUDIT_API_URL override still works exactly as before.
    const res = await client.get(AUDIT_API, { params });
    const data = res.data;
    return {
      results: Array.isArray(data) ? data : data.results ?? [],
      count: Array.isArray(data) ? data.length : data.count ?? 0,
      next: data?.next ?? null,
      previous: data?.previous ?? null,
      source: "api",
    };
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/**
 * The distinct roles and modules present across the whole log, plus per-status
 * counts. Needed because the filter options can no longer be derived from the
 * rows on screen once the list is paginated server-side.
 */
export async function fetchAuditFacets() {
  try {
    const res = await client.get(AUDIT_FACETS_API);
    return {
      roles: res.data?.roles ?? [],
      modules: res.data?.modules ?? [],
      statusCounts: res.data?.status_counts ?? {},
    };
  } catch (err) {
    throw toFriendlyError(err);
  }
}
