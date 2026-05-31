import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { canViewAuditTrail, clearAuthSession, getCurrentUser } from "../utils/auth";
import logo from "../assets/logo.png";
import logoutIcon from "../assets/logout.svg";

const NAV = [
  {
    section: "Main",
    items: [
      { label: "Dashboard",    icon: "ti-layout-dashboard", path: "/dashboard"    },
      { label: "Students",     icon: "ti-users",             path: "/students"     },
      { label: "Enrollments",  icon: "ti-clipboard-list",    path: "/enrollments"  },
      { label: "Subjects",     icon: "ti-book",              path: "/subjects"     },
      { label: "Grades",             icon: "ti-chart-bar",         path: "/grades"             },
      { label: "Requirements",      icon: "ti-file-check",        path: "/requirements"       },
      { label: "Academic Calendar", icon: "ti-calendar-event",    path: "/academic-calendar"  },
      { label: "Analytics",         icon: "ti-chart-dots-3",      path: "/analytics"          },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Invoices",     icon: "ti-receipt",  path: "/invoices"     },
      { label: "Payments",     icon: "ti-cash",     path: "/payments"     },
      { label: "Scholarships", icon: "ti-discount", path: "/scholarships" },
    ],
  },
  {
    section: "Settings",
    items: [
      { label: "Users",             icon: "ti-user-cog",         path: "/users"             },
      { label: "Audit Trail",       icon: "ti-shield-check",     path: "/audit-trail",       adminOnly: true },
      { label: "School Settings",   icon: "ti-settings",         path: "/settings"          },
      { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates" },
      { label: "Scholarship Types", icon: "ti-discount",         path: "/scholarship-types" },
      { label: "Fee Schedules",     icon: "ti-cash",             path: "/fee-schedules"     },
    ],
  },
];

function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "white", borderRadius: 20, padding: "32px 36px", width: 380, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animation: "slideUp 0.2s ease" }}>
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
      </div>
    </div>
  );
}

export default function Sidebar({ user: userProp }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogout, setShowLogout] = useState(false);

  const currentUser = userProp ?? getCurrentUser();

  const navGroups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || canViewAuditTrail(currentUser)),
  }));

  function handleLogout() {
    clearAuthSession();
    navigate("/");
  }

  return (
    <>
      <aside style={{ width: 224, flexShrink: 0, background: "white", borderRight: "1px solid #f5eaea", display: "flex", flexDirection: "column", boxShadow: "2px 0 12px rgba(224,49,49,0.04)" }}>
        <div style={{ height: 58, padding: "0 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={logo} alt="Logo" style={{ width: 20, height: 30 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>South Lakes IS</div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>Admin Portal</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {navGroups.map((group) => (
            <div key={group.section} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9.5, color: "#cdb0b0", letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 10px 4px", fontWeight: 600 }}>
                {group.section}
              </div>
              {group.items.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                return (
                  <div
                    key={item.path}
                    className={`nav-item${active ? " nav-active" : ""}`}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, fontSize: 13, color: active ? "#e03131" : "#7a5a5a", cursor: "pointer" }}
                    onClick={() => navigate(item.path)}
                    role="button"
                    tabIndex={0}
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

        <div style={{ padding: "14px 10px", borderTop: "1px solid #f5eaea" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px", borderRadius: 10, background: "#fff8f6" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#fde8e8,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#e03131", flexShrink: 0 }}>
              {(currentUser?.name || "SA").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser?.name || "Super Admin"}</div>
              <div style={{ fontSize: 11, color: "#b09090" }}>{currentUser?.role || "super_admin"}</div>
            </div>
            <button
              title="Logout"
              onClick={() => setShowLogout(true)}
              style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090", transition: "all 0.12s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#fff0f0"; e.currentTarget.style.color = "#e03131"; e.currentTarget.style.borderColor = "#fca5a5"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = "#c09090"; e.currentTarget.style.borderColor = "#f0e4e4"; }}
            >
              <img src={logoutIcon} alt="Logout" style={{ width: 20, height: 20 }} />
            </button>
          </div>
        </div>
      </aside>

      {showLogout && (
        <LogoutModal
          onConfirm={handleLogout}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </>
  );
}
