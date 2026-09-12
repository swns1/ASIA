// applicationApi.js
//
// Staff-side client for issuing applicant invites and reviewing submitted
// student applications (backend: intake/views.py's
// ApplicationInviteViewSet / StudentApplicationViewSet). Normal
// staff-authenticated client — see applyApi.js for why the public,
// applicant-facing endpoints deliberately use a separate one.
import { createApiClient } from "./apiClient";

const applicationClient = createApiClient({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://localhost:8000/api",
  timeout: 10000,
});

// ── Invites ──────────────────────────────────────────────────────────────

// { applicant_first_name, applicant_last_name, contact_email?, contact_mobile? }
// -> { invite_id, ..., access_code, apply_url }
// access_code is shown exactly once in this response — the backend never
// stores or re-derives the plaintext, so there is no "look it up later".
export async function createApplicationInvite(payload) {
  const res = await applicationClient.post("/application-invites/", payload);
  return res.data;
}

export async function getApplicationInvites({ status = "" } = {}) {
  const res = await applicationClient.get("/application-invites/", {
    params: { ...(status && { status }) },
  });
  return Array.isArray(res.data) ? res.data : res.data?.results ?? [];
}

export async function revokeApplicationInvite(id) {
  const res = await applicationClient.post(`/application-invites/${id}/revoke/`);
  return res.data;
}

// Revokes the old invite and issues a fresh one for the same applicant —
// same response shape as createApplicationInvite (a new access_code shown once).
export async function reissueApplicationInvite(id) {
  const res = await applicationClient.post(`/application-invites/${id}/reissue/`);
  return res.data;
}

// ── Applications ─────────────────────────────────────────────────────────

export async function getStudentApplications({ page = 1, page_size, status = "", search = "" } = {}) {
  const res = await applicationClient.get("/student-applications/", {
    params: {
      page,
      ...(page_size && { page_size }),
      ...(status && { status }),
      ...(search && { search }),
    },
  });
  return res.data;
}

export async function getStudentApplication(id) {
  const res = await applicationClient.get(`/student-applications/${id}/`);
  return res.data;
}

export async function claimStudentApplication(id) {
  const res = await applicationClient.patch(`/student-applications/${id}/claim/`);
  return res.data;
}

// overrides: the same {student, household, guardians, siblings,
// previous_schools} shape as the stored payload — only what the registrar
// is correcting needs to be included. LRN is the one field structurally
// required if the applicant didn't supply one (students.lrn is NOT NULL).
export async function approveStudentApplication(id, overrides = {}) {
  const res = await applicationClient.post(`/student-applications/${id}/approve/`, overrides);
  return res.data;
}

export async function rejectStudentApplication(id, decisionNote) {
  const res = await applicationClient.post(`/student-applications/${id}/reject/`, {
    decision_note: decisionNote,
  });
  return res.data;
}
