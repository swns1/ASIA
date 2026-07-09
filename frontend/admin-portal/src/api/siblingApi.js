// siblingApi.js
import { createApiClient } from "./apiClient";

const studentClient = createApiClient({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://localhost:8000/api",
  timeout: 10000,
});

export async function getSiblingsByStudent(studentId) {
  const res = await studentClient.get("/siblings/", { params: { student_id: studentId } });
  return res.data;
}

export async function createSibling(payload) {
  const res = await studentClient.post("/siblings/", payload);
  return res.data;
}

export async function updateSibling(id, payload) {
  const res = await studentClient.put(`/siblings/${id}/`, payload);
  return res.data;
}

export async function deleteSibling(id) {
  const res = await studentClient.delete(`/siblings/${id}/`);
  return res.data;
}
