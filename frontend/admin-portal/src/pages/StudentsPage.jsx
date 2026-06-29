import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";
import { deleteStudent, getStudents } from "../api/studentApi";
import { modalVariants, springTransition } from "../utils/motion";


// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_META = {
  active:      { bg: "#e8f5e0", color: "#2e6b0d", dot: "#4caf50", label: "Active" },
  inactive:    { bg: "#f0ede8", color: "#5c5752", dot: "#9e9e9e", label: "Inactive" },
  transferred: { bg: "#fef3e2", color: "#7a4a08", dot: "#ff9800", label: "Transferred" },
  graduated:   { bg: "#e3f0fd", color: "#1455a0", dot: "#2196f3", label: "Graduated" },
  dropped:     { bg: "#fde8e8", color: "#9b2020", dot: "#f44336", label: "Dropped" },
};

const STATUS_FILTERS = ["all", "active", "inactive", "transferred", "graduated", "dropped"];

const SORT_OPTIONS = [
  { value: "-student_id", label: "Newest first" },
  { value: "student_id",  label: "Oldest first" },
  { value: "last_name",   label: "Name A → Z" },
  { value: "-last_name",  label: "Name Z → A" },
  { value: "birth_date",  label: "Youngest last" },
  { value: "-birth_date", label: "Youngest first" },
];

const SEX_FILTERS = [
  { value: "", label: "All" },
  { value: "male",   label: "Male",   icon: "ti-mars",  color: "#2563eb" },
  { value: "female", label: "Female", icon: "ti-venus", color: "#be185d" },
];

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
          ? <Skeleton w={40} h={20} r={4} />
          : <div style={{ fontSize: 22, fontWeight: 700, color: "#1a0a0a", lineHeight: 1 }}>{value?.toLocaleString() ?? "—"}</div>
        }
        <div style={{ fontSize: 11, color: "#a07878", marginTop: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      </div>
    </motion.div>
  );
}

// ── Delete confirm modal ───────────────────────────────────────────────────────
function ConfirmModal({ student, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onCancel}
        style={{ position: "absolute", inset: 0, background: "rgba(26,10,10,0.35)", backdropFilter: "blur(4px)" }}
      />
      <motion.div
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={springTransition}
        style={{
          position: "relative", background: "white", borderRadius: 20, padding: "32px 36px",
          width: 400, boxShadow: "0 24px 64px rgba(224,49,49,0.18)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
        }}
      >
        <div style={{
          width: 60, height: 60, borderRadius: 16, background: "#fff0f0",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className="ti ti-trash" style={{ fontSize: 24, color: "#e03131" }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a0a0a" }}>
          Delete Student?
        </div>
        <div style={{ fontSize: 13, color: "#7a5050", textAlign: "center", lineHeight: 1.7 }}>
          You're about to permanently remove{" "}
          <strong style={{ color: "#1a0a0a" }}>{student.first_name} {student.last_name}</strong>{" "}
          and all their associated records. This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 6, width: "100%" }}>
          <motion.button
            whileHover={{ background: "#fdf8f8" }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12 }}
            style={{
              flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10,
              background: "white", fontSize: 13, color: "#7a5050", cursor: "pointer",
              fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
            }}
            onClick={onCancel}
          >Cancel</motion.button>
          <motion.button
            whileHover={{ opacity: 0.88 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12 }}
            style={{
              flex: 1, height: 42, border: "none", borderRadius: 10,
              background: "linear-gradient(135deg, #e03131, #c92a2a)",
              fontSize: 13, color: "white", cursor: "pointer",
              fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              boxShadow: "0 4px 16px rgba(224,49,49,0.3)",
            }}
            onClick={onConfirm}
          >Yes, delete</motion.button>
        </div>
      </motion.div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function StudentsPage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [students, setStudents]   = useState([]);
  const [search, setSearch]       = useState("");
  const [inputVal, setInputVal]   = useState("");
  const PAGE_SIZE = 20;
  const [page, setPage]           = useState(1);
  const [pageMeta, setPageMeta]   = useState({ count: 0, next: null, previous: null });
  const [loading, setLoading]     = useState(true);
  const [toDelete, setToDelete]   = useState(null);
  const [statusFilter, setStatus] = useState("all");
  const [sexFilter, setSexFilter] = useState("");
  const [ordering, setOrdering]   = useState("-student_id");
  const [isRecents, setIsRecents] = useState(false);

  // Per-status counts for stat cards
  const [statusCounts, setStatusCounts] = useState({});

  const searchRef   = useRef();
  const hasAnimated = useRef(false);
  const rowsAnimated = useRef(false); // rows only animate on the very first load
  const token = sessionStorage.getItem("access_token");

  // Fetch students — all filter/sort params threaded through
  const fetchStudents = async (
    nextPage = 1,
    term = search,
    status = statusFilter,
    sex = sexFilter,
    ord = ordering,
  ) => {
    setLoading(true);
    try {
      const data = await getStudents({
        page: nextPage,
        page_size: PAGE_SIZE,
        search: term,
        status: status === "all" ? "" : status,
        sex,
        ordering: ord,
      });
      setStudents(data.results || []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(nextPage);
      rowsAnimated.current = true;
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
    fetchStudents(1, "", "all", "", "-student_id");
    fetchCounts();
  }, []);

  const handleSearch = () => {
    setSearch(inputVal);
    setIsRecents(false);
    fetchStudents(1, inputVal, statusFilter, sexFilter, ordering);
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSearch(); };

  const handleStatusFilter = (val) => {
    setStatus(val);
    setIsRecents(false);
    fetchStudents(1, inputVal, val, sexFilter, ordering);
  };

  const handleSexFilter = (val) => {
    setSexFilter(val);
    setIsRecents(false);
    fetchStudents(1, inputVal, statusFilter, val, ordering);
  };

  const handleOrdering = (val) => {
    setOrdering(val);
    setIsRecents(false);
    fetchStudents(1, inputVal, statusFilter, sexFilter, val);
  };

  const handleRecents = () => {
    const newRecents = !isRecents;
    setIsRecents(newRecents);
    if (newRecents) {
      setInputVal("");
      setSearch("");
      setStatus("all");
      setSexFilter("");
      setOrdering("-student_id");
      fetchStudents(1, "", "all", "", "-student_id");
    }
  };

  const handleClearAll = () => {
    setInputVal("");
    setSearch("");
    setStatus("all");
    setSexFilter("");
    setOrdering("-student_id");
    setIsRecents(false);
    fetchStudents(1, "", "all", "", "-student_id");
  };

  const hasActiveFilters = search || statusFilter !== "all" || sexFilter || ordering !== "-student_id";

  const handleDelete = async () => {
    if (!toDelete) return;
    await deleteStudent(toDelete.student_id);
    setToDelete(null);
    fetchStudents(page, search, statusFilter, sexFilter, ordering);
    fetchCounts();
  };

  const totalPages = Math.ceil(pageMeta.count / PAGE_SIZE);

  const isFirstRender    = !hasAnimated.current;
  if (isFirstRender) hasAnimated.current = true;
  const isFirstRowRender = !rowsAnimated.current;

  return (
    <AppLayout>

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
            
              {/* <button style={{
                width: 36, height: 36, border: "1px solid #f5eaea", borderRadius: 10,
                background: "white", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#9a7070", position: "relative",
              }}> 
                <i className="ti ti-bell" style={{ fontSize: 16 }} />
                <span style={{
                  width: 8, height: 8, background: "#e03131", borderRadius: "50%",
                  position: "absolute", top: 6, right: 6, border: "2px solid white",
                }} />
                
              </button> */}
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: "0 8px 28px rgba(224,49,49,0.32)" }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.13 }}
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
              </motion.button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>

            {/* ── Stat cards ── */}
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { label: "Total Students", icon: "ti-users",       value: statusCounts.all,         color: "#e03131", bg: "#fff0f0" },
                { label: "Active",         icon: "ti-user-check",  value: statusCounts.active,      color: "#2e6b0d", bg: "#e8f5e0" },
                { label: "Graduated",      icon: "ti-certificate", value: statusCounts.graduated,   color: "#1455a0", bg: "#e3f0fd" },
                { label: "Transferred",    icon: "ti-transfer",    value: statusCounts.transferred, color: "#7a4a08", bg: "#fef3e2" },
                { label: "Dropped",        icon: "ti-user-x",      value: statusCounts.dropped,     color: "#9b2020", bg: "#fde8e8" },
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

            {/* ── Search + filters ── */}
            <motion.div
              initial={isFirstRender ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.22 : 0 }}
              style={{
                background: "white", border: "1px solid #f5eaea",
                borderRadius: 14, padding: "18px 20px",
                boxShadow: "0 2px 12px rgba(224,49,49,0.05)",
                display: "flex", flexDirection: "column", gap: 0,
              }}
            >

              {/* Row 1: search + sort + clear */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {/* Search box */}
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
                      onClick={() => { setInputVal(""); setSearch(""); fetchStudents(1, "", statusFilter, sexFilter, ordering); }}
                    >
                      <i className="ti ti-x" style={{ fontSize: 13 }} />
                    </button>
                  )}
                </div>

                {/* Sort dropdown */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <i className="ti ti-arrows-sort" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#c0a0a0", pointerEvents: "none" }} />
                  <select
                    value={ordering}
                    onChange={(e) => handleOrdering(e.target.value)}
                    style={{
                      height: 42, paddingLeft: 34, paddingRight: 14,
                      border: `1.5px solid ${ordering !== "-student_id" ? "#e03131" : "#f0e4e4"}`,
                      borderRadius: 12, background: ordering !== "-student_id" ? "#fff0f0" : "white",
                      fontSize: 13, fontWeight: 600,
                      color: ordering !== "-student_id" ? "#e03131" : "#7a5050",
                      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                      outline: "none", appearance: "none", minWidth: 158,
                    }}
                  >
                    {SORT_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Search button */}
                <button
                  style={{
                    height: 42, padding: "0 20px", background: "white",
                    border: "1.5px solid #f0e4e4", borderRadius: 12,
                    fontSize: 13, fontWeight: 600, color: "#7a5050",
                    cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    transition: "all 0.14s", flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#e03131"; e.currentTarget.style.color = "#e03131"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#f0e4e4"; e.currentTarget.style.color = "#7a5050"; }}
                  onClick={handleSearch}
                >
                  Search
                </button>

                {/* Clear all filters */}
                <AnimatePresence>
                  {hasActiveFilters && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.88 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.88 }}
                      transition={{ duration: 0.14 }}
                      whileTap={{ scale: 0.93 }}
                      onClick={handleClearAll}
                      title="Clear all filters"
                      style={{
                        height: 42, padding: "0 14px", background: "white",
                        border: "1.5px solid #fca5a5", borderRadius: 12,
                        fontSize: 12, fontWeight: 600, color: "#b91c1c",
                        cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                        display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                      }}
                    >
                      <i className="ti ti-filter-off" style={{ fontSize: 13 }} />
                      Clear
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "#f5eaea", margin: "14px 0" }} />

              {/* Chip rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* Status */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Status</div>
                  <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {STATUS_FILTERS.map((val) => {
                      const meta = STATUS_META[val];
                      const isActive = statusFilter === val;
                      return (
                        <motion.button
                          key={val}
                          initial={false}
                          animate={{
                            backgroundColor: isActive ? "#fff0f0" : "#ffffff",
                            color:           isActive ? "#e03131" : "#9a7070",
                            borderColor:     isActive ? "#e03131" : "#f0e4e4",
                          }}
                          layout
                          transition={{ layout: { type: "spring", stiffness: 400, damping: 36 }, duration: 0.18, ease: "easeOut" }}
                          onClick={() => handleStatusFilter(val)}
                          style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                        >
                          {val !== "all" && (
                            <motion.span
                              animate={{ background: isActive ? "#e03131" : meta?.dot ?? "#9e9e9e" }}
                              transition={{ duration: 0.18, ease: "easeOut" }}
                              style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block" }}
                            />
                          )}
                          {val === "all" ? "All" : meta?.label}
                          {isActive && !loading && statusCounts[val] !== undefined && (
                            <span style={{ display: "inline-block", background: "#e03131", color: "white", borderRadius: 99, fontSize: 10, fontWeight: 700, padding: "1px 7px", marginLeft: 2, whiteSpace: "nowrap", flexShrink: 0 }}>
                              {statusCounts[val]}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </div>

                {/* Sex */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Sex</div>
                  <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {SEX_FILTERS.map((sf) => {
                      const isActive = sexFilter === sf.value;
                      return (
                        <motion.button
                          key={sf.value}
                          initial={false}
                          animate={{
                            backgroundColor: isActive ? "#fff0f0" : "#ffffff",
                            color:           isActive ? "#e03131" : "#9a7070",
                            borderColor:     isActive ? "#e03131" : "#f0e4e4",
                          }}
                          layout
                          transition={{ layout: { type: "spring", stiffness: 400, damping: 36 }, duration: 0.18, ease: "easeOut" }}
                          onClick={() => handleSexFilter(sf.value)}
                          style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                        >
                          {sf.icon && <i className={`ti ${sf.icon}`} style={{ fontSize: 12 }} />}
                          {sf.label}
                        </motion.button>
                      );
                    })}

                    <div style={{ width: 1, height: 18, background: "#f0e4e4", margin: "0 2px", flexShrink: 0 }} />

                    {/* Recents quick-filter — kept inline with Sex since it's a view shortcut */}
                    <motion.button
                      initial={false}
                      animate={{
                        backgroundColor: isRecents ? "#fff0f0" : "#ffffff",
                        color:           isRecents ? "#e03131" : "#9a7070",
                        borderColor:     isRecents ? "#e03131" : "#f0e4e4",
                      }}
                      layout
                      transition={{ layout: { type: "spring", stiffness: 400, damping: 36 }, duration: 0.18, ease: "easeOut" }}
                      onClick={handleRecents}
                      title="Show most recently registered students"
                      style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                    >
                      <i className="ti ti-clock" style={{ fontSize: 12 }} />
                      Recents
                    </motion.button>
                  </motion.div>
                </div>

              </div>
            </motion.div>

            {/* ── Table ── */}
            <motion.div
              initial={isFirstRender ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut", delay: isFirstRender ? 0.34 : 0 }}
              style={{
                background: "white", border: "1px solid #f5eaea",
                borderRadius: 16, overflow: "hidden",
                boxShadow: "0 2px 16px rgba(224,49,49,0.06)",
                maxHeight: "calc(100vh - 340px)",
                overflowY: "auto",
              }}
            >
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
                        position: "sticky",   
                        top: 0,               
                        zIndex: 1,            
                        background: "#fdfafa",
                      }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <AnimatePresence mode="popLayout">
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
                        <motion.tr
                          key="empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.18 }}
                        >
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
                        </motion.tr>
                      )
                      : students.map((st, idx) => {
                          const palette = getAvatarPalette(st.last_name);
                          const initials = `${st.first_name?.[0] ?? ""}${st.last_name?.[0] ?? ""}`.toUpperCase();
                          const pill = STATUS_META[st.status] ?? STATUS_META.inactive;
                          const age = calcAge(st.birth_date);
                          const dob = fmtDate(st.birth_date);
                          const fullName = [st.last_name, ",", st.first_name, st.middle_name ? st.middle_name[0] + "." : "", st.suffix ?? ""].filter(Boolean).join(" ");

                          return (
                            <motion.tr
                              key={st.student_id}
                              initial={isFirstRowRender ? { opacity: 0, x: -6 } : false}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 6 }}
                              transition={{ duration: 0.18, ease: "easeOut", delay: isFirstRowRender ? Math.min(idx * 0.025, 0.3) : 0 }}
                              className="student-row"
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
                                    <i className="ti ti-pencil" style={{ fontSize: 14 }} />
                                  </button>
                                  <button
                                    className="row-action danger" title="Delete"
                                    style={{ color: "#c09090" }}
                                    onClick={(e) => { e.stopPropagation(); setToDelete(st); }}
                                  >
                                    <i className="ti ti-trash" style={{ fontSize: 14 }} />
                                  </button>
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

            {/* ── Pagination ── */}
            {!loading && pageMeta.count > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#b09090" }}>
                  Page <strong style={{ color: "#7a5050" }}>{page}</strong> of{" "}
                  <strong style={{ color: "#7a5050" }}>{totalPages || 1}</strong>
                  &nbsp;·&nbsp; {pageMeta.count.toLocaleString()} total records
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    transition={{ duration: 0.1 }}
                    className="page-btn"
                    style={pgBtn}
                    disabled={!pageMeta.previous}
                    onClick={() => fetchStudents(page - 1, search, statusFilter, sexFilter, ordering)}
                  >
                    <i className="ti ti-chevron-left" style={{ fontSize: 13 }} />
                  </motion.button>
                  {(() => {
                    const windowSize = Math.min(totalPages, 5);
                    const start = Math.min(
                      Math.max(1, page - 2),
                      Math.max(1, totalPages - windowSize + 1)
                    );
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
                        onClick={() => fetchStudents(p, search, statusFilter, sexFilter, ordering)}
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
                    onClick={() => fetchStudents(page + 1, search, statusFilter, sexFilter, ordering)}
                  >
                    <i className="ti ti-chevron-right" style={{ fontSize: 13 }} />
                  </motion.button>
                </div>
              </div>
            )}

          </div>

      {/* Delete modal */}
      <AnimatePresence>
        {toDelete && (
          <ConfirmModal
            student={toDelete}
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
