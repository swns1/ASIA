import axios from "axios";

const identityClient = axios.create({
  baseURL: import.meta.env.VITE_IDENTITY_API_URL || "http://localhost:8001/api/auth",
  withCredentials: true, // required for httpOnly refresh cookies
  timeout: 10000,
});

// ── Auth token attachment ─────────────────────────────────────────────────────
identityClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── 401 auto-refresh ──────────────────────────────────────────────────────────
identityClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const res = await axios.post(
          (import.meta.env.VITE_IDENTITY_API_URL || "http://localhost:8001/api/auth") + "/refresh/",
          {},
          { withCredentials: true }
        );
        const newToken = res.data.access;
        sessionStorage.setItem("access_token", newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return identityClient(original);
      } catch {
        sessionStorage.removeItem("access_token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function login({ identifier, password, rememberMe }) {
  const res = await identityClient.post("/login/", {
    identifier,
    password,
    remember_me: rememberMe,
  });
  return res.data;
}

export async function refreshToken() {
  const res = await identityClient.post("/refresh/");
  return res.data;
}

export async function logout() {
  const res = await identityClient.post("/logout/");
  return res.data;
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUsers = () =>
  identityClient.get("/users/").then((r) => r.data);

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
