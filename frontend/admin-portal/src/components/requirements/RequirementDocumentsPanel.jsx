import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import ConfirmModal from "../ConfirmModal";
import { fetchRequirementSummary, removeRequirement, resolveMediaUrl } from "../../api/requirementApi";
import DocumentUploadModal from "./DocumentUploadModal";
import DocumentViewModal from "./DocumentViewModal";
import { C, groupRequirements, isImageDoc, isPdfDoc, reqIcon } from "./requirementMeta";

// Hoisted deliberately. Defined inside the panel these would be new component
// types on every render, so React would unmount and remount each row — losing
// focus and restarting animations — and the compiler rejects it outright.
function DocumentActions({ req, readOnly, onView, onUpload, onRemove }) {
  if (readOnly) return null;
  const viewable = req.is_submitted && req.image_url && (isImageDoc(req) || isPdfDoc(req));
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {req.is_submitted ? (
        <>
          {viewable && (
            <button className="row-action" title="View" onClick={() => onView(req)}>
              <i className="ti ti-eye" style={{ fontSize: 14 }} />
            </button>
          )}
          <button className="row-action" title="Replace" onClick={() => onUpload(req)}>
            <i className="ti ti-replace" style={{ fontSize: 14 }} />
          </button>
          <button
            className="row-action danger" title="Remove" style={{ color: "#8a6a6a" }}
            onClick={() => onRemove(req)}
          >
            <i className="ti ti-trash" style={{ fontSize: 14 }} />
          </button>
        </>
      ) : (
        <button
          className="row-action" title="Upload" style={{ color: C.red }}
          onClick={() => onUpload(req)}
        >
          <i className="ti ti-upload" style={{ fontSize: 14 }} />
        </button>
      )}
    </div>
  );
}

function DocumentRow({ req, compact, ...actions }) {
  const icon = reqIcon(req.requirement_code);
  const blocking = !req.is_submitted && req.is_required;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: compact ? "10px 0" : "12px 4px",
      borderBottom: `1px solid ${C.softBorder}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: req.is_submitted ? C.greenLight : blocking ? C.redLight : "#f5f5f5",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <i
          className={`ti ${req.is_submitted ? "ti-file-check" : icon}`}
          style={{ fontSize: 15, color: req.is_submitted ? C.green : blocking ? C.red : "#8a6a6a" }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{req.requirement_name}</span>
          {!req.is_submitted && (
            <span style={{
              fontSize: 10, fontWeight: 700, borderRadius: 99, padding: "2px 8px",
              textTransform: "uppercase", letterSpacing: "0.05em",
              color: blocking ? C.red : C.muted,
              background: blocking ? C.redLight : "#f5f5f5",
            }}>
              {blocking ? "Required" : "Optional"}
            </span>
          )}
        </div>
        {req.submitted_at && (
          <div style={{ fontSize: 11, color: C.pale, marginTop: 2 }}>
            Submitted {new Date(req.submitted_at).toLocaleDateString("en-PH", {
              year: "numeric", month: "short", day: "2-digit",
            })}
          </div>
        )}
        {req.remarks && (
          <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginTop: 2 }}>
            &ldquo;{req.remarks}&rdquo;
          </div>
        )}
        {!req.submitted_at && !req.remarks && req.description && !compact && (
          <div style={{ fontSize: 11, color: C.pale, marginTop: 2 }}>{req.description}</div>
        )}
      </div>

      <DocumentActions req={req} {...actions} />
    </div>
  );
}

function DocumentSection({ heading, tone, rows, ...rowProps }) {
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: tone, textTransform: "uppercase",
        letterSpacing: "0.07em", marginBottom: 4,
      }}>
        {heading} ({rows.length})
      </div>
      {rows.map((r) => <DocumentRow key={r.requirement_type_id} req={r} {...rowProps} />)}
    </div>
  );
}

/**
 * One student's document checklist, with upload / replace / remove / view.
 *
 * Extracted from two divergent copies — RequirementsPage's grid and
 * StudentFormPage's DocumentsStep — so document handling lives in one place
 * and can also be embedded on the enrollment side, which is where the
 * completeness gate actually blocks a registrar. Previously the enrollment
 * pages could only *display* a missing count, with no navigation path to
 * anywhere that could fix it.
 *
 * Props
 *   studentId   required
 *   student     { first_name, last_name } — for the OCR name check and copy
 *   variant     "table" (full page) | "compact" (embedded in a card)
 *   readOnly    hides every action; for the guardian view
 *   context     { schoolLevel, entryStatus } — scopes the list to the
 *               documents THIS learner is asked for, and marks which block
 *   title/subtitle/emptyMessage
 *   onChange    called with { total, submitted, requiredMissing } after every
 *               load and every mutation, so a host can render its own counts
 *   refreshKey  bump to force a reload
 */
export default function RequirementDocumentsPanel({
  studentId,
  student = null,
  variant = "table",
  readOnly = false,
  context = null,
  title = "Requirement Documents",
  subtitle = null,
  emptyMessage = "No requirement types configured",
  onChange = null,
  refreshKey = 0,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadModal, setUploadModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  // Read off `context` before the callback: hosts pass an object literal,
  // which is a new identity every render and would defeat the memo.
  const ctxLevel = context?.schoolLevel;
  const ctxStatus = context?.entryStatus;
  // Only the newest request may fill the list. Switching students while one
  // is loading otherwise let the earlier response land last, listing the
  // previous student's files -- and Replace/Remove act on a row's own
  // submission_id, so they would have changed that other student's documents.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (!studentId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const data = await fetchRequirementSummary(studentId, {
        schoolLevel: ctxLevel,
        entryStatus: ctxStatus,
      });
      if (seq !== loadSeq.current) return;
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(e.message || "Failed to load documents.");
      setItems([]);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [studentId, ctxLevel, ctxStatus]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const { submitted, required, optional, notApplicable } = groupRequirements(items);
  // "Applicable" is what the progress bar counts — a document this learner is
  // not asked for must not drag their completeness down.
  const applicable = items.filter((i) => i.applies !== false);
  const submittedCount = submitted.length;
  const total = applicable.length;
  const requiredMissing = required.length;

  useEffect(() => {
    if (!loading && onChange) {
      onChange({ total, submitted: submittedCount, requiredMissing });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, total, submittedCount, requiredMissing]);

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeRequirement(removeTarget.submission_id);
      toast.success("Document removed.");
      setRemoveTarget(null);
      await load();
    } catch (e) {
      toast.error(e.message || "Could not remove the document.");
    } finally {
      setRemoving(false);
    }
  }

  function openView(req) {
    setViewModal({
      url: resolveMediaUrl(req.image_url),
      name: req.requirement_name,
      isPdf: isPdfDoc(req),
    });
  }

  const compact = variant === "compact";
  const rowProps = {
    compact, readOnly,
    onView: openView, onUpload: setUploadModal, onRemove: setRemoveTarget,
  };


  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: compact ? 0 : 16 }}>
        {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px" }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "#f3ebeb" }} />
            <div style={{ flex: 1, height: 13, borderRadius: 6, background: "#f3ebeb" }} />
          </div>
        ))}
      </div>
    );
  }

  const allDone = total > 0 && submittedCount === total;

  return (
    <div>
      {error && (
        <div style={{ background: "#fef2f2", border: `1px solid ${C.redBorder}`, borderRadius: 10,
                      padding: "10px 14px", fontSize: 13, color: "#b91c1c", display: "flex",
                      alignItems: "center", gap: 8, marginBottom: 12 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
        </div>
      )}

      {!compact && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
            <div style={{ fontSize: 11.5, color: C.pale, marginTop: 2 }}>
              {subtitle ?? `${submittedCount} of ${total} submitted`}
            </div>
          </div>
        </div>
      )}

      {total > 0 && (
        <div style={{ marginTop: compact ? 0 : 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: requiredMissing ? C.red : C.green }}>
              {requiredMissing === 0
                ? "All required documents submitted."
                : `${requiredMissing} required document${requiredMissing === 1 ? "" : "s"} still missing.`}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: allDone ? C.green : C.muted }}>
              {submittedCount} / {total}
            </span>
          </div>
          <div style={{ height: 7, background: "#f0e4e4", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${total ? Math.round((submittedCount / total) * 100) : 0}%`,
              background: requiredMissing === 0
                ? `linear-gradient(90deg,${C.green},#43a047)`
                : `linear-gradient(90deg,#d97706,#f59e0b)`,
              borderRadius: 99, transition: "width .4s ease",
            }} />
          </div>
        </div>
      )}

      {total === 0 && notApplicable.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 16px", color: C.muted, fontSize: 13 }}>
          {emptyMessage}
        </div>
      ) : (
        <>
          <DocumentSection heading="Required" tone={C.red} rows={required} {...rowProps} />
          <DocumentSection heading="Optional" tone={C.muted} rows={optional} {...rowProps} />
          <DocumentSection heading="Submitted" tone={C.green} rows={submitted} {...rowProps} />
          {notApplicable.length > 0 && !compact && (
            <div style={{ marginTop: 14, fontSize: 11, color: C.pale }}>
              <i className="ti ti-info-circle" style={{ fontSize: 12, marginRight: 5 }} />
              {notApplicable.length} document{notApplicable.length === 1 ? " is" : "s are"} not
              asked of this learner at this level.
            </div>
          )}
        </>
      )}

      {uploadModal && (
        <DocumentUploadModal
          requirement={uploadModal}
          studentId={studentId}
          student={student}
          onClose={() => setUploadModal(null)}
          onSuccess={() => { setUploadModal(null); load(); }}
        />
      )}
      {viewModal && (
        <DocumentViewModal
          url={viewModal.url}
          name={viewModal.name}
          isPdf={viewModal.isPdf}
          onClose={() => setViewModal(null)}
        />
      )}
      {removeTarget && (
        <ConfirmModal
          icon="ti-trash"
          title="Remove document?"
          message={<>You&apos;re about to remove <strong style={{ color: C.text }}>{removeTarget.requirement_name}</strong>. This cannot be undone.</>}
          confirmLabel="Yes, remove"
          loading={removing}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
