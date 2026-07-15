import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import AppLayout from "../components/AppLayout";
import ConfirmModal from "../components/ConfirmModal";
import { useNavigate } from "react-router-dom";
import { modalVariants, springTransition } from "../utils/motion";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF } from "../utils/auth";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getSubjects as _getSubjects,
  createSubject as _createSubject,
  updateSubject as _updateSubject,
  deleteSubject as _deleteSubject,
  getGradingTemplates as _getTemplates,
} from "../api/enrollmentApi";

const getSubjects   = (p = {}) => _getSubjects(p);
const createSubject = (p)      => _createSubject(p);
const updateSubject = (id, p)  => _updateSubject(id, p);
const deleteSubject = (id)     => _deleteSubject(id).catch(() => null);
const getTemplates  = ()       => _getTemplates({ is_active: true });

// ── Constants ─────────────────────────────────────────────────────────────────
const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", color: "#be185d", bg: "#fde8f8" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          color: "#d97706", bg: "#fdf5e8" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          color: "#2e6b0d", bg: "#e8f5e0" },
  { value: "junior_highschool", label: "Junior HS",    icon: "ti-school",        color: "#1455a0", bg: "#e3f0fd" },
  { value: "senior_highschool", label: "Senior HS",    icon: "ti-certificate",   color: "#7c3aed", bg: "#f0e8fd" },
];

const GRADE_LEVELS_BY_LEVEL = {
  nursery:           ["Nursery"],
  kindergarten:      ["Kindergarten"],
  elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["Grade 11","Grade 12"],
};

const SHS_STRANDS = ["STEM","ABM","HUMSS","GAS","TVL-ICT","TVL-HE","TVL-IA","TVL-AFA","Arts and Design","Sports"];

const getLevelMeta = (level) => SCHOOL_LEVELS.find((l) => l.value === level) ?? SCHOOL_LEVELS[2];

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: "linear-gradient(90deg, #f0e8e8 25%, #fde8e8 50%, #f0e8e8 75%)",
    backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite",
  }} />
);

// ── Stat card — matches StudentsPage exactly ──────────────────────────────────
function StatCard({ label, value, icon, color, bg, loading }) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(224,49,49,0.12)" }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.16 }}
      style={{
        background: "white", borderRadius: 14, padding: "16px 20px",
        border: "1px solid #f5eaea", width: "100%",
        display: "flex", alignItems: "center", gap: 14,
        boxShadow: "0 2px 12px rgba(224,49,49,0.06)",
      }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 12, background: bg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 18, color }} />
      </div>
      <div>
        {loading
          ? <Sk w={40} h={20} r={4} />
          : <div style={{ fontSize: 22, fontWeight: 700, color: "#1a0a0a", lineHeight: 1 }}>{value?.toLocaleString?.() ?? value ?? "—"}</div>
        }
        <div style={{ fontSize: 11, color: "#a07878", marginTop: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      </div>
    </motion.div>
  );
}

// ── Form Modal ────────────────────────────────────────────────────────────────
function SubjectModal({ subject, templates, onSave, onClose }) {
  const isEdit = Boolean(subject?.subject_id);
  const [form, setForm] = useState({
    subject_code:     subject?.subject_code     ?? "",
    subject_name:     subject?.subject_name     ?? "",
    school_level:     subject?.school_level     ?? "elementary",
    grade_level:      subject?.grade_level      ?? "Grade 1",
    strand:           subject?.strand           ?? "",
    semester:         subject?.semester         ?? "",
    grading_template: subject?.grading_template ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const isSHS = form.school_level === "senior_highschool";
  const gradeOptions = GRADE_LEVELS_BY_LEVEL[form.school_level] ?? [];

  const setF = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v };
    if (k === "school_level") {
      next.grade_level = (GRADE_LEVELS_BY_LEVEL[v] ?? [])[0] ?? "";
      if (v !== "senior_highschool") { next.strand = ""; next.semester = ""; }
      else if (!next.semester) next.semester = "1st";
    }
    return next;
  });

  const handleSave = async () => {
    if (!form.subject_code.trim()) { setError("Subject code is required."); return; }
    if (!form.subject_name.trim()) { setError("Subject name is required."); return; }
    if (isSHS && !form.semester)   { setError("Semester is required for Senior HS."); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        subject_code:     form.subject_code.trim(),
        subject_name:     form.subject_name.trim(),
        school_level:     form.school_level,
        grade_level:      form.grade_level,
        strand:           isSHS && form.strand ? form.strand : null,
        semester:         isSHS ? form.semester : null,
        grading_template: form.grading_template || null,
      };
      await onSave(isEdit ? subject.subject_id : null, payload);
    } catch (e) {
      const msg = e.message || "Failed to save subject.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const inp = {
    width: "100%", border: "1.5px solid #fde2de", borderRadius: 10,
    padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
    color: "#1a0a0a", background: "#fffbfb", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(26,10,10,0.4)", backdropFilter: "blur(4px)" }}
      />
      {/* Dialog */}
      <motion.div
        variants={modalVariants}
        initial="hidden" animate="visible" exit="exit"
        transition={springTransition}
        style={{ position: "relative", background: "white", borderRadius: 20, width: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(224,49,49,0.18)" }}
      >
        {/* Modal header */}
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to right, #fdfafa, white)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-book" style={{ fontSize: 18, color: "#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a" }}>
                {isEdit ? "Edit Subject" : "New Subject"}
              </div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>
                {isEdit ? "Update subject details" : "Add a new subject to the curriculum"}
              </div>
            </div>
          </div>
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.1, backgroundColor: "#fff0f0", color: "#e03131" }}
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.12 }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", fontSize: 20, display: "flex", alignItems: "center", borderRadius: 8, padding: 4 }}
          >
            <i className="ti ti-x" />
          </motion.button>
        </div>

        {/* Modal body */}
        <div style={{ padding: "22px 28px" }}>
          <AnimatePresence>
            {error && (
              <motion.div
                key="modal-error"
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}
              >
                <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* School level chips */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>School Level *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SCHOOL_LEVELS.map((lvl) => {
                const active = form.school_level === lvl.value;
                return (
                  <motion.button
                    key={lvl.value}
                    type="button"
                    onClick={() => setF("school_level", lvl.value)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ duration: 0.12 }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 99, border: `1.5px solid ${active ? lvl.color : "#f0e4e4"}`, background: active ? lvl.bg : "white", color: active ? lvl.color : "#9a7070", fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.14s" }}
                  >
                    <i className={`ti ${lvl.icon}`} style={{ fontSize: 13 }} />{lvl.label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Grid fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Subject Code *</label>
              <input value={form.subject_code} onChange={(e) => setF("subject_code", e.target.value)} placeholder="e.g. MATH-7" style={inp} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Grade Level *</label>
              <select value={form.grade_level} onChange={(e) => setF("grade_level", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Subject Name *</label>
            <input value={form.subject_name} onChange={(e) => setF("subject_name", e.target.value)} placeholder="e.g. Mathematics 7" style={inp} />
          </div>

          {/* SHS fields */}
          <AnimatePresence>
            {isSHS && (
              <motion.div
                key="shs-fields"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
              >
                <div style={{ padding: "14px 16px", background: "#fff8f6", border: "1px dashed #fca5a5", borderRadius: 10, marginBottom: 14 }}>
                  <div style={{ fontSize: 10.5, color: "#e03131", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Senior HS specifics</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                    <div style={{ marginBottom: 0 }}>
                      <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Strand</label>
                      <select value={form.strand} onChange={(e) => setF("strand", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                        <option value="">— Any strand —</option>
                        {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Semester *</label>
                      <select value={form.semester} onChange={(e) => setF("semester", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                        <option value="1st">1st Semester</option>
                        <option value="2nd">2nd Semester</option>
                      </select>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Grading template */}
          <div style={{ marginBottom: 6 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Grading Template</label>
            <select value={form.grading_template || ""} onChange={(e) => setF("grading_template", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              <option value="">— No template assigned —</option>
              {templates.map((t) => (
                <option key={t.grading_template_id} value={t.grading_template_id}>
                  {t.template_name} ({t.school_level})
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: "#b09090", marginTop: 5, fontStyle: "italic" }}>
              Determines how raw scores are weighted into a final grade.
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div style={{ padding: "16px 28px 24px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <motion.button
            onClick={onClose}
            whileHover={{ background: "#fdf8f8" }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12 }}
            style={{ background: "white", color: "#7a5050", border: "1.5px solid #f0e0e0", borderRadius: 10, padding: "9px 22px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
          >
            Cancel
          </motion.button>
          <motion.button
            onClick={handleSave}
            disabled={saving}
            whileHover={saving ? {} : { opacity: 0.88 }}
            whileTap={saving ? {} : { scale: 0.97 }}
            transition={{ duration: 0.12 }}
            style={{ background: saving ? "#e87474" : "linear-gradient(135deg, #e03131, #c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "9px 24px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: saving ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}
          >
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />Saving…</>
              : <><i className="ti ti-check" style={{ fontSize: 13 }} />{isEdit ? "Update Subject" : "Create Subject"}</>
            }
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function SubjectsPage() {
  usePageTitle("Subjects");
  const navigate    = useNavigate();
  const canManage   = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);

  const [subjects,     setSubjects]    = useState([]);
  const [templates,    setTemplates]   = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [search,       setSearch]      = useState("");
  const [inputVal,     setInputVal]    = useState("");
  const [levelFilter,  setLevelFilter] = useState("all");
  const [gradeFilter,  setGradeFilter] = useState("");
  const [page,         setPage]        = useState(1);
  const [pageMeta,     setPageMeta]    = useState({ count: 0, next: null, previous: null });
  const [modal,        setModal]       = useState(null);
  const [toDelete,     setToDelete]    = useState(null);

  const gradeOptions = levelFilter !== "all" ? (GRADE_LEVELS_BY_LEVEL[levelFilter] ?? []) : [];

  const fetchSubjects = useCallback(async (p = 1, term = search, level = levelFilter, grade = gradeFilter) => {
    setLoading(true);
    try {
      const params = { page: p };
      if (term)              params.search       = term;
      if (level !== "all")   params.school_level = level;
      if (grade)             params.grade_level  = grade;
      const data = await getSubjects(params);
      setSubjects(data.results || []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, levelFilter, gradeFilter]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchSubjects(1, "", "all");
    getTemplates().then((d) => setTemplates(Array.isArray(d) ? d : d?.results ?? [])).catch(() => {});
  }, []);

  const handleSave = async (id, payload) => {
    if (id) await updateSubject(id, payload);
    else    await createSubject(payload);
    toast.success(id ? "Subject updated." : "Subject created.");
    setModal(null);
    fetchSubjects(page, search, levelFilter, gradeFilter);
  };

  const [deletingSubject, setDeletingSubject] = useState(false);

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeletingSubject(true);
    try {
      await deleteSubject(toDelete.subject_id);
      toast.success("Subject deleted.");
      setToDelete(null);
      fetchSubjects(page, search, levelFilter, gradeFilter);
    } finally {
      setDeletingSubject(false);
    }
  };

  const totalPages = Math.ceil(pageMeta.count / 20);

  const withTemplate    = subjects.filter((s) => s.grading_template_detail).length;
  const withoutTemplate = subjects.filter((s) => !s.grading_template_detail).length;
  const activeLevels    = new Set(subjects.map((s) => s.school_level)).size;

  const isFirstRender = useIsFirstRender();

  return (
    <AppLayout>
      {/* Topbar */}
      <div style={{ background: "white", borderBottom: "1px solid #f5eaea", padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>Subjects</div>
          <div style={{ fontSize: 11.5, color: "#b09090", marginTop: 1 }}>
            {loading ? "Loading…" : `${pageMeta.count.toLocaleString()} subjects in curriculum`}
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.03, boxShadow: "0 8px 28px rgba(224,49,49,0.32)" }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.13 }}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}
          onClick={() => setModal({ mode: "create" })}
        >
          <i className="ti ti-plus" style={{ fontSize: 15 }} />New Subject
        </motion.button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Stat cards — matches StudentsPage layout */}
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "Total Subjects",   icon: "ti-books",           value: pageMeta.count,  color: "#e03131", bg: "#fff0f0" },
            { label: "With Template",    icon: "ti-report-analytics", value: withTemplate,    color: "#2e6b0d", bg: "#e8f5e0" },
            { label: "No Template",      icon: "ti-alert-triangle",  value: withoutTemplate, color: "#d97706", bg: "#fdf5e8" },
            { label: "Levels Active",    icon: "ti-layout-grid",     value: activeLevels,    color: "#1455a0", bg: "#e3f0fd" },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              initial={isFirstRender ? { y: 14, opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.28, ease: "easeOut", delay: isFirstRender ? i * 0.06 : 0 }}
              style={{ flex: 1, minWidth: 0 }}
            >
              <StatCard {...card} loading={loading} />
            </motion.div>
          ))}
        </div>

        {/* Search + filters */}
        <motion.div
          initial={isFirstRender ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.22 : 0 }}
          style={{ background: "white", border: "1px solid #f5eaea", borderRadius: 14, padding: "18px 20px", boxShadow: "0 2px 12px rgba(224,49,49,0.05)", display: "flex", flexDirection: "column", gap: 0 }}
        >
          {/* Row 1: search + clear */}
          <div style={{ display: "flex", gap: 10 }}>
            <div className="search-wrap" style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, padding: "0 16px", height: 42, transition: "border 0.15s,box-shadow 0.15s" }}>
              <i className="ti ti-search" style={{ fontSize: 15, color: "#c0a0a0", flexShrink: 0 }} />
              <input
                placeholder="Search by code or name…"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setSearch(inputVal); fetchSubjects(1, inputVal, levelFilter, gradeFilter); } }}
                style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, color: "#1a0a0a", fontFamily: "'DM Sans',sans-serif", outline: "none" }}
              />
              {inputVal && (
                <button
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", display: "flex", alignItems: "center", padding: 2, borderRadius: 4 }}
                  onClick={() => { setInputVal(""); setSearch(""); fetchSubjects(1, "", levelFilter, gradeFilter); }}
                >
                  <i className="ti ti-x" style={{ fontSize: 13 }} />
                </button>
              )}
            </div>
            <button
              style={{ height: 42, padding: "0 20px", background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, fontSize: 13, fontWeight: 600, color: "#7a5050", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.14s", flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#e03131"; e.currentTarget.style.color = "#e03131"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#f0e4e4"; e.currentTarget.style.color = "#7a5050"; }}
              onClick={() => { setSearch(inputVal); fetchSubjects(1, inputVal, levelFilter, gradeFilter); }}
            >
              Search
            </button>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "#f5eaea", margin: "14px 0" }} />

          {/* Chip rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* School Level chips */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>School Level</div>
                <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[{ value: "all", label: "All Subjects", icon: "ti-books", color: "#e03131", bg: "#fff0f0" }, ...SCHOOL_LEVELS].map((lvl) => {
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
                        onClick={() => {
                          setLevelFilter(lvl.value);
                          setGradeFilter("");
                          fetchSubjects(1, inputVal, lvl.value, "");
                        }}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          height: 32, padding: "0 14px", borderRadius: 99,
                          border: "1.5px solid", fontSize: 12, fontWeight: 600,
                          cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                        }}
                      >
                        <i className={`ti ${lvl.icon}`} style={{ fontSize: 12 }} />
                        {lvl.label}
                        {active && !loading && (
                          <span style={{ display: "inline-block", background: lvl.color, color: "white", borderRadius: 99, fontSize: 10, fontWeight: 700, padding: "1px 7px", marginLeft: 2, whiteSpace: "nowrap", flexShrink: 0 }}>
                            {pageMeta.count}
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </motion.div>
              </div>

              {/* Grade Level chips — cascades from level selection */}
              <div style={{
                maxHeight: levelFilter !== "all" ? 200 : 0,
                overflow: "hidden",
                opacity: levelFilter !== "all" ? 1 : 0,
                marginTop: levelFilter !== "all" ? 0 : -12,
                transition: "max-height 0.22s ease, opacity 0.18s ease, margin-top 0.22s ease",
                pointerEvents: levelFilter !== "all" ? "auto" : "none",
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Grade Level</div>
                  <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {["All Grades", ...gradeOptions].map((g, idx) => {
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
                          onClick={() => { setGradeFilter(val); fetchSubjects(1, inputVal, levelFilter, val); }}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            height: 32, padding: "0 14px", borderRadius: 99,
                            border: "1.5px solid", fontSize: 12, fontWeight: 600,
                            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                          }}
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

        {/* Table */}
        <motion.div
          initial={isFirstRender ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut", delay: isFirstRender ? 0.34 : 0 }}
          style={{ background: "white", border: "1px solid #f5eaea", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 16px rgba(224,49,49,0.06)", maxHeight: "calc(100vh - 360px)", overflowY: "auto" }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fdfafa" }}>
                {[
                  { label: "Subject",          w: "28%" },
                  { label: "Code",             w: "12%" },
                  { label: "Level",            w: "14%" },
                  { label: "Grade",            w: "11%" },
                  { label: "Strand / Sem",     w: "16%" },
                  { label: "Grading Template", w: "15%" },
                  { label: "",                 w: "4%"  },
                ].map(({ label, w }) => (
                  <th key={label} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "13px 18px", borderBottom: "1px solid #f5eaea", textTransform: "uppercase", letterSpacing: "0.07em", width: w, position: "sticky", top: 0, zIndex: 1, background: "#fdfafa" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <AnimatePresence mode="popLayout">
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Sk w={32} h={32} r={8} />
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <Sk w={130} h={13} />
                              <Sk w={80} h={11} />
                            </div>
                          </div>
                        </td>
                        {[70, 80, 70, 100, 110, 36].map((w, j) => (
                          <td key={j} style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0" }}><Sk w={w} h={13} /></td>
                        ))}
                      </tr>
                    ))
                  : subjects.length === 0
                    ? (
                      <motion.tr
                        key="empty"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        <td colSpan={7} style={{ textAlign: "center", padding: "64px 16px" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 56, height: 56, borderRadius: 16, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                              <i className="ti ti-book-off" style={{ fontSize: 24, color: "#e08080" }} />
                            </div>
                            <div style={{ fontSize: 15, color: "#7a5050", fontWeight: 600 }}>No subjects found</div>
                            <div style={{ fontSize: 12, color: "#b09090" }}>Try a different search or add a new subject</div>
                          </div>
                        </td>
                      </motion.tr>
                    )
                    : subjects.map((sub, idx) => {
                        const lvlMeta = getLevelMeta(sub.school_level);
                        const hasTpl  = sub.grading_template_detail;
                        return (
                          <motion.tr
                            key={sub.subject_id}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 6 }}
                            transition={{ duration: 0.18, ease: "easeOut", delay: Math.min(idx * 0.025, 0.3) }}
                            className="sub-row"
                            onClick={() => setModal({ mode: "edit", subject: sub })}
                          >
                            {/* Subject name */}
                            <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 34, height: 34, borderRadius: 9, background: lvlMeta.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <i className={`ti ${lvlMeta.icon}`} style={{ fontSize: 15, color: lvlMeta.color }} />
                                </div>
                                <div className="sub-name" style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a", transition: "color 0.12s" }}>{sub.subject_name}</div>
                              </div>
                            </td>
                            {/* Code */}
                            <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
                              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#5a4a4a", background: "#f9f4f4", padding: "3px 8px", borderRadius: 6 }}>{sub.subject_code}</span>
                            </td>
                            {/* Level */}
                            <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: lvlMeta.bg, color: lvlMeta.color }}>
                                <i className={`ti ${lvlMeta.icon}`} style={{ fontSize: 11 }} />{lvlMeta.label}
                              </span>
                            </td>
                            {/* Grade */}
                            <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle", fontSize: 13, color: "#5a4a4a" }}>
                              {sub.grade_level}
                            </td>
                            {/* Strand / Sem */}
                            <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
                              {sub.strand || sub.semester
                                ? <div style={{ fontSize: 12, color: "#7a5a5a" }}>
                                    {sub.strand && <span style={{ display: "block" }}>{sub.strand}</span>}
                                    {sub.semester && <span style={{ color: "#b09090", fontSize: 11 }}>{sub.semester === "1st" ? "1st Semester" : "2nd Semester"}</span>}
                                  </div>
                                : <span style={{ color: "#d0b8b8", fontStyle: "italic", fontSize: 12 }}>—</span>
                              }
                            </td>
                            {/* Grading template */}
                            <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
                              {hasTpl
                                ? <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 99, background: "#e8f5e0", color: "#2e6b0d" }}>
                                      <i className="ti ti-check" style={{ fontSize: 10 }} />{hasTpl.template_name}
                                    </span>
                                    <span style={{ fontSize: 11, color: "#b09090", paddingLeft: 2 }}>
                                      {hasTpl.components?.length ?? 0} components · {hasTpl.total_weight ?? 0}%
                                    </span>
                                  </div>
                                : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontStyle: "italic", padding: "3px 9px", borderRadius: 99, border: "1px dashed #f0d8d8", color: "#c0a0a0" }}>
                                    <i className="ti ti-minus" style={{ fontSize: 10 }} />No template
                                  </span>
                              }
                            </td>
                            {/* Actions */}
                            <td style={{ padding: "13px 14px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }} onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="row-action" title="Edit" onClick={() => setModal({ mode: "edit", subject: sub })}>
                                  <i className="ti ti-pencil" style={{ fontSize: 13 }} />
                                </button>
                                {canManage && (
                                  <button className="row-action danger" title="Delete" style={{ color: "#c09090" }} onClick={() => setToDelete(sub)}>
                                    <i className="ti ti-trash" style={{ fontSize: 13 }} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })
                }
              </tbody>
            </AnimatePresence>
          </table>
        </motion.div>

        {/* Pagination */}
        {!loading && pageMeta.count > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "#b09090" }}>
              Page <strong style={{ color: "#7a5050" }}>{page}</strong> of <strong style={{ color: "#7a5050" }}>{totalPages || 1}</strong> · {pageMeta.count.toLocaleString()} subjects
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <motion.button
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.1 }}
                className="page-btn"
                style={pgBtn}
                disabled={!pageMeta.previous}
                onClick={() => fetchSubjects(page - 1, search, levelFilter, gradeFilter)}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 13 }} />
              </motion.button>
              {(() => {
                const windowSize = Math.min(totalPages, 5);
                const start = Math.min(Math.max(1, page - 2), Math.max(1, totalPages - windowSize + 1));
                return Array.from({ length: windowSize }, (_, i) => start + i);
              })().map((p) => {
                const isActive = p === page;
                return (
                  <motion.button
                    key={p}
                    whileTap={{ scale: 0.92 }}
                    transition={{ duration: 0.1 }}
                    className="page-btn"
                    style={{ ...pgBtn, ...(isActive ? pgBtnActive : {}) }}
                    onClick={() => fetchSubjects(p, search, levelFilter, gradeFilter)}
                  >
                    {p}
                  </motion.button>
                );
              })}
              <motion.button
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.1 }}
                className="page-btn"
                style={pgBtn}
                disabled={!pageMeta.next}
                onClick={() => fetchSubjects(page + 1, search, levelFilter)}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: 13 }} />
              </motion.button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modal && (
          <SubjectModal
            key="subject-modal"
            subject={modal.mode === "edit" ? modal.subject : null}
            templates={templates}
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toDelete && (
          <ConfirmModal
            key="delete-modal"
            icon="ti-trash"
            title="Delete subject?"
            message={<>You're about to delete <strong style={{ color: "#1a0a0a" }}>{toDelete.subject_name}</strong>. This cannot be undone and may affect existing grades.</>}
            loading={deletingSubject}
            onConfirm={handleDelete}
            onCancel={() => setToDelete(null)}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}

const pgBtn = {
  width: 32, height: 32, border: "1px solid #f0e4e4", borderRadius: 8,
  background: "white", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", fontSize: 12, color: "#9a7070",
  fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s",
};

const pgBtnActive = {
  background: "#fff0f0", borderColor: "#e03131", color: "#e03131", fontWeight: 700,
};
