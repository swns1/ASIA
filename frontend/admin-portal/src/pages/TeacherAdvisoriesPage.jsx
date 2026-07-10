import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import toast from "react-hot-toast";
import AppLayout from "../components/AppLayout";
import ConfirmModal from "../components/ConfirmModal";
import { useNavigate } from "react-router-dom";
import { listVariants, modalVariants, springTransition } from "../utils/motion";

import {
  getSectionAdvisories,
  createSectionAdvisory,
  updateSectionAdvisory,
  deleteSectionAdvisory,
} from "../api/enrollmentApi";
import { getUsers } from "../api/identityApi";

// ── School level / grade level options (mirrors EnrollmentFormPage.jsx) ────────
const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",            icon: "ti-baby-carriage" },
  { value: "kindergarten",      label: "Kindergarten",       icon: "ti-star"          },
  { value: "elementary",        label: "Elementary",         icon: "ti-book"          },
  { value: "junior_highschool", label: "Junior High School", icon: "ti-school"        },
  { value: "senior_highschool", label: "Senior High School", icon: "ti-certificate"   },
];

const GRADE_LEVELS_BY_LEVEL = {
  nursery:           ["Nursery"],
  kindergarten:      ["Kindergarten"],
  elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["Grade 11","Grade 12"],
};

const SHS_STRANDS = [
  "STEM","ABM","HUMSS","GAS","TVL-ICT","TVL-HE","TVL-IA","TVL-AFA","Arts and Design","Sports",
];

const SCHOOL_LEVEL_LABELS = Object.fromEntries(SCHOOL_LEVELS.map((l) => [l.value, l.label]));

function currentSchoolYear() {
  const now = new Date();
  const y = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1; // school year starts ~June
  return `${y}-${y + 1}`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);

function AnimatedCount({ value, style }) {
  const mv = useMotionValue(value);
  const sp = useSpring(mv, { stiffness: 90, damping: 18 });
  const display = useTransform(sp, Math.round);
  const [shown, setShown] = useState(value);

  useEffect(() => { mv.set(value); }, [value, mv]);
  useEffect(() => display.on("change", setShown), [display]);

  return <span style={style}>{shown}</span>;
}

// ── Advisory Modal (create/edit) ────────────────────────────────────────────────
function AdvisoryModal({ advisory, teachers, onClose, onSaved }) {
  const isEdit = Boolean(advisory?.advisory_id);

  const [form, setForm] = useState({
    teacher_user_id: advisory?.teacher_user_id ?? "",
    school_year:     advisory?.school_year     ?? currentSchoolYear(),
    school_level:    advisory?.school_level    ?? "elementary",
    grade_level:     advisory?.grade_level     ?? "",
    section:         advisory?.section         ?? "",
    strand:          advisory?.strand          ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const gradeOptions = useMemo(() => GRADE_LEVELS_BY_LEVEL[form.school_level] ?? [], [form.school_level]);
  const isSHS = form.school_level === "senior_highschool";

  const handleSave = async () => {
    if (!form.teacher_user_id) { setError("Please select a teacher."); return; }
    if (!form.school_year.trim()) { setError("School year is required."); return; }
    if (!form.grade_level) { setError("Grade level is required."); return; }
    if (!form.section.trim()) { setError("Section is required."); return; }

    setSaving(true); setError("");
    try {
      const payload = {
        teacher_user_id: parseInt(form.teacher_user_id, 10),
        school_year:     form.school_year.trim(),
        school_level:    form.school_level,
        grade_level:     form.grade_level,
        section:         form.section.trim(),
        strand:          isSHS ? (form.strand || null) : null,
      };
      if (isEdit) await updateSectionAdvisory(advisory.advisory_id, payload);
      else        await createSectionAdvisory(payload);
      toast.success(isEdit ? "Advisory assignment updated." : "Advisory assignment created.");
      onSaved();
      onClose();
    } catch (e) {
      const msg = e.message || "Failed to save.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const inp = {
    width: "100%", border: "1.5px solid #fde2de", borderRadius: 10,
    padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif",
    color: "#1a0a0a", background: "#fffbfb", outline: "none", boxSizing: "border-box",
  };

  const lbl = {
    display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050",
    letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}
    >
      <motion.div
        variants={modalVariants} initial="hidden" animate="visible" exit="exit"
        transition={springTransition}
        style={{ background: "white", borderRadius: 20, width: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(224,49,49,0.18)" }}
      >
        {/* Header */}
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-user-check" style={{ fontSize: 20, color: "#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a" }}>
                {isEdit ? "Edit Advisory Assignment" : "New Advisory Assignment"}
              </div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>
                {isEdit ? "Update which section this teacher advises" : "Assign a teacher as adviser of a section"}
              </div>
            </div>
          </div>
          <motion.button onClick={onClose} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", fontSize: 20, display: "flex", alignItems: "center" }}>
            <i className="ti ti-x" />
          </motion.button>
        </div>

        {/* Body */}
        <div style={{ padding: "22px 28px" }}>
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}
              >
                <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Teacher */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Teacher *</label>
            <select value={form.teacher_user_id} onChange={(e) => setF("teacher_user_id", e.target.value)} style={inp}>
              <option value="">Select a teacher…</option>
              {teachers.map((t) => (
                <option key={t.user_id} value={t.user_id}>{t.name} ({t.email})</option>
              ))}
            </select>
          </div>

          {/* School year */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>School Year *</label>
            <input value={form.school_year} onChange={(e) => setF("school_year", e.target.value)}
              placeholder="e.g. 2025-2026" style={inp} />
          </div>

          {/* School level */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>School Level *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SCHOOL_LEVELS.map((lvl) => {
                const active = form.school_level === lvl.value;
                return (
                  <button key={lvl.value} type="button"
                    onClick={() => setForm((f) => ({ ...f, school_level: lvl.value, grade_level: "", strand: "" }))}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px",
                      borderRadius: 10, border: `1.5px solid ${active ? "#e03131" : "#f0e4e4"}`,
                      background: active ? "#fff0f0" : "white", cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, fontWeight: active ? 700 : 500,
                      color: active ? "#e03131" : "#7a5050",
                    }}>
                    <i className={`ti ${lvl.icon}`} style={{ fontSize: 13 }} />{lvl.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grade level + Section */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Grade Level *</label>
              <select value={form.grade_level} onChange={(e) => setF("grade_level", e.target.value)} style={inp}>
                <option value="">Select grade…</option>
                {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Section *</label>
              <input value={form.section} onChange={(e) => setF("section", e.target.value)}
                placeholder="e.g. Rizal" style={inp} />
            </div>
          </div>

          {/* Strand (SHS only) */}
          {isSHS && (
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Strand</label>
              <select value={form.strand} onChange={(e) => setF("strand", e.target.value)} style={inp}>
                <option value="">None</option>
                {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 28px 24px", display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #f5eaea" }}>
          <motion.button onClick={onClose}
            whileHover={{ borderColor: "#e03131", color: "#e03131" }}
            style={{ background: "transparent", color: "#9a7070", border: "1.5px solid #fde2de", borderRadius: 50, padding: "9px 22px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer" }}>
            Cancel
          </motion.button>
          <motion.button onClick={handleSave} disabled={saving}
            whileHover={!saving ? { scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" } : {}}
            whileTap={!saving ? { scale: 0.96 } : {}}
            style={{ background: saving ? "#e87474" : "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 50, padding: "9px 24px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", cursor: saving ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />Saving…</>
              : <><i className="ti ti-check" style={{ fontSize: 13 }} />{isEdit ? "Update" : "Create Assignment"}</>
            }
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteModal({ item, teacherName, onConfirm, onCancel, deleting }) {
  return (
    <ConfirmModal
      icon="ti-trash"
      title="Remove advisory assignment?"
      message={<>You're about to remove <strong style={{ color: "#1a0a0a" }}>{teacherName}</strong>'s advisory of <strong style={{ color: "#1a0a0a" }}>{item.grade_level} - {item.section}</strong>. They will lose access to that section's grades, attendance, and narrative reports.</>}
      loading={deleting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ── Table Row ─────────────────────────────────────────────────────────────────
function AdvisoryRow({ advisory, teacherName, onEdit, onDelete }) {
  return (
    <motion.tr variants={listVariants.item}>
      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-user-check" style={{ fontSize: 15, color: "#e03131" }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a" }}>{teacherName}</div>
        </div>
      </td>
      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle", fontSize: 13, color: "#5a4a4a" }}>
        {advisory.school_year}
      </td>
      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
        <span style={{ fontSize: 12.5, color: "#7a5050" }}>{SCHOOL_LEVEL_LABELS[advisory.school_level] || advisory.school_level}</span>
      </td>
      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: "#e3f0fd", color: "#1455a0" }}>
          {advisory.grade_level} · {advisory.section}
        </span>
      </td>
      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle", fontSize: 12.5, color: "#7a5050" }}>
        {advisory.strand || "—"}
      </td>
      <td style={{ padding: "13px 14px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 4 }}>
          <motion.button title="Edit" onClick={() => onEdit(advisory)}
            whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#fca5a5" }}
            whileTap={{ scale: 0.93 }}
            style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9a7070" }}>
            <i className="ti ti-pencil" style={{ fontSize: 13 }} />
          </motion.button>
          <motion.button title="Delete" onClick={() => onDelete(advisory)}
            whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#fca5a5" }}
            whileTap={{ scale: 0.93 }}
            style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090" }}>
            <i className="ti ti-trash" style={{ fontSize: 13 }} />
          </motion.button>
        </div>
      </td>
    </motion.tr>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function TeacherAdvisoriesPage() {
  usePageTitle("Teacher Advisories");
  const navigate = useNavigate();

  const [advisories, setAdvisories] = useState([]);
  const [teachers,   setTeachers]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [modal,      setModal]      = useState(null);
  const [toDelete,   setToDelete]   = useState(null);
  const [deleting,   setDeleting]   = useState(false);

  const [animated] = useState(false);
  const isFirstRender = !animated;

  const teacherMap = useMemo(() => {
    const map = new Map();
    teachers.forEach((t) => map.set(t.user_id, t.name));
    return map;
  }, [teachers]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [advisoryData, userData] = await Promise.all([
        getSectionAdvisories({ page_size: 500 }),
        getUsers(),
      ]);
      setAdvisories(Array.isArray(advisoryData) ? advisoryData : advisoryData?.results ?? []);
      setTeachers((Array.isArray(userData) ? userData : userData?.results ?? []).filter((u) => u.role === "teacher"));
    } catch (e) {
      toast.error(e.message || "Failed to load advisory assignments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const schoolYears = useMemo(() => {
    const unique = Array.from(new Set(advisories.map((a) => a.school_year)));
    return unique.sort().reverse();
  }, [advisories]);

  const filtered = useMemo(() => {
    let list = advisories;
    if (yearFilter !== "all") list = list.filter((a) => a.school_year === yearFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => {
        const teacherName = (teacherMap.get(a.teacher_user_id) || "").toLowerCase();
        return teacherName.includes(q) ||
          a.section.toLowerCase().includes(q) ||
          a.grade_level.toLowerCase().includes(q);
      });
    }
    return list;
  }, [advisories, yearFilter, search, teacherMap]);

  const hasFilters = yearFilter !== "all" || search.trim() !== "";

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteSectionAdvisory(toDelete.advisory_id);
      toast.success("Advisory assignment removed.");
      setToDelete(null);
      fetchData();
    } catch (e) {
      toast.error(e.message || "Failed to remove assignment.");
    } finally {
      setDeleting(false);
    }
  };

  const totalCount = advisories.length;
  const teacherCount = new Set(advisories.map((a) => a.teacher_user_id)).size;

  const STATS = [
    { label: "Assignments",     value: totalCount,        icon: "ti-user-check",  color: "#e03131", bg: "#fff0f0" },
    { label: "Teachers assigned", value: teacherCount,    icon: "ti-users",       color: "#1455a0", bg: "#e3f0fd" },
    { label: "Unassigned teachers", value: Math.max(0, teachers.length - teacherCount), icon: "ti-user-exclamation", color: "#b45309", bg: "#fef3e2" },
  ];

  return (
    <AppLayout>
      {/* ── Topbar ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        style={{ background: "white", borderBottom: "1px solid #f5eaea", padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>Teacher Advisories</div>
          <div style={{ fontSize: 11.5, color: "#b09090", marginTop: 1 }}>
            {loading ? "Loading…" : `${totalCount} assignments · ${teacherCount} teachers assigned`}
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
          whileTap={{ scale: 0.96 }}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}
          onClick={() => setModal({ mode: "create" })}>
          <i className="ti ti-plus" style={{ fontSize: 15 }} />New Assignment
        </motion.button>
      </motion.div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
          {STATS.map((s, idx) => (
            <motion.div
              key={s.label}
              initial={isFirstRender ? { y: 10, opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.28, delay: 0.06 + idx * 0.06, ease: "easeOut" }}
              style={{ background: "white", borderRadius: 14, padding: "16px 20px", border: "1px solid #f5eaea", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 12px rgba(224,49,49,0.06)" }}
            >
              <div style={{ width: 42, height: 42, borderRadius: 12, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className={`ti ${s.icon}`} style={{ fontSize: 18, color: s.color }} />
              </div>
              <div>
                {loading
                  ? <Sk w={40} h={20} r={4} />
                  : <AnimatedCount value={s.value} style={{ fontSize: 22, fontWeight: 700, color: "#1a0a0a", lineHeight: 1 }} />
                }
                <div style={{ fontSize: 11, color: "#a07878", marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Filter panel */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.18, ease: "easeOut" }}
          style={{ background: "white", borderRadius: 14, padding: "16px 20px", border: "1px solid #f5eaea", boxShadow: "0 2px 12px rgba(224,49,49,0.05)", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div className="search-wrap" style={{ display: "flex", alignItems: "center", gap: 10, background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, padding: "0 14px", height: 38, width: "100%", boxSizing: "border-box", transition: "border .15s, box-shadow .15s" }}>
            <i className="ti ti-search" style={{ fontSize: 14, color: "#c0a0a0", flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by teacher name, grade level, or section…"
              style={{ border: "none", outline: "none", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "transparent", width: "100%" }}
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                  onClick={() => setSearch("")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", display: "flex", alignItems: "center", padding: 0 }}>
                  <i className="ti ti-x" style={{ fontSize: 12 }} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 2 }}>School Year</span>
              {["all", ...schoolYears].map((y) => {
                const active = yearFilter === y;
                return (
                  <motion.button
                    key={y}
                    onClick={() => setYearFilter(y)}
                    style={{
                      height: 32, padding: "0 14px", borderRadius: 99,
                      border: `1.5px solid ${active ? "#e03131" : "#f0e4e4"}`,
                      background: active ? "#fff0f0" : "white",
                      color: active ? "#e03131" : "#9a7070",
                      fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    {y === "all" ? "All" : y}
                  </motion.button>
                );
              })}
            </div>

            <AnimatePresence>
              {hasFilters && (
                <motion.button
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  onClick={() => { setYearFilter("all"); setSearch(""); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, border: "1.5px solid #fde2de", background: "white", color: "#e03131", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                  <i className="ti ti-x" style={{ fontSize: 11 }} />Clear
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.24, ease: "easeOut" }}
          style={{ background: "white", border: "1px solid #f5eaea", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 16px rgba(224,49,49,0.06)" }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fdfafa" }}>
                {[
                  { label: "Teacher",           w: "26%" },
                  { label: "School Year",       w: "14%" },
                  { label: "School Level",      w: "18%" },
                  { label: "Grade & Section",   w: "18%" },
                  { label: "Strand",            w: "14%" },
                  { label: "",                  w: "10%" },
                ].map(({ label, w }) => (
                  <th key={label} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "13px 18px", borderBottom: "1px solid #f5eaea", textTransform: "uppercase", letterSpacing: "0.07em", width: w }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <motion.tbody
              variants={listVariants.container}
              initial={isFirstRender ? "hidden" : false}
              animate="visible"
            >
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Sk w={36} h={36} r={10} />
                          <Sk w={140} h={13} />
                        </div>
                      </td>
                      {[80, 100, 100, 60].map((w, j) => (
                        <td key={j} style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0" }}><Sk w={w} h={13} /></td>
                      ))}
                    </tr>
                  ))
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "64px 16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <i className="ti ti-user-off" style={{ fontSize: 22, color: "#e08080" }} />
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#7a5050" }}>
                            {hasFilters ? "No assignments match your filters" : "No advisory assignments found"}
                          </div>
                          <div style={{ fontSize: 12, color: "#b09090" }}>
                            {hasFilters ? "Try adjusting your search or filters" : "Assign a teacher to a section to get started"}
                          </div>
                          {!hasFilters && (
                            <motion.button
                              whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => setModal({ mode: "create" })}
                              style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
                              <i className="ti ti-plus" style={{ fontSize: 14 }} />New Assignment
                            </motion.button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                  : filtered.map((a) => (
                      <AdvisoryRow
                        key={a.advisory_id}
                        advisory={a}
                        teacherName={teacherMap.get(a.teacher_user_id) || `User #${a.teacher_user_id}`}
                        onEdit={(adv) => setModal({ mode: "edit", advisory: adv })}
                        onDelete={(adv) => setToDelete(adv)}
                      />
                    ))
              }
            </motion.tbody>
          </table>
        </motion.div>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {modal && (
          <AdvisoryModal
            key="advisory-modal"
            advisory={modal.mode === "edit" ? modal.advisory : null}
            teachers={teachers}
            onClose={() => setModal(null)}
            onSaved={fetchData}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toDelete && (
          <DeleteModal
            key="delete-modal"
            item={toDelete}
            teacherName={teacherMap.get(toDelete.teacher_user_id) || `User #${toDelete.teacher_user_id}`}
            onConfirm={handleDelete}
            onCancel={() => setToDelete(null)}
            deleting={deleting}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
