import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { deleteStudent, getStudents } from "../api/studentApi";
import { getVisibleNavGroups } from "../utils/navigation";
import { clearAuthSession } from "../utils/auth";

// ── Nav config ────────────────────────────────────────────────────────────────
const NAV = [
  {
    section: "Main",
    items: [
      { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/Dashboard" },
      { label: "Students",    icon: "ti-users",             path: "/Students" },
      { label: "Enrollments", icon: "ti-clipboard-list",    path: "/enrollments" },
      { label: "Subjects",    icon: "ti-book",              path: "/subjects"    },
      { label: "Grades",      icon: "ti-chart-bar",         path: "/grades"      },
      { label: "Requirements", icon: "ti-file-check",        path: "/requirements" },
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
      { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates" },
      { label: "Scholarship Types", icon: "ti-discount",         path: "/scholarship-types" },
      { label: "Fee Schedules",     icon: "ti-cash",             path: "/fee-schedules"     },
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

const STATUS_FILTERS = ["all", "active", "inactive", "transferred", "graduated", "dropped"];

// ── Avatar color palette (deterministic from name) ────────────────────────────
const AVATAR_PALETTES = [
  { bg: "#fde8e8", color: "#c0392b" },
  { bg: "#e8f0fd", color: "#2563eb" },
  { bg: "#e8fdf0", color: "#16a34a" },
  { bg: "#fdf5e8", color: "#d97706" },
  { bg: "#f0e8fd", color: "#7c3aed" },
  { bg: "#fde8f8", color: "#be185d" },
  { bg: "#e8fdfd", color: "#0891b2" },
];

function getAvatarPalette(name = "") {
  const idx = name.charCodeAt(0) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[idx];
}

// ── Age from birth date ───────────────────────────────────────────────────────
function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ── Format date nicely ────────────────────────────────────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Skeleton = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: "linear-gradient(90deg, #f0e8e8 25%, #fde8e8 50%, #f0e8e8 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.6s ease-in-out infinite",
  }} />
);

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color, bg, loading }) {
  return (
    <div style={{
      background: "white", borderRadius: 14, padding: "16px 20px",
      border: "1px solid #f5eaea", flex: 1, minWidth: 0,
      display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 2px 12px rgba(224,49,49,0.06)",
      transition: "transform 0.18s, box-shadow 0.18s",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(224,49,49,0.12)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 12px rgba(224,49,49,0.06)"; }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 12, background: bg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 18, color }} />
      </div>
      <div>
        {loading
          ? <Skeleton w={40} h={20} r={4} />
          : <div style={{ fontSize: 22, fontWeight: 700, color: "#1a0a0a", lineHeight: 1 }}>{value?.toLocaleString() ?? "—"}</div>
        }
        <div style={{ fontSize: 11, color: "#a07878", marginTop: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      </div>
    </div>
  );
}

// ── Delete confirm modal ───────────────────────────────────────────────────────
function ConfirmModal({ student, onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(26,10,10,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 999, backdropFilter: "blur(4px)", animation: "fadeIn 0.15s ease",
    }}>
      <div style={{
        background: "white", borderRadius: 20, padding: "32px 36px",
        width: 400, boxShadow: "0 24px 64px rgba(224,49,49,0.18)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
        animation: "slideUp 0.2s ease",
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16, background: "#fff0f0",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className="ti ti-trash" style={{ fontSize: 24, color: "#e03131" }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a0a0a"}}>
          Delete Student?
        </div>
        <div style={{ fontSize: 13, color: "#7a5050", textAlign: "center", lineHeight: 1.7 }}>
          You're about to permanently remove{" "}
          <strong style={{ color: "#1a0a0a" }}>{student.first_name} {student.last_name}</strong>{" "}
          and all their associated records. This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 6, width: "100%" }}>
          <button
            style={{
              flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10,
              background: "white", fontSize: 13, color: "#7a5050", cursor: "pointer",
              fontWeight: 600, fontFamily: "'DM Sans', sans-serif", transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#fdf8f8"}
            onMouseLeave={e => e.currentTarget.style.background = "white"}
            onClick={onCancel}
          >Cancel</button>
          <button
            style={{
              flex: 1, height: 42, border: "none", borderRadius: 10,
              background: "linear-gradient(135deg, #e03131, #c92a2a)",
              fontSize: 13, color: "white", cursor: "pointer",
              fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              boxShadow: "0 4px 16px rgba(224,49,49,0.3)", transition: "opacity 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            onClick={onConfirm}
          >Yes, delete</button>
        </div>
      </div>
    </div>
  );
}

function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, padding:"32px 36px", width:380, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", display:"flex", flexDirection:"column", alignItems:"center", gap:14, animation:"slideUp 0.2s ease" }}>
        <div style={{ width:56, height:56, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <i className="ti ti-logout" style={{ fontSize:24, color:"#e03131" }} />
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>Log out?</div>
        <div style={{ fontSize:13, color:"#7a5050", textAlign:"center", lineHeight:1.7 }}>
          You'll be returned to the login page. Any unsaved changes will be lost.
        </div>
        <div style={{ display:"flex", gap:10, width:"100%", marginTop:4 }}>
          <button onClick={onCancel} style={{ flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:"white", fontSize:13, color:"#7a5050", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
            Stay
          </button>
          <button onClick={onConfirm} style={{ flex:1, height:42, border:"none", borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", fontSize:13, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.3)" }}>
            Yes, logout
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function StudentsPage() {
  const navigate = useNavigate();

  const [students, setStudents]   = useState([]);
  const [search, setSearch]       = useState("");
  const [inputVal, setInputVal]   = useState("");
  const [page, setPage]           = useState(1);
  const [pageMeta, setPageMeta]   = useState({ count: 0, next: null, previous: null });
  const [loading, setLoading]     = useState(true);
  const [toDelete, setToDelete]   = useState(null);
  const [statusFilter, setStatus] = useState("all");

  const [showLogout, setShowLogout] = useState(false);

  // Per-status counts for stat cards
  const [statusCounts, setStatusCounts] = useState({});

  const searchRef = useRef();
  const token = sessionStorage.getItem("access_token");

  // Fetch students
  const fetchStudents = async (nextPage = 1, term = search, status = statusFilter) => {
    setLoading(true);
    try {
      const data = await getStudents({
        page: nextPage,
        search: term,
        status: status === "all" ? "" : status,
      });
      setStudents(data.results || []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(nextPage);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch counts for all statuses (for stat cards)
  const fetchCounts = async () => {
    try {
      const counts = {};
      const all = await getStudents({ page: 1, search: "", status: "" });
      counts.all = all.count;
      await Promise.all(
        ["active", "inactive", "transferred", "graduated", "dropped"].map(async (s) => {
          const res = await getStudents({ page: 1, search: "", status: s });
          counts[s] = res.count;
        })
      );
      setStatusCounts(counts);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    fetchStudents(1, "", "all");
    fetchCounts();
  }, []);

  const handleSearch = () => {
    setSearch(inputVal);
    fetchStudents(1, inputVal, statusFilter);
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSearch(); };

  const handleStatusFilter = (val) => {
    setStatus(val);
    fetchStudents(1, inputVal, val);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    await deleteStudent(toDelete.student_id);
    setToDelete(null);
    fetchStudents(page, search, statusFilter);
    fetchCounts();
  };

  const totalPages = Math.ceil(pageMeta.count / 20);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes rowIn   { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #f0dada; border-radius: 99px; }

        .nav-item { transition: background 0.12s, color 0.12s; }
        .nav-item:hover { background: #fff4f4 !important; color: #e03131 !important; }
        .nav-active { background: #fff0f0 !important; color: #e03131 !important; font-weight: 600 !important; }

        .student-row { transition: background 0.12s; cursor: pointer; }
        .student-row:hover td { background: #fff8f6 !important; }
        .student-row:hover .row-name { color: #e03131 !important; }

        .row-action {
          width: 30px; height: 30px; border: 1px solid #f0e4e4; border-radius: 8px;
          background: white; display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9a7070; transition: all 0.12s; font-family: 'DM Sans', sans-serif;
        }
        .row-action:hover { background: #fff0f0 !important; color: #e03131 !important; border-color: #fca5a5 !important; }
        .row-action.danger:hover { background: #fff0f0 !important; color: #e03131 !important; }

        .chip-btn {
          display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px;
          border-radius: 99px; border: 1.5px solid #f0e4e4; background: white;
          font-size: 12px; color: #9a7070; cursor: pointer;
          font-family: 'DM Sans', sans-serif; font-weight: 500;
          transition: all 0.14s;
        }
        .chip-btn:hover { border-color: #fca5a5; color: #e03131; background: #fff8f6; }
        .chip-btn.active { background: #fff0f0; border-color: #e03131; color: #e03131; font-weight: 700; }

        .search-input:focus { outline: none; }
        .search-wrap:focus-within { border-color: #e03131 !important; box-shadow: 0 0 0 3px rgba(224,49,49,0.09) !important; }

        .new-btn:hover { background: #c92a2a !important; box-shadow: 0 8px 28px rgba(224,49,49,0.32) !important; transform: translateY(-1px); }
        .new-btn { transition: all 0.16s !important; }

        .page-btn:hover:not(:disabled) { background: #fff0f0 !important; border-color: #e03131 !important; color: #e03131 !important; }
        .page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: "#fdf8f6", fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside style={{
  width: 224, flexShrink: 0, background: "white",
  borderRight: "1px solid #f5eaea", display: "flex", flexDirection: "column",
  boxShadow: "2px 0 12px rgba(224,49,49,0.04)",
}}>
  {/* Brand */}
  <div style={{ padding: "22px 18px 18px", borderBottom: "1px solid #f5eaea" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: "linear-gradient(135deg, #e03131, #c92a2a)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 12px rgba(224,49,49,0.3)",
      }}>
        <i className="ti ti-school" style={{ fontSize: 17, color: "white" }} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>South Lakes IS</div>
        <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>Admin Portal</div>
      </div>
    </div>
  </div>

  {/* Nav */}
  <nav style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
    {getVisibleNavGroups(NAV).map((group) => (
      <div key={group.section} style={{ marginBottom: 6 }}>
        <div style={{
          fontSize: 9.5, color: "#cdb0b0", letterSpacing: "0.1em",
          textTransform: "uppercase", padding: "10px 10px 4px", fontWeight: 600,
        }}>
          {group.section}
        </div>
        {group.items.map((item) => {
          const active = location.pathname === item.path;
          return (
            <div
              key={item.path}
              className={`nav-item${active ? " nav-active" : ""}`}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 10px", borderRadius: 9,
                fontSize: 13, color: active ? "#e03131" : "#7a5a5a", cursor: "pointer",
              }}
              onClick={() => navigate(item.path)}
              role="button" tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && navigate(item.path)}
            >
              <i className={`ti ${item.icon}`} style={{ fontSize: 16, width: 20, textAlign: "center" }} />
              {item.label}
            </div>
          );
        })}
      </div>
    ))}
  </nav>

    <div style={{ padding:"14px 10px", borderTop:"1px solid #f5eaea" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px", borderRadius:10, background:"#fff8f6" }}>
        <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#fde8e8,#fca5a5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#e03131", flexShrink:0 }}>SA</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>Super Admin</div>
          <div style={{ fontSize:11, color:"#b09090" }}>super_admin</div>
        </div>
        <button
          title="Logout"
          onClick={() => setShowLogout(true)}
          style={{
            width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8,
            background:"white", display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer", color:"#c09090", transition:"all 0.12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.color="#e03131"; e.currentTarget.style.borderColor="#fca5a5"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.color="#c09090"; e.currentTarget.style.borderColor="#f0e4e4"; }}
        >
          <i className="ti ti-logout" style={{ fontSize:14 }} />
        </button>
      </div>
    </div>
</aside>
        {/* ── Main ────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Topbar */}
          <div style={{
            background: "white", borderBottom: "1px solid #f5eaea",
            padding: "0 28px", height: 58,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)",
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>
                Student
              </div>
              <div style={{ fontSize: 11.5, color: "#b09090", marginTop: 1 }}>
                {loading ? "Loading records…" : `${pageMeta.count.toLocaleString()} students registered`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            
              <button style={{
                width: 36, height: 36, border: "1px solid #f5eaea", borderRadius: 10,
                background: "white", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#9a7070", position: "relative",
              }}> 
                <i className="ti ti-bell" style={{ fontSize: 16 }} />
                <span style={{
                  width: 8, height: 8, background: "#e03131", borderRadius: "50%",
                  position: "absolute", top: 6, right: 6, border: "2px solid white",
                }} />
                
              </button>
              <button
                className="new-btn"
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "linear-gradient(135deg, #e03131, #c92a2a)",
                  color: "white", border: "none", borderRadius: 10,
                  padding: "9px 18px", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  boxShadow: "0 4px 16px rgba(224,49,49,0.26)",
                  letterSpacing: "0.01em",
                }}
                onClick={() => navigate("/students/new")}
              >
                <i className="ti ti-user-plus" style={{ fontSize: 15 }} />
                New Student
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>

            {/* ── Stat cards ── */}
            <div style={{ display: "flex", gap: 12 }}>
              <StatCard
                label="Total Students" icon="ti-users"
                value={statusCounts.all} loading={loading}
                color="#e03131" bg="#fff0f0"
              />
              <StatCard
                label="Active" icon="ti-circle-check"
                value={statusCounts.active} loading={loading}
                color="#2e6b0d" bg="#e8f5e0"
              />
              <StatCard
                label="Graduated" icon="ti-award"
                value={statusCounts.graduated} loading={loading}
                color="#1455a0" bg="#e3f0fd"
              />
              <StatCard
                label="Transferred" icon="ti-transfer"
                value={statusCounts.transferred} loading={loading}
                color="#7a4a08" bg="#fef3e2"
              />
              <StatCard
                label="Dropped" icon="ti-user-x"
                value={statusCounts.dropped} loading={loading}
                color="#9b2020" bg="#fde8e8"
              />
            </div>

            {/* ── Search + status chips ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                {/* Search */}
                <div
                  className="search-wrap"
                  style={{
                    flex: 1, display: "flex", alignItems: "center", gap: 10,
                    background: "white", border: "1.5px solid #f0e4e4",
                    borderRadius: 12, padding: "0 16px", height: 42,
                    transition: "border 0.15s, box-shadow 0.15s",
                  }}
                >
                  <i className="ti ti-search" style={{ fontSize: 15, color: "#c0a0a0", flexShrink: 0 }} />
                  <input
                    ref={searchRef}
                    className="search-input"
                    placeholder="Search by name, LRN, or email…"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    style={{
                      flex: 1, border: "none", background: "transparent",
                      fontSize: 13, color: "#1a0a0a", fontFamily: "'DM Sans', sans-serif",
                      outline: "none",
                    }}
                  />
                  {inputVal && (
                    <button
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", display: "flex", alignItems: "center", padding: 2, borderRadius: 4 }}
                      onClick={() => { setInputVal(""); setSearch(""); fetchStudents(1, "", statusFilter); }}
                    >
                      <i className="ti ti-x" style={{ fontSize: 13 }} />
                    </button>
                  )}
                </div>
                <button
                  style={{
                    height: 42, padding: "0 20px", background: "white",
                    border: "1.5px solid #f0e4e4", borderRadius: 12,
                    fontSize: 13, fontWeight: 600, color: "#7a5050",
                    cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    transition: "all 0.14s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#e03131"; e.currentTarget.style.color = "#e03131"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#f0e4e4"; e.currentTarget.style.color = "#7a5050"; }}
                  onClick={handleSearch}
                >
                  Search
                </button>
              </div>

              {/* Status filter chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STATUS_FILTERS.map((val) => {
                  const meta = STATUS_META[val];
                  const isActive = statusFilter === val;
                  return (
                    <button
                      key={val}
                      className={`chip-btn${isActive ? " active" : ""}`}
                      onClick={() => handleStatusFilter(val)}
                    >
                      {val !== "all" && (
                        <span style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: isActive ? "#e03131" : meta?.dot ?? "#9e9e9e",
                          flexShrink: 0,
                        }} />
                      )}
                      {val === "all" ? "All Students" : meta?.label}
                      {isActive && !loading && statusCounts[val] !== undefined && (
                        <span style={{
                          background: "#e03131", color: "white", borderRadius: 99,
                          fontSize: 10, fontWeight: 700, padding: "1px 7px", marginLeft: 2,
                        }}>
                          {statusCounts[val]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Table ── */}
            <div style={{
              background: "white", border: "1px solid #f5eaea",
              borderRadius: 16, overflow: "hidden",
              boxShadow: "0 2px 16px rgba(224,49,49,0.06)",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#fdfafa" }}>
                    {[
                      { label: "Student",     w: "30%" },
                      { label: "LRN",         w: "15%" },
                      { label: "Age / DOB",   w: "16%" },
                      { label: "Sex",         w: "9%"  },
                      { label: "Status",      w: "11%" },
                      { label: "Contact",     w: "13%" },
                      { label: "",            w: "6%"  },
                    ].map(({ label, w }) => (
                      <th key={label} style={{
                        textAlign: "left", fontSize: 10.5, fontWeight: 600,
                        color: "#c0a0a0", padding: "13px 18px",
                        borderBottom: "1px solid #f5eaea",
                        textTransform: "uppercase", letterSpacing: "0.07em",
                        width: w,
                      }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 7 }).map((_, i) => (
                        <tr key={i}>
                          <td style={{ padding: "14px 18px", borderBottom: "1px solid #f9f0f0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <Skeleton w={36} h={36} r={99} />
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <Skeleton w={130} h={13} />
                                <Skeleton w={90} h={11} />
                              </div>
                            </div>
                          </td>
                          {[88, 80, 44, 64, 90, 40].map((w, j) => (
                            <td key={j} style={{ padding: "14px 18px", borderBottom: "1px solid #f9f0f0" }}>
                              <Skeleton w={w} h={13} />
                            </td>
                          ))}
                        </tr>
                      ))
                    : students.length === 0
                      ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: "64px 16px" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                              <div style={{
                                width: 56, height: 56, borderRadius: 16, background: "#fff0f0",
                                display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4,
                              }}>
                                <i className="ti ti-users-off" style={{ fontSize: 24, color: "#e08080" }} />
                              </div>
                              <div style={{ fontSize: 15, color: "#7a5050", fontWeight: 600 }}>
                                No students found
                              </div>
                              <div style={{ fontSize: 12, color: "#b09090" }}>
                                Try adjusting your search or changing the status filter
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                      : students.map((st, idx) => {
                          const palette = getAvatarPalette(st.last_name);
                          const initials = `${st.first_name?.[0] ?? ""}${st.last_name?.[0] ?? ""}`.toUpperCase();
                          const pill = STATUS_META[st.status] ?? STATUS_META.inactive;
                          const age = calcAge(st.birth_date);
                          const dob = fmtDate(st.birth_date);
                          const fullName = [st.last_name, ",", st.first_name, st.middle_name ? st.middle_name[0] + "." : "", st.suffix ?? ""].filter(Boolean).join(" ");

                          return (
                            <tr
                              key={st.student_id}
                              className="student-row"
                              style={{ animation: `rowIn 0.22s ease both`, animationDelay: `${idx * 25}ms` }}
                              onClick={() => navigate(`/students/${st.student_id}`)}
                            >
                              {/* Student name + email */}
                              <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  <div style={{
                                    width: 36, height: 36, borderRadius: "50%",
                                    background: palette.bg, flexShrink: 0,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 12, fontWeight: 700, color: palette.color,
                                    letterSpacing: "0.02em",
                                  }}>
                                    {initials}
                                  </div>
                                  <div>
                                    <div className="row-name" style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a", lineHeight: 1.3, transition: "color 0.12s" }}>
                                      {fullName}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#b09090", marginTop: 2 }}>
                                      {st.email
                                        ? st.email
                                        : <span style={{ fontStyle: "italic", color: "#d0b8b8" }}>no email on file</span>}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* LRN */}
                              <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
                                {st.lrn
                                  ? <span style={{ fontFamily: "monospace", fontSize: 12, color: "#5a4a4a", background: "#f9f4f4", padding: "3px 8px", borderRadius: 6 }}>{st.lrn}</span>
                                  : <span style={{ color: "#d0b8b8", fontStyle: "italic", fontSize: 12 }}>—</span>}
                              </td>

                              {/* Age / DOB */}
                              <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
                                {age !== null
                                  ? (
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a" }}>{age} yrs</div>
                                      <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>{dob}</div>
                                    </div>
                                  )
                                  : <span style={{ color: "#d0b8b8", fontStyle: "italic", fontSize: 12 }}>—</span>}
                              </td>

                              {/* Sex */}
                              <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <i
                                    className={`ti ${st.sex === "male" ? "ti-mars" : "ti-venus"}`}
                                    style={{ fontSize: 14, color: st.sex === "male" ? "#2563eb" : "#be185d" }}
                                  />
                                  <span style={{ fontSize: 12, color: "#7a5a5a", textTransform: "capitalize" }}>{st.sex}</span>
                                </div>
                              </td>

                              {/* Status */}
                              <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
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

                              {/* Contact */}
                              <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
                                {st.mobile_number
                                  ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <i className="ti ti-phone" style={{ fontSize: 12, color: "#c0a0a0" }} />
                                      <span style={{ fontSize: 12, color: "#5a4a4a" }}>{st.mobile_number}</span>
                                    </div>
                                  )
                                  : <span style={{ color: "#d0b8b8", fontStyle: "italic", fontSize: 12 }}>—</span>}
                              </td>

                              {/* Actions */}
                              <td
                                style={{ padding: "13px 14px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button
                                    className="row-action" title="Edit"
                                    onClick={(e) => { e.stopPropagation(); navigate(`/students/${st.student_id}/edit`); }}
                                  >
                                    <i className="ti ti-pencil" style={{ fontSize: 13 }} />
                                  </button>
                                  <button
                                    className="row-action danger" title="Delete"
                                    style={{ color: "#c09090" }}
                                    onClick={(e) => { e.stopPropagation(); setToDelete(st); }}
                                  >
                                    <i className="ti ti-trash" style={{ fontSize: 13 }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                  }
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            {!loading && pageMeta.count > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#b09090" }}>
                  Page <strong style={{ color: "#7a5050" }}>{page}</strong> of{" "}
                  <strong style={{ color: "#7a5050" }}>{totalPages || 1}</strong>
                  &nbsp;·&nbsp; {pageMeta.count.toLocaleString()} total records
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="page-btn"
                    style={pgBtn}
                    disabled={!pageMeta.previous}
                    onClick={() => fetchStudents(page - 1, search, statusFilter)}
                  >
                    <i className="ti ti-chevron-left" style={{ fontSize: 13 }} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const start = Math.max(1, page - 2);
                    const p = start + i;
                    if (p > totalPages) return null;
                    const isActive = p === page;
                    return (
                      <button
                        key={p}
                        className="page-btn"
                        style={{ ...pgBtn, ...(isActive ? pgBtnActive : {}) }}
                        onClick={() => fetchStudents(p, search, statusFilter)}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    className="page-btn"
                    style={pgBtn}
                    disabled={!pageMeta.next}
                    onClick={() => fetchStudents(page + 1, search, statusFilter)}
                  >
                    <i className="ti ti-chevron-right" style={{ fontSize: 13 }} />
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Delete modal */}
      {toDelete && (
        <ConfirmModal
          student={toDelete}
          onConfirm={handleDelete}
          onCancel={() => setToDelete(null)}
        />
      )}

      {showLogout && (
        <LogoutModal
          onConfirm={() => {
            clearAuthSession();
            navigate("/");
          }}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </>
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
