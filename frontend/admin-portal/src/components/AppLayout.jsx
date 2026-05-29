import Sidebar from "./Sidebar";

export default function AppLayout({ children, user }) {
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
        .nav-item { transition:background 0.12s,color 0.12s; }
        .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
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
    </>
  );
}
