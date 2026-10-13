// download.js — saving a file the API sent back, and reading what it said.
//
// The DepEd school forms arrive as .xlsx blobs (api/enrollmentApi.js
// downloadSchoolForm). A failed request's JSON body arrives as a Blob too, so
// the usual `err.response.data.detail` is unreadable until it is parsed back.

import { extractValidationMessage } from "../api/apiClient";

/** Hand `blob` to the browser as a download named `filename`. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: some browsers start the download only after
  // the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The filename in a Content-Disposition header, else `fallback`. */
export function filenameFromDisposition(header, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(header || "");
  return match ? match[1] : fallback;
}

/** The server's X-Form-Warnings header: a JSON list of strings, or []. */
export function parseFormWarnings(header) {
  if (!header) return [];
  try {
    const list = JSON.parse(header);
    return Array.isArray(list) ? list.filter((w) => typeof w === "string") : [];
  } catch {
    return [];
  }
}

// Blob.text(), with FileReader for engines that lack it (older browsers, jsdom).
function blobText(blob) {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/**
 * When a blob request fails, read its JSON body and put the server's reason
 * on `err.message`. Leaves the error alone when the body isn't JSON.
 */
export async function readBlobError(err) {
  const data = err?.response?.data;
  if (!(data instanceof Blob)) return err;
  try {
    const parsed = JSON.parse(await blobText(data));
    err.response.data = parsed;
    const message = extractValidationMessage(parsed);
    if (message) err.message = message;
  } catch {
    // Not JSON (an HTML error page, say): the interceptor's message stands.
  }
  return err;
}
