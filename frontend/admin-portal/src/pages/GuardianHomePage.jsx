import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import GuardianLayout from "../components/GuardianLayout";
import { getEnrollments } from "../api/enrollmentApi";
import { getCurrentUser } from "../utils/auth";

const LEVEL_LABELS = {
  nursery: "Nursery", kindergarten: "Kindergarten", elementary: "Elementary",
  junior_highschool: "Junior High School", senior_highschool: "Senior High School",
};

const STATUS_META = {
  enrolled:  { label: "Enrolled",  color: "#2e6b0d", bg: "#e8f5e0" },
  pending:   { label: "Pending",   color: "#854f0b", bg: "#faeeda" },
  completed: { label: "Completed", color: "#1455a0", bg: "#e3f0fd" },
  cancelled: { label: "Cancelled", color: "#5c5752", bg: "#f0ede8" },
};

const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);

// Pick the enrollment to feature per child: prefer an active (enrolled/pending)
// one, else the most recent by school year / id.
function pickPrimary(enrollments) {
  const active = enrollments.filter((e) => ["enrolled", "pending"].includes(e.enrollment_status));
  const pool = active.length ? active : enrollments;
  return [...pool].sort((a, b) =>
    (b.school_year || "").localeCompare(a.school_year || "") || b.enrollment_id - a.enrollment_id
  )[0];
}

export default function GuardianHomePage() {
  usePageTitle("My Children");
  const navigate = useNavigate();
  const user = getCurrentUser();

  const [children, setChildren] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  const fetchChildren = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getEnrollments({ page_size: 500 });
      const rows = Array.isArray(data) ? data : data?.results ?? [];

      // Group enrollments by student → one card per child.
      const byStudent = new Map();
      rows.forEach((e) => {
        const sid = e.student_id ?? e.student;
        if (!byStudent.has(sid)) byStudent.set(sid, []);
        byStudent.get(sid).push(e);
      });

      const kids = Array.from(byStudent.values()).map((enrollments) => {
        const primary = pickPrimary(enrollments);
        return {
          student_id:   primary.student_id ?? primary.student,
          name:         primary.student_detail?.full_name || primary.student_name || "Student",
          lrn:          primary.student_detail?.lrn,
          primary,
        };
      });
      kids.sort((a, b) => a.name.localeCompare(b.name));
      setChildren(kids);
    } catch (e) {
      setError(e.message || "Failed to load your children's records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/login"); return; }
    fetchChildren(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GuardianLayout>
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        style={{ marginBottom: 24 }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>
          Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
        </h1>
        <p style={{ fontSize: 14, color: "#a07878", marginTop: 4 }}>
          Here are your children's academic records. Select a child to view grades, attendance, and billing.
        </p>
      </motion.div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 15 }} />{error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ background: "white", borderRadius: 16, padding: 22, border: "1px solid #f5eaea" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <Sk w={48} h={48} r={12} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Sk w="70%" h={15} /><Sk w="40%" h={12} /></div>
              </div>
              <Sk w="100%" h={40} r={10} />
            </div>
          ))}
        </div>
      ) : children.length === 0 ? (
        <div style={{ textAlign: "center", padding: "72px 16px", background: "white", borderRadius: 16, border: "1px solid #f5eaea" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <i className="ti ti-users" style={{ fontSize: 24, color: "#e08080" }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#7a5050" }}>No linked students yet</div>
          <div style={{ fontSize: 13, color: "#b09090", marginTop: 6, maxWidth: 380, marginInline: "auto", lineHeight: 1.6 }}>
            Your account hasn't been linked to a student record yet. Please contact the school's registrar or administrator to complete the link.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
          {children.map((child, idx) => {
            const e = child.primary;
            const st = STATUS_META[e.enrollment_status] || STATUS_META.enrolled;
            return (
              <motion.div
                key={child.student_id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.05 + idx * 0.05 }}
                onClick={() => navigate(`/guardian/child/${e.enrollment_id}`)}
                whileHover={{ y: -3, boxShadow: "0 10px 30px rgba(224,49,49,0.12)" }}
                style={{ background: "white", borderRadius: 16, padding: 22, border: "1px solid #f5eaea", boxShadow: "0 2px 12px rgba(224,49,49,0.06)", cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg,#fde8e8,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: "#e03131", flexShrink: 0 }}>
                    {child.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{child.name}</div>
                    {child.lrn && <div style={{ fontSize: 11.5, color: "#b09090", fontFamily: "monospace", marginTop: 2 }}>LRN {child.lrn}</div>}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fdfafa", border: "1px solid #f5eaea", borderRadius: 10, padding: "10px 14px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a" }}>{e.grade_level} · {e.section}</div>
                    <div style={{ fontSize: 11, color: "#a07878", marginTop: 2 }}>{LEVEL_LABELS[e.school_level] || e.school_level} · SY {e.school_year}</div>
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 99, background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 14, fontSize: 12.5, fontWeight: 600, color: "#e03131" }}>
                  View records <i className="ti ti-arrow-right" style={{ fontSize: 14 }} />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </GuardianLayout>
  );
}
