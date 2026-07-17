import { createApiClient } from "./apiClient";

const enrollmentClient = createApiClient({
  baseURL: import.meta.env.VITE_ENROLLMENT_API_URL || "http://localhost:8003/api",
  timeout: 15000,
});

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

// ── Mid-year transfers ───────────────────────────────────────────────────────
export const transferOutEnrollment = (id, payload) =>
  enrollmentClient.post(`/enrollments/${id}/transfer-out/`, payload).then((r) => r.data);

export const transferInEnrollment = (id, payload) =>
  enrollmentClient.post(`/enrollments/${id}/transfer-in/`, payload).then((r) => r.data);

export const getEnrollmentTransfers = (params = {}) =>
  enrollmentClient.get("/enrollment-transfers/", { params }).then((r) => r.data);

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

export async function callGemini(context_type, payload) {
  const res = await enrollmentClient.post("/ai/interpret/", { context_type, payload });
  return res.data; // { interpretation: string }
}

// ── At-risk student prediction (persisted risk scoring) ───────────────────────
export const runRiskAssessment = (payload) =>
  enrollmentClient.post("/ai/risk-assessment/run/", payload).then((r) => r.data);

export const getRiskAssessmentLatest = (params = {}) =>
  enrollmentClient.get("/ai/risk-assessment/latest/", { params }).then((r) => r.data);

export const getRiskAssessmentTrend = (studentId) =>
  enrollmentClient
    .get("/ai/risk-assessment/trend/", { params: { student_id: studentId } })
    .then((r) => r.data);

// ── Requirement types (enrollment-service mirror) ─────────────────────────────
export const getRequirementTypes = (params = {}) =>
  enrollmentClient.get("/requirement-types/", { params }).then((r) => r.data);

export const getStudentRequirementSubmissions = (params = {}) =>
  enrollmentClient
    .get("/student-requirement-submissions/", { params })
    .then((r) => r.data);

// ── Section promotion ─────────────────────────────────────────────────────────
export const promotePreview = (payload) =>
  enrollmentClient.post("/enrollments/promote/preview/", payload).then((r) => r.data);

export const promoteConfirm = (payload) =>
  enrollmentClient.post("/enrollments/promote/confirm/", payload).then((r) => r.data);

// ── Report card ───────────────────────────────────────────────────────────────
export const getReportCard = (enrollmentId, params = {}) =>
  enrollmentClient.get(`/enrollments/${enrollmentId}/report-card/`, { params }).then((r) => r.data);

// ── Narrative categories ──────────────────────────────────────────────────────
export const getNarrativeCategories = (params = {}) =>
  enrollmentClient.get("/narrative-categories/", { params }).then((r) => r.data);

export const createNarrativeCategory = (payload) =>
  enrollmentClient.post("/narrative-categories/", payload).then((r) => r.data);

export const updateNarrativeCategory = (id, payload) =>
  enrollmentClient.patch(`/narrative-categories/${id}/`, payload).then((r) => r.data);

export const deleteNarrativeCategory = (id) =>
  enrollmentClient.delete(`/narrative-categories/${id}/`).then((r) => r.data);

// ── Section advisories (teacher → section assignment) ─────────────────────────
export const getSectionAdvisories = (params = {}) =>
  enrollmentClient.get("/section-advisories/", { params }).then((r) => r.data);

export const createSectionAdvisory = (payload) =>
  enrollmentClient.post("/section-advisories/", payload).then((r) => r.data);

export const updateSectionAdvisory = (id, payload) =>
  enrollmentClient.patch(`/section-advisories/${id}/`, payload).then((r) => r.data);

export const deleteSectionAdvisory = (id) =>
  enrollmentClient.delete(`/section-advisories/${id}/`).then((r) => r.data);

export const getMySections = (params = {}) =>
  enrollmentClient.get("/section-advisories/my-sections/", { params }).then((r) => r.data);

export const getSectionGrades = (params = {}) =>
  enrollmentClient.get("/section-advisories/section-grades/", { params }).then((r) => r.data);

export const saveSectionGrades = (payload) =>
  enrollmentClient.post("/section-advisories/section-grades/", payload).then((r) => r.data);

// ── Narrative reports ─────────────────────────────────────────────────────────
export const getNarrativeReports = (params = {}) =>
  enrollmentClient.get("/narrative-reports/", { params }).then((r) => r.data);

export const createNarrativeReport = (payload) =>
  enrollmentClient.post("/narrative-reports/", payload).then((r) => r.data);

export const updateNarrativeReport = (id, payload) =>
  enrollmentClient.patch(`/narrative-reports/${id}/`, payload).then((r) => r.data);

export const deleteNarrativeReport = (id) =>
  enrollmentClient.delete(`/narrative-reports/${id}/`).then((r) => r.data);

export { enrollmentClient };
