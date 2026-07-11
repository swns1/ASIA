import { useNavigate, Link, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { clearAuthSession, getCurrentUser } from "../utils/auth";
import logo from "../assets/logo.png";

// A slim, staff-sidebar-free shell for the guardian (parent) portal. Guardians
// see only their own child(ren)'s records, so they get a minimal top bar rather
// than the full admin Sidebar.
export default function GuardianLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();

  function handleLogout() {
    clearAuthSession();
    navigate("/login");
  }

  const onHome = location.pathname === "/guardian";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
      `}</style>
      <div style={{ minHeight: "100vh", background: "#fdf8f6", fontFamily: "'DM Sans',sans-serif", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <header style={{ background: "white", borderBottom: "1px solid #f5eaea", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", boxShadow: "0 1px 8px rgba(224,49,49,0.04)", position: "sticky", top: 0, zIndex: 50 }}>
          <Link to="/guardian" style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none" }}>
            <img src={logo} alt="SLIS" style={{ width: 26, height: 38 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a0a0a" }}>South Lakes IS</div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>Parent Portal</div>
            </div>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {!onHome && (
              <Link to="/guardian" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#7a5050", textDecoration: "none", fontWeight: 600 }}>
                <i className="ti ti-arrow-left" style={{ fontSize: 15 }} />My Children
              </Link>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#fde8e8,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#e03131" }}>
                {(user?.name || "P").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a" }}>{user?.name || "Parent"}</div>
                <div style={{ fontSize: 11, color: "#b09090" }}>Guardian</div>
              </div>
            </div>
            <button onClick={handleLogout} title="Log out"
              style={{ width: 34, height: 34, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090" }}>
              <i className="ti ti-logout" style={{ fontSize: 17 }} />
            </button>
          </div>
        </header>

        <main style={{ flex: 1, width: "100%", maxWidth: 1000, margin: "0 auto", padding: "28px 24px 60px" }}>
          {children}
        </main>
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { fontFamily: "'DM Sans', sans-serif", fontSize: 13, borderRadius: 10 },
          success: { style: { border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#15803d" } },
          error:   { style: { border: "1px solid #fca5a5", background: "#fff0f0", color: "#b91c1c" } },
        }}
      />
    </>
  );
}
