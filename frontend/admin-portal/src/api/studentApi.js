// studentApi.js
import { createApiClient } from "./apiClient";

const studentClient = createApiClient({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://localhost:8000/api",
  timeout: 10000,
});

export async function getStudents({ page = 1, page_size, search = "", status = "", sex = "", ordering = "", school_level = "", grade_level = "" } = {}) {
  const res = await studentClient.get("/students/", {
    params: {
      page,
      ...(page_size    && { page_size }),
      search,
      ...(status       && { status }),
      ...(sex          && { sex }),
      ...(ordering     && { ordering }),
      ...(school_level && { school_level }),
      ...(grade_level  && { grade_level }),
    },
  });
  return res.data;
}

export async function getStudent(id) {
  const res = await studentClient.get(`/students/${id}/`);
  return res.data;
}

export async function createStudent(payload) {
  const res = await studentClient.post("/students/", payload);
  return res.data;
}

export async function bulkCreateStudent(payload) {
  // payload: { student, household, guardians[] }
  const res = await studentClient.post("/students/bulk-create/", payload);
  return res.data;
}

export async function updateStudent(id, payload) {
  const res = await studentClient.put(`/students/${id}/`, payload);
  return res.data;
}

export async function updateStudentStatus(id, status) {
  const res = await studentClient.patch(`/students/${id}/`, { status });
  return res.data;
}

export async function deleteStudent(id) {
  const res = await studentClient.delete(`/students/${id}/`);
  return res.data;
}
