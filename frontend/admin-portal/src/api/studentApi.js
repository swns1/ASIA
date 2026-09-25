// studentApi.js
import { createApiClient } from "./apiClient";

const studentClient = createApiClient({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://localhost:8000/api",
  timeout: 10000,
});

export async function getStudents({ page = 1, page_size, search = "", status = "", sex = "", ordering = "", school_level = "", grade_level = "", school_year = "", unenrolled = "" } = {}) {
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
      // Narrows school_level/grade_level to placements in that year.
      ...(school_year  && { school_year }),
      // A school year: students with no live enrollment for it.
      ...(unenrolled   && { unenrolled }),
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

// Marks Grade 12 completers as graduated. The server only changes a learner
// who is active, finished Grade 12 (2nd semester) and holds no enrolled or
// pending row; the rest come back in `skipped` with the reason.
// -> { graduated: [ids], skipped: [{ student_id, reason }] }
export async function markStudentsGraduated(studentIds) {
  const res = await studentClient.post("/students/mark-graduated/", { student_ids: studentIds });
  return res.data;
}

export async function deleteStudent(id) {
  const res = await studentClient.delete(`/students/${id}/`);
  return res.data;
}

// ── Siblings ─────────────────────────────────────────────────────────────────
// Siblings are the other students sharing this student's household, not a
// separate stored link — see StudentViewSet.siblings in student-service.

export async function getSiblingStudents(id) {
  const res = await studentClient.get(`/students/${id}/siblings/`);
  return Array.isArray(res.data) ? res.data : res.data?.results ?? [];
}

export async function linkSibling(id, siblingStudentId) {
  const res = await studentClient.post(`/students/${id}/link-sibling/`, {
    sibling_student_id: siblingStudentId,
  });
  return res.data;
}

export async function unlinkSibling(id) {
  const res = await studentClient.post(`/students/${id}/unlink-sibling/`, {});
  return res.data;
}
