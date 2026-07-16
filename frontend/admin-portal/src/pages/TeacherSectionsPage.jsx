import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import { listVariants } from "../utils/motion";
import { getMySections } from "../api/enrollmentApi";
import { getUsers } from "../api/identityApi";
import { getCurrentUser } from "../utils/auth";

const SCHOOL_LEVEL_LABELS = {
  nursery: "Nursery",
  kindergarten: "Kindergarten",
  elementary: "Elementary",
  junior_highschool: "Junior High School",
  senior_highschool: "Senior High School",
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);

function fullName(s) {
  if (!s) return "";
  if (s.full_name) return s.full_name;
  return [s.first_name, s.middle_name, s.last_name, s.suffix].filter(Boolean).join(" ");
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ entry, expanded, onToggle }) {
  const { advisory, student_count, students, subjects } = entry;
  const [tab, setTab] = useState("students");

  return (
    <motion.div
      layout
      style={{ background: "white", border: "1px solid #f5eaea", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 16px rgba(224,49,49,0.06)" }}
    >
      <div
        onClick={onToggle}
        style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-users-group" style={{ fontSize: 18, color: "#e03131" }} />
          </div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#1a0a0a" }}>
              {advisory.grade_level} · {advisory.section}
              {advisory.strand ? ` (${advisory.strand})` : ""}
            </div>
            <div style={{ fontSize: 11.5, color: "#b09090", marginTop: 2 }}>
              {SCHOOL_LEVEL_LABELS[advisory.school_level] || advisory.school_level} · SY {advisory.school_year}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: "#e3f0fd", color: "#1455a0" }}>
            {student_count} student{student_count === 1 ? "" : "s"}
          </span>
          <i className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 16, color: "#c0a0a0" }} />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ overflow: "hidden", borderTop: "1px solid #f5eaea" }}
          >
            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, padding: "12px 22px 0" }}>
              {[
                { key: "students", label: `Students (${students.length})`, icon: "ti-users" },
                { key: "subjects", label: `Subjects (${subjects.length})`, icon: "ti-book" },
              ].map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
                      borderRadius: "10px 10px 0 0", border: "none",
                      borderBottom: `2px solid ${active ? "#e03131" : "transparent"}`,
                      background: "transparent", cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, fontWeight: active ? 700 : 500,
                      color: active ? "#e03131" : "#9a7070",
                    }}
                  >
                    <i className={`ti ${t.icon}`} style={{ fontSize: 13 }} />{t.label}
                  </button>
                );
              })}
            </div>

            {tab === "students" ? (
              students.length === 0 ? (
                <div style={{ padding: "28px 22px", textAlign: "center", fontSize: 12.5, color: "#b09090" }}>
                  No enrolled students in this section yet.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#fdfafa" }}>
                      {["Name", "LRN", "Student No.", "Sex"].map((label) => (
                        <th key={label} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "10px 22px", borderBottom: "1px solid #f5eaea", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <motion.tbody variants={listVariants.container} initial="hidden" animate="visible">
                    {students.map((s) => (
                      <motion.tr key={s.student_id} variants={listVariants.item}>
                        <td style={{ padding: "11px 22px", borderBottom: "1px solid #f9f0f0", fontWeight: 600, color: "#1a0a0a" }}>
                          {fullName(s)}
                        </td>
                        <td style={{ padding: "11px 22px", borderBottom: "1px solid #f9f0f0", color: "#7a5050" }}>{s.lrn}</td>
                        <td style={{ padding: "11px 22px", borderBottom: "1px solid #f9f0f0", color: "#7a5050" }}>{s.student_number}</td>
                        <td style={{ padding: "11px 22px", borderBottom: "1px solid #f9f0f0", color: "#7a5050" }}>{s.sex}</td>
                      </motion.tr>
                    ))}
                  </motion.tbody>
                </table>
              )
            ) : subjects.length === 0 ? (
              <div style={{ padding: "28px 22px", textAlign: "center", fontSize: 12.5, color: "#b09090" }}>
                No subjects configured for this grade level yet.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#fdfafa" }}>
                    {["Code", "Subject", "Semester"].map((label) => (
                      <th key={label} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "10px 22px", borderBottom: "1px solid #f5eaea", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <motion.tbody variants={listVariants.container} initial="hidden" animate="visible">
                  {subjects.map((sub) => (
                    <motion.tr key={sub.subject_id} variants={listVariants.item}>
                      <td style={{ padding: "11px 22px", borderBottom: "1px solid #f9f0f0", color: "#7a5050" }}>{sub.subject_code}</td>
                      <td style={{ padding: "11px 22px", borderBottom: "1px solid #f9f0f0", fontWeight: 600, color: "#1a0a0a" }}>{sub.subject_name}</td>
                      <td style={{ padding: "11px 22px", borderBottom: "1px solid #f9f0f0", color: "#7a5050" }}>{sub.semester || "—"}</td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function TeacherSectionsPage() {
  usePageTitle("My Sections");
  const navigate = useNavigate();

  const currentUser = getCurrentUser();
  const isTeacher = currentUser?.role === "teacher";

  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);

  // Admin/registrar: load the teacher list for the picker.
  useEffect(() => {
    if (isTeacher) return;
    getUsers()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.results ?? [];
        setTeachers(list.filter((u) => u.role === "teacher"));
      })
      .catch(() => toast.error("Failed to load teacher list."));
  }, [isTeacher]);

  const fetchSections = useCallback(async (teacherUserId) => {
    setLoading(true);
    try {
      const params = teacherUserId ? { teacher_user_id: teacherUserId } : {};
      const data = await getMySections(params);
      setSections(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e.message || "Failed to load sections.");
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }

    if (isTeacher) {
      fetchSections();
    } else if (selectedTeacherId) {
      fetchSections(selectedTeacherId);
    } else {
      setSections([]);
      setLoading(false);
    }
  }, [isTeacher, selectedTeacherId, fetchSections, navigate]);

  const totalStudents = useMemo(
    () => sections.reduce((sum, e) => sum + e.student_count, 0),
    [sections]
  );

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
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>My Sections</div>
          <div style={{ fontSize: 11.5, color: "#b09090", marginTop: 1 }}>
            {loading ? "Loading…" : `${sections.length} section${sections.length === 1 ? "" : "s"} · ${totalStudents} students`}
          </div>
        </div>

        {!isTeacher && (
          <select
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
            style={{ border: "1.5px solid #fde2de", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none", minWidth: 240 }}
          >
            <option value="">Select a teacher…</option>
            {teachers.map((t) => (
              <option key={t.user_id} value={t.user_id}>{t.name} ({t.email})</option>
            ))}
          </select>
        )}
      </motion.div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ background: "white", border: "1px solid #f5eaea", borderRadius: 16, padding: "18px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Sk w={42} h={42} r={12} />
                <div style={{ flex: 1 }}>
                  <Sk w={180} h={15} />
                  <div style={{ marginTop: 8 }}><Sk w={140} h={11} /></div>
                </div>
              </div>
            </div>
          ))
        ) : !isTeacher && !selectedTeacherId ? (
          <div style={{ textAlign: "center", padding: "80px 16px" }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <i className="ti ti-user-search" style={{ fontSize: 22, color: "#e08080" }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#7a5050" }}>Select a teacher to view their sections</div>
          </div>
        ) : sections.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 16px" }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <i className="ti ti-users-group" style={{ fontSize: 22, color: "#e08080" }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#7a5050" }}>No section assignments found</div>
            <div style={{ fontSize: 12, color: "#b09090", marginTop: 4 }}>
              {isTeacher ? "You haven't been assigned as an adviser of any section yet." : "This teacher has no advisory assignments yet."}
            </div>
          </div>
        ) : (
          sections.map((entry) => {
            const key = entry.advisory.advisory_id;
            return (
              <SectionCard
                key={key}
                entry={entry}
                expanded={expandedKey === key}
                onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
              />
            );
          })
        )}
      </div>
    </AppLayout>
  );
}
