// ocrApi.js
import { createApiClient } from "./apiClient";

const studentClient = createApiClient({
  baseURL: import.meta.env.VITE_STUDENT_API_URL || "http://localhost:8000/api",
  timeout: 10000,
});

/**
 * Sends a document image to the OCR endpoint and returns extracted fields.
 *
 * @param {File} imageFile  - The scanned document (JPEG/PNG/WEBP)
 * @returns {Promise<{
 *   success: boolean,
 *   confidence: "high"|"medium"|"low",
 *   extracted: Object
 * }>}
 */
export async function scanDocument(imageFile) {
  const formData = new FormData();
  formData.append("image", imageFile);

  // Deliberately no Content-Type header here — axios/the browser sets
  // multipart/form-data with the correct boundary automatically for a
  // FormData body; setting it manually (as this used to) omits the
  // boundary parameter the server needs to parse the body.
  const response = await studentClient.post("/ocr/scan/", formData);

  return response.data;
}
