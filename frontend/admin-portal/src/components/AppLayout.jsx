import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Sidebar from "./Sidebar";
import { clearAuthSession } from "../utils/auth";
import { refreshToken } from "../api/identityApi";
import { useSchoolYear } from "../context/SchoolYearContext";

const WARN_BEFORE_MS = 5 * 60 * 1000; // 5 minutes before expiry

function SessionTimeoutWarning() {
  const navigate = useNavigate();
  const [show, setShow]       = useState(false);
  const [extending, setExtend] = useState(false);
  const timerRef = useRef(null);

  function scheduleCheck() {
    if (timerRef.current) clearTimeout(timerRef.current);
    const token = sessionStorage.getItem("access_token");
    if (!token) return;
    try {
      const exp = JSON.parse(atob(token.split(".")[1])).exp * 1000;
      const msLeft = exp - Date.now();
      if (msLeft <= 0) { setShow(true); return; }
      if (msLeft <= WARN_BEFORE_MS) { setShow(true); return; }
      timerRef.current = setTimeout(() => setShow(true), msLeft - WARN_BEFORE_MS);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    scheduleCheck();
    const id = setInterval(scheduleCheck, 60_000);
    return () => { clearTimeout(timerRef.current); clearInterval(id); };
  }, []);

  async function handleExtend() {
    setExtend(true);
    try {
      const data = await refreshToken();
      if (data?.access) {
        sessionStorage.setItem("access_token", data.access);
        setShow(false);
        scheduleCheck();
      }
    } catch {
      clearAuthSession();
      navigate("/login");
    } finally {
      setExtend(false);
    }
  }

  function handleLogout() {
    clearAuthSession();
    navigate("/login");
  }

  if (!show) return null;

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 2000, maxWidth: 340, background: "white", borderRadius: 14, boxShadow: "0 8px 32px rgba(224,49,49,0.18)", border: "1.5px solid #fca5a5", padding: "16px 20px", fontFamily: "'DM Sans', sans-serif", animation: "slideUp 0.22s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#fde8e8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-clock" style={{ fontSize: 18, color: "#e03131" }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>Session expiring soon</div>
          <div style={{ fontSize: 12, color: "#7a5050" }}>Your session will expire in less than 5 minutes.</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleLogout}
          style={{ flex: 1, padding: "8px 0", borderRadius: 50, border: "1.5px solid #fca5a5", background: "transparent", color: "#7a5050", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
          Log Out
        </button>
        <button onClick={handleExtend} disabled={extending}
          style={{ flex: 1, padding: "8px 0", borderRadius: 50, border: "none", background: extending ? "#f0c4c4" : "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", fontWeight: 700, fontSize: 12, cursor: extending ? "not-allowed" : "pointer" }}>
          {extending ? "Extending…" : "Stay Logged In"}
        </button>
      </div>
    </div>
  );
}

export default function AppLayout({ children, user }) {
  // AppLayout is the first thing to mount once a user is actually
  // authenticated (SchoolYearProvider itself mounts before login, when
  // there's no token yet to resolve a default against) — retry here so the
  // global school year gets its backend-sourced default right after login.
  const { ensureDefault } = useSchoolYear();
  useEffect(() => { ensureDefault(); }, [ensureDefault]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes rowIn { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
        .nav-item { }
        .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }
        .enroll-row:hover td { background:#fff8f6 !important; cursor:pointer; }
        .qa-btn:hover { background:#fde8e8 !important; }
        .icon-btn:hover { background:#f5f5f3 !important; }
        .chip-btn { display:flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:99px;border:1.5px solid #f0e4e4;background:white;font-size:12px;color:#9a7070;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all 0.14s; }
        .chip-btn:hover { border-color:#fca5a5;color:#e03131;background:#fff8f6; }
        .chip-btn.active { background:#fff0f0;border-color:#e03131;color:#e03131;font-weight:700; }
        .new-btn { transition:all 0.16s !important; }
        .new-btn:hover { background:#c92a2a !important;box-shadow:0 8px 28px rgba(224,49,49,0.32) !important;transform:translateY(-1px); }
        .page-btn:hover:not(:disabled) { background:#fff0f0 !important;border-color:#e03131 !important;color:#e03131 !important; }
        .page-btn:disabled { opacity:0.3;cursor:not-allowed; }
        .search-wrap:focus-within { border-color:#e03131 !important;box-shadow:0 0 0 3px rgba(224,49,49,0.09) !important; }
        .row-action { width:30px;height:30px;border:1px solid #f0e4e4;border-radius:8px;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#9a7070;transition:all 0.12s;font-family:'DM Sans',sans-serif; }
        .row-action:hover { background:#fff0f0 !important;color:#e03131 !important;border-color:#fca5a5 !important; }
        .row-action.danger:hover { background:#fff0f0 !important;color:#e03131 !important; }
        .student-row { transition:background 0.12s;cursor:pointer; }
        .student-row:hover td { background:#fff8f6 !important; }
        .student-row:hover .row-name { color:#e03131 !important; }
        .sub-row { transition:background 0.12s;cursor:pointer; }
        .sub-row:hover td { background:#fff8f6 !important; }
        .sub-row:hover .sub-name { color:#e03131 !important; }
        .inv-row { transition:background 0.12s;cursor:pointer; }
        .inv-row:hover td { background:#fff8f6 !important; }
        .pay-row { transition:background 0.12s; }
        .pay-row:hover td { background:#fff8f6 !important; }
        .sch-row { transition:background 0.12s; }
        .sch-row:hover td { background:#fff8f6 !important; }
        .sch-btn { transition:all 0.12s;cursor:pointer; }
        .sch-btn:hover { background:#fff8f6 !important;border-color:#fca5a5 !important; }
        .audit-row:hover td { background:#fff8f6; }
      `}</style>
      <div style={{ display: "flex", height: "100vh", background: "#fdf8f6", fontFamily: "'DM Sans',sans-serif", overflow: "hidden" }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {children}
        </div>
      </div>
      <SessionTimeoutWarning />
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
