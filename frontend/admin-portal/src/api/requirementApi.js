const ENROLLMENT_BASE = (
  import.meta.env.VITE_ENROLLMENT_API_URL || "http://localhost:8003"
).replace(/\/+$/, "");

function authHeaders() {
  const token = sessionStorage.getItem("access_token") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function resolveMediaUrl(url) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${ENROLLMENT_BASE}${url}`;
}

export async function fetchRequirementTypes(activeOnly = true) {
  const qs = activeOnly ? "?is_active=true" : "";
  const res = await fetch(`${ENROLLMENT_BASE}/api/requirement-types/${qs}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load requirement types.");
  const data = await res.json();
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function fetchRequirementSummary(studentId) {
  const res = await fetch(
    `${ENROLLMENT_BASE}/api/student-requirement-submissions/summary/?student_id=${studentId}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error("Failed to load requirements for this student.");
  return res.json();
}

export async function uploadRequirement({ studentId, requirementTypeId, file, remarks = "" }) {
  const form = new FormData();
  form.append("student_id", studentId);
  form.append("requirement_type", requirementTypeId);
  form.append("file", file);
  if (remarks) form.append("remarks", remarks);

  const res = await fetch(`${ENROLLMENT_BASE}/api/student-requirement-submissions/`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Upload failed.");
  }
  return res.json();
}

export async function replaceRequirement({ submissionId, file, remarks }) {
  const form = new FormData();
  if (file) form.append("file", file);
  if (remarks !== undefined) form.append("remarks", remarks);

  const res = await fetch(
    `${ENROLLMENT_BASE}/api/student-requirement-submissions/${submissionId}/`,
    { method: "PATCH", headers: authHeaders(), body: form }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Update failed.");
  }
  return res.json();
}

export async function removeRequirement(submissionId) {
  const res = await fetch(
    `${ENROLLMENT_BASE}/api/student-requirement-submissions/${submissionId}/`,
    { method: "DELETE", headers: authHeaders() }
  );
  if (!res.ok) throw new Error("Could not remove requirement.");
}