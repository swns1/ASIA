import axios from "axios";

const STUDENT_API = "http://localhost:8000/api";

/**
 * Sends a document image to the OCR endpoint and returns extracted fields.
 *
 * @param {File} imageFile  - The scanned document (JPEG/PNG/WEBP)
 * @param {string} token    - JWT access token
 * @returns {Promise<{
 *   success: boolean,
 *   confidence: "high"|"medium"|"low",
 *   extracted: Object
 * }>}
 */
export async function scanDocument(imageFile, token) {
  const formData = new FormData();
  formData.append("image", imageFile);

  const response = await axios.post(`${STUDENT_API}/ocr/scan/`, formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}