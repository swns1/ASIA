import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { deleteStudent, getStudents } from "../api/studentApi";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// ── Sidebar nav config (shared) ──────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function statusPill(status) {
  const map = {
    active:      { bg: "#eaf3de", color: "#3b6d11" },
    inactive:    { bg: "#f1efe8", color: "#5f5e5a" },
    transferred: { bg: "#faeeda", color: "#854f0b" },
    graduated:   { bg: "#e6f1fb", color: "#185fa5" },
    dropped:     { bg: "#fcebeb", color: "#a32d2d" },
  };
  return map[status] ?? { bg: "#f1efe8", color: "#5f5e5a" };
}

function sexIcon(sex) {
  return sex === "male" ? "ti-mars" : "ti-venus";
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
const Skeleton = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "#e8e6e0", animation: "pulse 1.4s ease-in-out infinite" }} />
);

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ student, onConfirm, onCancel }) {
  return (
    <div style={s.modalOverlay}>
      <div style={s.modal}>
        <div style={s.modalIcon}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 22, color: "#e03131" }} />
        </div>
        <div style={s.modalTitle}>Delete Student?</div>
        <div style={s.modalBody}>
          This will permanently remove <strong>{student.first_name} {student.last_name}</strong> and all associated records. This action cannot be undone.
        </div>
        <div style={s.modalActions}>
          <button style={s.btnGhost} onClick={onCancel}>Cancel</button>
          <button style={s.btnDanger} onClick={onConfirm}>Yes, delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function StudentsPage() {
  const navigate = useNavigate();
  const [students, setStudents]     = useState([]);
  const [search, setSearch]         = useState("");
  const [inputVal, setInputVal]     = useState("");
  const [page, setPage]             = useState(1);
  const [pageMeta, setPageMeta]     = useState({ count: 0, next: null, previous: null });
  const [loading, setLoading]       = useState(true);
  const [toDelete, setToDelete]     = useState(null);
  const [statusFilter, setStatus]   = useState("all");
  const searchRef = useRef();

  const token = sessionStorage.getItem("access_token");

  const fetchStudents = async (nextPage = 1, term = search, status = statusFilter) => {
    setLoading(true);
    try {
      const data = await getStudents({ page: nextPage, search: term, status: status === "all" ? "" : status });
      setStudents(data.results || []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(nextPage);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    fetchStudents(1, "", "all");
  }, []);

  const handleSearch = () => {
    setSearch(inputVal);
    fetchStudents(1, inputVal, statusFilter);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleStatusFilter = (val) => {
    setStatus(val);
    fetchStudents(1, inputVal, val);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    await deleteStudent(toDelete.student_id);
    setToDelete(null);
    fetchStudents(page, search, statusFilter);
  };

  const totalPages = Math.ceil(pageMeta.count / 20);

  const STATUS_FILTERS = ["all", "active", "inactive", "transferred", "graduated", "dropped"];

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; }
        a { text-decoration: none; }
        .nav-item:hover { background: rgba(0,0,0,0.04) !important; }
        .nav-item-active { background: #fff0f0 !important; color: #e03131 !important; }
        .student-row:hover td { background: #fff8f6 !important; cursor: pointer; }
        .icon-btn:hover { background: #f5f5f3 !important; }
        .user-row:hover { background: #f5f5f3 !important; }
        .row-action:hover { background: #f5f5f3 !important; }
        .filter-chip:hover { border-color: #e03131 !important; color: #e03131 !important; }
        .filter-chip-active { background: #fff0f0 !important; border-color: #e03131 !important; color: #e03131 !important; font-weight: 600 !important; }
        .search-input:focus { outline: none; border-color: #e03131 !important; box-shadow: 0 0 0 3px rgba(224,49,49,0.08); }
        .new-btn:hover { background: #c42020 !important; box-shadow: 0 8px 24px rgba(224,49,49,0.28) !important; }
        .page-btn:hover:not(:disabled) { background: #fff0f0 !important; border-color: #e03131 !important; color: #e03131 !important; }
        .page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
      `}</style>

      <div style={s.shell}>
        {/* ── Sidebar ── */}
        <aside style={s.sidebar}>
          <div style={s.brand}>
            <div style={s.brandIcon}>
              <i className="ti ti-school" style={{ fontSize: 16, color: "white" }} />
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
                      <i className={`ti ${item.icon}`} style={{ fontSize: 17, width: 20, textAlign: "center" }} />
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
              <div style={s.topbarTitle}>Students</div>
              <div style={s.topbarSub}>
                {loading ? "Loading…" : `${pageMeta.count.toLocaleString()} total records`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="icon-btn" style={s.iconBtn} aria-label="Notifications">
                <i className="ti ti-bell" style={{ fontSize: 17 }} />
                <span style={s.badgeDot} />
              </button>
              <button
                className="new-btn"
                style={s.newBtn}
                onClick={() => navigate("/students/new")}
              >
                <i className="ti ti-user-plus" style={{ fontSize: 15 }} />
                New Student
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={s.content}>

            {/* Search + filters bar */}
            <div style={s.toolbar}>
              <div style={s.searchWrap}>
                <i className="ti ti-search" style={{ fontSize: 15, color: "#b09090", flexShrink: 0 }} />
                <input
                  ref={searchRef}
                  className="search-input"
                  placeholder="Search by name, LRN, or student number…"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={s.searchInput}
                />
                {inputVal && (
                  <button
                    style={s.clearBtn}
                    onClick={() => { setInputVal(""); setSearch(""); fetchStudents(1, "", statusFilter); }}
                  >
                    <i className="ti ti-x" style={{ fontSize: 13 }} />
                  </button>
                )}
              </div>
              <button style={s.searchBtn} onClick={handleSearch}>Search</button>
            </div>

            {/* Status filter chips */}
            <div style={s.chipRow}>
              {STATUS_FILTERS.map((val) => (
                <button
                  key={val}
                  className={`filter-chip${statusFilter === val ? " filter-chip-active" : ""}`}
                  style={{ ...s.chip, ...(statusFilter === val ? s.chipActive : {}) }}
                  onClick={() => handleStatusFilter(val)}
                >
                  {val === "all" ? "All students" : val.charAt(0).toUpperCase() + val.slice(1)}
                  {statusFilter === val && !loading && (
                    <span style={s.chipBadge}>{pageMeta.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Table panel */}
            <div style={s.panel}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {[
                      { label: "Student", w: "28%" },
                      { label: "LRN", w: "14%" },
                      { label: "Student No.", w: "13%" },
                      { label: "Sex", w: "8%" },
                      { label: "Status", w: "10%" },
                      { label: "Contact", w: "16%" },
                      { label: "", w: "11%" },
                    ].map(({ label, w }) => (
                      <th key={label} style={{ ...s.th, width: w }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                          <td style={s.td}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Skeleton w={32} h={32} r={99} />
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                <Skeleton w={120} h={13} />
                                <Skeleton w={80} h={11} />
                              </div>
                            </div>
                          </td>
                          {[90, 80, 50, 60, 90, 80].map((w, j) => (
                            <td key={j} style={s.td}><Skeleton w={w} h={13} /></td>
                          ))}
                        </tr>
                      ))
                    : students.length === 0
                      ? (
                        <tr>
                          <td colSpan={7} style={s.emptyCell}>
                            <div style={s.emptyState}>
                              <div style={s.emptyIcon}>
                                <i className="ti ti-users-off" style={{ fontSize: 22, color: "#c09090" }} />
                              </div>
                              <div style={{ fontSize: 14, color: "#7a5050", fontWeight: 500 }}>No students found</div>
                              <div style={{ fontSize: 12, color: "#b09090" }}>Try adjusting your search or filters</div>
                            </div>
                          </td>
                        </tr>
                      )
                      : students.map((st, idx) => {
                          const pill = statusPill(st.status);
                          const initials = `${st.first_name?.[0] ?? ""}${st.last_name?.[0] ?? ""}`.toUpperCase();
                          return (
                            <tr
                              key={st.student_id}
                              className="student-row"
                              style={{ animation: `fadeIn 0.2s ease both`, animationDelay: `${idx * 30}ms` }}
                              onClick={() => navigate(`/students/${st.student_id}`)}
                            >
                              {/* Name cell */}
                              <td style={s.td}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={s.studentAvatar}>
                                    {initials}
                                  </div>
                                  <div>
                                    <div style={s.studentName}>
                                      {st.last_name}, {st.first_name} {st.middle_name ? st.middle_name[0] + "." : ""} {st.suffix ?? ""}
                                    </div>
                                    <div style={s.studentSub}>
                                      {st.email ?? <span style={{ color: "#c0b0b0", fontStyle: "italic" }}>no email</span>}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td style={{ ...s.td, fontFamily: "monospace", fontSize: 12, color: "#5f5e5a" }}>{st.lrn}</td>
                              <td style={{ ...s.td, fontFamily: "monospace", fontSize: 12, color: "#5f5e5a" }}>{st.student_number}</td>

                              {/* Sex */}
                              <td style={s.td}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <i
                                    className={`ti ${sexIcon(st.sex)}`}
                                    style={{ fontSize: 14, color: st.sex === "male" ? "#185fa5" : "#a0399a" }}
                                  />
                                  <span style={{ fontSize: 12, color: "#7a5050", textTransform: "capitalize" }}>
                                    {st.sex}
                                  </span>
                                </div>
                              </td>

                              {/* Status */}
                              <td style={s.td}>
                                <span style={{ ...s.pill, background: pill.bg, color: pill.color }}>
                                  {st.status.charAt(0).toUpperCase() + st.status.slice(1)}
                                </span>
                              </td>

                              {/* Contact */}
                              <td style={{ ...s.td, fontSize: 12, color: "#7a5050" }}>
                                {st.mobile_number ?? <span style={{ color: "#c0b0b0", fontStyle: "italic" }}>—</span>}
                              </td>

                              {/* Actions */}
                              <td style={{ ...s.td }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button
                                    className="row-action"
                                    style={s.rowAction}
                                    title="View"
                                    onClick={(e) => { e.stopPropagation(); navigate(`/students/${st.student_id}`); }}
                                  >
                                    <i className="ti ti-eye" style={{ fontSize: 14 }} />
                                  </button>
                                  <button
                                    className="row-action"
                                    style={s.rowAction}
                                    title="Edit"
                                    onClick={(e) => { e.stopPropagation(); navigate(`/students/${st.student_id}/edit`); }}
                                  >
                                    <i className="ti ti-pencil" style={{ fontSize: 14 }} />
                                  </button>
                                  <button
                                    className="row-action"
                                    style={{ ...s.rowAction, color: "#e03131" }}
                                    title="Delete"
                                    onClick={(e) => { e.stopPropagation(); setToDelete(st); }}
                                  >
                                    <i className="ti ti-trash" style={{ fontSize: 14 }} />
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

            {/* Pagination */}
            {!loading && pageMeta.count > 0 && (
              <div style={s.pagination}>
                <span style={s.pageInfo}>
                  Page <strong>{page}</strong> of <strong>{totalPages || 1}</strong>
                  &nbsp;·&nbsp; {pageMeta.count.toLocaleString()} records
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="page-btn"
                    style={s.pageBtn}
                    disabled={!pageMeta.previous}
                    onClick={() => fetchStudents(page - 1, search, statusFilter)}
                  >
                    <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const start = Math.max(1, page - 2);
                    const p = start + i;
                    if (p > totalPages) return null;
                    return (
                      <button
                        key={p}
                        className="page-btn"
                        style={{ ...s.pageBtn, ...(p === page ? s.pageBtnActive : {}) }}
                        onClick={() => fetchStudents(p, search, statusFilter)}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    className="page-btn"
                    style={s.pageBtn}
                    disabled={!pageMeta.next}
                    onClick={() => fetchStudents(page + 1, search, statusFilter)}
                  >
                    <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Delete confirm modal */}
      {toDelete && (
        <ConfirmModal
          student={toDelete}
          onConfirm={handleDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
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
  newBtn:       { display: "flex", alignItems: "center", gap: 7, background: "#e03131", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 14px rgba(224,49,49,0.22)", transition: "background 0.15s, box-shadow 0.15s" },

  content:      { flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 },

  toolbar:      { display: "flex", gap: 8 },
  searchWrap:   { flex: 1, display: "flex", alignItems: "center", gap: 10, background: "white", border: "0.5px solid #f0e8e8", borderRadius: 10, padding: "0 14px", height: 40, transition: "border 0.15s" },
  searchInput:  { flex: 1, border: "none", background: "transparent", fontSize: 13, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif", outline: "none" },
  clearBtn:     { background: "none", border: "none", cursor: "pointer", color: "#b09090", display: "flex", alignItems: "center", padding: 0 },
  searchBtn:    { height: 40, padding: "0 16px", background: "white", border: "0.5px solid #f0e8e8", borderRadius: 10, fontSize: 13, fontWeight: 500, color: "#7a5050", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },

  chipRow:      { display: "flex", gap: 6, flexWrap: "wrap" },
  chip:         { display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 99, border: "0.5px solid #f0e8e8", background: "white", fontSize: 12, color: "#7a5050", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.1s" },
  chipActive:   { background: "#fff0f0", borderColor: "#e03131", color: "#e03131", fontWeight: 600 },
  chipBadge:    { background: "#e03131", color: "white", borderRadius: 99, fontSize: 10, fontWeight: 600, padding: "1px 6px" },

  panel:        { background: "white", border: "0.5px solid #f0e8e8", borderRadius: 12, overflow: "hidden" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { textAlign: "left", fontSize: 10.5, fontWeight: 500, color: "#b09090", padding: "11px 16px", borderBottom: "0.5px solid #f0e8e8", textTransform: "uppercase", letterSpacing: "0.06em", background: "#fdfcfc" },
  td:           { padding: "11px 16px", borderBottom: "0.5px solid #f0e8e8", color: "#1a1a1a", verticalAlign: "middle", transition: "background 0.1s" },

  studentAvatar:{ width: 32, height: 32, borderRadius: "50%", background: "#fde8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#e03131", flexShrink: 0, letterSpacing: "0.02em" },
  studentName:  { fontSize: 13, fontWeight: 500, color: "#1a1a1a", lineHeight: 1.4 },
  studentSub:   { fontSize: 11, color: "#a07070", lineHeight: 1.3, marginTop: 1 },

  pill:         { display: "inline-block", fontSize: 11, padding: "2px 9px", borderRadius: 99, fontWeight: 500 },

  rowAction:    { width: 28, height: 28, border: "0.5px solid #f0e8e8", borderRadius: 7, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#7a5050", transition: "background 0.1s", fontFamily: "'DM Sans', sans-serif" },

  emptyCell:    { textAlign: "center", padding: "48px 16px" },
  emptyState:   { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  emptyIcon:    { width: 48, height: 48, borderRadius: 12, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 },

  pagination:   { display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 },
  pageInfo:     { fontSize: 12, color: "#a07070" },
  pageBtn:      { width: 32, height: 32, border: "0.5px solid #f0e8e8", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12, color: "#7a5050", fontFamily: "'DM Sans', sans-serif", transition: "all 0.1s" },
  pageBtnActive:{ background: "#fff0f0", borderColor: "#e03131", color: "#e03131", fontWeight: 600 },

  // Modal
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(2px)" },
  modal:        { background: "white", borderRadius: 16, padding: "28px 32px", width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, animation: "fadeIn 0.15s ease" },
  modalIcon:    { width: 52, height: 52, borderRadius: 12, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" },
  modalTitle:   { fontSize: 16, fontWeight: 600, color: "#1a1a1a" },
  modalBody:    { fontSize: 13, color: "#7a5050", textAlign: "center", lineHeight: 1.6 },
  modalActions: { display: "flex", gap: 8, marginTop: 4, width: "100%" },
  btnGhost:     { flex: 1, height: 38, border: "0.5px solid #f0e8e8", borderRadius: 8, background: "white", fontSize: 13, color: "#7a5050", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 },
  btnDanger:    { flex: 1, height: 38, border: "none", borderRadius: 8, background: "#e03131", fontSize: 13, color: "white", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, boxShadow: "0 4px 12px rgba(224,49,49,0.22)" },
};
