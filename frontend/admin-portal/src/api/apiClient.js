// apiClient.js
//
// Shared axios client factory. Every backend client in this app used to
// re-implement the same token-attach request interceptor and 401-refresh
// response interceptor (~30-40 near-identical lines per file). This is the
// one place that logic lives now — see studentApi.js / billingApi.js / etc.
// for usage.
import axios from "axios";

const IDENTITY_REFRESH_URL =
  (import.meta.env.VITE_IDENTITY_API_URL || "http://localhost:8001/api/auth").replace(/\/+$/, "") +
  "/refresh/";

export function createApiClient({ baseURL, timeout = 10000, withCredentials = false }) {
  const client = axios.create({ baseURL, timeout, withCredentials });

  client.interceptors.request.use((config) => {
    const token = sessionStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config;
      if (error.response?.status === 401 && !original._retry) {
        original._retry = true;
        try {
          // Deliberately bare `axios`, not `client` — posting through the
          // client itself would re-enter this same interceptor.
          const res = await axios.post(IDENTITY_REFRESH_URL, {}, { withCredentials: true });
          const newToken = res.data.access;
          sessionStorage.setItem("access_token", newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return client(original);
        } catch (refreshError) {
          sessionStorage.removeItem("access_token");
          window.location.href = "/login";
          return Promise.reject(refreshError);
        }
      }
      return Promise.reject(error);
    }
  );

  return client;
}

export function authHeaders() {
  const token = sessionStorage.getItem("access_token") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}
