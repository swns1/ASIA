import { useState, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const MotionLink = motion.create(Link);
import { hasAnyRole, clearAuthSession, getCurrentUser } from "../utils/auth";
import { modalVariants, springTransition } from "../utils/motion";
import logo from "../assets/logo.png";
import logoutIcon from "../assets/logout.svg";

// Role sets matching the backend permission matrix (see App.jsx).
const STAFF_ADMIN    = ["super_admin", "admin"];
const ACADEMIC_STAFF = ["super_admin", "admin", "registrar"];
const GRADE_ROLES    = ["super_admin", "admin", "registrar", "teacher"];
const BILLING_ROLES  = ["super_admin", "admin", "accounting"];

const NAV = [
  {
    section: "Main",
    items: [
      { label: "Dashboard",         icon: "ti-layout-dashboard",  path: "/dashboard"           },
      { label: "Students",          icon: "ti-users",             path: "/students"            },
      { label: "Enrollments",       icon: "ti-clipboard-list",    path: "/enrollments"         },
      { label: "Subjects",          icon: "ti-book",              path: "/subjects"            },
      { label: "Grades",            icon: "ti-chart-bar",         path: "/grades",             allowedRoles: GRADE_ROLES },
      { label: "Requirements",      icon: "ti-file-check",        path: "/requirements",        allowedRoles: ACADEMIC_STAFF },
      { label: "Academic Calendar", icon: "ti-calendar-event",    path: "/academic-calendar"   },
      { label: "Attendance",    icon: "ti-calendar-check", path: "/attendance",   allowedRoles: GRADE_ROLES },
      { label: "School Forms", icon: "ti-forms", path: "/school-forms" },
      { label: "Analytics",         icon: "ti-chart-dots-3",      path: "/analytics",           allowedRoles: ACADEMIC_STAFF },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Invoices",     icon: "ti-receipt",  path: "/invoices",     allowedRoles: BILLING_ROLES },
      { label: "Payments",     icon: "ti-cash",     path: "/payments",     allowedRoles: BILLING_ROLES },
      { label: "Scholarships", icon: "ti-discount", path: "/scholarships", allowedRoles: ACADEMIC_STAFF },
    ],
  },
  {
    section: "Settings",
    items: [
      { label: "Users",             icon: "ti-user-cog",         path: "/users",              allowedRoles: STAFF_ADMIN },
      { label: "Audit Trail",       icon: "ti-shield-check",     path: "/audit-trail",         allowedRoles: STAFF_ADMIN },
      { label: "School Settings",   icon: "ti-settings",         path: "/settings",            allowedRoles: BILLING_ROLES },
      { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates",   allowedRoles: GRADE_ROLES },
      { label: "Narrative Categories", icon: "ti-clipboard-text", path: "/narrative-categories", allowedRoles: GRADE_ROLES },
      { label: "Scholarship Types", icon: "ti-discount",         path: "/scholarship-types",   allowedRoles: ACADEMIC_STAFF },
      { label: "Fee Schedules",     icon: "ti-cash",             path: "/fee-schedules",       allowedRoles: BILLING_ROLES },
    ],
  },
];

// ── Animation variants ────────────────────────────────────────────────────────
const sidebarVariants = {
  hidden:  { x: -16, opacity: 0 },
  visible: {
    x: 0, opacity: 1,
    transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1], staggerChildren: 0.028, delayChildren: 0.06 },
  },
};

const navItemVariants = {
  hidden:  { x: -10, opacity: 0 },
  visible: { x: 0,   opacity: 1, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } },
};

const userCardVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { delay: 0.28, duration: 0.2, ease: "easeOut" } },
};

// ── Logout modal ──────────────────────────────────────────────────────────────
function LogoutModal({ onConfirm, onCancel }) {
  return (
    <AnimatePresence>
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onCancel}
          style={{ position: "absolute", inset: 0, background: "rgba(26,10,10,0.4)", backdropFilter: "blur(4px)" }}
        />
        {/* Dialog */}
        <motion.div
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={springTransition}
          style={{ position: "relative", background: "white", borderRadius: 20, padding: "32px 36px", width: 380, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
        >
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-logout" style={{ fontSize: 24, color: "#e03131" }} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#1a0a0a" }}>Log out?</div>
          <div style={{ fontSize: 13, color: "#7a5050", textAlign: "center", lineHeight: 1.7 }}>
            You'll be returned to the login page. Any unsaved changes will be lost.
          </div>
          <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
            <button onClick={onCancel} style={{ flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10, background: "white", fontSize: 13, color: "#7a5050", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
              Stay
            </button>
            <button onClick={onConfirm} style={{ flex: 1, height: 42, border: "none", borderRadius: 10, background: "linear-gradient(135deg,#e03131,#c92a2a)", fontSize: 13, color: "white", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.3)" }}>
              Yes, logout
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar({ user: userProp }) {
  const navigate     = useNavigate();
  const location     = useLocation();
  const [showLogout, setShowLogout] = useState(false);
  const hasAnimated  = useRef(false);

  const currentUser = userProp ?? getCurrentUser();

  const navGroups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasAnyRole(currentUser, item.allowedRoles)),
  }));

  function handleLogout() {
    clearAuthSession();
    navigate("/");
  }

  const isFirstRender = !hasAnimated.current;
  if (isFirstRender) hasAnimated.current = true;

  return (
    <>
      <motion.aside
        variants={sidebarVariants}
        initial={isFirstRender ? "hidden" : false}
        animate="visible"
        style={{ width: 224, flexShrink: 0, background: "white", borderRight: "1px solid #f5eaea", display: "flex", flexDirection: "column", boxShadow: "2px 0 12px rgba(224,49,49,0.04)" }}
      >
        {/* Logo */}
        <motion.div variants={navItemVariants} style={{ height: 58, padding: "0 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={logo} alt="Logo" style={{ width: 20, height: 30 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>South Lakes IS</div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>Admin Portal</div>
            </div>
          </div>
        </motion.div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {navGroups.map((group) => (
            <div key={group.section} style={{ marginBottom: 6 }}>
              <motion.div variants={navItemVariants} style={{ fontSize: 9.5, color: "#cdb0b0", letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 10px 4px", fontWeight: 600 }}>
                {group.section}
              </motion.div>
              {group.items.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                return (
                  <MotionLink
                    key={item.path}
                    to={item.path}
                    variants={navItemVariants}
                    className="nav-item"
                    whileHover="hovered"
                    initial="rest"
                    animate="rest"
                    aria-current={active ? "page" : undefined}
                    style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, fontSize: 13, color: active ? "#e03131" : "#7a5a5a", cursor: "pointer", fontWeight: active ? 600 : 400, textDecoration: "none" }}
                  >
                    {/* Sliding active pill */}
                    {active && (
                      <motion.div
                        layoutId="nav-active-pill"
                        initial={{ opacity: 0.4 }}
                        animate={{ opacity: 1 }}
                        transition={{
                          layout:  { type: "spring", stiffness: 380, damping: 34 },
                          opacity: { duration: 0.18, delay: 0.22, ease: "easeOut" },
                        }}
                        style={{ position: "absolute", inset: 0, borderRadius: 9, background: "#fff0f0" }}
                      />
                    )}
                    {/* Hover pill */}
                    {!active && (
                      <motion.div
                        variants={{ rest: { opacity: 0 }, hovered: { opacity: 1 } }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        style={{ position: "absolute", inset: 0, borderRadius: 9, background: "#fff4f4", pointerEvents: "none" }}
                      />
                    )}
                    <i className={`ti ${item.icon}`} style={{ fontSize: 16, width: 20, textAlign: "center", position: "relative" }} />
                    <span style={{ position: "relative" }}>{item.label}</span>
                  </MotionLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User card */}
        <motion.div variants={userCardVariants} style={{ padding: "14px 10px", borderTop: "1px solid #f5eaea" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px", borderRadius: 10, background: "#fff8f6" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#fde8e8,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#e03131", flexShrink: 0 }}>
              {(currentUser?.name || "SA").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser?.name || "Super Admin"}</div>
              <div style={{ fontSize: 11, color: "#b09090" }}>{currentUser?.role || "super_admin"}</div>
            </div>
            <motion.button
              title="Logout"
              onClick={() => setShowLogout(true)}
              whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#fca5a5", color: "#e03131" }}
              whileTap={{ scale: 0.93 }}
              transition={{ duration: 0.12 }}
              style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090" }}
            >
              <img src={logoutIcon} alt="Logout" style={{ width: 20, height: 20 }} />
            </motion.button>
          </div>
        </motion.div>
      </motion.aside>

      <AnimatePresence>
        {showLogout && (
          <LogoutModal
            onConfirm={handleLogout}
            onCancel={() => setShowLogout(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
