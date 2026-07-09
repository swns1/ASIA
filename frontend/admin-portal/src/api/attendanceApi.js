import { createApiClient } from "./apiClient";

const enrollmentClient = createApiClient({
  baseURL: import.meta.env.VITE_ENROLLMENT_API_URL || "http://localhost:8003/api",
  timeout: 15000,
});

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
