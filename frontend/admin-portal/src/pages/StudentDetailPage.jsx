import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "../components/AppLayout";
import { useNavigate, useParams } from "react-router-dom";
import { getStudent } from "../api/studentApi";
import { getGuardiansByStudent, patchGuardian, getGuardiansByUserIds } from "../api/guardianApi";
import { getSiblingsByStudent } from "../api/siblingApi";
import { getPreviousSchoolsByStudent } from "../api/previousSchoolApi";
import { getEnrollments } from "../api/enrollmentApi";
import { getStudentLedger } from "../api/billingApi";
import { getUsers } from "../api/identityApi";
import { getCurrentUser, hasAnyRole, BILLING_ROLES } from "../utils/auth";
import { modalVariants, springTransition } from "../utils/motion";

const CAN_LINK_ROLES = ["super_admin", "admin", "registrar"];

// ── Guardian account-linking modal ────────────────────────────────────────────
function LinkAccountModal({ guardian, onClose, onLinked }) {
  const [users, setUsers]     = useState([]);
  const [linkedMap, setLinkedMap] = useState({}); // user_id -> [student names already linked elsewhere]
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(guardian.user_id ?? "");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  useEffect(() => {
    getUsers()
      .then(async (data) => {
        const guardianUsers = (Array.isArray(data) ? data : data?.results ?? []).filter((u) => u.role === "guardian");
        setUsers(guardianUsers);
        try {
          const linkedData = await getGuardiansByUserIds(guardianUsers.map((u) => u.user_id));
          const linkedRows = Array.isArray(linkedData) ? linkedData : linkedData?.results ?? [];
          const map = {};
          for (const row of linkedRows) {
            if (row.guardian_id === guardian.guardian_id || !row.student_name) continue;
            (map[row.user_id] ??= []).push(row.student_name);
          }
          setLinkedMap(map);
        } catch { /* non-critical — hints just won't show */ }
      })
      .catch((e) => setError(e.message || "Failed to load guardian accounts."))
      .finally(() => setLoading(false));
  }, [guardian.guardian_id]);

  async function handleSave(unlink = false) {
    setSaving(true); setError("");
    try {
      const value = unlink ? null : (selected ? parseInt(selected, 10) : null);
      const updated = await patchGuardian(guardian.guardian_id, { user_id: value });
      toast.success(unlink ? "Account unlinked." : "Guardian account linked.");
      onLinked(updated);
      onClose();
    } catch (e) {
      const msg = e.message || "Failed to update link.";
      setError(msg); toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const inp = { width: "100%", border: "1.5px solid #fde2de", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none", boxSizing: "border-box" };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}>
      <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" transition={springTransition}
        style={{ background: "white", borderRadius: 20, width: 480, boxShadow: "0 24px 64px rgba(224,49,49,0.18)" }}>
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a" }}>Link Login Account</div>
          <div style={{ fontSize: 11.5, color: "#b09090", marginTop: 2 }}>
            Give <strong>{guardian.full_name}</strong> access to the parent portal for this student.
          </div>
        </div>
        <div style={{ padding: "22px 28px" }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 16 }}>{error}</div>
          )}
          <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Guardian account</label>
          {loading ? (
            <div style={{ fontSize: 13, color: "#b09090" }}>Loading accounts…</div>
          ) : users.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#a07878", lineHeight: 1.6, background: "#fdfafa", border: "1px solid #f5eaea", borderRadius: 10, padding: "12px 14px" }}>
              No guardian login accounts exist yet. Create one first in <strong>Users</strong> (role “Guardian”), then return here to link it.
            </div>
          ) : (
            <select value={selected} onChange={(e) => setSelected(e.target.value)} style={inp}>
              <option value="">— Not linked —</option>
              {users.map((u) => {
                const linkedTo = linkedMap[u.user_id];
                return (
                  <option key={u.user_id} value={u.user_id}>
                    {u.name} ({u.email}){linkedTo?.length ? ` — linked to: ${linkedTo.join(", ")}` : ""}
                  </option>
                );
              })}
            </select>
          )}
          <div style={{ fontSize: 11, color: "#b09090", marginTop: 8, lineHeight: 1.5 }}>
            Tip: link the same account across each of a parent's children so they see all of them in one portal.
          </div>
        </div>
        <div style={{ padding: "16px 28px 24px", display: "flex", justifyContent: "space-between", gap: 10, borderTop: "1px solid #f5eaea" }}>
          <div>
            {guardian.user_id && (
              confirmUnlink ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#7a5050" }}>Unlink this account?</span>
                  <button onClick={() => setConfirmUnlink(false)} disabled={saving}
                    style={{ background: "transparent", color: "#9a7070", border: "1.5px solid #fde2de", borderRadius: 50, padding: "9px 14px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: saving ? "not-allowed" : "pointer" }}>
                    No
                  </button>
                  <button onClick={() => handleSave(true)} disabled={saving}
                    style={{ background: "transparent", color: "#c92a2a", border: "1.5px solid #fca5a5", borderRadius: 50, padding: "9px 18px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: saving ? "not-allowed" : "pointer" }}>
                    Yes, unlink
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmUnlink(true)} disabled={saving}
                  style={{ background: "transparent", color: "#c92a2a", border: "1.5px solid #fca5a5", borderRadius: 50, padding: "9px 18px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: saving ? "not-allowed" : "pointer" }}>
                  Unlink
                </button>
              )
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ background: "transparent", color: "#9a7070", border: "1.5px solid #fde2de", borderRadius: 50, padding: "9px 22px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer" }}>Cancel</button>
            <button onClick={() => handleSave(false)} disabled={saving || loading || users.length === 0}
              style={{ background: saving ? "#e87474" : "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 50, padding: "9px 24px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", cursor: saving || loading ? "not-allowed" : "pointer" }}>
              {saving ? "Saving…" : "Save link"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}



// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_META = {
  active:      { bg: "#e8f5e0", color: "#2e6b0d", dot: "#4caf50", label: "Active" },
  inactive:    { bg: "#f0ede8", color: "#5c5752", dot: "#9e9e9e", label: "Inactive" },
  transferred: { bg: "#fef3e2", color: "#7a4a08", dot: "#ff9800", label: "Transferred" },
  graduated:   { bg: "#e3f0fd", color: "#1455a0", dot: "#2196f3", label: "Graduated" },
  dropped:     { bg: "#fde8e8", color: "#9b2020", dot: "#f44336", label: "Dropped" },
};

// ── Avatar palette (deterministic by name) ────────────────────────────────────
const PALETTES = [
  { bg: "#fde8e8", color: "#c0392b" },
  { bg: "#e8f0fd", color: "#2563eb" },
  { bg: "#e8fdf0", color: "#16a34a" },
  { bg: "#fdf5e8", color: "#d97706" },
  { bg: "#f0e8fd", color: "#7c3aed" },
  { bg: "#fde8f8", color: "#be185d" },
  { bg: "#e8fdfd", color: "#0891b2" },
];
const getPalette = (name = "") => PALETTES[name.charCodeAt(0) % PALETTES.length];

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age;
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function capitalize(str = "") {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: "linear-gradient(90deg, #f5eaea 25%, #fde8e8 50%, #f5eaea 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.6s ease-in-out infinite",
  }} />
);

// ── Reusable info row ─────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, mono = false }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "11px 0", borderBottom: "1px solid #f9f0f0",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9, background: "#fff4f2",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 14, color: "#e03131" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
          {label}
        </div>
        <div style={{
          fontSize: 13.5, color: "#1a0a0a", fontWeight: 500, lineHeight: 1.5,
          fontFamily: mono ? "monospace" : "inherit",
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function SectionCard({ title, icon, children, badge, motionProps = {} }) {
  return (
    <motion.div
      {...motionProps}
      style={{
        background: "white", borderRadius: 16, border: "1px solid #f5eaea",
        boxShadow: "0 2px 16px rgba(224,49,49,0.05)", overflow: "hidden",
        ...motionProps.style,
      }}
    >
      {/* Accent strip — matches the hero card's top gradient */}
      <div style={{ height: 4, background: "linear-gradient(to right, #e03131, #ff6b6b, #fca5a5, #fde8e8)" }} />
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 22px", borderBottom: "1px solid #f9f0f0",
        background: "linear-gradient(to right, #fff8f8, white)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "linear-gradient(135deg, #fff0f0, #fde8e8)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <i className={`ti ${icon}`} style={{ fontSize: 16, color: "#e03131" }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1a0a0a" }}>
            {title}
          </span>
        </div>
        {badge != null && (
          <span style={{
            background: "#fff0f0", color: "#e03131", borderRadius: 99,
            fontSize: 11, fontWeight: 700, padding: "3px 10px", border: "1px solid #fca5a5",
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ padding: "6px 22px 14px" }}>
        {children}
      </div>
    </motion.div>
  );
}

// ── Empty state inside a section ──────────────────────────────────────────────
function EmptySection({ message }) {
  return (
    <div style={{ padding: "24px 0", textAlign: "center", color: "#c0a0a0", fontSize: 13, fontStyle: "italic" }}>
      {message}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

const TAB_ORDER = ["personal", "household", "guardians", "family", "schools", "enrollments", "ledger"];

export default function StudentDetailPage() {
  usePageTitle("Student Details");
  const { id } = useParams();
  const navigate = useNavigate();

  const [student,       setStudent]       = useState(null);
  const [guardians,     setGuardians]     = useState([]);
  const [siblings,      setSiblings]      = useState([]);
  const [schools,       setSchools]       = useState([]);
  const [enrollments,   setEnrollments]   = useState([]);
  const [ledger,        setLedger]        = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState("personal");
  const [linkGuardian,  setLinkGuardian]  = useState(null); // guardian being linked to an account

  const canLink = hasAnyRole(getCurrentUser(), CAN_LINK_ROLES);
  // getStudentLedger hits a billing-service endpoint that's BILLING_ROLES-only
  // even though this route allows every staff role — skip the doomed fetch
  // for teacher/registrar and show an accurate message instead of "Failed to
  // load financial history. Check that the billing service is running."
  // (which is misleading — the service is fine, the role just can't see it).
  const canViewBilling = hasAnyRole(getCurrentUser(), BILLING_ROLES);

  const prevTabRef    = useRef("personal");
  const visitedTabs   = useRef(new Set(["personal"]));
  const [tabDirection, setTabDirection] = useState(1); // 1 = right, -1 = left

  function handleTabChange(tabId) {
    const prevIdx = TAB_ORDER.indexOf(prevTabRef.current);
    const nextIdx = TAB_ORDER.indexOf(tabId);
    setTabDirection(nextIdx > prevIdx ? 1 : -1);
    prevTabRef.current = tabId;
    visitedTabs.current.add(tabId);
    setActiveTab(tabId);
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getStudent(id),
      getGuardiansByStudent(id).catch(() => []),
      getSiblingsByStudent(id).catch(() => []),
      getPreviousSchoolsByStudent(id).catch(() => []),
      getEnrollments({ student: id, page_size: 100, ordering: "-school_year,-enrollment_id" }).catch(() => ({})),
    ]).then(([s, g, sib, sch, enrData]) => {
      setStudent(s);
      setGuardians(Array.isArray(g) ? g : g?.results ?? []);
      setSiblings(Array.isArray(sib) ? sib : sib?.results ?? []);
      setSchools(Array.isArray(sch) ? sch : sch?.results ?? []);
      setEnrollments(Array.isArray(enrData) ? enrData : enrData?.results ?? []);
    }).finally(() => setLoading(false));
  }, [id]);

  // Lazy-load ledger only when the tab is first opened
  useEffect(() => {
    if (activeTab !== "ledger" || ledger !== null || !id) return;
    if (!canViewBilling) { setLedger({ forbidden: true }); return; }
    setLedgerLoading(true);
    getStudentLedger(id)
      .then(setLedger)
      .catch(() => setLedger({ error: true }))
      .finally(() => setLedgerLoading(false));
  }, [activeTab, id, ledger, canViewBilling]);

  const TABS = [
    { id: "personal",    label: "Personal",     icon: "ti-user"           },
    { id: "household",   label: "Household",     icon: "ti-home"           },
    { id: "guardians",   label: "Guardians",     icon: "ti-users",   count: guardians.length   },
    { id: "family",      label: "Siblings",      icon: "ti-heart",   count: siblings.length    },
    { id: "schools",     label: "Prev. Schools", icon: "ti-school",  count: schools.length     },
    { id: "enrollments", label: "Enrollments",   icon: "ti-clipboard-list", count: enrollments.length },
    { id: "ledger",      label: "Financial History", icon: "ti-receipt"   },
  ];

  const palette    = getPalette(student?.last_name ?? "");
  const statusMeta = STATUS_META[student?.status] ?? STATUS_META.inactive;
  const age        = calcAge(student?.birth_date);
  const fullName   = student
    ? [student.first_name, student.middle_name, student.last_name, student.suffix]
        .filter(Boolean).join(" ")
    : "";

  const isFirstRender = useIsFirstRender();

  const dir = tabDirection;
  const tabVariants = {
    enter:  { x: dir * 18, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit:   { x: dir * -18, opacity: 0 },
  };

  return (
    <AppLayout>

          {/* Topbar */}
          <div style={{
            background:"white", borderBottom:"1px solid #f5eaea",
            padding:"0 28px", height:58, display:"flex", alignItems:"center",
            justifyContent:"space-between", flexShrink:0,
            boxShadow:"0 1px 8px rgba(224,49,49,0.04)",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12 }}
                style={{ display:"flex", alignItems:"center", gap:6, height:34, padding:"0 14px", border:"1px solid #f0e4e4", borderRadius:9, background:"white", fontSize:13, color:"#9a7070", fontFamily:"'DM Sans', sans-serif", fontWeight:500, cursor:"pointer" }}
                onClick={() => navigate("/students")}
              >
                <i className="ti ti-arrow-left" style={{ fontSize:13 }} />
                Students
              </motion.button>
              <i className="ti ti-chevron-right" style={{ fontSize:12, color:"#d0b8b8" }} />
              <span style={{ fontSize:13, color:"#1a0a0a", fontWeight:600 }}>
                {loading ? "Loading…" : fullName}
              </span>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {/* <button style={{ width:36, height:36, border:"1px solid #f5eaea", borderRadius:10, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070", position:"relative" }}>
                <i className="ti ti-bell" style={{ fontSize:16 }} />
                <span style={{ width:8, height:8, background:"#e03131", borderRadius:"50%", position:"absolute", top:6, right:6, border:"2px solid white" }} />
              </button> */}
              <AnimatePresence>
                {!loading && student && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.16 }}
                    whileHover={{ borderColor: "#e03131", color: "#e03131" }}
                    whileTap={{ scale: 0.96 }}
                    style={{ display:"flex", alignItems:"center", gap:8, height:36, padding:"0 16px", border:"1.5px solid #f0e4e4", borderRadius:10, background:"white", fontSize:13, color:"#9a7070", fontFamily:"'DM Sans', sans-serif", fontWeight:600, cursor:"pointer" }}
                    onClick={() => navigate(`/students/${student.student_id}/edit`)}
                  >
                    <i className="ti ti-pencil" style={{ fontSize:13 }} />
                    Edit Student
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", display:"flex", flexDirection:"column", gap:22 }}>

            {loading ? (
              /* ── Skeleton hero + cards ── */
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                <div style={{ background:"white", borderRadius:20, padding:"28px 28px", border:"1px solid #f5eaea", display:"flex", gap:20, alignItems:"center" }}>
                  <Sk w={80} h={80} r={99} />
                  <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10 }}>
                    <Sk w={220} h={22} />
                    <Sk w={140} h={14} />
                    <div style={{ display:"flex", gap:8, marginTop:4 }}>
                      <Sk w={80} h={28} r={99} />
                      <Sk w={80} h={28} r={99} />
                    </div>
                  </div>
                </div>
                {[1,2,3].map(i => (
                  <div key={i} style={{ background:"white", borderRadius:16, padding:"20px 22px", border:"1px solid #f5eaea", display:"flex", flexDirection:"column", gap:14 }}>
                    <Sk w={140} h={16} />
                    <Sk w="80%" h={13} />
                    <Sk w="60%" h={13} />
                    <Sk w="70%" h={13} />
                  </div>
                ))}
              </div>
            ) : !student ? (
              <div style={{ textAlign:"center", padding:"80px 0", color:"#b09090", fontSize:15 }}>
                Student not found.
              </div>
            ) : (
              <>
                {/* ── Hero profile card ── */}
                <motion.div
                  initial={isFirstRender ? { y: 16, opacity: 0 } : false}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.28, ease: "easeOut", delay: isFirstRender ? 0.06 : 0 }}
                  style={{
                    background:"white", borderRadius:20,
                    border:"1px solid #f5eaea",
                    boxShadow:"0 4px 24px rgba(224,49,49,0.07)",
                    overflow:"hidden",
                  }}
                >
                  {/* Top accent strip */}
                  <div style={{
                    height:6,
                    background:"linear-gradient(to right, #e03131, #ff6b6b, #fca5a5, #fde8e8)",
                  }} />

                  <div style={{ padding:"26px 28px", display:"flex", alignItems:"flex-start", gap:22, flexWrap:"wrap" }}>
                    {/* Avatar */}
                    <motion.div
                      initial={isFirstRender ? { scale: 0.82, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1], delay: isFirstRender ? 0.12 : 0 }}
                      style={{
                        width:76, height:76, borderRadius:"50%",
                        background:`linear-gradient(135deg, ${palette.bg}, ${palette.color}22)`,
                        border:`3px solid ${palette.color}33`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:26, fontWeight:700, color:palette.color,
                        flexShrink:0, letterSpacing:"0.02em",
                        boxShadow:`0 4px 20px ${palette.color}22`,
                      }}
                    >
                      {`${student.first_name?.[0] ?? ""}${student.last_name?.[0] ?? ""}`.toUpperCase()}
                    </motion.div>

                    {/* Name + identifiers */}
                    <div style={{ flex:1, minWidth:200 }}>
                      <div style={{ fontSize:22, fontWeight:700, color:"#1a0a0a", lineHeight:1.2, letterSpacing:"-0.01em" }}>
                        {fullName}
                      </div>
                      <div style={{ fontSize:12, color:"#b09090", marginTop:5, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                        {student.student_number && (
                          <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <i className="ti ti-id-badge" style={{ fontSize:13 }} />
                            {student.student_number}
                          </span>
                        )}
                        {student.lrn && (
                          <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <i className="ti ti-fingerprint" style={{ fontSize:13 }} />
                            LRN {student.lrn}
                          </span>
                        )}
                        {student.religion && (
                          <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <i className="ti ti-star" style={{ fontSize:13 }} />
                            {student.religion}
                          </span>
                        )}
                      </div>

                      {/* Badges */}
                      <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap", alignItems:"center" }}>
                        {/* Status */}
                        <span style={{
                          display:"inline-flex", alignItems:"center", gap:6,
                          padding:"5px 13px", borderRadius:99,
                          background:statusMeta.bg, color:statusMeta.color,
                          fontSize:12, fontWeight:700,
                        }}>
                          <span style={{ width:7, height:7, borderRadius:"50%", background:statusMeta.dot }} />
                          {statusMeta.label}
                        </span>

                        {/* Sex */}
                        <span style={{
                          display:"inline-flex", alignItems:"center", gap:6,
                          padding:"5px 13px", borderRadius:99,
                          background: student.sex === "male" ? "#e8f0fd" : "#fde8f8",
                          color: student.sex === "male" ? "#2563eb" : "#be185d",
                          fontSize:12, fontWeight:600,
                        }}>
                          <i className={`ti ${student.sex === "male" ? "ti-mars" : "ti-venus"}`} style={{ fontSize:13 }} />
                          {capitalize(student.sex)}
                        </span>

                        {/* Age */}
                        {age !== null && (
                          <span style={{
                            display:"inline-flex", alignItems:"center", gap:6,
                            padding:"5px 13px", borderRadius:99,
                            background:"#f0f9f4", color:"#1a6640",
                            fontSize:12, fontWeight:600,
                          }}>
                            <i className="ti ti-cake" style={{ fontSize:13 }} />
                            {age} years old
                          </span>
                        )}

                        {/* Guardian count */}
                        {guardians.length > 0 && (
                          <span style={{
                            display:"inline-flex", alignItems:"center", gap:6,
                            padding:"5px 13px", borderRadius:99,
                            background:"#fdf5e8", color:"#92500a",
                            fontSize:12, fontWeight:600,
                          }}>
                            <i className="ti ti-users" style={{ fontSize:13 }} />
                            {guardians.length} Guardian{guardians.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick contact */}
                    <div style={{ display:"flex", flexDirection:"column", gap:8, alignSelf:"center" }}>
                      {student.mobile_number && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#5a4a4a" }}>
                          <div style={{ width:30, height:30, borderRadius:8, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <i className="ti ti-phone" style={{ fontSize:13, color:"#e03131" }} />
                          </div>
                          {student.mobile_number}
                        </div>
                      )}
                      {student.email && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#5a4a4a" }}>
                          <div style={{ width:30, height:30, borderRadius:8, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <i className="ti ti-mail" style={{ fontSize:13, color:"#e03131" }} />
                          </div>
                          {student.email}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>

                {/* ── Tab bar ── */}
                <motion.div
                  initial={isFirstRender ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: "easeOut", delay: isFirstRender ? 0.16 : 0 }}
                  style={{
                    display:"flex", gap:2,
                    background:"white", borderRadius:14,
                    border:"1px solid #f5eaea", padding:6,
                    boxShadow:"0 2px 10px rgba(224,49,49,0.04)",
                  }}
                >
                  {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <motion.button
                        key={tab.id}
                        whileTap={{ scale: 0.96 }}
                        transition={{ duration: 0.1 }}
                        style={{
                          position:"relative", flex:1, display:"flex", alignItems:"center",
                          justifyContent:"center", gap:7, height:38, borderRadius:10, border:"none",
                          background:"transparent",
                          color: isActive ? "white" : "#9a7070",
                          fontSize:12.5, fontWeight: isActive ? 700 : 500,
                          fontFamily:"'DM Sans', sans-serif",
                          cursor:"pointer", zIndex:1,
                        }}
                        onClick={() => handleTabChange(tab.id)}
                      >
                        {/* Sliding active pill */}
                        {isActive && (
                          <motion.div
                            layoutId="tab-active-pill"
                            style={{
                              position:"absolute", inset:0, borderRadius:10,
                              background:"linear-gradient(135deg, #e03131, #c92a2a)",
                              boxShadow:"0 4px 14px rgba(224,49,49,0.24)",
                              zIndex:-1,
                            }}
                            transition={{ type:"spring", stiffness:420, damping:36 }}
                          />
                        )}
                        <i className={`ti ${tab.icon}`} style={{ fontSize:14, position:"relative" }} />
                        <span style={{ position:"relative" }}>{tab.label}</span>
                        {tab.count != null && tab.count > 0 && (
                          <span style={{
                            position:"relative",
                            background: isActive ? "rgba(255,255,255,0.25)" : "#fff0f0",
                            color: isActive ? "white" : "#e03131",
                            borderRadius:99, fontSize:10, fontWeight:700,
                            padding:"1px 7px",
                          }}>
                            {tab.count}
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </motion.div>

                {/* ── Tab content ── */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    variants={tabVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    style={{ display:"flex", flexDirection:"column", gap:16 }}
                  >

                    {/* PERSONAL TAB */}
                    {activeTab === "personal" && (<>
                      <SectionCard title="Basic Information" icon="ti-user"
                        motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0,    duration:0.22 } }}>
                        <InfoRow icon="ti-calendar"        label="Date of Birth"   value={fmtDate(student.birth_date)} />
                        <InfoRow icon="ti-clock"           label="Age"             value={age !== null ? `${age} years old` : null} />
                        <InfoRow icon="ti-gender-bigender" label="Sex"             value={capitalize(student.sex)} />
                        <InfoRow icon="ti-star"            label="Religion"        value={student.religion} />
                      </SectionCard>
                      <SectionCard title="Contact Information" icon="ti-address-book"
                        motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0.06, duration:0.22 } }}>
                        <InfoRow icon="ti-mail"  label="Email Address" value={student.email} />
                        <InfoRow icon="ti-phone" label="Mobile Number" value={student.mobile_number} />
                      </SectionCard>
                      <SectionCard title="Address" icon="ti-map-pin"
                        motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0.12, duration:0.22 } }}>
                        <InfoRow icon="ti-home"  label="Current Address"   value={student.current_address} />
                        <InfoRow icon="ti-map-2" label="Permanent Address" value={student.permanent_address} />
                      </SectionCard>
                      <SectionCard title="System Information" icon="ti-info-circle"
                        motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0.18, duration:0.22 } }}>
                        <InfoRow icon="ti-id-badge"    label="Student Number" value={student.student_number} mono />
                        <InfoRow icon="ti-fingerprint" label="LRN"            value={student.lrn} mono />
                        <InfoRow icon="ti-toggle-right" label="Status"        value={capitalize(student.status)} />
                      </SectionCard>
                    </>)}

                    {/* HOUSEHOLD TAB */}
                    {activeTab === "household" && (
                      <SectionCard title="Household Information" icon="ti-home"
                        motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                        {(!student.household_id && !student.parent_marital_status && !student.living_arrangement) ? (
                          <EmptySection message="No household information recorded for this student." />
                        ) : (<>
                          <InfoRow icon="ti-heart"              label="Parent Marital Status" value={capitalize(student.parent_marital_status || "")} />
                          <InfoRow icon="ti-building-community" label="Living Arrangement"    value={capitalize(student.living_arrangement || "")} />
                          <InfoRow icon="ti-badge"              label="4Ps Beneficiary"       value={student.is_4ps_beneficiary ? "Yes" : student.is_4ps_beneficiary === false ? "No" : null} />
                          <InfoRow icon="ti-hash"               label="4Ps ID"                value={student.four_ps_id} mono />
                        </>)}
                      </SectionCard>
                    )}

                    {/* GUARDIANS TAB */}
                    {activeTab === "guardians" && (
                      guardians.length === 0 ? (
                        <SectionCard title="Guardians" icon="ti-users"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                          <EmptySection message="No guardians have been linked to this student." />
                        </SectionCard>
                      ) : guardians.map((g, i) => (
                        <motion.div
                          key={g.guardian_id ?? i}
                          initial={{ opacity:0, y:10 }}
                          animate={{ opacity:1, y:0 }}
                          transition={{ delay: i * 0.07, duration:0.22 }}
                          whileHover={{ y:-2, boxShadow: g.is_primary_contact ? "0 6px 22px rgba(224,49,49,0.16)" : "0 6px 18px rgba(224,49,49,0.10)" }}
                          style={{
                            background:"white", borderRadius:16,
                            border:"1px solid #f5eaea",
                            boxShadow: g.is_primary_contact ? "0 2px 16px rgba(224,49,49,0.10)" : "0 2px 10px rgba(224,49,49,0.04)",
                            overflow:"hidden",
                          }}
                        >
                          <div style={{ height:4, background: g.is_primary_contact ? "linear-gradient(to right, #e03131, #ff6b6b, #fca5a5, #fde8e8)" : "linear-gradient(to right, #f5eaea, #fde8e8, #f5eaea)" }} />
                          <div style={{
                            padding:"14px 22px",
                            background: g.is_primary_contact ? "linear-gradient(to right, #fff0f0, #fdfafa)" : "linear-gradient(to right, #fff8f8, white)",
                            borderBottom:"1px solid #f9f0f0",
                            display:"flex", alignItems:"center", justifyContent:"space-between",
                          }}>
                            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                              <div style={{ width:38, height:38, borderRadius:"50%", background:getPalette(g.full_name ?? "").bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:getPalette(g.full_name ?? "").color }}>
                                {(g.full_name ?? "?")[0].toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>{g.full_name}</div>
                                <div style={{ fontSize:11.5, color:"#b09090", marginTop:2, textTransform:"capitalize" }}>{g.relationship}</div>
                              </div>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              {g.is_primary_contact && (
                                <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 11px", borderRadius:99, background:"#fff0f0", color:"#e03131", fontSize:11, fontWeight:700, border:"1px solid #fca5a5" }}>
                                  <i className="ti ti-star-filled" style={{ fontSize:10 }} />
                                  Primary Contact
                                </span>
                              )}
                              {g.user_id ? (
                                <span title="This guardian can log into the parent portal"
                                  style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 11px", borderRadius:99, background:"#e8f5e0", color:"#2e6b0d", fontSize:11, fontWeight:700, border:"1px solid #86efac" }}>
                                  <i className="ti ti-user-check" style={{ fontSize:11 }} />
                                  Portal access
                                </span>
                              ) : canLink ? (
                                <button onClick={() => setLinkGuardian(g)}
                                  style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 11px", borderRadius:99, background:"white", color:"#7a5050", fontSize:11, fontWeight:600, border:"1px solid #f0e4e4", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                                  <i className="ti ti-link" style={{ fontSize:11 }} />
                                  Link account
                                </button>
                              ) : null}
                              {g.user_id && canLink && (
                                <button title="Manage portal access" onClick={() => setLinkGuardian(g)}
                                  style={{ width:26, height:26, borderRadius:7, border:"1px solid #f0e4e4", background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070" }}>
                                  <i className="ti ti-settings" style={{ fontSize:12 }} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div style={{ padding:"4px 22px 14px" }}>
                            <InfoRow icon="ti-briefcase" label="Occupation"    value={g.occupation} />
                            <InfoRow icon="ti-phone"     label="Mobile Number" value={g.mobile_number} />
                            <InfoRow icon="ti-mail"      label="Email Address" value={g.email_address} />
                          </div>
                        </motion.div>
                      ))
                    )}

                    {/* SIBLINGS TAB */}
                    {activeTab === "family" && (
                      siblings.length === 0 ? (
                        <SectionCard title="Siblings" icon="ti-heart" badge={0}
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                          <EmptySection message="No siblings have been recorded for this student." />
                        </SectionCard>
                      ) : (
                        <SectionCard title="Siblings" icon="ti-heart" badge={siblings.length}
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                            {siblings.map((s, i) => (
                              <div key={s.sibling_id ?? i} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 0", borderBottom: i < siblings.length - 1 ? "1px solid #f9f0f0" : "none" }}>
                                <div style={{ width:36, height:36, borderRadius:"50%", background:getPalette(s.full_name ?? "").bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:getPalette(s.full_name ?? "").color, flexShrink:0 }}>
                                  {(s.full_name ?? "?")[0].toUpperCase()}
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:13.5, fontWeight:600, color:"#1a0a0a" }}>{s.full_name}</div>
                                  {s.age && <div style={{ fontSize:12, color:"#b09090", marginTop:2 }}>{s.age} years old</div>}
                                </div>
                                <div style={{ fontSize:11, color:"#c0a0a0", background:"#f9f4f4", padding:"3px 10px", borderRadius:99, fontWeight:500 }}>
                                  Sibling {i + 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        </SectionCard>
                      )
                    )}

                    {/* PREVIOUS SCHOOLS TAB */}
                    {activeTab === "schools" && (
                      schools.length === 0 ? (
                        <SectionCard title="Previous Schools" icon="ti-school"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                          <EmptySection message="No previous schools have been recorded." />
                        </SectionCard>
                      ) : schools.map((s, i) => (
                        <motion.div
                          key={s.previous_school_id ?? i}
                          initial={{ opacity:0, y:10 }}
                          animate={{ opacity:1, y:0 }}
                          transition={{ delay: i * 0.07, duration:0.22 }}
                          whileHover={{ y:-2, boxShadow:"0 6px 18px rgba(224,49,49,0.10)" }}
                          style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", boxShadow:"0 2px 10px rgba(224,49,49,0.04)", overflow:"hidden" }}
                        >
                          <div style={{ height:4, background:"linear-gradient(to right, #e03131, #ff6b6b, #fca5a5, #fde8e8)" }} />
                          <div style={{ padding:"14px 22px", background:"linear-gradient(to right, #fff8f8, white)", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:12 }}>
                            <div style={{ width:38, height:38, borderRadius:10, background:"#e8f0fd", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              <i className="ti ti-school" style={{ fontSize:17, color:"#2563eb" }} />
                            </div>
                            <div>
                              <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>{s.school_name}</div>
                              <div style={{ fontSize:11, color:"#b09090", marginTop:2 }}>School {i + 1}</div>
                            </div>
                          </div>
                          <div style={{ padding:"4px 22px 14px" }}>
                            <InfoRow icon="ti-map-pin" label="School Address" value={s.school_address} />
                          </div>
                        </motion.div>
                      ))
                    )}

                    {/* ENROLLMENTS TAB */}
                    {activeTab === "enrollments" && (<>
                      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
                        <button
                          onClick={() => navigate(`/enrollments/new?student=${student.student_id}`)}
                          style={{ display:"flex", alignItems:"center", gap:8, height:36, padding:"0 16px", border:"none", borderRadius:10, background:"#e03131", color:"white", fontSize:13, fontFamily:"'DM Sans', sans-serif", fontWeight:700, cursor:"pointer" }}
                        >
                          <i className="ti ti-clipboard-plus" style={{ fontSize:14 }} />
                          New Enrollment
                        </button>
                      </div>
                      {enrollments.length === 0 ? (
                        <SectionCard title="Enrollment History" icon="ti-clipboard-list"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                          <EmptySection message="No enrollment records found for this student." />
                        </SectionCard>
                      ) : enrollments.map((en, i) => {
                        const statusColors = {
                          enrolled:        { color:"#2e6b0d", bg:"#e8f5e0", label:"Enrolled" },
                          pending:         { color:"#854f0b", bg:"#faeeda", label:"Pending" },
                          completed:       { color:"#1455a0", bg:"#e3f0fd", label:"Completed" },
                          cancelled:       { color:"#5c5752", bg:"#f0ede8", label:"Cancelled" },
                          transferred_out: { color:"#7a4a08", bg:"#fef3e2", label:"Transferred Out" },
                        };
                        const sc = statusColors[en.enrollment_status] ?? statusColors.pending;
                        return (
                          <motion.div
                            key={en.enrollment_id}
                            initial={{ opacity:0, y:10 }}
                            animate={{ opacity:1, y:0 }}
                            transition={{ delay: i * 0.05, duration:0.22 }}
                            whileHover={{ y:-2, boxShadow:"0 4px 16px rgba(224,49,49,0.12)" }}
                            whileTap={{ scale:0.99 }}
                            onClick={() => navigate(`/enrollments/${en.enrollment_id}`)}
                            style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", boxShadow:"0 2px 10px rgba(224,49,49,0.04)" }}
                          >
                            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                              <div style={{ width:38, height:38, borderRadius:10, background:"#fde8e8", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                <i className="ti ti-clipboard-list" style={{ fontSize:16, color:"#e03131" }} />
                              </div>
                              <div>
                                <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>{en.grade_level} — {en.section}</div>
                                <div style={{ fontSize:12, color:"#b09090", marginTop:2 }}>
                                  {en.school_year}{en.semester ? ` · ${en.semester === "1st" ? "1st Sem" : "2nd Sem"}` : ""}{en.strand ? ` · ${en.strand}` : ""}
                                </div>
                              </div>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <span style={{ fontSize:11, fontWeight:700, color:sc.color, background:sc.bg, padding:"2px 10px", borderRadius:50 }}>
                                {sc.label}
                              </span>
                              <i className="ti ti-chevron-right" style={{ fontSize:14, color:"#b09090" }} />
                            </div>
                          </motion.div>
                        );
                      })}
                    </>)}

                    {/* LEDGER TAB */}
                    {activeTab === "ledger" && (<>
                      {ledgerLoading && (
                        <SectionCard title="Financial History" icon="ti-receipt"
                          motionProps={{ initial:{ opacity:0 }, animate:{ opacity:1 }, transition:{ duration:0.18 } }}>
                          <div style={{ display:"flex", flexDirection:"column", gap:10, padding:"8px 0" }}>
                            {[1,2,3].map((k) => <Sk key={k} h={52} r={10} />)}
                          </div>
                        </SectionCard>
                      )}
                      {!ledgerLoading && ledger?.forbidden && (
                        <SectionCard title="Financial History" icon="ti-receipt"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ duration:0.22 } }}>
                          <EmptySection message="Financial history is only visible to billing staff." />
                        </SectionCard>
                      )}
                      {!ledgerLoading && ledger?.error && (
                        <SectionCard title="Financial History" icon="ti-receipt"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ duration:0.22 } }}>
                          <EmptySection message="Failed to load financial history. Check that the billing service is running." />
                        </SectionCard>
                      )}
                      {!ledgerLoading && ledger && !ledger.error && ledger.school_years?.length === 0 && (
                        <SectionCard title="Financial History" icon="ti-receipt"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ duration:0.22 } }}>
                          <EmptySection message="No invoices found for this student." />
                        </SectionCard>
                      )}
                      {!ledgerLoading && ledger && !ledger.error && ledger.school_years?.length > 0 && (<>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                          {[
                            { label:"Total Billed",  value:ledger.total_billed,   color:"#1a0a0a", bg:"#fff8f6", border:"#f5eaea" },
                            { label:"Total Paid",    value:ledger.total_paid,     color:"#2e6b0d", bg:"#f0faf0", border:"#d4edda" },
                            { label:"Total Balance", value:ledger.total_balance,  color:parseFloat(ledger.total_balance) > 0 ? "#c92a2a" : "#2e6b0d", bg:parseFloat(ledger.total_balance) > 0 ? "#fff0f0" : "#f0faf0", border:parseFloat(ledger.total_balance) > 0 ? "#fca5a5" : "#d4edda" },
                          ].map(({ label, value, color, bg, border }, i) => (
                            <motion.div
                              key={label}
                              initial={{ opacity:0, y:10 }}
                              animate={{ opacity:1, y:0 }}
                              transition={{ delay: i * 0.06, duration:0.22 }}
                              style={{ background:bg, border:`1px solid ${border}`, borderRadius:12, padding:"14px 18px" }}
                            >
                              <div style={{ fontSize:10, fontWeight:700, color:"#b09090", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>{label}</div>
                              <div style={{ fontSize:18, fontWeight:800, color }}>
                                ₱{parseFloat(value).toLocaleString("en-PH", { minimumFractionDigits:2 })}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                        {ledger.school_years.map((yr, yi) => {
                          const balanceAmt = parseFloat(yr.year_balance);
                          const yrStatusColor = balanceAmt > 0 ? "#c92a2a" : "#2e6b0d";
                          const yrStatusBg    = balanceAmt > 0 ? "#fde8e8" : "#e8f5e0";
                          const levelLabel    = yr.school_level?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                          return (
                            <SectionCard
                              key={yr.school_year}
                              title={`SY ${yr.school_year} — ${yr.grade_level}`}
                              icon="ti-calendar"
                              motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay: 0.18 + yi * 0.07, duration:0.22 } }}
                              badge={
                                <span style={{ fontSize:11, fontWeight:700, color:yrStatusColor, background:yrStatusBg, padding:"2px 10px", borderRadius:50 }}>
                                  {balanceAmt > 0 ? `Balance ₱${balanceAmt.toLocaleString("en-PH", { minimumFractionDigits:2 })}` : "Settled"}
                                </span>
                              }
                            >
                              <div style={{ fontSize:11, color:"#b09090", marginBottom:10 }}>
                                {levelLabel}{yr.section ? ` · ${yr.section}` : ""} · <span style={{ fontWeight:600 }}>{yr.enrollment_status}</span>
                              </div>
                              {yr.invoices.length === 0 ? (
                                <EmptySection message="No invoices for this school year." />
                              ) : yr.invoices.map((inv) => {
                                const INV_STATUS = {
                                  unpaid:         { label:"Unpaid",  color:"#a32d2d", bg:"#fde8e8" },
                                  partially_paid: { label:"Partial", color:"#854f0b", bg:"#faeeda" },
                                  paid:           { label:"Paid",    color:"#2e6b0d", bg:"#e8f5e0" },
                                  void:           { label:"Void",    color:"#5c5752", bg:"#f0ede8" },
                                };
                                const isMeta = INV_STATUS[inv.status] ?? INV_STATUS.unpaid;
                                const netAmt  = parseFloat(inv.net_amount || 0);
                                const paidAmt = parseFloat(inv.total_paid || 0);
                                const balAmt  = netAmt - paidAmt;
                                return (
                                  <motion.div
                                    key={inv.invoice_id}
                                    whileHover={{ boxShadow:"0 3px 12px rgba(224,49,49,0.10)" }}
                                    onClick={() => navigate(`/invoices?selected=${inv.invoice_id}`)}
                                    style={{ border:"1px solid #f5eaea", borderRadius:10, padding:"12px 16px", marginBottom:8, cursor:"pointer" }}
                                  >
                                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                        <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>{inv.invoice_no}</span>
                                        <span style={{ fontSize:10, fontWeight:700, color:isMeta.color, background:isMeta.bg, padding:"2px 8px", borderRadius:50 }}>{isMeta.label}</span>
                                      </div>
                                      <span style={{ fontSize:11, color:"#b09090" }}>
                                        {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString("en-PH", { month:"short", day:"numeric", year:"numeric" }) : "—"}
                                        {" · "}{inv.payment_plan?.replace(/_/g, " ")}
                                      </span>
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                                      {[
                                        { label:"Billed",  value:netAmt,  color:"#1a0a0a" },
                                        { label:"Paid",    value:paidAmt, color:"#2e6b0d" },
                                        { label:"Balance", value:balAmt,  color:balAmt > 0 ? "#c92a2a" : "#2e6b0d" },
                                      ].map(({ label, value, color }) => (
                                        <div key={label}>
                                          <div style={{ fontSize:9.5, fontWeight:700, color:"#b09090", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
                                          <div style={{ fontSize:13, fontWeight:700, color }}>₱{value.toLocaleString("en-PH", { minimumFractionDigits:2 })}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </motion.div>
                                );
                              })}
                              <div style={{ display:"flex", justifyContent:"flex-end", gap:20, paddingTop:8, borderTop:"1px dashed #f0e4e4", marginTop:4 }}>
                                {[
                                  { label:"Year Billed",  value:yr.year_billed  },
                                  { label:"Year Paid",    value:yr.year_paid    },
                                  { label:"Year Balance", value:yr.year_balance, bold:true, color:balanceAmt > 0 ? "#c92a2a" : "#2e6b0d" },
                                ].map(({ label, value, bold, color }) => (
                                  <div key={label} style={{ textAlign:"right" }}>
                                    <div style={{ fontSize:9.5, color:"#b09090", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{label}</div>
                                    <div style={{ fontSize:13, fontWeight:bold ? 800 : 600, color:color || "#1a0a0a" }}>
                                      ₱{parseFloat(value).toLocaleString("en-PH", { minimumFractionDigits:2 })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </SectionCard>
                          );
                        })}
                      </>)}
                    </>)}

                  </motion.div>
                </AnimatePresence>

              </>
            )}
          </div>

          <AnimatePresence>
            {linkGuardian && (
              <LinkAccountModal
                key="link-guardian-modal"
                guardian={linkGuardian}
                onClose={() => setLinkGuardian(null)}
                onLinked={(updated) =>
                  setGuardians((prev) => prev.map((x) => x.guardian_id === updated.guardian_id ? { ...x, ...updated } : x))
                }
              />
            )}
          </AnimatePresence>
    </AppLayout>
  );
}
