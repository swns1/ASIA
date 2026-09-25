import { createApiClient } from "./apiClient";

const enrollmentClient = createApiClient({
  baseURL: import.meta.env.VITE_ENROLLMENT_API_URL || "http://localhost:8003/api",
  timeout: 15000,
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
/**
 * One aggregate call behind the whole staff dashboard: enrolment pipeline,
 * level distribution, weekly attendance and risk bands.
 *
 * Replaces eleven list requests that each fetched a page with `page_size=1`
 * just to read `.count` off it — five of those only to break enrolment down by
 * school level. It is also the only source of period-grouped data in the API,
 * so the trend charts cannot be built without it.
 *
 * Scoped server-side: a teacher gets their own advisory roster, not the school.
 */
export const getDashboardSummary = (params = {}) =>
  enrollmentClient.get("/dashboard/summary/", { params }).then((r) => r.data);

// ── Enrollments ───────────────────────────────────────────────────────────────
// Every school year that has enrollments, newest first, with a count each —
// plus the current year even when it's still empty. Replaces the old computed
// window, which both invented years with no data and silently capped at five.
export const getSchoolYears = () =>
  enrollmentClient.get("/enrollments/school-years/").then((r) => r.data);

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

/**
 * Progression + document eligibility for a student.
 *
 * `placement` is optional and describes the enrollment being considered
 * ({ schoolLevel, gradeLevel, isTransferIn }). It matters because which
 * documents are required depends on it: a Grade 7 transferee owes a Form 137
 * and a Good Moral certificate, a Grade 7 learner promoted from our own
 * Grade 6 owes neither. Omitted, the server reports on the next placement its
 * progression rules work out.
 *
 * Pass `excludeEnrollmentId` when the report is about a row that already
 * exists — an enrollment being edited, or a pending one about to be
 * activated. That row is not part of its own history; counting it makes the
 * learner look "continuing" and silently drops the transferee document rules,
 * which is exactly the case the gate exists for. The server-side gate already
 * excludes it, so omitting this is what made the preview and the gate
 * disagree.
 */
export const getEnrollmentEligibility = (studentId, placement = {}) =>
  enrollmentClient
    .get("/enrollments/eligibility/", {
      params: {
        student_id: studentId,
        ...(placement.schoolLevel ? { school_level: placement.schoolLevel } : null),
        ...(placement.gradeLevel ? { grade_level: placement.gradeLevel } : null),
        ...(placement.isTransferIn ? { is_transfer_in: true } : null),
        ...(placement.excludeEnrollmentId
          ? { exclude_enrollment_id: placement.excludeEnrollmentId }
          : null),
      },
    })
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

// Per-scholarship-type award counts across every matching award, not just the
// page being shown. Takes the same year/level/grade/date filters as the list;
// deliberately ignores scholarship_type so selecting one chip doesn't zero out
// the counts on the rest.
export const getEnrollmentScholarshipSummary = (params = {}) =>
  enrollmentClient.get("/enrollment-scholarships/summary/", { params }).then((r) => r.data);

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

// Requirement types and submissions used to be reachable from here too, which
// meant two API clients for one resource. Everything document-related now goes
// through api/requirementApi.js, which RequirementDocumentsPanel uses.

// ── Section promotion ─────────────────────────────────────────────────────────
export const promotePreview = (payload) =>
  enrollmentClient.post("/enrollments/promote/preview/", payload).then((r) => r.data);

export const promoteConfirm = (payload) =>
  enrollmentClient.post("/enrollments/promote/confirm/", payload).then((r) => r.data);

// Closes a section's school year: every `enrolled` row in it becomes
// `completed`, which is what Promote reads from. { school_year, grade_level,
// section, semester? } — semester is required for Grade 11/12.
export const completeSection = (payload) =>
  enrollmentClient.post("/enrollments/complete-section/", payload).then((r) => r.data);

// Active students with no enrolled/pending row in `schoolYear` — the
// registrar's "not yet placed" worklist.
export const getUnplacedStudents = (schoolYear) =>
  enrollmentClient
    .get("/enrollments/unplaced/", { params: schoolYear ? { school_year: schoolYear } : {} })
    .then((r) => r.data);

// A guardian's answer on their child's next-year pending row. Records the
// answer only — the registrar still activates or cancels the enrollment.
export const submitGuardianResponse = (enrollmentId, { response, reason = "" }) =>
  enrollmentClient
    .post(`/enrollments/${enrollmentId}/guardian-response/`, { response, reason })
    .then((r) => r.data);

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

export const getSectionAttendance = (params = {}) =>
  enrollmentClient.get("/section-advisories/section-attendance/", { params }).then((r) => r.data);

export const saveSectionAttendance = (payload) =>
  enrollmentClient.post("/section-advisories/section-attendance/", payload).then((r) => r.data);

export const getSectionNarrativeReports = (params = {}) =>
  enrollmentClient.get("/section-advisories/section-narrative-reports/", { params }).then((r) => r.data);

export const saveSectionNarrativeReports = (payload) =>
  enrollmentClient.post("/section-advisories/section-narrative-reports/", payload).then((r) => r.data);

export const getSectionAttendanceStats = (params = {}) =>
  enrollmentClient.get("/section-advisories/section-attendance-stats/", { params }).then((r) => r.data);

export const getSectionGradesSummary = (params = {}) =>
  enrollmentClient.get("/section-advisories/section-grades-summary/", { params }).then((r) => r.data);

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
