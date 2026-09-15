import { usePageTitle } from "../hooks/usePageTitle";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card, { StatCard, Panel } from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import Pagination from "../components/Pagination";
import Badge from "../components/ui/Badge";
import ChipGroup from "../components/ui/ChipGroup";
import FilterBar, { FilterRow, CollapsibleFilterRow } from "../components/ui/FilterBar";
import { getAvatarPalette } from "../utils/avatarPalette";
import { StatusBadge as StudentStatusBadge } from "../components/ui/Badge";
import { STUDENT_STATUS_MAP } from "../constants/statusMaps";
import { useNavigate } from "react-router-dom";
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
  text: "#1a0a0a", muted: "#7a5050", pale: "#8a6a6a",
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

const RECENT_COLUMNS = [
  { key: 'student', label: 'Student', width: '35%' },
  { key: 'lrn',     label: 'LRN',     width: '20%' },
  { key: 'grade',   label: 'Grade',   width: '20%' },
  { key: 'status',  label: 'Status',  width: '15%' },
  { key: 'arrow',   label: '',        width: '10%' },
];

const REQUIREMENT_COLUMNS = [
  { key: 'name',      label: 'Requirement',    width: '32%' },
  { key: 'status',    label: 'Status',         width: '14%' },
  { key: 'submitted', label: 'Date Submitted', width: '18%' },
  { key: 'remarks',   label: 'Remarks',        width: '26%' },
  { key: 'actions',   label: '',               width: '10%' },
];

function reqIcon(code) { return REQ_ICONS[code] || "ti-file"; }

// ── Filter constants ──────────────────────────────────────────────────────────
// `tone` names the shared ChipGroup palette entry; the categorical school-level
// tones are the same ones EnrollmentsPage uses, so a level reads the same colour
// on both pages.
const SCHOOL_LEVELS = [
  { value: "",                  label: "All Levels",   icon: "ti-layout-grid",   tone: "brand" },
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", tone: "nursery" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          tone: "kindergarten" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          tone: "elementary" },
  { value: "junior_highschool", label: "Junior High",  icon: "ti-school",        tone: "juniorhigh" },
  { value: "senior_highschool", label: "Senior High",  icon: "ti-certificate",   tone: "seniorhigh" },
];

const GRADE_LEVELS_BY_LEVEL = {
  "":                ["All Grades"],
  nursery:           ["All Grades", "Nursery"],
  kindergarten:      ["All Grades", "Kindergarten"],
  elementary:        ["All Grades", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  junior_highschool: ["All Grades", "Grade 7", "Grade 8", "Grade 9", "Grade 10"],
  senior_highschool: ["All Grades", "Grade 11", "Grade 12"],
};

// Document download URLs are now signed API links (…/file/?token=…), not
// plain media paths, so they no longer end in a file extension the way
// resolveMediaUrl()'s old targets did. `req.file_kind` (from the backend,
// derived server-side from the stored file's real extension) is the
// reliable signal; the extension regex on `req.image_url` only remains as
// a fallback for the brief window before both sides deploy together.
function isImageUrl(req) {
  if (!req) return false;
  if (req.file_kind) return req.file_kind === "image";
  return !!req.image_url && /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(req.image_url);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function StatusBadge({ submitted }) {
  return submitted ? (
    <Badge variant="success" icon="ti-circle-check" size="sm">Submitted</Badge>
  ) : (
    <Badge variant="muted" icon="ti-clock" size="sm">Pending</Badge>
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
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={uploading}
      icon={isReplace ? "ti-replace" : "ti-upload"}
      title={`${isReplace ? "Replace" : "Upload"} Document`}
      description={requirement?.requirement_name}
      // A chosen file and typed remarks shouldn't be lost to a stray click.
      closeOnBackdrop={false}
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            icon="ti-upload"
            fullWidth
            loading={uploading}
            disabled={!file && !isReplace}
            onClick={handleSubmit}
          >
            {uploading ? "Uploading…" : isReplace ? "Replace Document" : "Upload Document"}
          </Button>
        </div>
      }
    >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                <i className="ti ti-cloud-upload" style={{ fontSize: 32, color: "#8a6a6a" }} />
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

    </Modal>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
// Deliberately not the shared Modal: a lightbox has no dialog card, and Modal's
// white panel and 960px cap would both fight a full-bleed document view. It
// still needs the dialog semantics and Escape handling Modal would have given.
function ViewModal({ imageUrl, name, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      style={{ position: "fixed", inset: 0, background: "rgba(10,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 24 }}
      onClick={onClose}
    >
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

  const submitted = requirements.filter((r) => r.is_submitted).length;
  const pending   = requirements.length - submitted;

  return (
    <>
          <PageHeader
            title="Student Requirements"
            icon="ti-file-check"
            subtitle="Enrollment documents and submission tracker"
            actions={
              selectedStudent && (
                <Button variant="secondary" icon="ti-refresh" onClick={reloadRequirements}>
                  Refresh
                </Button>
              )
            }
          />

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-6">

            {/* ── Filter + Search panel ── */}
            {/* The search is a student autocomplete with an overlaying result
                list, not FilterBar's plain text search, so it rides in
                `extraControls`; the chip rows below are ordinary children. */}
            <FilterBar
              hasFilters={Boolean(hasFilters)}
              onClearFilters={() => { setLevelFilter(""); setGradeFilter(""); }}
              className="relative z-[100]"
              onSearch={() => { if (searchInput.trim()) setShowDropdown(true); }}
              extraControls={
                <div className="relative flex-1" ref={searchRef}>
                  <div className="filterbar-search flex h-[42px] items-center gap-2.5 rounded-lg border-[1.5px] border-neutral-300 bg-white px-4 transition-[border-color,box-shadow] duration-150">
                    <i className="ti ti-search shrink-0 text-[15px] text-neutral-500" aria-hidden="true" />
                    <label htmlFor="requirements-search" className="sr-only">Search students</label>
                    <input
                      id="requirements-search"
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                        if (!e.target.value) { setSelectedStudent(null); setRequirements([]); setShowDropdown(false); }
                      }}
                      placeholder="Search student name, LRN, or student number…"
                      className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-500"
                    />
                    {searchInput && (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => { setSearchInput(""); setSelectedStudent(null); setRequirements([]); setShowDropdown(false); }}
                        className="focus-ring flex shrink-0 items-center rounded-sm p-0.5 text-neutral-500 hover:text-brand-600"
                      >
                        <i className="ti ti-x text-[13px]" aria-hidden="true" />
                      </button>
                    )}
                    {searchLoading && (
                      <i className="ti ti-loader-2 shrink-0 animate-spin text-[13px] text-brand-500" aria-hidden="true" />
                    )}
                  </div>

                  {showDropdown && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[9999] max-h-[280px] overflow-y-auto rounded-xl border-[1.5px] border-neutral-200 bg-white shadow-[0_12px_40px_rgba(224,49,49,0.14)]">
                      {searchLoading && (
                        <div className="px-4 py-3.5 text-[13px] text-neutral-500">Searching…</div>
                      )}
                      {!searchLoading && searchResults.length === 0 && (
                        <div className="px-4 py-3.5 text-[13px] text-neutral-500">No students found.</div>
                      )}
                      {!searchLoading && searchResults.map((st) => {
                        const ap = getAvatarPalette(st.last_name ?? "X");
                        return (
                          <div
                            key={st.student_id}
                            onClick={() => selectStudent(st)}
                            className="flex cursor-pointer items-center gap-3 border-b border-neutral-200/70 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-brand-50"
                          >
                            <div
                              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-xs font-bold"
                              style={{ background: ap.bg, color: ap.color }}
                              aria-hidden="true"
                            >
                              {st.first_name?.[0]}{st.last_name?.[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-bold text-neutral-900">
                                {st.first_name} {st.middle_name ? st.middle_name + " " : ""}{st.last_name}
                              </div>
                              <div className="text-xs text-neutral-500">LRN: {st.lrn} · {st.student_number}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              }
            >
              <FilterRow label="School Level">
                <ChipGroup
                  options={SCHOOL_LEVELS.map((l) => ({
                    value: l.value, label: l.label, icon: l.icon, tone: l.tone,
                  }))}
                  value={levelFilter}
                  onChange={setLevelFilter}
                  label="Filter by school level"
                />
              </FilterRow>

              <CollapsibleFilterRow open={levelFilter !== ""} label="Grade Level">
                <ChipGroup
                  options={gradeOptions.map((g) => ({
                    value: g === "All Grades" ? "" : g, label: g,
                  }))}
                  value={gradeFilter}
                  onChange={setGradeFilter}
                  label="Filter by grade level"
                  stagger
                  generation={levelFilter}
                />
              </CollapsibleFilterRow>
            </FilterBar>

            {/* ── Selected student stats ── */}
            {selectedStudent && (() => {
              const selAp = getAvatarPalette(selectedStudent.last_name ?? "X");
              return (
              <div className="grid grid-cols-4 gap-3">
                <div className="flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
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
                <StatCard label="Total Requirements" value={requirements.length} icon="ti-list" iconTone="brand" loading={reqLoading} />
                <StatCard label="Submitted" value={submitted} icon="ti-circle-check" iconTone="success" loading={reqLoading} />
                <StatCard label="Pending" value={pending} icon="ti-clock" iconTone="warning" loading={reqLoading} />
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
              <Panel
                padding="none"
                className="overflow-hidden"
                title="Requirement Documents"
                subtitle={`${submitted} of ${requirements.length} submitted`}
                action={requirements.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-[120px] overflow-hidden rounded-full bg-neutral-200">
                      <div
                        className="h-full rounded-full bg-success-500 transition-[width] duration-300"
                        style={{ width: `${requirements.length ? (submitted / requirements.length) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-success-600">
                      {requirements.length ? Math.round((submitted / requirements.length) * 100) : 0}%
                    </span>
                  </div>
                )}
              >
                <div>
                  {reqError && (
                    <div className="px-5 pt-4">
                      <Alert variant="error" icon="ti-alert-circle" dismissible onDismiss={() => setReqError("")}>
                        {reqError}
                      </Alert>
                    </div>
                  )}

                  <Table
                    columns={REQUIREMENT_COLUMNS}
                    loading={reqLoading}
                    isEmpty={requirements.length === 0}
                    skeletonRows={6}
                    empty={{
                      icon: "ti-file-search",
                      title: "No requirements found",
                      subtitle: "This student has no requirement records yet.",
                    }}
                  >
                    {requirements.map((req) => {
                      const imageUrl = resolveMediaUrl(req.image_url);
                      const hasImage = req.is_submitted && imageUrl && isImageUrl(req);
                      const icon = reqIcon(req.requirement_code);
                      return (
                        <TableRow key={req.requirement_type_id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] ${req.is_submitted ? "bg-success-50" : "bg-brand-100"}`}>
                                <i
                                  className={`ti ${req.is_submitted ? "ti-file-check" : icon} text-[15px] ${req.is_submitted ? "text-success-600" : "text-brand-600"}`}
                                  aria-hidden="true"
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="text-[13px] font-semibold leading-tight text-neutral-900">
                                  {req.requirement_name}
                                </div>
                                {req.description && (
                                  <div className="mt-0.5 text-xs text-neutral-500">{req.description}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <StatusBadge submitted={req.is_submitted} />
                          </TableCell>

                          <TableCell>
                            {req.submitted_at ? (
                              <div className="flex items-center gap-1.5">
                                <i className="ti ti-calendar text-xs text-neutral-500" aria-hidden="true" />
                                <span className="text-xs text-neutral-700">
                                  {new Date(req.submitted_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs italic text-neutral-500">—</span>
                            )}
                          </TableCell>

                          <TableCell>
                            {req.remarks
                              ? <span className="text-xs italic text-neutral-700">&ldquo;{req.remarks}&rdquo;</span>
                              : <span className="text-xs italic text-neutral-500">—</span>}
                          </TableCell>

                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              {req.is_submitted ? (
                                <>
                                  {hasImage && (
                                    <Button
                                      variant="ghost" size="sm" icon="ti-eye"
                                      aria-label={`View ${req.requirement_name}`}
                                      onClick={() => setViewModal({ imageUrl, name: req.requirement_name })}
                                    />
                                  )}
                                  <Button
                                    variant="ghost" size="sm" icon="ti-replace"
                                    aria-label={`Replace ${req.requirement_name}`}
                                    onClick={() => setUploadModal(req)}
                                  />
                                  <Button
                                    variant="ghost" size="sm" icon="ti-trash"
                                    aria-label={`Remove ${req.requirement_name}`}
                                    onClick={() => handleRemove(req)}
                                  />
                                </>
                              ) : (
                                <Button
                                  variant="ghost" size="sm" icon="ti-upload"
                                  aria-label={`Upload ${req.requirement_name}`}
                                  onClick={() => setUploadModal(req)}
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </Table>
                </div>
              </Panel>
            )}

            {/* ── Recently enrolled students ── */}
            {!selectedStudent && (
              <>
              <Card padding="none" className="overflow-hidden">
                <Table
                  columns={RECENT_COLUMNS}
                  loading={recentStudentsLoading}
                  isEmpty={recentStudents.length === 0}
                  skeletonRows={RECENT_PAGE_SIZE}
                  empty={{
                    icon: "ti-users-off",
                    title: "No students found",
                    subtitle: hasFilters
                      ? "Try a different school level or grade."
                      : "No recently enrolled students to show.",
                  }}
                >
                  {recentStudents.map((st) => {
                    const rap = getAvatarPalette(st.last_name ?? "X");
                    const initials = `${st.first_name?.[0] ?? ""}${st.last_name?.[0] ?? ""}`.toUpperCase();
                    const fullName = [st.last_name, ",", st.first_name, st.middle_name ? st.middle_name[0] + "." : "", st.suffix ?? ""].filter(Boolean).join(" ");
                    const gradeLabel = st.grade_level
                      ? st.grade_level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                      : st.school_level
                        ? st.school_level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                        : null;
                    return (
                      <TableRow key={st.student_id} onClick={() => selectStudent(st)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                              style={{ background: rap.bg, color: rap.color }}
                              aria-hidden="true"
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold leading-tight text-neutral-900 transition-colors group-hover:text-brand-600">
                                {fullName}
                              </div>
                              <div className="mt-0.5 text-xs text-neutral-500">
                                {st.student_number || <span className="italic">no student number</span>}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          {st.lrn
                            ? <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-700">{st.lrn}</span>
                            : <span className="text-xs italic text-neutral-500">—</span>}
                        </TableCell>

                        <TableCell>
                          {gradeLabel
                            ? <span className="text-xs text-neutral-700">{gradeLabel}</span>
                            : <span className="text-xs italic text-neutral-500">—</span>}
                        </TableCell>

                        <TableCell>
                          <StudentStatusBadge status={st.status} map={STUDENT_STATUS_MAP} size="sm" />
                        </TableCell>

                        <TableCell>
                          <i className="ti ti-chevron-right text-sm text-neutral-500" aria-hidden="true" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Table>
              </Card>

              {!recentStudentsLoading && recentPageMeta.count > RECENT_PAGE_SIZE && (
                <Pagination
                  page={recentPage}
                  totalPages={Math.ceil(recentPageMeta.count / RECENT_PAGE_SIZE)}
                  count={recentPageMeta.count}
                  hasPrevious={Boolean(recentPageMeta.previous)}
                  hasNext={Boolean(recentPageMeta.next)}
                  onPageChange={(p) => fetchRecentStudents(p)}
                />
              )}
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
    </>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
// Page-specific rules only. The keyframes, the `*`/body resets, the scrollbar
// styling and `.search-wrap:focus-within` all live in index.css now, and the
// `.nav-item`/`.nav-active` overrides were dead weight — the sidebar no longer
// uses those class names, so the rules matched nothing.


