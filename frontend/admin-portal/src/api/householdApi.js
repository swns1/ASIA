// householdApi.js
import { createApiClient } from "./apiClient";

const householdClient = createApiClient({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://localhost:8000/api",
  timeout: 10000,
});

// Try to fetch a household for a given student.
// Adjust the endpoint to whatever your DRF view actually exposes.
// Common patterns:
//   GET /api/households/?student=<id>
//   GET /api/students/<id>/household/
export async function getHouseholdByStudent(studentId) {
  const res = await householdClient.get("/households/", {
    params: { student: studentId },
  });
  // DRF list endpoint may return a paginated response or a plain array
  const data = res.data;
  if (Array.isArray(data)) return data[0] || null;
  if (data?.results) return data.results[0] || null;
  return data || null;
}

export async function createHousehold(payload) {
  const res = await householdClient.post("/households/", payload);
  return res.data;
}

export async function updateHousehold(id, payload) {
  const res = await householdClient.put(`/households/${id}/`, payload);
  return res.data;
}

export async function deleteHousehold(id) {
  const res = await householdClient.delete(`/households/${id}/`);
  return res.data;
}
