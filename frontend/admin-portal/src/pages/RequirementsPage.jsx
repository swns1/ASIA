import { usePageTitle } from "../hooks/usePageTitle";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import AppLayout from "../components/AppLayout";
import ConfirmModal from "../components/ConfirmModal";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getStudents } from "../api/studentApi";
import {
  fetchRequirementSummary,
  removeRequirement,
  replaceRequirement,
  resolveMediaUrl,
  uploadRequirement,
} from "../api/requirementApi";



// ── Debug flag — set to false to hide dev-only UI ─────────────────────────────
const DEV_MODE = true;

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  red: "#e03131", redDark: "#c92a2a", redLight: "#fff0f0", redBorder: "#fca5a5",
  green: "#2e7d32", greenLight: "#e8f5e0", greenBorder: "#a5d6a7",
  border: "#f5eaea", softBorder: "#f9f0f0",
  text: "#1a0a0a", muted: "#7a5050", pale: "#b09090",
  bg: "#fdf8f6", white: "#ffffff",
};

// ── Avatar palette ────────────────────────────────────────────────────────────
const AVATAR_PALETTES = [
  { bg: "#fde8e8", color: "#c0392b" },
  { bg: "#e8f0fd", color: "#2563eb" },
  { bg: "#e8fdf0", color: "#16a34a" },
  { bg: "#fdf5e8", color: "#d97706" },
  { bg: "#f0e8fd", color: "#7c3aed" },
  { bg: "#fde8f8", color: "#be185d" },
  { bg: "#e8fdfd", color: "#0891b2" },
];
function getAvatarPalette(name = "X") {
  return AVATAR_PALETTES[name.charCodeAt(0) % AVATAR_PALETTES.length];
}

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

// ── Filter constants ──────────────────────────────────────────────────────────
const SCHOOL_LEVELS = [
  { value: "",                  label: "All Levels",   icon: "ti-layout-grid",   bg: "#fff0f0", color: "#e03131" },
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", bg: "#fdf5e8", color: "#c27a12" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          bg: "#f0e8fd", color: "#7c3aed" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          bg: "#e8f0fd", color: "#2563eb" },
  { value: "junior_highschool", label: "Junior High",  icon: "ti-school",        bg: "#e8fdf0", color: "#16a34a" },
  { value: "senior_highschool", label: "Senior High",  icon: "ti-certificate",   bg: "#fde8f8", color: "#be185d" },
];

const GRADE_LEVELS_BY_LEVEL = {
  "":                ["All Grades"],
  nursery:           ["All Grades", "Nursery"],
  kindergarten:      ["All Grades", "Kindergarten"],
  elementary:        ["All Grades", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  junior_highschool: ["All Grades", "Grade 7", "Grade 8", "Grade 9", "Grade 10"],
  senior_highschool: ["All Grades", "Grade 11", "Grade 12"],
};

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
function RemoveModal({ req, onConfirm, onCancel, removing }) {
  return (
    <ConfirmModal
      icon="ti-trash"
      title="Remove document?"
      message={<>You're about to remove <strong style={{ color: C.text }}>{req?.requirement_name}</strong>. This cannot be undone.</>}
      confirmLabel="Yes, remove"
      loading={removing}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
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
      toast.success(isReplace ? "Document replaced." : "Document uploaded.");
      onSuccess();
    } catch (e) {
      const msg = e.message || "Upload failed.";
      setError(msg);
      toast.error(msg);
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
  usePageTitle("Requirements");
  const navigate = useNavigate();

  // Filter state
  const [levelFilter, setLevelFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const gradeOptions = GRADE_LEVELS_BY_LEVEL[levelFilter] ?? ["All Grades"];

  // Reset grade when level changes
  useEffect(() => { setGradeFilter(""); }, [levelFilter]);

  const hasFilters = levelFilter || gradeFilter;

  // Search state
  const [searchInput,   setSearchInput]   = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const searchRef = useRef(null);
  const suppressSearch = useRef(false);

  // Recent students
  const [recentStudents,        setRecentStudents]        = useState([]);
  const [recentStudentsLoading, setRecentStudentsLoading] = useState(false);
  const [recentPage,            setRecentPage]            = useState(1);
  const [recentPageMeta,        setRecentPageMeta]        = useState({ count: 0, next: null, previous: null });
  const RECENT_PAGE_SIZE = 10;

  // Requirements state
  const [requirements, setRequirements] = useState([]);
  const [reqLoading,   setReqLoading]   = useState(false);
  const [reqError,     setReqError]     = useState("");

  // Modal state
  const [uploadModal, setUploadModal] = useState(null);
  const [viewModal,   setViewModal]   = useState(null);
  const [removeModal, setRemoveModal] = useState(null);
  const [removing,    setRemoving]    = useState(false);

  // Auth guard
  useEffect(() => {
    if (!sessionStorage.getItem("access_token")) navigate("/");
  }, [navigate]);

  // Load recent students — re-fetches when filters or page change
  const fetchRecentStudents = useCallback((page = 1) => {
    setRecentStudentsLoading(true);
    getStudents({
      ordering: "-student_id",
      page,
      page_size: RECENT_PAGE_SIZE,
      school_level: levelFilter,
      grade_level: gradeFilter,
    })
      .then((data) => {
        setRecentStudents(data?.results ?? []);
        setRecentPageMeta({ count: data?.count ?? 0, next: data?.next, previous: data?.previous });
        setRecentPage(page);
      })
      .catch(() => {})
      .finally(() => setRecentStudentsLoading(false));
  }, [levelFilter, gradeFilter]);

  useEffect(() => { fetchRecentStudents(1); }, [levelFilter, gradeFilter]);

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
    if (suppressSearch.current) { suppressSearch.current = false; return; }
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
    suppressSearch.current = true;
    setSelectedStudent(student);
    setShowDropdown(false);
    setSearchResults([]);
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
    setRemoving(true);
    try {
      await removeRequirement(removeModal.submission_id);
      toast.success("Document removed.");
      reloadRequirements();
    } catch (e) {
      const msg = e.message || "Failed to remove document.";
      setReqError(msg);
      toast.error(msg);
    } finally {
      setRemoving(false);
      setRemoveModal(null);
    }
  }

  const [completing, setCompleting] = useState(false);

  async function handleCompleteAll() {
    const pending = requirements.filter((r) => !r.is_submitted);
    if (!pending.length) return;
    setCompleting(true);
    const placeholder = new File(["debug"], "debug_placeholder.txt", { type: "text/plain" });
    try {
      await Promise.all(
        pending.map((req) =>
          uploadRequirement({
            studentId: selectedStudent.student_id,
            requirementTypeId: req.requirement_type_id,
            file: placeholder,
            remarks: "debug auto-complete",
          })
        )
      );
      await reloadRequirements();
    } catch (e) {
      setReqError(e.message || "Failed to complete all requirements.");
    } finally {
      setCompleting(false);
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

            {/* ── Filter + Search panel ── */}
            <motion.div
              style={{
                background: "white", border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "18px 20px",
                boxShadow: "0 2px 12px rgba(224,49,49,0.05)",
                display: "flex", flexDirection: "column", gap: 0,
                position: "relative", zIndex: 100,
              }}
            >
              {/* Search row */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1, position: "relative" }} ref={searchRef}>
                  <div
                    className="search-wrap"
                    style={{ display: "flex", alignItems: "center", gap: 10, background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, padding: "0 16px", height: 42, transition: "border .15s, box-shadow .15s" }}
                  >
                    <i className="ti ti-search" style={{ fontSize: 15, color: "#c0a0a0", flexShrink: 0 }} />
                    <input
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                        if (!e.target.value) { setSelectedStudent(null); setRequirements([]); setShowDropdown(false); }
                      }}
                      placeholder="Search student name, LRN, or student number…"
                      style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", color: C.text }}
                    />
                    {searchInput && (
                      <button
                        onClick={() => { setSearchInput(""); setSelectedStudent(null); setRequirements([]); setShowDropdown(false); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", display: "flex", alignItems: "center", padding: 2, borderRadius: 4 }}
                      >
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
                      {!searchLoading && searchResults.map((st) => {
                        const ap = getAvatarPalette(st.last_name ?? "X");
                        return (
                        <div key={st.student_id}
                          className="dropdown-item"
                          onClick={() => selectStudent(st)}
                          style={{ padding: "11px 16px", cursor: "pointer", borderBottom: `1px solid ${C.softBorder}`, display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: ap.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: ap.color, flexShrink: 0 }}>
                            {st.first_name?.[0]}{st.last_name?.[0]}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                              {st.first_name} {st.middle_name ? st.middle_name + " " : ""}{st.last_name}
                            </div>
                            <div style={{ fontSize: 11, color: C.pale }}>LRN: {st.lrn} · {st.student_number}</div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  style={{ height: 42, padding: "0 20px", background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, fontSize: 13, fontWeight: 600, color: "#7a5050", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.14s", flexShrink: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#e03131"; e.currentTarget.style.color = "#e03131"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#f0e4e4"; e.currentTarget.style.color = "#7a5050"; }}
                  onClick={() => { if (searchInput.trim()) setShowDropdown(true); }}
                >
                  Search
                </button>
                <AnimatePresence>
                  {hasFilters && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.88 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.88 }}
                      transition={{ duration: 0.14 }}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => { setLevelFilter(""); setGradeFilter(""); }}
                      style={{ height: 42, padding: "0 14px", background: "white", border: "1.5px solid #fca5a5", borderRadius: 12, fontSize: 12, fontWeight: 600, color: "#b91c1c", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
                    >
                      <i className="ti ti-filter-off" style={{ fontSize: 13 }} />Clear
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "#f5eaea", margin: "14px 0" }} />

              {/* Chip rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* School Level chips */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>School Level</div>
                  <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {SCHOOL_LEVELS.map((lvl) => {
                      const active = levelFilter === lvl.value;
                      return (
                        <motion.button
                          key={lvl.value}
                          layout
                          initial={false}
                          animate={{
                            backgroundColor: active ? lvl.bg    : "#ffffff",
                            color:           active ? lvl.color : "#9a7070",
                            borderColor:     active ? lvl.color : "#f0e4e4",
                          }}
                          transition={{ layout: { type: "spring", stiffness: 400, damping: 36 }, duration: 0.18, ease: "easeOut" }}
                          onClick={() => setLevelFilter(lvl.value)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                        >
                          <i className={`ti ${lvl.icon}`} style={{ fontSize: 12 }} />
                          {lvl.label}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </div>

                {/* Grade Level chips — CSS max-height cascade */}
                <div style={{
                  maxHeight: levelFilter !== "" ? 200 : 0,
                  overflow: "hidden",
                  opacity: levelFilter !== "" ? 1 : 0,
                  marginTop: levelFilter !== "" ? 0 : -12,
                  transition: "max-height 0.22s ease, opacity 0.18s ease, margin-top 0.22s ease",
                  pointerEvents: levelFilter !== "" ? "auto" : "none",
                }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Grade Level</div>
                    <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {gradeOptions.map((g, idx) => {
                        const val = g === "All Grades" ? "" : g;
                        const active = gradeFilter === val;
                        return (
                          <motion.button
                            key={`${levelFilter}-${g}`}
                            layout
                            initial={{ opacity: 0, y: 6, backgroundColor: "#ffffff", color: "#9a7070", borderColor: "#f0e4e4" }}
                            animate={{
                              opacity: 1, y: 0,
                              backgroundColor: active ? "#fff0f0" : "#ffffff",
                              color:           active ? "#e03131" : "#9a7070",
                              borderColor:     active ? "#e03131" : "#f0e4e4",
                            }}
                            transition={{
                              opacity:         { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                              y:               { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                              backgroundColor: { duration: 0.18, ease: "easeOut" },
                              color:           { duration: 0.18, ease: "easeOut" },
                              borderColor:     { duration: 0.18, ease: "easeOut" },
                              layout:          { type: "spring", stiffness: 400, damping: 36 },
                            }}
                            onClick={() => setGradeFilter(val)}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                          >
                            {g}
                          </motion.button>
                        );
                      })}
                    </motion.div>
                  </div>
                </div>

              </div>
            </motion.div>

            {/* ── Selected student stats ── */}
            {selectedStudent && (() => {
              const selAp = getAvatarPalette(selectedStudent.last_name ?? "X");
              return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                <div style={{ ...s.statCard, flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: selAp.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: selAp.color, flexShrink: 0 }}>
                    {selectedStudent.first_name?.[0]}{selectedStudent.last_name?.[0]}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedStudent.first_name} {selectedStudent.last_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.pale }}>LRN: {selectedStudent.lrn}</div>
                    <div style={{ fontSize: 11, color: C.pale }}>{selectedStudent.student_number}</div>
                    <button
                      onClick={() => navigate(`/students/${selectedStudent.student_id}`)}
                      style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 7, background: "white", color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                    >
                      <i className="ti ti-user" style={{ fontSize: 12 }} />View Profile
                    </button>
                  </div>
                </div>
                <StatCard label="Total Requirements" value={requirements.length} icon="ti-list"          loading={reqLoading} />
                <StatCard label="Submitted"          value={submitted}           icon="ti-circle-check" color={C.green} loading={reqLoading} />
                <StatCard label="Pending"            value={pending}             icon="ti-clock"        loading={reqLoading} />
              </div>
              );
            })()}

            {/* ── Document completeness bar ── */}
            {selectedStudent && !reqLoading && requirements.length > 0 && (
              <div style={{
                background: submitted === requirements.length ? "#f0fdf4" : "#fef9ec",
                border: `1px solid ${submitted === requirements.length ? "#bbf7d0" : "#fde68a"}`,
                borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: submitted === requirements.length ? "#15803d" : "#92400e" }}>
                      {submitted === requirements.length
                        ? "All documents submitted — student is ready to be activated to Enrolled."
                        : `${requirements.length - submitted} of ${requirements.length} document(s) still missing.`}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: submitted === requirements.length ? "#16a34a" : "#d97706" }}>
                      {submitted} / {requirements.length}
                    </span>
                  </div>
                  <div style={{ height: 8, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${requirements.length > 0 ? Math.round((submitted / requirements.length) * 100) : 0}%`,
                      background: submitted === requirements.length
                        ? "linear-gradient(to right,#16a34a,#22c55e)"
                        : "linear-gradient(to right,#d97706,#f59e0b)",
                      borderRadius: 99, transition: "width .4s ease",
                    }} />
                  </div>
                </div>
                {submitted < requirements.length && (
                  <div style={{ fontSize: 11, color: "#92400e", textAlign: "center", flexShrink: 0, maxWidth: 160, lineHeight: 1.5 }}>
                    <i className="ti ti-info-circle" style={{ fontSize: 13, display: "block", marginBottom: 2 }} />
                    Enrollment can be created as <strong>Pending</strong>. All docs required to activate.
                  </div>
                )}
              </div>
            )}

            {/* ── Requirements grid ── */}
            {selectedStudent && (
              <section style={{ ...s.panel, overflow: "hidden" }}>
                <div style={s.panelHeader}>
                  <div>
                    <div style={s.panelTitle}>Requirement Documents</div>
                    <div style={{ fontSize: 11.5, color: C.pale, marginTop: 2 }}>
                      {submitted} of {requirements.length} submitted
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                    {DEV_MODE && pending > 0 && (
                      <button
                        onClick={handleCompleteAll}
                        disabled={completing}
                        title="DEBUG: mark all pending requirements as submitted"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", border: "1.5px dashed #f59e0b", borderRadius: 8, background: "#fffbeb", color: "#92400e", fontSize: 11, fontWeight: 700, cursor: completing ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", opacity: completing ? 0.6 : 1 }}
                      >
                        {completing
                          ? <><i className="ti ti-loader-2" style={{ fontSize: 12, animation: "spin 0.8s linear infinite" }} />Completing…</>
                          : <><i className="ti ti-bug" style={{ fontSize: 12 }} />Complete All (dev)</>
                        }
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  {reqError && (
                    <div style={{ ...s.errorBanner, margin: "16px 20px 0" }}>
                      <i className="ti ti-alert-circle" style={{ fontSize: 15 }} />{reqError}
                      <button onClick={() => setReqError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#b91c1c" }}>
                        <i className="ti ti-x" style={{ fontSize: 13 }} />
                      </button>
                    </div>
                  )}

                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#fdfafa" }}>
                        {[
                          { label: "Requirement",    w: "32%" },
                          { label: "Status",         w: "14%" },
                          { label: "Date Submitted", w: "18%" },
                          { label: "Remarks",        w: "26%" },
                          { label: "",               w: "10%" },
                        ].map(({ label, w }) => (
                          <th key={label} style={{
                            textAlign: "left", fontSize: 10.5, fontWeight: 600,
                            color: "#c0a0a0", padding: "13px 18px",
                            borderBottom: `1px solid ${C.border}`,
                            textTransform: "uppercase", letterSpacing: "0.07em",
                            width: w,
                            background: "#fdfafa",
                          }}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reqLoading
                        ? Array.from({ length: 6 }).map((_, i) => (
                            <tr key={i}>
                              <td style={{ padding: "14px 18px", borderBottom: `1px solid #f9f0f0` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  <Sk w={32} h={32} r={8} />
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    <Sk w={160} h={13} /><Sk w={100} h={10} />
                                  </div>
                                </div>
                              </td>
                              {[70, 100, 140, 80].map((w, j) => (
                                <td key={j} style={{ padding: "14px 18px", borderBottom: `1px solid #f9f0f0` }}>
                                  <Sk w={w} h={13} />
                                </td>
                              ))}
                            </tr>
                          ))
                        : requirements.length === 0
                          ? (
                            <tr>
                              <td colSpan={5} style={{ textAlign: "center", padding: "56px 16px" }}>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                                  <div style={{ width: 52, height: 52, borderRadius: 14, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                                    <i className="ti ti-file-search" style={{ fontSize: 22, color: C.red }} />
                                  </div>
                                  <div style={{ fontSize: 14, color: "#7a5050", fontWeight: 600 }}>No requirement types configured</div>
                                  <div style={{ fontSize: 12, color: C.pale }}>Requirements are set up per school level and grade</div>
                                </div>
                              </td>
                            </tr>
                          )
                          : requirements.map((req) => {
                              const imageUrl = resolveMediaUrl(req.image_url);
                              const hasImage = req.is_submitted && imageUrl && isImageUrl(req.image_url);
                              const icon = reqIcon(req.requirement_code);
                              return (
                                <tr key={req.requirement_type_id} className="student-row">
                                  {/* Requirement name + icon */}
                                  <td style={{ padding: "13px 18px", borderBottom: `1px solid #f9f0f0`, verticalAlign: "middle" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                      <div style={{
                                        width: 34, height: 34, borderRadius: 9,
                                        background: req.is_submitted ? C.greenLight : C.redLight,
                                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                      }}>
                                        <i className={`ti ${req.is_submitted ? "ti-file-check" : icon}`} style={{ fontSize: 15, color: req.is_submitted ? C.green : C.red }} />
                                      </div>
                                      <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a", lineHeight: 1.3 }}>
                                          {req.requirement_name}
                                        </div>
                                        {req.description && (
                                          <div style={{ fontSize: 11, color: "#b09090", marginTop: 2 }}>{req.description}</div>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Status */}
                                  <td style={{ padding: "13px 18px", borderBottom: `1px solid #f9f0f0`, verticalAlign: "middle" }}>
                                    <StatusBadge submitted={req.is_submitted} />
                                  </td>

                                  {/* Date submitted */}
                                  <td style={{ padding: "13px 18px", borderBottom: `1px solid #f9f0f0`, verticalAlign: "middle" }}>
                                    {req.submitted_at
                                      ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <i className="ti ti-calendar" style={{ fontSize: 12, color: "#c0a0a0" }} />
                                          <span style={{ fontSize: 12, color: "#5a4a4a" }}>
                                            {new Date(req.submitted_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })}
                                          </span>
                                        </div>
                                      )
                                      : <span style={{ color: "#d0b8b8", fontStyle: "italic", fontSize: 12 }}>—</span>}
                                  </td>

                                  {/* Remarks */}
                                  <td style={{ padding: "13px 18px", borderBottom: `1px solid #f9f0f0`, verticalAlign: "middle" }}>
                                    {req.remarks
                                      ? <span style={{ fontSize: 12, color: "#7a5050", fontStyle: "italic" }}>"{req.remarks}"</span>
                                      : <span style={{ color: "#d0b8b8", fontStyle: "italic", fontSize: 12 }}>—</span>}
                                  </td>

                                  {/* Actions */}
                                  <td
                                    style={{ padding: "13px 14px", borderBottom: `1px solid #f9f0f0`, verticalAlign: "middle" }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                      {req.is_submitted ? (
                                        <>
                                          {hasImage && (
                                            <button
                                              className="row-action" title="View"
                                              onClick={() => setViewModal({ imageUrl, name: req.requirement_name })}
                                            >
                                              <i className="ti ti-eye" style={{ fontSize: 14 }} />
                                            </button>
                                          )}
                                          <button
                                            className="row-action" title="Replace"
                                            onClick={() => setUploadModal(req)}
                                          >
                                            <i className="ti ti-replace" style={{ fontSize: 14 }} />
                                          </button>
                                          <button
                                            className="row-action danger" title="Remove"
                                            style={{ color: "#c09090" }}
                                            onClick={() => handleRemove(req)}
                                          >
                                            <i className="ti ti-trash" style={{ fontSize: 14 }} />
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          className="row-action" title="Upload"
                                          onClick={() => setUploadModal(req)}
                                          style={{ color: C.red }}
                                        >
                                          <i className="ti ti-upload" style={{ fontSize: 14 }} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                      }
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ── Recently enrolled students ── */}
            {!selectedStudent && (
              <>
              <section style={s.panel}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#fdfafa" }}>

                      {[
                        { label: "Student",  w: "35%" },
                        { label: "LRN",      w: "20%" },
                        { label: "Grade",    w: "20%" },
                        { label: "Status",   w: "15%" },
                        { label: "",         w: "10%" },
                      ].map(({ label, w }, i, arr) => (
                        <th key={label} style={{
                          textAlign: "left", fontSize: 10.5, fontWeight: 600,
                          color: "#c0a0a0", padding: "13px 18px",
                          borderBottom: `1px solid ${C.border}`,
                          textTransform: "uppercase", letterSpacing: "0.07em",
                          width: w,
                          background: "#fdfafa",
                          borderRadius: i === 0 ? "16px 0 0 0" : i === arr.length - 1 ? "0 16px 0 0" : 0,
                        }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentStudentsLoading
                      ? Array.from({ length: RECENT_PAGE_SIZE }).map((_, i) => (
                          <tr key={i}>
                            <td style={{ padding: "14px 18px", borderBottom: "1px solid #f9f0f0" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <Sk w={36} h={36} r={99} />
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  <Sk w={130} h={13} /><Sk w={90} h={11} />
                                </div>
                              </div>
                            </td>
                            {[88, 100, 70, 40].map((w, j) => (
                              <td key={j} style={{ padding: "14px 18px", borderBottom: "1px solid #f9f0f0" }}>
                                <Sk w={w} h={13} />
                              </td>
                            ))}
                          </tr>
                        ))
                      : recentStudents.length === 0
                        ? (
                          <tr>
                            <td colSpan={5} style={{ textAlign: "center", padding: "56px 16px" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 52, height: 52, borderRadius: 14, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                                  <i className="ti ti-users" style={{ fontSize: 22, color: C.red }} />
                                </div>
                                <div style={{ fontSize: 14, color: "#7a5050", fontWeight: 600 }}>No students found</div>
                                <div style={{ fontSize: 12, color: C.pale }}>Try adjusting the level or grade filter above</div>
                              </div>
                            </td>
                          </tr>
                        )
                        : recentStudents.map((st, idx) => {
                            const isLast = idx === recentStudents.length - 1;
                            const tdStyle = (extra = {}) => ({ padding: "13px 18px", borderBottom: isLast ? "none" : "1px solid #f9f0f0", verticalAlign: "middle", ...extra });
                            const rap = getAvatarPalette(st.last_name ?? "X");
                            const initials = `${st.first_name?.[0] ?? ""}${st.last_name?.[0] ?? ""}`.toUpperCase();
                            const fullName = [st.last_name, ",", st.first_name, st.middle_name ? st.middle_name[0] + "." : "", st.suffix ?? ""].filter(Boolean).join(" ");
                            const statusMeta = {
                              active:      { bg: "#e8f5e0", color: "#2e6b0d", dot: "#4caf50", label: "Active" },
                              inactive:    { bg: "#f0ede8", color: "#5c5752", dot: "#9e9e9e", label: "Inactive" },
                              transferred: { bg: "#fef3e2", color: "#7a4a08", dot: "#ff9800", label: "Transferred" },
                              graduated:   { bg: "#e3f0fd", color: "#1455a0", dot: "#2196f3", label: "Graduated" },
                              dropped:     { bg: "#fde8e8", color: "#9b2020", dot: "#f44336", label: "Dropped" },
                            };
                            const pill = statusMeta[st.status] ?? statusMeta.inactive;
                            const gradeLabel = st.grade_level
                              ? st.grade_level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                              : st.school_level
                                ? st.school_level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                                : null;
                            return (
                              <tr
                                key={st.student_id}
                                className="student-row"
                                onClick={() => selectStudent(st)}
                              >
                                {/* Student */}
                                <td style={tdStyle()}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{
                                      width: 36, height: 36, borderRadius: "50%",
                                      background: rap.bg, flexShrink: 0,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      fontSize: 12, fontWeight: 700, color: rap.color,
                                    }}>
                                      {initials}
                                    </div>
                                    <div>
                                      <div className="row-name" style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a", lineHeight: 1.3, transition: "color 0.12s" }}>
                                        {fullName}
                                      </div>
                                      <div style={{ fontSize: 11, color: "#b09090", marginTop: 2 }}>
                                        {st.student_number
                                          ? st.student_number
                                          : <span style={{ fontStyle: "italic", color: "#d0b8b8" }}>no student number</span>}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* LRN */}
                                <td style={tdStyle()}>
                                  {st.lrn
                                    ? <span style={{ fontFamily: "monospace", fontSize: 12, color: "#5a4a4a", background: "#f9f4f4", padding: "3px 8px", borderRadius: 6 }}>{st.lrn}</span>
                                    : <span style={{ color: "#d0b8b8", fontStyle: "italic", fontSize: 12 }}>—</span>}
                                </td>

                                {/* Grade */}
                                <td style={tdStyle()}>
                                  {gradeLabel
                                    ? <span style={{ fontSize: 12, color: "#5a4a4a" }}>{gradeLabel}</span>
                                    : <span style={{ color: "#d0b8b8", fontStyle: "italic", fontSize: 12 }}>—</span>}
                                </td>

                                {/* Status */}
                                <td style={tdStyle()}>
                                  <span style={{
                                    display: "inline-flex", alignItems: "center", gap: 5,
                                    fontSize: 11.5, fontWeight: 600,
                                    padding: "4px 10px", borderRadius: 99,
                                    background: pill.bg, color: pill.color,
                                  }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: pill.dot, flexShrink: 0 }} />
                                    {pill.label}
                                  </span>
                                </td>

                                {/* Arrow */}
                                <td style={tdStyle({ padding: "13px 14px" })}>
                                  <i className="ti ti-chevron-right" style={{ fontSize: 14, color: "#c0a0a0" }} />
                                </td>
                              </tr>
                            );
                          })
                    }
                  </tbody>
                </table>

              </section>

              {/* Pagination */}
              {!recentStudentsLoading && recentPageMeta.count > RECENT_PAGE_SIZE && (() => {
                const totalPages = Math.ceil(recentPageMeta.count / RECENT_PAGE_SIZE);
                const windowSize = Math.min(totalPages, 5);
                const start = Math.min(Math.max(1, recentPage - 2), Math.max(1, totalPages - windowSize + 1));
                const pages = Array.from({ length: windowSize }, (_, i) => start + i);
                return (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#b09090" }}>
                      Page <strong style={{ color: "#7a5050" }}>{recentPage}</strong> of{" "}
                      <strong style={{ color: "#7a5050" }}>{totalPages}</strong>
                      &nbsp;·&nbsp;{recentPageMeta.count.toLocaleString()} total records
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        style={{ ...pgBtn, opacity: !recentPageMeta.previous ? 0.4 : 1, cursor: !recentPageMeta.previous ? "default" : "pointer" }}
                        disabled={!recentPageMeta.previous}
                        onClick={() => fetchRecentStudents(recentPage - 1)}
                      >
                        <i className="ti ti-chevron-left" style={{ fontSize: 13 }} />
                      </button>
                      {pages.map((p) => (
                        <button
                          key={p}
                          style={{ ...pgBtn, ...(p === recentPage ? pgBtnActive : {}) }}
                          onClick={() => fetchRecentStudents(p)}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        style={{ ...pgBtn, opacity: !recentPageMeta.next ? 0.4 : 1, cursor: !recentPageMeta.next ? "default" : "pointer" }}
                        disabled={!recentPageMeta.next}
                        onClick={() => fetchRecentStudents(recentPage + 1)}
                      >
                        <i className="ti ti-chevron-right" style={{ fontSize: 13 }} />
                      </button>
                    </div>
                  </div>
                );
              })()}
              </>
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
          removing={removing}
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
.dropdown-item:hover { background:#fff8f6; }
  .dropdown-item:last-child { border-bottom:none !important; }
  .search-wrap:focus-within { border-color:#e03131 !important; box-shadow:0 0 0 3px rgba(224,49,49,0.09) !important; }
  .student-row:last-child td { border-bottom:none !important; }
  tbody tr:last-child td { border-bottom:none !important; }
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
  secondaryBtn:{ flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10, background: C.white, fontSize: 13, color: C.muted, cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" },
  dangerBtn:   { flex: 1, height: 42, border: "none", borderRadius: 10, background: `linear-gradient(135deg,#e03131,#c92a2a)`, fontSize: 13, color: C.white, cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans',sans-serif" },
  errorBanner: { background: "#fef2f2", border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8, marginBottom: 16 },
};

const pgBtn = {
  width: 32, height: 32, border: "1px solid #f0e4e4", borderRadius: 8,
  background: "white", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", fontSize: 12, color: "#9a7070",
  fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s",
};

const pgBtnActive = {
  background: "#fff0f0", borderColor: "#e03131", color: "#e03131", fontWeight: 700,
};
