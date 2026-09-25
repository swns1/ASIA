// guardianApi.js
import { createApiClient } from "./apiClient";

const studentClient = createApiClient({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://localhost:8000/api",
  timeout: 10000,
});

export async function getGuardiansByStudent(studentId) {
  const res = await studentClient.get("/guardians/", { params: { student_id: studentId } });
  return res.data;
}

export async function createGuardian(payload) {
  const res = await studentClient.post("/guardians/", payload);
  return res.data;
}

export async function updateGuardian(id, payload) {
  const res = await studentClient.put(`/guardians/${id}/`, payload);
  return res.data;
}

export async function patchGuardian(id, payload) {
  const res = await studentClient.patch(`/guardians/${id}/`, payload);
  return res.data;
}

// Links this guardian contact to a `role=guardian` login account, or unlinks
// it with null. Its own endpoint because guardians.user_id is read-only on
// the plain guardian routes -- a PATCH of it returned 200 and saved nothing --
// and this one checks the account is an active parent/guardian account.
export async function linkGuardianAccount(id, userId) {
  const res = await studentClient.post(`/guardians/${id}/link-account/`, { user_id: userId });
  return res.data;
}

export async function deleteGuardian(id) {
  const res = await studentClient.delete(`/guardians/${id}/`);
  return res.data;
}

// Fetches every Guardian row already linked to any of the given user_ids —
// used to warn an admin when a candidate login account is already linked to
// a different student before they link it again.
export async function getGuardiansByUserIds(userIds) {
  if (!userIds || userIds.length === 0) return [];
  const res = await studentClient.get("/guardians/", {
    params: { user_id__in: userIds.join(","), page_size: 500 },
  });
  return res.data;
}
