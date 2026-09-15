import { useRef, useState } from "react";
import toast from "react-hot-toast";

import { scanDocument } from "../../api/ocrApi";
import { replaceRequirement, resolveMediaUrl, uploadRequirement } from "../../api/requirementApi";
import DocumentCheckStrip from "./DocumentCheckStrip";
import { C } from "./requirementMeta";

/**
 * Upload or replace one document, with an advisory OCR check.
 *
 * Merged from the two divergent copies this replaces — RequirementsPage's
 * UploadModal and StudentFormPage's DocUploadModal — keeping what each got
 * right: the `capture="environment"` hint (StudentFormPage; lets a tablet at
 * the counter shoot the paper directly) and the scan sequence guard
 * (RequirementsPage; StudentFormPage had none).
 *
 * The check never gates the upload. A registrar holding a valid but unusual
 * document has to be able to proceed.
 */
export default function DocumentUploadModal({ requirement, studentId, student, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [remarks, setRemarks] = useState(requirement?.remarks || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [checkState, setCheckState] = useState("idle"); // idle | scanning | done | error
  const [check, setCheck] = useState(null);

  // A scan runs for tens of seconds (see ocrApi.js's timeout). Someone who
  // picks the wrong file and corrects it would otherwise have the first scan
  // land second and label the new file with the old file's verdict.
  const scanSeq = useRef(0);
  const fileInputRef = useRef(null);
  const isReplace = !!requirement?.submission_id;

  function acceptFile(f) {
    if (!f) return;
    setFile(f);
    setError("");
    setCheck(null);

    if (!f.type.startsWith("image/")) {
      // A PDF has no page for the recogniser to read, so there is nothing to
      // check — say nothing rather than showing a failed check. Still bump the
      // sequence, so an image picked a moment ago cannot resolve and show its
      // verdict against this PDF.
      scanSeq.current += 1;
      setPreview(null);
      setCheckState("idle");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(f);

    const seq = (scanSeq.current += 1);
    setCheckState("scanning");
    scanDocument(f, {
      requirementCode: requirement?.requirement_code,
      studentId,
      firstName: student?.first_name,
      lastName: student?.last_name,
    })
      .then((data) => {
        if (seq !== scanSeq.current) return; // superseded by a newer file
        if (!data?.success) { setCheckState("error"); return; }
        setCheck(data.check || null);
        setCheckState("done");
      })
      .catch(() => {
        if (seq !== scanSeq.current) return;
        setCheckState("error");
      });
  }

  async function handleSubmit() {
    if (!file && !isReplace) { setError("Please select a file."); return; }
    setUploading(true);
    setError("");
    try {
      if (isReplace) {
        await replaceRequirement({ submissionId: requirement.submission_id, file, remarks });
      } else {
        await uploadRequirement({
          studentId,
          requirementTypeId: requirement.requirement_type_id,
          file,
          remarks,
        });
      }
      toast.success(isReplace ? "Document replaced." : "Document uploaded.");
      onSuccess();
    } catch (e) {
      const msg = e.message || "Upload failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  const currentImageUrl = isReplace && requirement.image_url
    ? resolveMediaUrl(requirement.image_url)
    : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.45)", display: "flex",
                  alignItems: "center", justifyContent: "center", zIndex: 998,
                  backdropFilter: "blur(4px)", padding: 16 }}>
      <div style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 500,
                    boxShadow: "0 24px 64px rgba(224,49,49,0.15)", display: "flex",
                    flexDirection: "column", maxHeight: "90vh", overflow: "hidden",
                    animation: "slideUp 0.2s ease" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex",
                      alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
              {isReplace ? "Replace" : "Upload"} Document
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{requirement?.requirement_name}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 8,
                     background: "white", cursor: "pointer", display: "flex", alignItems: "center",
                     justifyContent: "center", color: C.muted }}
          >
            <i className="ti ti-x" style={{ fontSize: 14 }} />
          </button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {currentImageUrl && !preview && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase",
                            letterSpacing: "0.06em", marginBottom: 8 }}>Current File</div>
              <img src={currentImageUrl} alt="current"
                   style={{ width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 10,
                            border: `1px solid ${C.border}`, background: "#fafafa" }} />
            </div>
          )}

          <div
            onDrop={(e) => { e.preventDefault(); acceptFile(e.dataTransfer.files?.[0]); }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `2px dashed ${file ? C.redBorder : "#e0d0d0"}`, borderRadius: 12,
                     padding: "24px 16px", textAlign: "center", cursor: "pointer",
                     background: file ? C.redLight : "#fafafa", transition: "all 0.15s" }}
          >
            {/* capture="environment" lets a tablet at the counter photograph
                the document instead of hunting for a file. Harmless on desktop. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />
            {preview ? (
              <img src={preview} alt="preview"
                   style={{ maxHeight: 180, maxWidth: "100%", objectFit: "contain", borderRadius: 8 }} />
            ) : file ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <i className="ti ti-file-description" style={{ fontSize: 32, color: C.red }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{file.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>Click to change file</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <i className="ti ti-cloud-upload" style={{ fontSize: 32, color: "#8a6a6a" }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>
                  {isReplace ? "Drop new file or click to browse" : "Drop file here or click to browse"}
                </div>
                <div style={{ fontSize: 11, color: C.pale }}>Images (JPG, PNG, GIF) or PDF</div>
              </div>
            )}
          </div>

          <DocumentCheckStrip
            state={checkState}
            check={check}
            requirementName={requirement?.requirement_name}
            studentName={student ? `${student.first_name} ${student.last_name}` : ""}
          />

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase",
                            letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
              Remarks <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span>
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Add any notes about this document…"
              style={{ width: "100%", border: "1.5px solid #f0ceca", borderRadius: 10, padding: "10px 12px",
                       fontSize: 13, fontFamily: "'DM Sans',sans-serif", resize: "vertical", outline: "none",
                       color: C.text, background: "#fffbfb", boxSizing: "border-box" }}
            />
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: `1px solid ${C.redBorder}`, borderRadius: 10,
                          padding: "10px 14px", fontSize: 13, color: "#b91c1c", display: "flex",
                          alignItems: "center", gap: 8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
            </div>
          )}
        </div>

        <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, height: 42, border: `1px solid ${C.border}`, borderRadius: 10, background: "white",
                     color: C.muted, fontSize: 13, fontWeight: 700, cursor: "pointer",
                     fontFamily: "'DM Sans',sans-serif" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading || (!file && !isReplace)}
            style={{ flex: 2, height: 42, border: "none", borderRadius: 10,
                     background: uploading ? "#f0dada" : `linear-gradient(135deg,${C.red},${C.redDark})`,
                     color: uploading ? "#8a6a6a" : "white", fontSize: 13, fontWeight: 700,
                     cursor: uploading ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif",
                     display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {uploading ? (
              <><i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 0.8s linear infinite" }} />Uploading…</>
            ) : (
              <><i className="ti ti-upload" style={{ fontSize: 14 }} />{isReplace ? "Replace Document" : "Upload Document"}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
