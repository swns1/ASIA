import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// ── Sidebar nav config ──────────────────────────────────────────────────────
const NAV = [
  {
    section: "Main",
    items: [
      { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/Dashboard" },
      { label: "Students",    icon: "ti-users",             path: "/Students" },
      { label: "Enrollments", icon: "ti-clipboard-list",    path: "/enrollment" },
      { label: "Grades",      icon: "ti-chart-bar",         path: "/Grades" },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Invoices",     icon: "ti-receipt",   path: "/invoices" },
      { label: "Payments",     icon: "ti-cash",      path: "/payments" },
      { label: "Scholarships", icon: "ti-discount",  path: "/scholarships" },
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

// ── Helpers ─────────────────────────────────────────────────────────────────
function levelLabel(level) {
  const map = {
    nursery:          "Nursery",
    kindergarten:     "Kindergarten",
    elementary:       "Elementary",
    junior_highschool:  "Junior HS",
    senior_highschool:  "Senior HS",
  };
  return map[level] ?? level;
}

function levelIcon(level) {
  const map = {
    nursery:           "ti-baby-carriage",
    kindergarten:      "ti-star",
    elementary:        "ti-book",
    junior_highschool: "ti-school",
    senior_highschool: "ti-certificate",
  };
  return map[level] ?? "ti-school";
}

function pillClass(status) {
  const map = {
    enrolled:  { bg: "#eaf3de", color: "#3b6d11" },
    pending:   { bg: "#faeeda", color: "#854f0b" },
    cancelled: { bg: "#fcebeb", color: "#a32d2d" },
    completed: { bg: "#e6f1fb", color: "#185fa5" },
  };
  return map[status] ?? { bg: "#f1efe8", color: "#5f5e5a" };
}

function fmtCurrency(n) {
  if (n >= 1_000_000) return `₱ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₱ ${Math.round(n / 1_000)}k`;
  return `₱ ${n}`;
}

// ── Skeleton loader ──────────────────────────────────────────────────────────
const Skeleton = ({ w = "100%", h = 18, r = 6 }) => (
  <div
    style={{
      width: w, height: h, borderRadius: r,
      background: "var(--sk, #e8e6e0)",
      animation: "pulse 1.4s ease-in-out infinite",
    }}
  />
);

// ── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, icon, chipText, chipType, loading }) {
  const chipColors = {
    up:      { bg: "#eaf3de", color: "#3b6d11" },
    down:    { bg: "#fcebeb", color: "#a32d2d" },
    neutral: { bg: "#f1efe8", color: "#5f5e5a" },
  };
  const chip = chipColors[chipType] ?? chipColors.neutral;

  return (
    <div style={s.statCard}>
      <div style={s.statTop}>
        <span style={s.statLabel}>{label}</span>
        <div style={s.statIcon}>
          <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 15, color: "#e03131" }} />
        </div>
      </div>
      {loading
        ? <Skeleton h={30} w="60%" />
        : <div style={s.statValue}>{value}</div>
      }
      <div style={s.statFooter}>
        {loading
          ? <Skeleton h={16} w="70%" />
          : <><span style={{ ...s.chip, background: chip.bg, color: chip.color }}>{chipText}</span></>
        }
      </div>
    </div>
  );
}

function Panel({ title, action, onAction, children }) {
  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>{title}</span>
        {action && (
          <button style={s.panelAction} onClick={onAction}>{action}</button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats]               = useState(null);
  const [recentEnrollments, setRecent]  = useState([]);
  const [levelBreakdown, setLevels]     = useState([]);
  const [requirements, setReqs]         = useState([]);
  const [welfare, setWelfare]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [schoolYear, setSchoolYear]     = useState("—");

  // User from session
  const token = sessionStorage.getItem("access_token");

  useEffect(() => {
    if (!token) { navigate("/login"); return; }

    const headers = { Authorization: `Bearer ${token}` };

    async function fetchAll() {
      try {
        const [statsRes, recentRes, levelsRes, reqsRes, welfareRes, syRes] =
          await Promise.all([
            fetch(`${BASE_URL}/api/dashboard/stats/`,              { headers }),
            fetch(`${BASE_URL}/api/dashboard/recent-enrollments/`, { headers }),
            fetch(`${BASE_URL}/api/dashboard/level-breakdown/`,    { headers }),
            fetch(`${BASE_URL}/api/dashboard/requirements/`,       { headers }),
            fetch(`${BASE_URL}/api/dashboard/welfare/`,            { headers }),
            fetch(`${BASE_URL}/api/dashboard/school-year/`,        { headers }),
          ]);

        const [s, r, l, q, w, sy] = await Promise.all([
          statsRes.ok   ? statsRes.json()   : null,
          recentRes.ok  ? recentRes.json()  : [],
          levelsRes.ok  ? levelsRes.json()  : [],
          reqsRes.ok    ? reqsRes.json()    : [],
          welfareRes.ok ? welfareRes.json() : null,
          syRes.ok      ? syRes.json()      : null,
        ]);

        if (s)  setStats(s);
        if (r)  setRecent(r);
        if (l)  setLevels(l);
        if (q)  setReqs(q);
        if (w)  setWelfare(w);
        if (sy) setSchoolYear(sy.label ?? "—");
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, [token]);

  // Max students across levels (for bar width %)
  const maxLevel = Math.max(...levelBreakdown.map((l) => l.count), 1);

  const reqDotColor = (submitted, total) => {
    const pct = total > 0 ? submitted / total : 0;
    if (pct >= 0.8) return "#3b6d11";
    if (pct >= 0.5) return "#854f0b";
    return "#a32d2d";
  };

  return (
    <>
      {/* Inject pulse keyframe */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        --sk: var(--color-background-secondary, #e8e6e0);
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; }
        a { text-decoration: none; }
        .nav-item:hover { background: rgba(0,0,0,0.04) !important; }
        .nav-item-active { background: #fff0f0 !important; color: #e03131 !important; }
        .qa-btn:hover { background: #fde8e8 !important; }
        .enroll-row:hover td { background: #fff8f6 !important; }
        .icon-btn:hover { background: #f5f5f3 !important; }
        .user-row:hover { background: #f5f5f3 !important; }
      `}</style>

      <div style={s.shell}>
        {/* ── Sidebar ── */}
        <aside style={s.sidebar}>
          <div style={s.brand}>
            <div style={s.brandIcon}>
              <i className="ti ti-school" aria-hidden="true" style={{ fontSize: 16, color: "white" }} />
            </div>
            <div>
              <div style={s.brandText}>South Lakes IS</div>
              <div style={s.brandSub}>Admin Portal</div>
            </div>
          </div>

          <nav style={s.nav}>
            {NAV.map((group) => (
              <div key={group.section}>
                <div style={s.navSection}>{group.section}</div>
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <div
                      key={item.path}
                      className={`nav-item${active ? " nav-item-active" : ""}`}
                      style={{ ...s.navItem, ...(active ? s.navActive : {}) }}
                      onClick={() => navigate(item.path)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && navigate(item.path)}
                    >
                      <i className={`ti ${item.icon}`} aria-hidden="true" style={{ fontSize: 17, width: 20, textAlign: "center" }} />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>

          <div style={s.sidebarFooter}>
            <div className="user-row" style={s.userRow}>
              <div style={s.avatar}>SA</div>
              <div>
                <div style={s.userName}>Super Admin</div>
                <div style={s.userRole}>super_admin</div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div style={s.main}>
          {/* Topbar */}
          <div style={s.topbar}>
            <div>
              <div style={s.topbarTitle}>Dashboard</div>
              <div style={s.topbarSub}>{schoolYear}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="icon-btn" style={s.iconBtn} aria-label="Notifications">
                <i className="ti ti-bell" aria-hidden="true" style={{ fontSize: 17 }} />
                <span style={s.badgeDot} />
              </button>
              <button className="icon-btn" style={s.iconBtn} aria-label="Search">
                <i className="ti ti-search" aria-hidden="true" style={{ fontSize: 17 }} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={s.content}>

            {/* Stat cards */}
            <div style={s.statGrid}>
              <StatCard
                label="Total students" icon="ti-users"
                value={stats ? stats.total_students.toLocaleString() : "—"}
                chipText={stats ? `+${stats.new_vs_last_sy} vs last S.Y.` : "loading…"}
                chipType="up" loading={loading}
              />
              <StatCard
                label="Enrolled this S.Y." icon="ti-clipboard-check"
                value={stats ? stats.enrolled.toLocaleString() : "—"}
                chipText={stats ? `${stats.enrollment_rate}% rate` : "loading…"}
                chipType="neutral" loading={loading}
              />
              <StatCard
                label="Pending enrollment" icon="ti-clock"
                value={stats ? stats.pending.toLocaleString() : "—"}
                chipText="needs action"
                chipType="down" loading={loading}
              />
              <StatCard
                label="Unpaid invoices" icon="ti-receipt-2"
                value={stats ? fmtCurrency(stats.unpaid_amount) : "—"}
                chipText={stats ? `${stats.unpaid_count} invoices` : "loading…"}
                chipType="down" loading={loading}
              />
            </div>

            {/* Recent enrollments + Level breakdown */}
            <div style={s.twoCol}>
              <Panel title="Recent enrollments" action="View all →" onAction={() => navigate("/enrollments")}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {["Student", "Level", "Section", "Status"].map((h) => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}>
                            {[120, 80, 70, 60].map((w, j) => (
                              <td key={j} style={s.td}><Skeleton w={w} h={14} /></td>
                            ))}
                          </tr>
                        ))
                      : recentEnrollments.length === 0
                        ? <tr><td colSpan={4} style={{ ...s.td, textAlign: "center", color: "#888" }}>No recent enrollments</td></tr>
                        : recentEnrollments.map((e) => {
                            const pill = pillClass(e.enrollment_status);
                            return (
                              <tr key={e.enrollment_id} className="enroll-row" style={{ cursor: "pointer" }}
                                  onClick={() => navigate(`/students/${e.student_id}`)}>
                                <td style={s.td}>{e.student_name}</td>
                                <td style={s.td}>{levelLabel(e.school_level)} {e.grade_level}</td>
                                <td style={s.td}>{e.section}</td>
                                <td style={s.td}>
                                  <span style={{ ...s.pill, background: pill.bg, color: pill.color }}>
                                    {e.enrollment_status.charAt(0).toUpperCase() + e.enrollment_status.slice(1)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                    }
                  </tbody>
                </table>
              </Panel>

              <Panel title="Students by level">
                <div>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} style={s.levelRow}>
                          <Skeleton w={28} h={28} r={6} />
                          <Skeleton w={90} h={14} />
                          <div style={{ flex: 1 }} />
                          <Skeleton w={30} h={14} />
                        </div>
                      ))
                    : levelBreakdown.map((lv) => (
                        <div key={lv.school_level} style={s.levelRow}>
                          <div style={s.levelIcon}>
                            <i className={`ti ${levelIcon(lv.school_level)}`} aria-hidden="true" style={{ fontSize: 14, color: "#e03131" }} />
                          </div>
                          <span style={s.levelName}>{levelLabel(lv.school_level)}</span>
                          <div style={s.barWrap}>
                            <div style={{ ...s.bar, width: `${Math.round((lv.count / maxLevel) * 100)}%` }} />
                          </div>
                          <span style={s.levelCount}>{lv.count.toLocaleString()}</span>
                        </div>
                      ))
                  }
                </div>
              </Panel>
            </div>

            {/* Quick actions + Requirements + Welfare */}
            <div style={s.threeCol}>
              <Panel title="Quick actions">
                <div style={s.qaGrid}>
                  {[
                    { label: "New student",  icon: "ti-user-plus",  path: "/students/new" },
                    { label: "New invoice",  icon: "ti-file-plus",  path: "/invoices/new" },
                    { label: "Add payment",  icon: "ti-cash",       path: "/payments/new" },
                    { label: "Add user",     icon: "ti-user-cog",   path: "/users/new" },
                  ].map((qa) => (
                    <button
                      key={qa.label}
                      className="qa-btn"
                      style={s.qaBtn}
                      onClick={() => navigate(qa.path)}
                    >
                      <i className={`ti ${qa.icon}`} aria-hidden="true" style={{ fontSize: 16, color: "#e03131" }} />
                      {qa.label}
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel title="Requirements status" action="View →" onAction={() => navigate("/students?tab=requirements")}>
                <div>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} style={s.reqRow}>
                          <Skeleton w={8} h={8} r={99} />
                          <Skeleton w={120} h={13} />
                          <Skeleton w={60} h={13} />
                        </div>
                      ))
                    : requirements.map((r) => (
                        <div key={r.requirement_type_id} style={s.reqRow}>
                          <span style={{ ...s.reqDot, background: reqDotColor(r.submitted_count, r.total_students) }} />
                          <span style={s.reqName}>{r.requirement_name}</span>
                          <span style={s.reqCount}>{r.submitted_count.toLocaleString()} submitted</span>
                        </div>
                      ))
                  }
                </div>
              </Panel>

              <Panel title="Student welfare">
                <div>
                  {[
                    { label: "4Ps beneficiaries", icon: "ti-heart",          key: "four_ps",      iconColor: "#3b6d11", bg: "#eaf3de", val: welfare?.four_ps },
                    { label: "With scholarship",  icon: "ti-award",           key: "scholarships", iconColor: "#185fa5", bg: "#e6f1fb", val: welfare?.scholarships },
                    { label: "Transferred out",   icon: "ti-alert-triangle",  key: "transferred",  iconColor: "#854f0b", bg: "#faeeda", val: welfare?.transferred },
                    { label: "Dropped",           icon: "ti-user-off",        key: "dropped",      iconColor: "#a32d2d", bg: "#fcebeb", val: welfare?.dropped },
                  ].map((item) => (
                    <div key={item.key} style={s.levelRow}>
                      <div style={{ ...s.levelIcon, background: item.bg }}>
                        <i className={`ti ${item.icon}`} aria-hidden="true" style={{ fontSize: 14, color: item.iconColor }} />
                      </div>
                      <span style={s.levelName}>{item.label}</span>
                      {loading
                        ? <Skeleton w={30} h={14} />
                        : <span style={{ ...s.levelCount, color: item.iconColor }}>{item.val?.toLocaleString() ?? "—"}</span>
                      }
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = {
  shell:        { display: "flex", height: "100vh", background: "#fff8f6", fontFamily: "'DM Sans', sans-serif", overflow: "hidden" },
  sidebar:      { width: 220, flexShrink: 0, background: "white", borderRight: "0.5px solid #f0e8e8", display: "flex", flexDirection: "column" },
  brand:        { padding: "20px 18px 16px", borderBottom: "0.5px solid #f0e8e8", display: "flex", alignItems: "center", gap: 10 },
  brandIcon:    { width: 32, height: 32, background: "#e03131", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  brandText:    { fontSize: 13, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.3 },
  brandSub:     { fontSize: 11, color: "#a07070" },
  nav:          { flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" },
  navSection:   { fontSize: 10, color: "#b09090", letterSpacing: "0.08em", textTransform: "uppercase", padding: "10px 8px 4px" },
  navItem:      { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, fontSize: 13, color: "#7a5050", cursor: "pointer", transition: "background 0.1s" },
  navActive:    { background: "#fff0f0", color: "#e03131", fontWeight: 600 },
  sidebarFooter:{ padding: "14px 10px", borderTop: "0.5px solid #f0e8e8" },
  userRow:      { display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, cursor: "pointer", transition: "background 0.1s" },
  avatar:       { width: 30, height: 30, borderRadius: "50%", background: "#fde8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#e03131", flexShrink: 0 },
  userName:     { fontSize: 13, fontWeight: 500, color: "#1a1a1a" },
  userRole:     { fontSize: 11, color: "#a07070" },

  main:         { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar:       { background: "white", borderBottom: "0.5px solid #f0e8e8", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  topbarTitle:  { fontSize: 15, fontWeight: 600, color: "#1a1a1a" },
  topbarSub:    { fontSize: 12, color: "#a07070" },
  iconBtn:      { width: 32, height: 32, border: "0.5px solid #f0e8e8", borderRadius: 8, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#7a5050", position: "relative" },
  badgeDot:     { width: 7, height: 7, background: "#e03131", borderRadius: "50%", position: "absolute", top: 5, right: 5 },

  content:      { flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 },

  statGrid:     { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 },
  statCard:     { background: "white", border: "0.5px solid #f0e8e8", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 },
  statTop:      { display: "flex", alignItems: "center", justifyContent: "space-between" },
  statLabel:    { fontSize: 12, color: "#a07070" },
  statIcon:     { width: 30, height: 30, borderRadius: 8, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" },
  statValue:    { fontSize: 26, fontWeight: 500, color: "#1a1a1a", lineHeight: 1 },
  statFooter:   { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#a07070" },
  chip:         { fontSize: 11, padding: "2px 7px", borderRadius: 99, fontWeight: 500 },

  twoCol:       { display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 12 },
  threeCol:     { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 },

  panel:        { background: "white", border: "0.5px solid #f0e8e8", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" },
  panelHeader:  { padding: "14px 16px", borderBottom: "0.5px solid #f0e8e8", display: "flex", alignItems: "center", justifyContent: "space-between" },
  panelTitle:   { fontSize: 13, fontWeight: 600, color: "#1a1a1a" },
  panelAction:  { fontSize: 12, color: "#e03131", cursor: "pointer", border: "none", background: "none", fontFamily: "'DM Sans', sans-serif" },

  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { textAlign: "left", fontSize: 11, fontWeight: 500, color: "#a07070", padding: "10px 16px", borderBottom: "0.5px solid #f0e8e8", textTransform: "uppercase", letterSpacing: "0.05em" },
  td:           { padding: "10px 16px", borderBottom: "0.5px solid #f0e8e8", color: "#1a1a1a", verticalAlign: "middle" },
  pill:         { display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 500 },

  levelRow:     { display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: "0.5px solid #f0e8e8" },
  levelIcon:    { width: 28, height: 28, borderRadius: 8, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  levelName:    { fontSize: 13, color: "#1a1a1a", flex: 1 },
  levelCount:   { fontSize: 13, fontWeight: 500, color: "#1a1a1a" },
  barWrap:      { width: 60, height: 4, background: "#f0e8e8", borderRadius: 99, overflow: "hidden" },
  bar:          { height: "100%", borderRadius: 99, background: "#e03131" },

  qaGrid:       { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, padding: 14 },
  qaBtn:        { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "0.5px solid #f0e8e8", borderRadius: 8, background: "#fff8f6", cursor: "pointer", fontSize: 13, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif", transition: "background 0.1s" },

  reqRow:       { display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: "0.5px solid #f0e8e8", fontSize: 13 },
  reqDot:       { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  reqName:      { flex: 1, color: "#1a1a1a" },
  reqCount:     { color: "#a07070", fontSize: 12 },
};