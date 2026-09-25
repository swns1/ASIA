import { createApiClient } from "./apiClient";

const identityClient = createApiClient({
  baseURL: import.meta.env.VITE_IDENTITY_API_URL || "http://localhost:8001/api/auth",
  withCredentials: true, // required for httpOnly refresh cookies
  timeout: 10000,
});

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function login({ identifier, password, rememberMe }) {
  const res = await identityClient.post("/login/", {
    identifier,
    password,
    remember_me: rememberMe,
  });
  return res.data;
}

export async function logout() {
  const res = await identityClient.post("/logout/");
  return res.data;
}

// ── Users ─────────────────────────────────────────────────────────────────────
// { role: "teacher" } or { role: "teacher,guardian" } narrows the list. The
// pickers should always pass one: the full list carries every account's photo.
// A registrar only ever gets teachers and guardians back.
export const getUsers = (params = {}) =>
  identityClient.get("/users/", { params }).then((r) => r.data);

export const getUser = (id) =>
  identityClient.get(`/users/${id}/`).then((r) => r.data);

export const createUser = (payload) =>
  identityClient.post("/users/", payload).then((r) => r.data);

export const updateUser = (id, payload) =>
  identityClient.patch(`/users/${id}/`, payload).then((r) => r.data);

export const deleteUser = (id) =>
  identityClient.delete(`/users/${id}/`).then((r) => r.data);

// ── Audit logs ────────────────────────────────────────────────────────────────
export const getAuditLogs = (params = {}) =>
  identityClient.get("/audit-logs/", { params }).then((r) => r.data);

export { identityClient };
