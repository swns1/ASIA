// studentApi.js
import { createApiClient } from "./apiClient";

const studentClient = createApiClient({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://localhost:8000/api",
  timeout: 10000,
});

// The list's filters as query params, blanks left out. Shared by the list
// and its counts so both always describe the same students.
function studentFilterParams({ search = "", status = "", sex = "", school_level = "", grade_level = "", section = "", school_year = "", unenrolled = "" }) {
  return {
    ...(search       && { search }),
    ...(status       && { status }),
    ...(sex          && { sex }),
    // A school year alone: that year's learners (any row not cancelled).
    // With level/grade/section: placed there in that year.
    ...(school_year  && { school_year }),
    ...(school_level && { school_level }),
    ...(grade_level  && { grade_level }),
    ...(section      && { section }),
    // A school year: active students with no place in it.
    ...(unenrolled   && { unenrolled }),
  };
}

export async function getStudents({ page = 1, page_size, ordering = "", ...filters } = {}) {
  const res = await studentClient.get("/students/", {
    params: {
      page,
      ...(page_size && { page_size }),
      ...(ordering  && { ordering }),
      ...studentFilterParams(filters),
    },
  });
  return res.data;
}

// The masterlist's tiles and chip counts, each counted inside every other
// filter that is on. See StudentViewSet.counts for what comes back.
export async function getStudentCounts(filters = {}) {
  const res = await studentClient.get("/students/counts/", { params: studentFilterParams(filters) });
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
