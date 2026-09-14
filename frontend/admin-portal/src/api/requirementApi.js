import { createApiClient } from "./apiClient";

const ENROLLMENT_BASE = (
  import.meta.env.VITE_ENROLLMENT_API_URL || "http://localhost:8003/api"
).replace(/\/api\/?$/, "").replace(/\/+$/, "");

const client = createApiClient({ baseURL: ENROLLMENT_BASE, timeout: 15000 });

export function resolveMediaUrl(url) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${ENROLLMENT_BASE}${url}`;
}

export async function fetchRequirementTypes(activeOnly = true) {
  try {
    const res = await client.get("/api/requirement-types/", {
      params: activeOnly ? { is_active: true } : {},
    });
    return Array.isArray(res.data) ? res.data : res.data.results ?? [];
  } catch {
    throw new Error("Failed to load requirement types.");
  }
}

/**
 * One student's document checklist.
 *
 * `schoolLevel` / `entryStatus` are optional. Supplied, the server also
 * answers `applies` per row — whether this learner is asked for that document
 * at all — so a Grade 1 entrant is not shown an NCAE result. Omitted, every
 * row comes back with `applies: null` and the caller sees the whole
 * catalogue, which is what the standalone Requirements page wants.
 */
export async function fetchRequirementSummary(studentId, { schoolLevel, entryStatus } = {}) {
  try {
    const res = await client.get("/api/student-requirement-submissions/summary/", {
      params: {
        student_id: studentId,
        ...(schoolLevel ? { school_level: schoolLevel } : null),
        ...(entryStatus ? { entry_status: entryStatus } : null),
      },
    });
    return res.data;
  } catch {
    throw new Error("Failed to load requirements for this student.");
  }
}

export async function uploadRequirement({ studentId, requirementTypeId, file, remarks = "" }) {
  const form = new FormData();
  form.append("student_id", studentId);
  form.append("requirement_type", requirementTypeId);
  form.append("file", file);
  if (remarks) form.append("remarks", remarks);

  try {
    // Don't set Content-Type manually — axios detects FormData and fills in
    // the correct multipart boundary itself.
    const res = await client.post("/api/student-requirement-submissions/", form);
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.detail || "Upload failed.", { cause: err });
  }
}

export async function replaceRequirement({ submissionId, file, remarks }) {
  const form = new FormData();
  if (file) form.append("file", file);
  if (remarks !== undefined) form.append("remarks", remarks);

  try {
    const res = await client.patch(`/api/student-requirement-submissions/${submissionId}/`, form);
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.detail || "Update failed.", { cause: err });
  }
}

export async function removeRequirement(submissionId) {
  try {
    await client.delete(`/api/student-requirement-submissions/${submissionId}/`);
  } catch {
    throw new Error("Could not remove requirement.");
  }
}
