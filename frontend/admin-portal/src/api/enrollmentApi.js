import axios from "axios";

const enrollmentClient = axios.create({
  baseURL: import.meta.env.VITE_ENROLLMENT_API_URL || "http://localhost:8003/api",
  timeout: 15000,
});

// ── Auth token attachment ─────────────────────────────────────────────────────
enrollmentClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── 401 auto-refresh ──────────────────────────────────────────────────────────
enrollmentClient.interceptors.response.use(
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
        return enrollmentClient(original);
      } catch {
        sessionStorage.removeItem("access_token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ── Enrollments ───────────────────────────────────────────────────────────────
export const getEnrollments = (params = {}) =>
  enrollmentClient.get("/enrollments/", { params }).then((r) => r.data);

export const getEnrollment = (id) =>
  enrollmentClient.get(`/enrollments/${id}/`).then((r) => r.data);

export const createEnrollment = (payload) =>
  enrollmentClient.post("/enrollments/", payload).then((r) => r.data);

export const updateEnrollment = (id, payload) =>
  enrollmentClient.patch(`/enrollments/${id}/`, payload).then((r) => r.data);

export const deleteEnrollment = (id) =>
  enrollmentClient.delete(`/enrollments/${id}/`).then((r) => r.data);

export const bulkCreateEnrollments = (payload) =>
  enrollmentClient.post("/enrollments/bulk/", payload).then((r) => r.data);

export const getEnrollmentEligibility = (studentId) =>
  enrollmentClient
    .get("/enrollments/eligibility/", { params: { student_id: studentId } })
    .then((r) => r.data);

export const sendEnrollmentEmail = (payload) =>
  enrollmentClient.post("/send-enrollment-email/", payload).then((r) => r.data);

// ── Subjects ──────────────────────────────────────────────────────────────────
export const getSubjects = (params = {}) =>
  enrollmentClient.get("/subjects/", { params }).then((r) => r.data);

export const createSubject = (payload) =>
  enrollmentClient.post("/subjects/", payload).then((r) => r.data);

export const updateSubject = (id, payload) =>
  enrollmentClient.patch(`/subjects/${id}/`, payload).then((r) => r.data);

export const deleteSubject = (id) =>
  enrollmentClient.delete(`/subjects/${id}/`).then((r) => r.data);

// ── Grades ────────────────────────────────────────────────────────────────────
export const getGrades = (params = {}) =>
  enrollmentClient.get("/grades/", { params }).then((r) => r.data);

export const saveGrade = (payload) =>
  enrollmentClient.post("/grades/", payload).then((r) => r.data);

export const updateGrade = (id, payload) =>
  enrollmentClient.patch(`/grades/${id}/`, payload).then((r) => r.data);

// ── Score entries ─────────────────────────────────────────────────────────────
export const getScoreEntries = (params = {}) =>
  enrollmentClient.get("/score-entries/", { params }).then((r) => r.data);

export const computeGrade = (params = {}) =>
  enrollmentClient.get("/score-entries/compute/", { params }).then((r) => r.data);

export const createScoreEntry = (payload) =>
  enrollmentClient.post("/score-entries/", payload).then((r) => r.data);

export const updateScoreEntry = (id, payload) =>
  enrollmentClient.patch(`/score-entries/${id}/`, payload).then((r) => r.data);

export const deleteScoreEntry = (id) =>
  enrollmentClient.delete(`/score-entries/${id}/`).then((r) => r.data);

// ── Grading templates ─────────────────────────────────────────────────────────
export const getGradingTemplates = (params = {}) =>
  enrollmentClient.get("/grading-templates/", { params }).then((r) => r.data);

export const createGradingTemplate = (payload) =>
  enrollmentClient.post("/grading-templates/", payload).then((r) => r.data);

export const updateGradingTemplate = (id, payload) =>
  enrollmentClient.patch(`/grading-templates/${id}/`, payload).then((r) => r.data);

export const deleteGradingTemplate = (id) =>
  enrollmentClient.delete(`/grading-templates/${id}/`).then((r) => r.data);

// ── Grading components ────────────────────────────────────────────────────────
export const getGradingComponents = (params = {}) =>
  enrollmentClient.get("/grading-components/", { params }).then((r) => r.data);

export const createGradingComponent = (payload) =>
  enrollmentClient.post("/grading-components/", payload).then((r) => r.data);

export const updateGradingComponent = (id, payload) =>
  enrollmentClient.patch(`/grading-components/${id}/`, payload).then((r) => r.data);

export const deleteGradingComponent = (id) =>
  enrollmentClient.delete(`/grading-components/${id}/`).then((r) => r.data);

// ── Scholarship types ─────────────────────────────────────────────────────────
export const getScholarshipTypes = (params = {}) =>
  enrollmentClient.get("/scholarship-types/", { params }).then((r) => r.data);

export const createScholarshipType = (payload) =>
  enrollmentClient.post("/scholarship-types/", payload).then((r) => r.data);

export const updateScholarshipType = (id, payload) =>
  enrollmentClient.patch(`/scholarship-types/${id}/`, payload).then((r) => r.data);

export const deleteScholarshipType = (id) =>
  enrollmentClient.delete(`/scholarship-types/${id}/`).then((r) => r.data);

// ── Enrollment scholarships ───────────────────────────────────────────────────
export const getEnrollmentScholarships = (params = {}) =>
  enrollmentClient.get("/enrollment-scholarships/", { params }).then((r) => r.data);

export const createEnrollmentScholarship = (payload) =>
  enrollmentClient.post("/enrollment-scholarships/", payload).then((r) => r.data);

export const updateEnrollmentScholarship = (id, payload) =>
  enrollmentClient.patch(`/enrollment-scholarships/${id}/`, payload).then((r) => r.data);

export const deleteEnrollmentScholarship = (id) =>
  enrollmentClient.delete(`/enrollment-scholarships/${id}/`).then((r) => r.data);

// ── Calendar events ───────────────────────────────────────────────────────────
export const getCalendarEvents = (params = {}) =>
  enrollmentClient.get("/calendar-events/", { params }).then((r) => r.data);

export const createCalendarEvent = (payload) =>
  enrollmentClient.post("/calendar-events/", payload).then((r) => r.data);

export const updateCalendarEvent = (id, payload) =>
  enrollmentClient.patch(`/calendar-events/${id}/`, payload).then((r) => r.data);

export const deleteCalendarEvent = (id) =>
  enrollmentClient.delete(`/calendar-events/${id}/`).then((r) => r.data);

// ── AI / analytics ────────────────────────────────────────────────────────────
export const getAiCluster = (params = {}) =>
  enrollmentClient.get("/ai/cluster/", { params }).then((r) => r.data);

// ── Requirement types (enrollment-service mirror) ─────────────────────────────
export const getRequirementTypes = (params = {}) =>
  enrollmentClient.get("/requirement-types/", { params }).then((r) => r.data);

export const getStudentRequirementSubmissions = (params = {}) =>
  enrollmentClient
    .get("/student-requirement-submissions/", { params })
    .then((r) => r.data);

export { enrollmentClient };
