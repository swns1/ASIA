import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getStudent } from "../api/studentApi";
import { getGuardiansByStudent } from "../api/guardianApi";
import { getSiblingsByStudent } from "../api/siblingApi";
import { getPreviousSchoolsByStudent } from "../api/previousSchoolApi";

// ── Nav config (shared with other pages) ─────────────────────────────────────
const NAV = [
  {
    section: "Main",
    items: [
      { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/Dashboard" },
      { label: "Students",    icon: "ti-users",             path: "/Students" },
      { label: "Enrollments", icon: "ti-clipboard-list",    path: "/enrollments/n" },
      { label: "Grades",      icon: "ti-chart-bar",         path: "/Grades" },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Invoices",     icon: "ti-receipt",  path: "/invoices" },
      { label: "Payments",     icon: "ti-cash",     path: "/payments" },
      { label: "Scholarships", icon: "ti-discount", path: "/scholarships" },
    ],
  },
  {
    section: "Settings",
    items: [
      { label: "Users",           icon: "ti-user-cog", path: "/users" },
      { label: "School Settings", icon: "ti-settings", path: "/settings" },
    ],
  },
];

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
function SectionCard({ title, icon, children, badge }) {
  return (
    <div style={{
      background: "white", borderRadius: 16, border: "1px solid #f5eaea",
      boxShadow: "0 2px 16px rgba(224,49,49,0.05)", overflow: "hidden",
      animation: "fadeUp 0.3s ease both",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 22px", borderBottom: "1px solid #f9f0f0",
        background: "linear-gradient(to right, #fdfafa, white)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "linear-gradient(135deg, #fff0f0, #fde8e8)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <i className={`ti ${icon}`} style={{ fontSize: 16, color: "#e03131" }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1a0a0a", fontFamily: "'Playfair Display', serif" }}>
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
    </div>
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

export default function StudentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [student,       setStudent]       = useState(null);
  const [guardians,     setGuardians]     = useState([]);
  const [siblings,      setSiblings]      = useState([]);
  const [schools,       setSchools]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState("personal");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getStudent(id),
      getGuardiansByStudent(id).catch(() => []),
      getSiblingsByStudent(id).catch(() => []),
      getPreviousSchoolsByStudent(id).catch(() => []),
    ]).then(([s, g, sib, sch]) => {
      setStudent(s);
      setGuardians(Array.isArray(g) ? g : g?.results ?? []);
      setSiblings(Array.isArray(sib) ? sib : sib?.results ?? []);
      setSchools(Array.isArray(sch) ? sch : sch?.results ?? []);
    }).finally(() => setLoading(false));
  }, [id]);

  const TABS = [
    { id: "personal",  label: "Personal",   icon: "ti-user"       },
    { id: "household", label: "Household",   icon: "ti-home"       },
    { id: "guardians", label: "Guardians",   icon: "ti-users",     count: guardians.length },
    { id: "family",    label: "Siblings",    icon: "ti-heart",     count: siblings.length  },
    { id: "schools",   label: "Prev. Schools", icon: "ti-school",  count: schools.length   },
  ];

  const palette   = getPalette(student?.last_name ?? "");
  const statusMeta = STATUS_META[student?.status] ?? STATUS_META.inactive;
  const age       = calcAge(student?.birth_date);
  const fullName  = student
    ? [student.first_name, student.middle_name, student.last_name, student.suffix]
        .filter(Boolean).join(" ")
    : "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        @keyframes shimmer  { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes heroIn   { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }

        .nav-item { transition:background 0.12s, color 0.12s; }
        .nav-item:hover  { background:#fff4f4 !important; color:#e03131 !important; }
        .nav-active      { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }

        .tab-btn { transition:all 0.14s; cursor:pointer; }
        .tab-btn:hover:not(.tab-active) { color:#e03131 !important; border-bottom-color:#fca5a5 !important; }

        .action-btn { transition:all 0.15s; cursor:pointer; }
        .action-edit:hover  { background:#fff0f0 !important; border-color:#fca5a5 !important; color:#e03131 !important; }
        .action-back:hover  { background:#f9f4f4 !important; }

        .guardian-card:hover { box-shadow:0 6px 24px rgba(224,49,49,0.10) !important; transform:translateY(-2px); }
        .guardian-card { transition:all 0.16s; }

        .school-card:hover { box-shadow:0 6px 24px rgba(224,49,49,0.10) !important; transform:translateY(-2px); }
        .school-card { transition:all 0.16s; }
      `}</style>

      <div style={{ display:"flex", height:"100vh", background:"#fdf8f6", fontFamily:"'DM Sans', sans-serif", overflow:"hidden" }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside style={{
          width:224, flexShrink:0, background:"white",
          borderRight:"1px solid #f5eaea", display:"flex", flexDirection:"column",
          boxShadow:"2px 0 12px rgba(224,49,49,0.04)",
        }}>
          <div style={{ padding:"22px 18px 18px", borderBottom:"1px solid #f5eaea" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{
                width:36, height:36, borderRadius:10,
                background:"linear-gradient(135deg, #e03131, #c92a2a)",
                display:"flex", alignItems:"center", justifyContent:"center",
                boxShadow:"0 4px 12px rgba(224,49,49,0.3)",
              }}>
                <i className="ti ti-school" style={{ fontSize:17, color:"white" }} />
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"#1a0a0a", letterSpacing:"-0.01em" }}>South Lakes IS</div>
                <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Admin Portal</div>
              </div>
            </div>
          </div>

          <nav style={{ flex:1, padding:"14px 10px", display:"flex", flexDirection:"column", gap:2, overflowY:"auto" }}>
            {NAV.map((group) => (
              <div key={group.section} style={{ marginBottom:6 }}>
                <div style={{ fontSize:9.5, color:"#cdb0b0", letterSpacing:"0.1em", textTransform:"uppercase", padding:"10px 10px 4px", fontWeight:600 }}>
                  {group.section}
                </div>
                {group.items.map((item) => {
                  const active = location.pathname.startsWith(item.path);
                  return (
                    <div
                      key={item.path}
                      className={`nav-item${active ? " nav-active" : ""}`}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:9, fontSize:13, color:active ? "#e03131" : "#7a5a5a", cursor:"pointer" }}
                      onClick={() => navigate(item.path)}
                      role="button" tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && navigate(item.path)}
                    >
                      <i className={`ti ${item.icon}`} style={{ fontSize:16, width:20, textAlign:"center" }} />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>

          <div style={{ padding:"14px 10px", borderTop:"1px solid #f5eaea" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px", borderRadius:10, background:"#fff8f6", cursor:"pointer" }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg, #fde8e8, #fca5a5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#e03131", flexShrink:0 }}>SA</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>Super Admin</div>
                <div style={{ fontSize:11, color:"#b09090" }}>super_admin</div>
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize:13, color:"#c0a0a0", marginLeft:"auto" }} />
            </div>
          </div>
        </aside>

        {/* ── Main ────────────────────────────────────────────────────────── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Topbar */}
          <div style={{
            background:"white", borderBottom:"1px solid #f5eaea",
            padding:"0 28px", height:58, display:"flex", alignItems:"center",
            justifyContent:"space-between", flexShrink:0,
            boxShadow:"0 1px 8px rgba(224,49,49,0.04)",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <button
                className="action-btn action-back"
                style={{ display:"flex", alignItems:"center", gap:6, height:34, padding:"0 14px", border:"1px solid #f0e4e4", borderRadius:9, background:"white", fontSize:13, color:"#9a7070", fontFamily:"'DM Sans', sans-serif", fontWeight:500 }}
                onClick={() => navigate("/students")}
              >
                <i className="ti ti-arrow-left" style={{ fontSize:13 }} />
                Students
              </button>
              <i className="ti ti-chevron-right" style={{ fontSize:12, color:"#d0b8b8" }} />
              <span style={{ fontSize:13, color:"#1a0a0a", fontWeight:600 }}>
                {loading ? "Loading…" : fullName}
              </span>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button style={{ width:36, height:36, border:"1px solid #f5eaea", borderRadius:10, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070", position:"relative" }}>
                <i className="ti ti-bell" style={{ fontSize:16 }} />
                <span style={{ width:8, height:8, background:"#e03131", borderRadius:"50%", position:"absolute", top:6, right:6, border:"2px solid white" }} />
              </button>
              {!loading && student && (
                <button
                  className="action-btn action-edit"
                  style={{ display:"flex", alignItems:"center", gap:8, height:36, padding:"0 16px", border:"1.5px solid #f0e4e4", borderRadius:10, background:"white", fontSize:13, color:"#9a7070", fontFamily:"'DM Sans', sans-serif", fontWeight:600 }}
                  onClick={() => navigate(`/students/${student.student_id}/edit`)}
                >
                  <i className="ti ti-pencil" style={{ fontSize:13 }} />
                  Edit Student
                </button>
              )}
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
                <div style={{
                  background:"white", borderRadius:20,
                  border:"1px solid #f5eaea",
                  boxShadow:"0 4px 24px rgba(224,49,49,0.07)",
                  overflow:"hidden",
                  animation:"heroIn 0.3s ease both",
                }}>
                  {/* Top accent strip */}
                  <div style={{
                    height:6,
                    background:"linear-gradient(to right, #e03131, #ff6b6b, #fca5a5, #fde8e8)",
                  }} />

                  <div style={{ padding:"26px 28px", display:"flex", alignItems:"flex-start", gap:22, flexWrap:"wrap" }}>
                    {/* Avatar */}
                    <div style={{
                      width:76, height:76, borderRadius:"50%",
                      background:`linear-gradient(135deg, ${palette.bg}, ${palette.color}22)`,
                      border:`3px solid ${palette.color}33`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:26, fontWeight:700, color:palette.color,
                      flexShrink:0, letterSpacing:"0.02em",
                      boxShadow:`0 4px 20px ${palette.color}22`,
                    }}>
                      {`${student.first_name?.[0] ?? ""}${student.last_name?.[0] ?? ""}`.toUpperCase()}
                    </div>

                    {/* Name + identifiers */}
                    <div style={{ flex:1, minWidth:200 }}>
                      <div style={{ fontSize:22, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display', serif", lineHeight:1.2, letterSpacing:"-0.01em" }}>
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
                </div>

                {/* ── Tab bar ── */}
                <div style={{
                  display:"flex", gap:2,
                  background:"white", borderRadius:14,
                  border:"1px solid #f5eaea", padding:6,
                  boxShadow:"0 2px 10px rgba(224,49,49,0.04)",
                }}>
                  {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        className={`tab-btn${isActive ? " tab-active" : ""}`}
                        style={{
                          flex:1, display:"flex", alignItems:"center", justifyContent:"center",
                          gap:7, height:38, borderRadius:10, border:"none",
                          background: isActive ? "linear-gradient(135deg, #e03131, #c92a2a)" : "transparent",
                          color: isActive ? "white" : "#9a7070",
                          fontSize:12.5, fontWeight: isActive ? 700 : 500,
                          fontFamily:"'DM Sans', sans-serif",
                          boxShadow: isActive ? "0 4px 14px rgba(224,49,49,0.24)" : "none",
                        }}
                        onClick={() => setActiveTab(tab.id)}
                      >
                        <i className={`ti ${tab.icon}`} style={{ fontSize:14 }} />
                        {tab.label}
                        {tab.count != null && tab.count > 0 && (
                          <span style={{
                            background: isActive ? "rgba(255,255,255,0.25)" : "#fff0f0",
                            color: isActive ? "white" : "#e03131",
                            borderRadius:99, fontSize:10, fontWeight:700,
                            padding:"1px 7px",
                          }}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* ── Tab content ── */}

                {/* PERSONAL TAB */}
                {activeTab === "personal" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:16, animation:"fadeUp 0.22s ease both" }}>
                    <SectionCard title="Basic Information" icon="ti-user">
                      <InfoRow icon="ti-calendar"    label="Date of Birth"   value={fmtDate(student.birth_date)} />
                      <InfoRow icon="ti-clock"       label="Age"             value={age !== null ? `${age} years old` : null} />
                      <InfoRow icon="ti-gender-bigender" label="Sex"         value={capitalize(student.sex)} />
                      <InfoRow icon="ti-star"        label="Religion"        value={student.religion} />
                    </SectionCard>

                    <SectionCard title="Contact Information" icon="ti-address-book">
                      <InfoRow icon="ti-mail"        label="Email Address"   value={student.email} />
                      <InfoRow icon="ti-phone"       label="Mobile Number"   value={student.mobile_number} />
                    </SectionCard>

                    <SectionCard title="Address" icon="ti-map-pin">
                      <InfoRow icon="ti-home"        label="Current Address"   value={student.current_address} />
                      <InfoRow icon="ti-map-2"       label="Permanent Address" value={student.permanent_address} />
                    </SectionCard>

                    <SectionCard title="System Information" icon="ti-info-circle">
                      <InfoRow icon="ti-id-badge"    label="Student Number"  value={student.student_number} mono />
                      <InfoRow icon="ti-fingerprint" label="LRN"             value={student.lrn} mono />
                      <InfoRow icon="ti-toggle-right" label="Status"         value={capitalize(student.status)} />
                    </SectionCard>
                  </div>
                )}

                {/* HOUSEHOLD TAB */}
                {activeTab === "household" && (
                  <div style={{ animation:"fadeUp 0.22s ease both" }}>
                    {(!student.household_id && !student.parent_marital_status && !student.living_arrangement) ? (
                      <SectionCard title="Household Information" icon="ti-home">
                        <EmptySection message="No household information recorded for this student." />
                      </SectionCard>
                    ) : (
                      <SectionCard title="Household Information" icon="ti-home">
                        <InfoRow icon="ti-heart"       label="Parent Marital Status"  value={capitalize(student.parent_marital_status || "")} />
                        <InfoRow icon="ti-building-community" label="Living Arrangement" value={capitalize(student.living_arrangement || "")} />
                        <InfoRow icon="ti-badge"       label="4Ps Beneficiary"        value={student.is_4ps_beneficiary ? "Yes" : student.is_4ps_beneficiary === false ? "No" : null} />
                        <InfoRow icon="ti-hash"        label="4Ps ID"                 value={student.four_ps_id} mono />
                      </SectionCard>
                    )}
                  </div>
                )}

                {/* GUARDIANS TAB */}
                {activeTab === "guardians" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:14, animation:"fadeUp 0.22s ease both" }}>
                    {guardians.length === 0 ? (
                      <SectionCard title="Guardians" icon="ti-users">
                        <EmptySection message="No guardians have been linked to this student." />
                      </SectionCard>
                    ) : guardians.map((g, i) => (
                      <div
                        key={g.guardian_id ?? i}
                        className="guardian-card"
                        style={{
                          background:"white", borderRadius:16,
                          border:`1px solid ${g.is_primary_contact ? "#fca5a5" : "#f5eaea"}`,
                          boxShadow: g.is_primary_contact ? "0 2px 16px rgba(224,49,49,0.10)" : "0 2px 10px rgba(224,49,49,0.04)",
                          overflow:"hidden",
                        }}
                      >
                        {/* Card header */}
                        <div style={{
                          padding:"14px 22px",
                          background: g.is_primary_contact
                            ? "linear-gradient(to right, #fff0f0, #fdfafa)"
                            : "linear-gradient(to right, #fdfafa, white)",
                          borderBottom:"1px solid #f9f0f0",
                          display:"flex", alignItems:"center", justifyContent:"space-between",
                        }}>
                          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                            <div style={{
                              width:38, height:38, borderRadius:"50%",
                              background: getPalette(g.full_name ?? "").bg,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              fontSize:14, fontWeight:700,
                              color: getPalette(g.full_name ?? "").color,
                            }}>
                              {(g.full_name ?? "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display', serif" }}>{g.full_name}</div>
                              <div style={{ fontSize:11.5, color:"#b09090", marginTop:2, textTransform:"capitalize" }}>{g.relationship}</div>
                            </div>
                          </div>
                          {g.is_primary_contact && (
                            <span style={{
                              display:"inline-flex", alignItems:"center", gap:5,
                              padding:"4px 11px", borderRadius:99,
                              background:"#fff0f0", color:"#e03131",
                              fontSize:11, fontWeight:700, border:"1px solid #fca5a5",
                            }}>
                              <i className="ti ti-star-filled" style={{ fontSize:10 }} />
                              Primary Contact
                            </span>
                          )}
                        </div>
                        <div style={{ padding:"4px 22px 14px" }}>
                          <InfoRow icon="ti-briefcase"  label="Occupation"     value={g.occupation} />
                          <InfoRow icon="ti-phone"      label="Mobile Number"  value={g.mobile_number} />
                          <InfoRow icon="ti-mail"       label="Email Address"  value={g.email_address} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* SIBLINGS TAB */}
                {activeTab === "family" && (
                  <div style={{ animation:"fadeUp 0.22s ease both" }}>
                    {siblings.length === 0 ? (
                      <SectionCard title="Siblings" icon="ti-heart" badge={0}>
                        <EmptySection message="No siblings have been recorded for this student." />
                      </SectionCard>
                    ) : (
                      <SectionCard title="Siblings" icon="ti-heart" badge={siblings.length}>
                        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                          {siblings.map((s, i) => (
                            <div key={s.sibling_id ?? i} style={{
                              display:"flex", alignItems:"center", gap:14,
                              padding:"12px 0", borderBottom: i < siblings.length - 1 ? "1px solid #f9f0f0" : "none",
                            }}>
                              <div style={{
                                width:36, height:36, borderRadius:"50%",
                                background: getPalette(s.full_name ?? "").bg,
                                display:"flex", alignItems:"center", justifyContent:"center",
                                fontSize:13, fontWeight:700, color: getPalette(s.full_name ?? "").color,
                                flexShrink:0,
                              }}>
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
                    )}
                  </div>
                )}

                {/* PREVIOUS SCHOOLS TAB */}
                {activeTab === "schools" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:14, animation:"fadeUp 0.22s ease both" }}>
                    {schools.length === 0 ? (
                      <SectionCard title="Previous Schools" icon="ti-school">
                        <EmptySection message="No previous schools have been recorded." />
                      </SectionCard>
                    ) : schools.map((s, i) => (
                      <div
                        key={s.previous_school_id ?? i}
                        className="school-card"
                        style={{
                          background:"white", borderRadius:16,
                          border:"1px solid #f5eaea",
                          boxShadow:"0 2px 10px rgba(224,49,49,0.04)",
                          overflow:"hidden",
                        }}
                      >
                        <div style={{
                          padding:"14px 22px",
                          background:"linear-gradient(to right, #fdfafa, white)",
                          borderBottom:"1px solid #f9f0f0",
                          display:"flex", alignItems:"center", gap:12,
                        }}>
                          <div style={{
                            width:38, height:38, borderRadius:10,
                            background:"#e8f0fd",
                            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                          }}>
                            <i className="ti ti-school" style={{ fontSize:17, color:"#2563eb" }} />
                          </div>
                          <div>
                            <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display', serif" }}>
                              {s.school_name}
                            </div>
                            <div style={{ fontSize:11, color:"#b09090", marginTop:2 }}>School {i + 1}</div>
                          </div>
                        </div>
                        <div style={{ padding:"4px 22px 14px" }}>
                          <InfoRow icon="ti-map-pin" label="School Address" value={s.school_address} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
