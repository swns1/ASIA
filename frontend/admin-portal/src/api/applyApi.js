// applyApi.js
//
// Public, unauthenticated client for the applicant-facing student
// information form (backend: intake/views.py's ApplyVerifyView /
// ApplyDraftView / ApplySubmitView). Deliberately separate from
// applicationApi.js (the staff-side client) — they use different axios
// clients with different redirect behavior on a 401, and merging them into
// one module is how someone eventually calls a staff-only endpoint from an
// applicant's own device.
//
// redirectOnAuthFailure: false is load-bearing, not a nice-to-have: the
// default apiClient behavior on a 401 is a silent refresh attempt (this
// client carries no staff access_token and no refresh cookie, so that's
// guaranteed to fail) followed by `window.location.href = "/login"` —
// which would hard-navigate an applicant away from a half-filled form with
// no warning. See apiClient.test.jsx's "never navigates" test.
//
// The applicant session token (X-Applicant-Token) is NOT attached by an
// interceptor the way the staff access_token is — it's scoped to one
// invite's draft, held by the caller (ApplicantFormPage), and passed
// explicitly to every function here.
import { createApiClient } from "./apiClient";

const applyClient = createApiClient({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://localhost:8000/api",
  timeout: 10000,
  redirectOnAuthFailure: false,
});

function tokenHeaders(token) {
  return token ? { "X-Applicant-Token": token } : {};
}

// POST /apply/{inviteId}/verify/  { access_code } -> { token, applicant_full_name, payload, revision }
export async function verifyApplicantCode(inviteId, accessCode) {
  const res = await applyClient.post(`/apply/${inviteId}/verify/`, { access_code: accessCode });
  return res.data;
}

// GET /apply/{inviteId}/draft/  -> { payload, revision }
export async function getApplicationDraft(inviteId, token) {
  const res = await applyClient.get(`/apply/${inviteId}/draft/`, { headers: tokenHeaders(token) });
  return res.data;
}

// PATCH /apply/{inviteId}/draft/  { revision, payload } -> { payload, revision }
// A 409 (another tab saved first) is not thrown as an error the caller has
// to unwrap — it's returned the same shape as a success, with `conflict:
// true`, so ApplicantFormPage can reload the server copy without a
// try/catch just for this one expected case.
export async function saveApplicationDraft(inviteId, token, revision, payload) {
  try {
    const res = await applyClient.patch(
      `/apply/${inviteId}/draft/`,
      { revision, payload },
      { headers: tokenHeaders(token) }
    );
    return { conflict: false, ...res.data };
  } catch (err) {
    if (err.response?.status === 409) {
      return { conflict: true, ...err.response.data };
    }
    throw err;
  }
}

// POST /apply/{inviteId}/submit/  -> { reference, status, submitted_at }
export async function submitApplication(inviteId, token) {
  const res = await applyClient.post(`/apply/${inviteId}/submit/`, {}, { headers: tokenHeaders(token) });
  return res.data;
}
