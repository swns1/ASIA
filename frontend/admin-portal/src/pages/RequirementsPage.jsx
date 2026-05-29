import { useCallback, useEffect, useRef, useState } from "react";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, canViewAuditTrail } from "../utils/auth";
import { getStudents } from "../api/studentApi";
import {
  fetchRequirementSummary,
  removeRequirement,
  replaceRequirement,
  resolveMediaUrl,
  uploadRequirement,
} from "../api/requirementApi";



// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  red: "#e03131", redDark: "#c92a2a", redLight: "#fff0f0", redBorder: "#fca5a5",
  green: "#2e7d32", greenLight: "#e8f5e0", greenBorder: "#a5d6a7",
  border: "#f5eaea", softBorder: "#f9f0f0",
  text: "#1a0a0a", muted: "#7a5050", pale: "#b09090",
  bg: "#fdf8f6", white: "#ffffff",
};

// ── Requirement-type icon map ─────────────────────────────────────────────────
const REQ_ICONS = {
  birth_certificate:           "ti-certificate",
  form_138:                    "ti-file-description",
  certificate_good_moral:      "ti-rosette",
  ncae_result:                 "ti-chart-bar",
  esc_completers:              "ti-school",
  certificate_non_sf9:         "ti-file-check",
  recommendation_letter:       "ti-mail",
  clearance_previous_school:   "ti-building",
  psa_birth_certificate:       "ti-id",
  health_record:               "ti-heart-rate-monitor",
  alien_certificate:           "ti-world",
  form_137_or_138:             "ti-files",
  esc_transferee_qc:           "ti-arrows-transfer",
};

function reqIcon(code) { return REQ_ICONS[code] || "ti-file"; }

function isImageUrl(url) {
  if (!url) return false;
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);

function StatusBadge({ submitted }) {
  return submitted ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 99, padding: "3px 9px", background: C.greenLight, color: C.green, fontSize: 11, fontWeight: 700, border: `1px solid ${C.greenBorder}` }}>
      <i className="ti ti-circle-check" style={{ fontSize: 12 }} />Submitted
    </span>
  ) : (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 99, padding: "3px 9px", background: "#f5f5f5", color: "#888", fontSize: 11, fontWeight: 700, border: "1px solid #e0e0e0" }}>
      <i className="ti ti-clock" style={{ fontSize: 12 }} />Pending
    </span>
  );
}

// ── Logout modal ──────────────────────────────────────────────────────────────

// ── Remove confirm modal ──────────────────────────────────────────────────────
function RemoveModal({ req, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "white", borderRadius: 20, padding: "32px 36px", width: 400, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animation: "slideUp 0.2s ease" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="ti ti-trash" style={{ fontSize: 24, color: C.red }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display',serif" }}>Remove Document?</div>
        <div style={{ fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 1.7 }}>
          You're about to remove <strong style={{ color: C.text }}>{req?.requirement_name}</strong>. This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <button onClick={onCancel} style={s.secondaryBtn}>Cancel</button>
          <button onClick={onConfirm} style={s.dangerBtn}>Yes, remove</button>
        </div>
      </div>
    </div>
  );
}

// ── Upload / Replace modal ────────────────────────────────────────────────────
function UploadModal({ requirement, studentId, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [remarks, setRemarks] = useState(requirement?.remarks || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const isReplace = !!requirement?.submission_id;

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setError("");
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(f);
    } else { setPreview(null); }
  }

  function handleDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f); setError("");
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(f);
    } else { setPreview(null); }
  }

  async function handleSubmit() {
    if (!file && !isReplace) { setError("Please select a file."); return; }
    setUploading(true); setError("");
    try {
      if (isReplace) {
        await replaceRequirement({ submissionId: requirement.submission_id, file, remarks });
      } else {
        await uploadRequirement({ studentId, requirementTypeId: requirement.requirement_type_id, file, remarks });
      }
      onSuccess();
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally { setUploading(false); }
  }

  const currentImageUrl = isReplace && requirement.image_url ? resolveMediaUrl(requirement.image_url) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 998, backdropFilter: "blur(4px)", padding: 16 }}>
      <div style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 500, boxShadow: "0 24px 64px rgba(224,49,49,0.15)", display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden", animation: "slideUp 0.2s ease" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text}}>
              {isReplace ? "Replace" : "Upload"} Document
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{requirement?.requirement_name}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 8, background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
            <i className="ti ti-x" style={{ fontSize: 14 }} />
          </button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {currentImageUrl && !preview && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Current File</div>
              <img src={currentImageUrl} alt="current" style={{ width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 10, border: `1px solid ${C.border}`, background: "#fafafa" }} />
            </div>
          )}

          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `2px dashed ${file ? C.redBorder : "#e0d0d0"}`, borderRadius: 12, padding: "24px 16px", textAlign: "center", cursor: "pointer", background: file ? C.redLight : "#fafafa", transition: "all 0.15s" }}
          >
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={handleFileChange} />
            {preview ? (
              <img src={preview} alt="preview" style={{ maxHeight: 180, maxWidth: "100%", objectFit: "contain", borderRadius: 8 }} />
            ) : file ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <i className="ti ti-file-description" style={{ fontSize: 32, color: C.red }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{file.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>Click to change file</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <i className="ti ti-cloud-upload" style={{ fontSize: 32, color: "#c0a0a0" }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>
                  {isReplace ? "Drop new file or click to browse" : "Drop file here or click to browse"}
                </div>
                <div style={{ fontSize: 11, color: C.pale }}>Images (JPG, PNG, GIF) or PDF</div>
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
              Remarks <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span>
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Add any notes about this document…"
              style={{ width: "100%", border: `1.5px solid #f0ceca`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", resize: "vertical", outline: "none", color: C.text, background: "#fffbfb", boxSizing: "border-box" }}
            />
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
            </div>
          )}
        </div>

        <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ ...s.secondaryBtn, flex: 1 }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={uploading || (!file && !isReplace)}
            style={{ flex: 2, height: 42, border: "none", borderRadius: 10, background: uploading ? "#f0dada" : `linear-gradient(135deg,${C.red},${C.redDark})`, color: uploading ? "#b09090" : "white", fontSize: 13, fontWeight: 700, cursor: uploading ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {uploading
              ? <><i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 0.8s linear infinite" }} />Uploading…</>
              : <><i className="ti ti-upload" style={{ fontSize: 14 }} />{isReplace ? "Replace Document" : "Upload Document"}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function ViewModal({ imageUrl, name, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 24 }} onClick={onClose}>
      <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: "absolute", top: -14, right: -14, width: 36, height: 36, borderRadius: "50%", background: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 1 }}>
          <i className="ti ti-x" style={{ fontSize: 16, color: C.text }} />
        </button>
        <img src={imageUrl} alt={name} style={{ maxWidth: "86vw", maxHeight: "86vh", objectFit: "contain", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />
        <div style={{ position: "absolute", bottom: -32, left: 0, right: 0, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{name}</div>
      </div>
    </div>
  );
}

// ── Requirement card ──────────────────────────────────────────────────────────
function RequirementCard({ req, onUpload, onView, onRemove }) {
  const imageUrl = resolveMediaUrl(req.image_url);
  const hasImage = req.is_submitted && imageUrl && isImageUrl(req.image_url);
  const icon = reqIcon(req.requirement_code);

  return (
    <div style={{
      background: "white",
      border: `1.5px solid ${req.is_submitted ? C.greenBorder : C.border}`,
      borderRadius: 16,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      boxShadow: req.is_submitted ? "0 2px 16px rgba(46,125,50,0.08)" : "0 2px 12px rgba(224,49,49,0.05)",
      transition: "box-shadow 0.15s, transform 0.15s",
    }} className="req-card">
      <div style={{ height: 4, background: req.is_submitted ? `linear-gradient(90deg,${C.green},#43a047)` : `linear-gradient(90deg,#e0d0d0,#f0e4e4)` }} />

      <div style={{ height: 120, background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderBottom: `1px solid ${C.softBorder}`, cursor: hasImage ? "pointer" : "default" }}
        onClick={() => hasImage && onView(imageUrl, req.requirement_name)}>
        {hasImage ? (
          <img src={imageUrl} alt={req.requirement_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : req.is_submitted ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <i className="ti ti-file-check" style={{ fontSize: 34, color: C.green }} />
            <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>Document on file</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <i className={`ti ${icon}`} style={{ fontSize: 34, color: "#c8b0b0" }} />
            <span style={{ fontSize: 11, color: C.pale }}>No document yet</span>
          </div>
        )}
      </div>

      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>{req.requirement_name}</div>
          <StatusBadge submitted={req.is_submitted} />
        </div>
        {req.description && <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>{req.description}</div>}
        {req.remarks && <div style={{ fontSize: 11, color: C.pale, fontStyle: "italic", marginTop: 2 }}>"{req.remarks}"</div>}
        {req.submitted_at && (
          <div style={{ fontSize: 10.5, color: C.pale, marginTop: 2 }}>
            <i className="ti ti-calendar" style={{ fontSize: 11 }} />{" "}
            {new Date(req.submitted_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })}
          </div>
        )}
      </div>

      <div style={{ padding: "0 16px 14px", display: "flex", gap: 8 }}>
        {req.is_submitted ? (
          <>
            {hasImage && (
              <button onClick={() => onView(imageUrl, req.requirement_name)} style={s.outlineBtn}>
                <i className="ti ti-eye" style={{ fontSize: 13 }} />View
              </button>
            )}
            <button onClick={() => onUpload(req)} style={{ ...s.outlineBtn, flex: 1 }}>
              <i className="ti ti-replace" style={{ fontSize: 13 }} />Replace
            </button>
            <button onClick={() => onRemove(req)} title="Remove"
              style={{ width: 34, height: 34, border: "1px solid #fde2de", borderRadius: 8, background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.red, flexShrink: 0 }}>
              <i className="ti ti-trash" style={{ fontSize: 13 }} />
            </button>
          </>
        ) : (
          <button onClick={() => onUpload(req)} style={{ ...s.primaryBtn, flex: 1, height: 34, fontSize: 12 }}>
            <i className="ti ti-upload" style={{ fontSize: 13 }} />Upload Document
          </button>
        )}
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color, loading }) {
  return (
    <div style={s.statCard}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={s.statLabel}>{label}</span>
        <div style={s.statIcon}><i className={`ti ${icon}`} style={{ fontSize: 15, color: color || C.red }} /></div>
      </div>
      {loading ? <Sk h={28} w="50%" /> : <div style={{ ...s.statValue, color: color || C.text }}>{value}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function RequirementsPage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const isAdmin = canViewAuditTrail(currentUser);

  // Search state
  const [searchInput,   setSearchInput]   = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const searchRef = useRef(null);

  // Requirements state
  const [requirements, setRequirements] = useState([]);
  const [reqLoading,   setReqLoading]   = useState(false);
  const [reqError,     setReqError]     = useState("");

  // Modal state
  const [uploadModal, setUploadModal] = useState(null);
  const [viewModal,   setViewModal]   = useState(null);
  const [removeModal, setRemoveModal] = useState(null);

  // Auth guard
  useEffect(() => {
    if (!sessionStorage.getItem("access_token")) navigate("/");
  }, [navigate]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Live debounced student search
  useEffect(() => {
    if (!searchInput.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    setSearchLoading(true);
    setShowDropdown(true);
    const t = setTimeout(async () => {
      try {
        const data = await getStudents({ search: searchInput.trim() });
        setSearchResults(Array.isArray(data) ? data : data?.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Select a student → load requirements
  async function selectStudent(student) {
    setSelectedStudent(student);
    setShowDropdown(false);
    setSearchInput(`${student.first_name} ${student.last_name}`);
    setReqLoading(true);
    setReqError("");
    setRequirements([]);
    try {
      const data = await fetchRequirementSummary(student.student_id);
      setRequirements(data);
    } catch (e) {
      setReqError(e.message || "Failed to load requirements.");
    } finally {
      setReqLoading(false);
    }
  }

  const reloadRequirements = useCallback(async () => {
    if (!selectedStudent) return;
    setReqLoading(true);
    try {
      const data = await fetchRequirementSummary(selectedStudent.student_id);
      setRequirements(data);
    } catch (e) {
      setReqError(e.message);
    } finally {
      setReqLoading(false);
    }
  }, [selectedStudent]);

  // Remove — opens modal instead of window.confirm
  function handleRemove(req) {
    setRemoveModal(req);
  }

  async function confirmRemove() {
    if (!removeModal) return;
    try {
      await removeRequirement(removeModal.submission_id);
      setRemoveModal(null);
      reloadRequirements();
    } catch (e) {
      setRemoveModal(null);
      setReqError(e.message || "Failed to remove document.");
    }
  }

  const submitted = requirements.filter((r) => r.is_submitted).length;
  const pending   = requirements.length - submitted;

  return (
    <AppLayout>
      <style>{baseCss}</style>
          {/* Topbar */}
          <div style={s.topbar}>
            <div>
              <div style={s.topbarTitle}>Student Requirements</div>
              <div style={s.topbarSub}>Enrollment Documents / Submission Tracker</div>
            </div>
            {selectedStudent && (
              <button onClick={reloadRequirements} style={s.primaryBtn}>
                <i className="ti ti-refresh" style={{ fontSize: 14 }} />Refresh
              </button>
            )}
          </div>

          <div style={s.content}>

            {/* ── Student search ── */}
            <section style={{ ...s.panel, position: "relative", zIndex: 100 }}>
              <div style={{ padding: "18px 22px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12}}>
                  <i className="ti ti-search" style={{ fontSize: 15, color: C.red, marginRight: 8 }} />Search Student
                </div>

                {/* Search input — live debounced, no form submit needed */}
                <div style={{ position: "relative" }} ref={searchRef}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: "white", border: `1.5px solid #f0ceca`, borderRadius: 10, padding: "0 14px", height: 44 }}>
                    <i className="ti ti-search" style={{ fontSize: 14, color: "#c0a0a0", flexShrink: 0 }} />
                    <input
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                        if (!e.target.value) { setSelectedStudent(null); setRequirements([]); setShowDropdown(false); }
                      }}
                      placeholder="Type name, LRN, or student number…"
                      style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", color: C.text }}
                    />
                    {searchInput && (
                      <button
                        onClick={() => { setSearchInput(""); setSelectedStudent(null); setRequirements([]); setShowDropdown(false); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", display: "flex", alignItems: "center", padding: 2 }}>
                        <i className="ti ti-x" style={{ fontSize: 13 }} />
                      </button>
                    )}
                    {searchLoading && (
                      <i className="ti ti-loader-2" style={{ fontSize: 13, color: C.red, animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                    )}
                  </div>

                  {/* Dropdown */}
                  {showDropdown && (
                    <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "white", border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(224,49,49,0.14)", zIndex: 9999, maxHeight: 280, overflowY: "auto" }}>
                      {searchLoading && (
                        <div style={{ padding: "14px 16px", color: C.pale, fontSize: 13 }}>Searching…</div>
                      )}
                      {!searchLoading && searchResults.length === 0 && (
                        <div style={{ padding: "14px 16px", color: C.pale, fontSize: 13 }}>No students found.</div>
                      )}
                      {!searchLoading && searchResults.map((st) => (
                        <div key={st.student_id}
                          className="dropdown-item"
                          onClick={() => selectStudent(st)}
                          style={{ padding: "11px 16px", cursor: "pointer", borderBottom: `1px solid ${C.softBorder}`, display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#fde8e8,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.red, flexShrink: 0 }}>
                            {st.first_name?.[0]}{st.last_name?.[0]}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                              {st.first_name} {st.middle_name ? st.middle_name + " " : ""}{st.last_name}
                            </div>
                            <div style={{ fontSize: 11, color: C.pale }}>LRN: {st.lrn} · {st.student_number}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── Selected student stats ── */}
            {selectedStudent && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                <div style={{ ...s.statCard, flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: `linear-gradient(135deg,${C.redLight},${C.redBorder})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: C.red, flexShrink: 0 }}>
                    {selectedStudent.first_name?.[0]}{selectedStudent.last_name?.[0]}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedStudent.first_name} {selectedStudent.last_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.pale }}>LRN: {selectedStudent.lrn}</div>
                    <div style={{ fontSize: 11, color: C.pale }}>{selectedStudent.student_number}</div>
                  </div>
                </div>
                <StatCard label="Total Requirements" value={requirements.length} icon="ti-list"          loading={reqLoading} />
                <StatCard label="Submitted"          value={submitted}           icon="ti-circle-check" color={C.green} loading={reqLoading} />
                <StatCard label="Pending"            value={pending}             icon="ti-clock"        loading={reqLoading} />
              </div>
            )}

            {/* ── Requirements grid ── */}
            {selectedStudent && (
              <section style={s.panel}>
                <div style={s.panelHeader}>
                  <div>
                    <div style={s.panelTitle}>Requirement Documents</div>
                    <div style={{ fontSize: 11.5, color: C.pale, marginTop: 2 }}>
                      {submitted} of {requirements.length} submitted
                    </div>
                  </div>
                  {requirements.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ height: 8, width: 120, borderRadius: 99, background: "#f0e4e4", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${requirements.length ? (submitted / requirements.length) * 100 : 0}%`, background: `linear-gradient(90deg,${C.green},#43a047)`, borderRadius: 99, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>
                        {requirements.length ? Math.round((submitted / requirements.length) * 100) : 0}%
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ padding: "18px 20px" }}>
                  {reqError && (
                    <div style={s.errorBanner}>
                      <i className="ti ti-alert-circle" style={{ fontSize: 15 }} />{reqError}
                      <button onClick={() => setReqError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#b91c1c" }}>
                        <i className="ti ti-x" style={{ fontSize: 13 }} />
                      </button>
                    </div>
                  )}

                  {reqLoading ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} style={{ background: "white", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
                          <div style={{ height: 120, background: "#fafafa" }} />
                          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                            <Sk h={14} w="70%" /><Sk h={10} w="50%" /><Sk h={30} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : requirements.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
                      {requirements.map((req) => (
                        <RequirementCard
                          key={req.requirement_type_id}
                          req={req}
                          onUpload={setUploadModal}
                          onView={(url, name) => setViewModal({ imageUrl: url, name })}
                          onRemove={handleRemove}
                        />
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: "40px 0", textAlign: "center", color: C.pale }}>
                      <i className="ti ti-file-search" style={{ fontSize: 36, display: "block", marginBottom: 12 }} />
                      No requirement types configured.
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Empty state ── */}
            {!selectedStudent && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0" }}>
                <div style={{ textAlign: "center", color: C.pale }}>
                  <div style={{ width: 72, height: 72, borderRadius: 20, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                    <i className="ti ti-users-group" style={{ fontSize: 32, color: "#e8a0a0" }} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.muted}}>No student selected</div>
                  <div style={{ fontSize: 13, color: C.pale, marginTop: 6, maxWidth: 300, lineHeight: 1.7 }}>
                    Search for a student above to view and manage their requirement documents.
                  </div>
                </div>
              </div>
            )}
          </div>
      {/* ── Modals ── */}
      {uploadModal && (
        <UploadModal
          requirement={uploadModal}
          studentId={selectedStudent?.student_id}
          onClose={() => setUploadModal(null)}
          onSuccess={() => { setUploadModal(null); reloadRequirements(); }}
        />
      )}

      {viewModal && (
        <ViewModal imageUrl={viewModal.imageUrl} name={viewModal.name} onClose={() => setViewModal(null)} />
      )}

      {removeModal && (
        <RemoveModal
          req={removeModal}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveModal(null)}
        />
      )}
    </AppLayout>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const baseCss = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'DM Sans',sans-serif; }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
  .nav-item { transition:background 0.12s,color 0.12s; }
  .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
  .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }
  .req-card:hover { box-shadow:0 4px 20px rgba(224,49,49,0.10) !important; transform:translateY(-1px); }
  .dropdown-item:hover { background:#fff8f6; }
  .dropdown-item:last-child { border-bottom:none !important; }
`;

const s = {
  shell:       { display: "flex", height: "100vh", background: C.bg, fontFamily: "'DM Sans',sans-serif", overflow: "hidden" },
  sidebar:     { width: 224, flexShrink: 0, background: C.white, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", boxShadow: "2px 0 12px rgba(224,49,49,0.04)" },
  brandWrap:   { padding: "22px 18px 18px", borderBottom: `1px solid ${C.border}` },
  nav:         { flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" },
  navSection:  { fontSize: 9.5, color: "#cdb0b0", letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 10px 4px", fontWeight: 600 },
  navItem:     { display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, fontSize: 13, cursor: "pointer" },
  userBox:     { display: "flex", alignItems: "center", gap: 10, padding: "10px", borderRadius: 10, background: "#fff8f6" },
  avatar:      { width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#fde8e8,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.red, flexShrink: 0 },
  userName:    { fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  userRole:    { fontSize: 11, color: C.pale, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  logoutBtn:   { width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: C.white, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090", transition: "all 0.12s" },
  main:        { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar:      { background: C.white, borderBottom: `1px solid ${C.border}`, padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" },
  topbarTitle: { fontSize: 16, fontWeight: 700, color: C.text},
  topbarSub:   { fontSize: 11.5, color: C.pale, marginTop: 1 },
  content:     { flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 },
  panel:       { background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "visible", boxShadow: "0 2px 16px rgba(224,49,49,0.06)" },
  panelHeader: { padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" },
  panelTitle:  { fontSize: 14, fontWeight: 700, color: C.text},
  statCard:    { background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 2px 12px rgba(224,49,49,0.06)" },
  statLabel:   { fontSize: 11, color: "#a07878", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" },
  statIcon:    { width: 30, height: 30, borderRadius: 8, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center" },
  statValue:   { fontSize: 26, fontWeight: 700, lineHeight: 1 },
  primaryBtn:  { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(135deg,#e03131,#c92a2a)`, color: C.white, border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.24)" },
  outlineBtn:  { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  secondaryBtn:{ flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10, background: C.white, fontSize: 13, color: C.muted, cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" },
  dangerBtn:   { flex: 1, height: 42, border: "none", borderRadius: 10, background: `linear-gradient(135deg,#e03131,#c92a2a)`, fontSize: 13, color: C.white, cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans',sans-serif" },
  errorBanner: { background: "#fef2f2", border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8, marginBottom: 16 },
};
