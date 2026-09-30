import { useRef, useState } from "react";
import toast from "react-hot-toast";

import { scanDocument } from "../../api/ocrApi";
import { replaceRequirement, resolveMediaUrl, uploadRequirement } from "../../api/requirementApi";
import DocumentCheckStrip from "./DocumentCheckStrip";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { Field, Textarea } from "../FormField";

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
 *
 * The dialog shell is ui/Modal, so this inherits the focus trap, Escape
 * handling and restore-focus-on-close that the hand-rolled <div> overlay it
 * used to draw had none of. Its header is left-aligned with the requirement
 * name under it, which Modal's centred title block doesn't do — so the header
 * is passed as content and Modal just supplies the shell and close button.
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
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={uploading}
      className="text-left"
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          {/* Upload takes twice Cancel's width, as before — it's the action
              the dialog exists for. */}
          <Button
            className="flex-[2]"
            onClick={handleSubmit}
            loading={uploading}
            disabled={!file && !isReplace}
            icon="ti-upload"
          >
            {uploading ? "Uploading…" : isReplace ? "Replace Document" : "Upload Document"}
          </Button>
        </div>
      }
    >
      <div className="mb-5">
        <h2 className="text-md font-bold text-neutral-900">
          {isReplace ? "Replace" : "Upload"} Document
        </h2>
        <p className="mt-0.5 text-xs text-neutral-700">{requirement?.requirement_name}</p>
      </div>

      <div className="flex flex-col gap-4">
        {currentImageUrl && !preview && (
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-700">
              Current File
            </div>
            <img
              src={currentImageUrl}
              alt="current"
              className="max-h-40 w-full rounded-lg border border-neutral-200 bg-neutral-50 object-contain"
            />
          </div>
        )}

        {/* The drop zone is a button so it's reachable by keyboard: it used to
            be a div with onClick, so the only way to attach a file was a
            mouse. */}
        <button
          type="button"
          onDrop={(e) => { e.preventDefault(); acceptFile(e.dataTransfer.files?.[0]); }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className={`focus-ring w-full cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-150 ${
            file ? "border-brand-300 bg-brand-100" : "border-neutral-300 bg-neutral-50 hover:border-brand-300"
          }`}
        >
          {/* capture="environment" lets a tablet at the counter photograph
              the document instead of hunting for a file. Harmless on desktop. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />
          {preview ? (
            <img src={preview} alt="preview" className="mx-auto max-h-44 max-w-full rounded-lg object-contain" />
          ) : file ? (
            <div className="flex flex-col items-center gap-2">
              <i className="ti ti-file-description text-3xl text-brand-500" aria-hidden="true" />
              <div className="text-sm font-semibold text-neutral-900">{file.name}</div>
              <div className="text-[11px] text-neutral-700">Click to change file</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <i className="ti ti-cloud-upload text-3xl text-neutral-500" aria-hidden="true" />
              <div className="text-sm font-semibold text-neutral-700">
                {isReplace ? "Drop new file or click to browse" : "Drop file here or click to browse"}
              </div>
              <div className="text-[11px] text-neutral-500">Images (JPG, PNG, GIF) or PDF</div>
            </div>
          )}
        </button>

        <DocumentCheckStrip
          state={checkState}
          check={check}
          requirementName={requirement?.requirement_name}
          studentName={student ? `${student.first_name} ${student.last_name}` : ""}
        />

        <Field
          label="Remarks"
          hint="Optional — add any notes about this document."
        >
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            placeholder="Add any notes about this document…"
          />
        </Field>

        {error && <Alert variant="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
