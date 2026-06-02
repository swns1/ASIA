import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";

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

// ── Animation variants ────────────────────────────────────────────────────────
const fadeUp = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0  },
};

const rowVariants = {
  hidden:  { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0  },
  exit:    { opacity: 0, x: 8, transition: { duration: 0.15 } },
};

const tableContainerVariants = {
  visible: { transition: { staggerChildren: 0.03 } },
};

const modalBackdropVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1 },
  exit:    { opacity: 0 },
};

const modalVariants = {
  hidden:  { opacity: 0, scale: 0.93, y: 10 },
  visible: { opacity: 1, scale: 1,    y: 0  },
  exit:    { opacity: 0, scale: 0.95, y: 6  },
};

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
      setError(e.message || "Failed to save subject.");
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
    <motion.div
      variants={modalBackdropVariants}
      initial="hidden" animate="visible" exit="exit"
      transition={{ duration: 0.18 }}
      style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <motion.div
        variants={modalVariants}
        initial="hidden" animate="visible" exit="exit"
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        style={{ background: "white", borderRadius: 20, width: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(224,49,49,0.18)" }}
        onClick={(e) => e.stopPropagation()}
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
                    animate={{ borderColor: active ? lvl.color : "#f0e4e4", background: active ? lvl.bg : "white", color: active ? lvl.color : "#9a7070", fontWeight: active ? 700 : 500 }}
                    transition={{ duration: 0.15 }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 99, border: `1.5px solid ${active ? lvl.color : "#f0e4e4"}`, background: active ? lvl.bg : "white", color: active ? lvl.color : "#9a7070", fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
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
            whileHover={{ scale: 1.02, borderColor: "#e03131", color: "#e03131" }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12 }}
            style={{ background: "transparent", color: "#9a7070", border: "1.5px solid #fde2de", borderRadius: 50, padding: "9px 22px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
          >
            Cancel
          </motion.button>
          <motion.button
            onClick={handleSave}
            disabled={saving}
            whileHover={saving ? {} : { scale: 1.02, boxShadow: "0 8px 28px rgba(224,49,49,0.32)" }}
            whileTap={saving ? {} : { scale: 0.97 }}
            transition={{ duration: 0.12 }}
            style={{ background: saving ? "#e87474" : "linear-gradient(135deg, #e03131, #c92a2a)", color: "white", border: "none", borderRadius: 50, padding: "9px 24px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: saving ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}
          >
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />Saving…</>
              : <><i className="ti ti-check" style={{ fontSize: 13 }} />{isEdit ? "Update Subject" : "Create Subject"}</>
            }
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteModal({ subject, onConfirm, onCancel }) {
  return (
    <motion.div
      variants={modalBackdropVariants}
      initial="hidden" animate="visible" exit="exit"
      transition={{ duration: 0.18 }}
      style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <motion.div
        variants={modalVariants}
        initial="hidden" animate="visible" exit="exit"
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        style={{ background: "white", borderRadius: 20, padding: "32px 36px", width: 400, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.06 }}
          style={{ width: 56, height: 56, borderRadius: 14, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <i className="ti ti-trash" style={{ fontSize: 24, color: "#e03131" }} />
        </motion.div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1a0a0a" }}>Delete Subject?</div>
        <div style={{ fontSize: 13, color: "#7a5050", textAlign: "center", lineHeight: 1.7 }}>
          You're about to delete <strong style={{ color: "#1a0a0a" }}>{subject.subject_name}</strong>. This cannot be undone and may affect existing grades.
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <motion.button
            onClick={onCancel}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12 }}
            style={{ flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10, background: "white", fontSize: 13, color: "#7a5050", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
          >
            Cancel
          </motion.button>
          <motion.button
            onClick={onConfirm}
            whileHover={{ scale: 1.02, boxShadow: "0 8px 24px rgba(224,49,49,0.36)" }} whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12 }}
            style={{ flex: 1, height: 42, border: "none", borderRadius: 10, background: "linear-gradient(135deg, #e03131, #c92a2a)", fontSize: 13, color: "white", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.3)" }}
          >
            Yes, delete
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────
function StatsStrip({ subjects, total, loading }) {
  const withTemplate    = subjects.filter((s) => s.grading_template_detail).length;
  const withoutTemplate = subjects.filter((s) => !s.grading_template_detail).length;
  const activeLevels    = new Set(subjects.map((s) => s.school_level)).size;

  const stats = [
    { label: "Total Subjects",      value: loading ? "—" : total,           icon: "ti-books",          color: "#e03131", bg: "#fff0f0" },
    { label: "With Template",       value: loading ? "—" : withTemplate,    icon: "ti-report-analytics",color: "#2e6b0d", bg: "#e8f5e0" },
    { label: "Without Template",    value: loading ? "—" : withoutTemplate, icon: "ti-alert-triangle", color: "#d97706", bg: "#fdf5e8" },
    { label: "Levels Active",       value: loading ? "—" : activeLevels,    icon: "ti-layout-grid",    color: "#1455a0", bg: "#e3f0fd" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ type: "spring", stiffness: 300, damping: 24, delay: i * 0.06 }}
          style={{ background: "white", border: "1px solid #f5eaea", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 2px 12px rgba(224,49,49,0.05)" }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className={`ti ${s.icon}`} style={{ fontSize: 16, color: s.color }} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#b09090", marginTop: 2 }}>{s.label}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function SubjectsPage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [subjects,    setSubjects]    = useState([]);
  const [templates,   setTemplates]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [inputVal,    setInputVal]    = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [page,        setPage]        = useState(1);
  const [pageMeta,    setPageMeta]    = useState({ count: 0, next: null, previous: null });
  const [modal,       setModal]       = useState(null);
  const [toDelete,    setToDelete]    = useState(null);

  const fetchSubjects = useCallback(async (p = 1, term = search, level = levelFilter) => {
    setLoading(true);
    try {
      const params = { page: p };
      if (term) params.search = term;
      if (level !== "all") params.school_level = level;
      const data = await getSubjects(params);
      setSubjects(data.results || []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, levelFilter]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchSubjects(1, "", "all");
    getTemplates().then((d) => setTemplates(Array.isArray(d) ? d : d?.results ?? [])).catch(() => {});
  }, []);

  const handleSave = async (id, payload) => {
    if (id) await updateSubject(id, payload);
    else    await createSubject(payload);
    setModal(null);
    fetchSubjects(page, search, levelFilter);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    await deleteSubject(toDelete.subject_id);
    setToDelete(null);
    fetchSubjects(page, search, levelFilter);
  };

  const totalPages = Math.ceil(pageMeta.count / 20);

  return (
    <AppLayout>
      {/* Topbar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        style={{ background: "white", borderBottom: "1px solid #f5eaea", padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>Subjects</div>
          <div style={{ fontSize: 11.5, color: "#b09090", marginTop: 1 }}>
            {loading ? "Loading…" : `${pageMeta.count.toLocaleString()} subjects in curriculum`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
      </motion.div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Stats strip */}
        <StatsStrip subjects={subjects} total={pageMeta.count} loading={loading} />

        {/* Search + filters */}
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.1 }}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            <div className="search-wrap" style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, padding: "0 16px", height: 42, transition: "border 0.15s,box-shadow 0.15s" }}>
              <i className="ti ti-search" style={{ fontSize: 15, color: "#c0a0a0", flexShrink: 0 }} />
              <input
                placeholder="Search by code or name…"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setSearch(inputVal); fetchSubjects(1, inputVal, levelFilter); } }}
                style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, color: "#1a0a0a", fontFamily: "'DM Sans',sans-serif", outline: "none" }}
              />
              <AnimatePresence>
                {inputVal && (
                  <motion.button
                    key="clear-btn"
                    initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.14 }}
                    whileHover={{ scale: 1.15, color: "#e03131" }} whileTap={{ scale: 0.85 }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", display: "flex", alignItems: "center", padding: 2 }}
                    onClick={() => { setInputVal(""); setSearch(""); fetchSubjects(1, "", levelFilter); }}
                  >
                    <i className="ti ti-x" style={{ fontSize: 13 }} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            <motion.button
              whileHover={{ borderColor: "#e03131", color: "#e03131", scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.13 }}
              style={{ height: 42, padding: "0 20px", background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, fontSize: 13, fontWeight: 600, color: "#7a5050", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
              onClick={() => { setSearch(inputVal); fetchSubjects(1, inputVal, levelFilter); }}
            >
              Search
            </motion.button>
          </div>

          {/* Level filter chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[{ value: "all", label: "All Subjects", icon: "ti-books", color: "#e03131", bg: "#fff0f0" }, ...SCHOOL_LEVELS].map((lvl, i) => {
              const active = levelFilter === lvl.value;
              return (
                <motion.button
                  key={lvl.value}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 24 }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setLevelFilter(lvl.value); fetchSubjects(1, inputVal, lvl.value); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    height: 32, padding: "0 14px", borderRadius: 99,
                    border: `1.5px solid ${active ? (lvl.color ?? "#e03131") : "#f0e4e4"}`,
                    background: active ? (lvl.bg ?? "#fff0f0") : "white",
                    color: active ? (lvl.color ?? "#e03131") : "#9a7070",
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                    transition: "border-color 0.14s, background 0.14s, color 0.14s",
                  }}
                >
                  <i className={`ti ${lvl.icon}`} style={{ fontSize: 12 }} />
                  {lvl.label}
                  {active && lvl.value === "all" && !loading && (
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      style={{ background: "#e03131", color: "white", borderRadius: 99, fontSize: 10, fontWeight: 700, padding: "1px 7px", marginLeft: 2 }}
                    >
                      {pageMeta.count}
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24, delay: 0.14 }}
          style={{ background: "white", border: "1px solid #f5eaea", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 16px rgba(224,49,49,0.06)", maxHeight: "calc(100vh - 400px)", overflowY: "auto" }}
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
                  <th key={label} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "13px 18px", borderBottom: "1px solid #f5eaea", textTransform: "uppercase", letterSpacing: "0.07em", width: w }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <motion.tbody variants={tableContainerVariants} initial="hidden" animate="visible">
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
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "64px 16px" }}>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: "spring", stiffness: 300, damping: 22 }}
                          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
                        >
                          <motion.div
                            animate={{ y: [0, -5, 0] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                            style={{ width: 56, height: 56, borderRadius: 16, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <i className="ti ti-book-off" style={{ fontSize: 24, color: "#e08080" }} />
                          </motion.div>
                          <div style={{ fontSize: 15, color: "#7a5050", fontWeight: 600 }}>No subjects found</div>
                          <div style={{ fontSize: 12, color: "#b09090" }}>Try a different search or add a new subject</div>
                        </motion.div>
                      </td>
                    </tr>
                  )
                  : subjects.map((sub) => {
                      const lvlMeta = getLevelMeta(sub.school_level);
                      const hasTpl  = sub.grading_template_detail;
                      return (
                        <motion.tr
                          key={sub.subject_id}
                          variants={rowVariants}
                          transition={{ type: "spring", stiffness: 300, damping: 26 }}
                          className="sub-row"
                          layout
                        >
                          {/* Subject name */}
                          <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 34, height: 34, borderRadius: 9, background: lvlMeta.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <i className={`ti ${lvlMeta.icon}`} style={{ fontSize: 15, color: lvlMeta.color }} />
                              </div>
                              <div>
                                <div className="sub-name" style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a", transition: "color 0.12s" }}>{sub.subject_name}</div>
                              </div>
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
                              <motion.button
                                className="row-action"
                                title="Edit"
                                whileHover={{ scale: 1.12, backgroundColor: "#fff0f0", color: "#e03131", borderColor: "#fca5a5" }}
                                whileTap={{ scale: 0.88 }}
                                transition={{ duration: 0.12 }}
                                onClick={() => setModal({ mode: "edit", subject: sub })}
                              >
                                <i className="ti ti-pencil" style={{ fontSize: 13 }} />
                              </motion.button>
                              <motion.button
                                className="row-action"
                                title="Delete"
                                whileHover={{ scale: 1.12, backgroundColor: "#fff0f0", color: "#e03131", borderColor: "#fca5a5" }}
                                whileTap={{ scale: 0.88 }}
                                transition={{ duration: 0.12 }}
                                style={{ color: "#c09090" }}
                                onClick={() => setToDelete(sub)}
                              >
                                <i className="ti ti-trash" style={{ fontSize: 13 }} />
                              </motion.button>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })
              }
            </motion.tbody>
          </table>
        </motion.div>

        {/* Pagination */}
        {!loading && pageMeta.count > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.22 }}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <span style={{ fontSize: 12, color: "#b09090" }}>
              Page <strong style={{ color: "#7a5050" }}>{page}</strong> of <strong style={{ color: "#7a5050" }}>{totalPages || 1}</strong> · {pageMeta.count.toLocaleString()} subjects
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <motion.button
                className="page-btn" style={pgBtn}
                disabled={!pageMeta.previous}
                whileHover={pageMeta.previous ? { scale: 1.08 } : {}}
                whileTap={pageMeta.previous ? { scale: 0.92 } : {}}
                onClick={() => fetchSubjects(page - 1, search, levelFilter)}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 13 }} />
              </motion.button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const start = Math.max(1, page - 2);
                const p = start + i;
                if (p > totalPages) return null;
                const isActive = p === page;
                return (
                  <motion.button
                    key={p}
                    className="page-btn"
                    style={{ ...pgBtn, ...(isActive ? pgBtnActive : {}) }}
                    whileHover={!isActive ? { scale: 1.08 } : {}}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => fetchSubjects(p, search, levelFilter)}
                  >
                    {p}
                  </motion.button>
                );
              })}
              <motion.button
                className="page-btn" style={pgBtn}
                disabled={!pageMeta.next}
                whileHover={pageMeta.next ? { scale: 1.08 } : {}}
                whileTap={pageMeta.next ? { scale: 0.92 } : {}}
                onClick={() => fetchSubjects(page + 1, search, levelFilter)}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: 13 }} />
              </motion.button>
            </div>
          </motion.div>
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
          <DeleteModal
            key="delete-modal"
            subject={toDelete}
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
  cursor: "pointer", fontSize: 12, color: "#9a7070", fontFamily: "'DM Sans',sans-serif", transition: "all 0.12s",
};
const pgBtnActive = {
  background: "#fff0f0", borderColor: "#e03131", color: "#e03131", fontWeight: 700,
};
