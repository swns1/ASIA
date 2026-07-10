/**
 * OcrScanButton
 *
 * A self-contained "Scan Document" button that:
 *  1. Opens a file picker (or camera on mobile)
 *  2. Shows a preview of the selected image
 *  3. Calls the OCR endpoint
 *  4. Calls onExtracted(fields) so the parent form can auto-fill
 *
 * Usage in StudentFormPage:
 *   <OcrScanButton onExtracted={(fields) => setFormData(prev => ({ ...prev, ...fields }))} />
 */

import { useRef, useState } from "react";
import { scanDocument } from "../api/ocrApi";

const CONFIDENCE_STYLES = {
  high:   { bar: "bg-green-500",  label: "text-green-700",  text: "High confidence"   },
  medium: { bar: "bg-yellow-400", label: "text-yellow-700", text: "Medium confidence" },
  low:    { bar: "bg-red-400",    label: "text-red-700",    text: "Low confidence — review carefully" },
};

// Maps OCR field names → human-readable labels for the preview
const FIELD_LABELS = {
  first_name:              "First Name",
  middle_name:             "Middle Name",
  last_name:               "Last Name",
  suffix:                  "Suffix",
  lrn:                     "LRN",
  birth_date:              "Birth Date",
  sex:                     "Sex",
  religion:                "Religion",
  email:                   "Email",
  mobile_number:           "Mobile Number",
  current_address:         "Current Address",
  permanent_address:       "Permanent Address",
  guardian_full_name:      "Guardian Name",
  guardian_relationship:   "Guardian Relationship",
  guardian_mobile_number:  "Guardian Mobile",
  guardian_email:          "Guardian Email",
  previous_school_name:    "Previous School",
  previous_school_address: "Previous School Address",
};

export default function OcrScanButton({ onExtracted, className = "" }) {
  const fileInputRef = useRef(null);

  const [state, setState] = useState("idle"); // idle | scanning | done | error
  const [preview, setPreview]       = useState(null);   // object URL
  const [result, setResult]         = useState(null);   // { confidence, extracted }
  const [error, setError]           = useState("");
  const [isOpen, setIsOpen]         = useState(false);  // modal open

  // ── Trigger file picker ─────────────────────────────────────────────────
  function handleButtonClick() {
    setIsOpen(true);
    setResult(null);
    setError("");
    setPreview(null);
    setState("idle");
    // Small delay so the modal renders before we open the picker
    setTimeout(() => fileInputRef.current?.click(), 100);
  }

  // ── File selected ───────────────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    setPreview(URL.createObjectURL(file));
    setState("scanning");
    setError("");
    setResult(null);

    try {
      const access = sessionStorage.getItem("access_token");
      const data = await scanDocument(file, access);

      if (!data.success) {
        throw new Error(data.error || "OCR failed.");
      }

      setResult(data);
      setState("done");
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "OCR request failed. Please try again.";
      setError(msg);
      setState("error");
    }

    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  // ── Apply extracted fields to the parent form ───────────────────────────
  function handleApply() {
    if (result?.extracted) {
      onExtracted(result.extracted);
    }
    setIsOpen(false);
  }

  function handleClose() {
    setIsOpen(false);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const fieldCount = result ? Object.keys(result.extracted).length : 0;
  const confStyle  = result ? (CONFIDENCE_STYLES[result.confidence] ?? CONFIDENCE_STYLES.medium) : null;

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleButtonClick}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors ${className}`}
      >
        {/* Camera icon */}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Scan Document
      </button>

      {/* Hidden file input — accepts images + camera on mobile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Scan Document</h2>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">

              {/* Idle state */}
              {state === "idle" && (
                <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-300 rounded-xl text-gray-400">
                  <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-sm">Selecting document…</p>
                </div>
              )}

              {/* Image preview */}
              {preview && (
                <div className="rounded-xl overflow-hidden border border-gray-200">
                  <img src={preview} alt="Document preview" className="w-full object-contain max-h-56" />
                </div>
              )}

              {/* Scanning spinner */}
              {state === "scanning" && (
                <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl">
                  <svg className="w-5 h-5 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-indigo-800">Scanning document…</p>
                    <p className="text-xs text-indigo-500">Groq AI is extracting student information</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {state === "error" && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm font-medium text-red-700">Scan failed</p>
                  <p className="text-xs text-red-500 mt-1">{error}</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 text-xs text-red-600 underline"
                  >
                    Try another image
                  </button>
                </div>
              )}

              {/* Results */}
              {state === "done" && result && (
                <div className="space-y-3">
                  {/* Confidence badge */}
                  <div className={`flex items-center gap-2 text-sm font-medium ${confStyle.label}`}>
                    <div className={`w-2 h-2 rounded-full ${confStyle.bar}`} />
                    {confStyle.text} · {fieldCount} field{fieldCount !== 1 ? "s" : ""} found
                  </div>

                  {/* Extracted fields table */}
                  {fieldCount > 0 ? (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody>
                          {Object.entries(result.extracted).map(([key, value], i) => (
                            <tr key={key} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                              <td className="px-4 py-2 text-gray-500 font-medium w-2/5">
                                {FIELD_LABELS[key] ?? key}
                              </td>
                              <td className="px-4 py-2 text-gray-800 break-all">
                                {String(value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No fields could be extracted. Try a clearer image.
                    </p>
                  )}

                  {/* Action row */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Rescan
                    </button>
                    <button
                      type="button"
                      onClick={handleApply}
                      disabled={fieldCount === 0}
                      className="flex-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Apply to Form
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  );
}