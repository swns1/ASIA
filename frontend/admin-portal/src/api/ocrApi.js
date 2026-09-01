// ocrApi.js
import { createApiClient } from "./apiClient";

const studentClient = createApiClient({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://localhost:8000/api",
  // A scan runs the local recogniser over the whole page (~30s) and may then
  // escalate to the cloud reader (45s x 3). The old 10s ceiling aborted the
  // request browser-side while the server was still working, and the UI
  // reported that as "OCR failed" -- almost certainly the cause of the
  // spurious failures on slower documents.
  timeout: 180000,
});

/**
 * Sends a document image to the OCR endpoint.
 *
 * `requirementCode` decides what happens to the document: the two families
 * the enrollment form needs get a full field extraction, and everything else
 * gets a cheap "is this the right paper, for this student?" check that makes
 * no model call at all. Omitting it makes the server fall back to verifying,
 * which is the safe direction -- a wrong anchor set produces confidently wrong
 * fields, which is worse than no fields.
 *
 * @param {File} imageFile
 * @param {{requirementCode?: string, studentId?: number|string,
 *          firstName?: string, lastName?: string}} [context]
 * @returns {Promise<{
 *   success: boolean,
 *   policy: "extract"|"verify",
 *   source_engine: "paddle"|"groq",
 *   extracted: Object,
 *   field_confidence: Object,
 *   check: Object|null,
 *   ledger: Object,
 *   warnings: string[]
 * }>}
 */
export async function scanDocument(imageFile, context = {}) {
  const formData = new FormData();
  formData.append("image", imageFile);
  if (context.requirementCode) formData.append("requirement_code", context.requirementCode);
  if (context.studentId) formData.append("student_id", context.studentId);
  // What the form currently holds, so the server can answer "does this
  // document actually name this student?" without a second round trip.
  if (context.firstName) formData.append("first_name", context.firstName);
  if (context.lastName) formData.append("last_name", context.lastName);

  // Deliberately no Content-Type header here — axios/the browser sets
  // multipart/form-data with the correct boundary automatically for a
  // FormData body; setting it manually (as this used to) omits the
  // boundary parameter the server needs to parse the body.
  const response = await studentClient.post("/ocr/scan/", formData);

  return response.data;
}
