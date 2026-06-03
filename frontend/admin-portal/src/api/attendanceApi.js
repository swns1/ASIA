import axios from "axios";

const enrollmentClient = axios.create({
  baseURL: import.meta.env.VITE_ENROLLMENT_API_URL || "http://localhost:8003/api",
  timeout: 15000,
});

enrollmentClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

enrollmentClient.interceptors.response.use(
  (r) => r,
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
        return enrollmentClient(original);
      } catch {
        sessionStorage.removeItem("access_token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export const getAttendance = (params = {}) =>
  enrollmentClient.get("/attendance/", { params }).then((r) => r.data);

export const createAttendance = (payload) =>
  enrollmentClient.post("/attendance/", payload).then((r) => r.data);

export const updateAttendance = (id, payload) =>
  enrollmentClient.patch(`/attendance/${id}/`, payload).then((r) => r.data);

export const deleteAttendance = (id) =>
  enrollmentClient.delete(`/attendance/${id}/`).then((r) => r.data);

export const bulkAttendance = (payload) =>
  enrollmentClient.post("/attendance/bulk/", payload).then((r) => r.data);

export const getAttendanceSummary = (params = {}) =>
  enrollmentClient.get("/attendance/summary/", { params }).then((r) => r.data);