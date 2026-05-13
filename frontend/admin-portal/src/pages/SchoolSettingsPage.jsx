import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getVisibleNavGroups } from "../utils/navigation";
import { clearAuthSession } from "../utils/auth";

// ── API ───────────────────────────────────────────────────────────────────────
const BILLING_API = "http://localhost:8002/api";

function getToken() { return sessionStorage.getItem("access_token") || ""; }

async function apiCall(method, url, body = null) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
  const opts = { method, headers };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) { const e = await res.text(); throw new Error(`${res.status}: ${e}`); }
  return res.json();
}

const getSettings    = ()       => apiCall("GET",   `${BILLING_API}/school-settings/current/`);
const updateSettings = (id, p)  => apiCall("PATCH", `${BILLING_API}/school-settings/${id}/`, p);

// ── NAV ───────────────────────────────────────────────────────────────────────
const NAV = [
  { section: "Main", items: [
    { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/dashboard"   },
    { label: "Students",    icon: "ti-users",             path: "/students"    },
    { label: "Enrollments", icon: "ti-clipboard-list",    path: "/enrollments" },
    { label: "Subjects",    icon: "ti-book",              path: "/subjects"    },
    { label: "Grades",      icon: "ti-chart-bar",         path: "/grades"      },
    { label: "Requirements", icon: "ti-file-check",        path: "/requirements" },
  ]},
  { section: "Finance", items: [
    { label: "Invoices",     icon: "ti-receipt",  path: "/invoices"     },
    { label: "Payments",     icon: "ti-cash",     path: "/payments"     },
    { label: "Scholarships", icon: "ti-discount", path: "/scholarships" },
  ]},
  { section: "Settings", items: [
    { label: "Users",             icon: "ti-user-cog",         path: "/users"             },
    { label: "School Settings",   icon: "ti-settings",         path: "/settings"          },
    { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates" },
    { label: "Scholarship Types", icon: "ti-discount",         path: "/scholarship-types" },
    { label: "Fee Schedules",     icon: "ti-cash",             path: "/fee-schedules"     },
  ]},
];

const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.6s ease-in-out infinite" }} />
);

function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, padding:"32px 36px", width:380, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", display:"flex", flexDirection:"column", alignItems:"center", gap:14, animation:"slideUp 0.2s ease" }}>
        <div style={{ width:56, height:56, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <i className="ti ti-logout" style={{ fontSize:24, color:"#e03131" }} />
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>Log out?</div>
        <div style={{ fontSize:13, color:"#7a5050", textAlign:"center", lineHeight:1.7 }}>You'll be returned to the login page. Any unsaved changes will be lost.</div>
        <div style={{ display:"flex", gap:10, width:"100%", marginTop:4 }}>
          <button onClick={onCancel} style={{ flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:"white", fontSize:13, color:"#7a5050", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>Stay</button>
          <button onClick={onConfirm} style={{ flex:1, height:42, border:"none", borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", fontSize:13, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>Yes, logout</button>
        </div>
      </div>
    </div>
  );
}

// ── Section card ─────────────────────────────────────────────────────────────
function SectionCard({ title, subtitle, icon, children }) {
  return (
    <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>
      <div style={{ padding:"18px 24px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", gap:12, background:"linear-gradient(to right,#fdfafa,white)" }}>
        <div style={{ width:38, height:38, borderRadius:10, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className={`ti ${icon}`} style={{ fontSize:18, color:"#e03131" }} />
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>{title}</div>
          {subtitle && <div style={{ fontSize:11, color:"#b09090", marginTop:2 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding:"22px 24px" }}>{children}</div>
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom:18 }}>
      <label style={{ display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize:11, color:"#b09090", marginTop:5, fontStyle:"italic" }}>{hint}</div>}
    </div>
  );
}

const inp = {
  width:"100%", border:"1.5px solid #fde2de", borderRadius:10,
  padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif",
  color:"#1a0a0a", background:"#fffbfb", outline:"none", boxSizing:"border-box",
};

// ════════════════════════════════════════════════════════════════════════════
export default function SchoolSettingsPage() {
  const navigate = useNavigate();

  const [settings,    setSettings]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState("");
  const [showLogout,  setShowLogout]  = useState(false);

  const [form, setForm] = useState({
    school_name:         "",
    current_school_year: "",
    sy_start_date:       "",
    sy_end_date:         "",
    early_bird_days:     7,
    school_address:      "",
    contact_email:       "",
    contact_phone:       "",
  });

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    getSettings()
      .then((d) => {
        setSettings(d);
        setForm({
          school_name:         d.school_name         ?? "",
          current_school_year: d.current_school_year ?? "",
          sy_start_date:       d.sy_start_date        ?? "",
          sy_end_date:         d.sy_end_date          ?? "",
          early_bird_days:     d.early_bird_days      ?? 7,
          school_address:      d.school_address       ?? "",
          contact_email:       d.contact_email        ?? "",
          contact_phone:       d.contact_phone        ?? "",
        });
      })
      .catch(() => setError("Failed to load school settings."))
      .finally(() => setLoading(false));
  }, []);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.school_name.trim())         { setError("School name is required."); return; }
    if (!form.current_school_year.trim()) { setError("School year is required. Format: YYYY-YYYY"); return; }
    if (!form.sy_start_date)              { setError("S.Y. start date is required."); return; }
    if (!form.sy_end_date)                { setError("S.Y. end date is required."); return; }
    if (form.sy_start_date >= form.sy_end_date) { setError("Start date must be before end date."); return; }
    if (!form.early_bird_days || parseInt(form.early_bird_days) < 1) { setError("Early bird days must be at least 1."); return; }

    setSaving(true); setError(""); setSaved(false);
    try {
      await updateSettings(settings.setting_id, {
        school_name:         form.school_name.trim(),
        current_school_year: form.current_school_year.trim(),
        sy_start_date:       form.sy_start_date,
        sy_end_date:         form.sy_end_date,
        early_bird_days:     parseInt(form.early_bird_days),
        school_address:      form.school_address.trim() || null,
        contact_email:       form.contact_email.trim()  || null,
        contact_phone:       form.contact_phone.trim()  || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
        .nav-item { transition:background 0.12s,color 0.12s; }
        .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
        .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }
        input:focus, textarea:focus, select:focus { border-color:#e03131 !important; box-shadow:0 0 0 3px rgba(224,49,49,0.09) !important; }
      `}</style>

      <div style={{ display:"flex", height:"100vh", background:"#fdf8f6", fontFamily:"'DM Sans',sans-serif", overflow:"hidden" }}>

        {/* Sidebar */}
        <aside style={{ width:224, flexShrink:0, background:"white", borderRight:"1px solid #f5eaea", display:"flex", flexDirection:"column", boxShadow:"2px 0 12px rgba(224,49,49,0.04)" }}>
          <div style={{ padding:"22px 18px 18px", borderBottom:"1px solid #f5eaea" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 12px rgba(224,49,49,0.3)" }}>
                <i className="ti ti-school" style={{ fontSize:17, color:"white" }} />
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>South Lakes IS</div>
                <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Admin Portal</div>
              </div>
            </div>
          </div>
          <nav style={{ flex:1, padding:"14px 10px", display:"flex", flexDirection:"column", gap:2, overflowY:"auto" }}>
            {getVisibleNavGroups(NAV).map((group) => (
              <div key={group.section} style={{ marginBottom:6 }}>
                <div style={{ fontSize:9.5, color:"#cdb0b0", letterSpacing:"0.1em", textTransform:"uppercase", padding:"10px 10px 4px", fontWeight:600 }}>{group.section}</div>
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <div key={item.path} className={`nav-item${active?" nav-active":""}`}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:9, fontSize:13, color:active?"#e03131":"#7a5a5a", cursor:"pointer" }}
                      onClick={() => navigate(item.path)} role="button" tabIndex={0}
                      onKeyDown={(e) => e.key==="Enter" && navigate(item.path)}>
                      <i className={`ti ${item.icon}`} style={{ fontSize:16, width:20, textAlign:"center" }} />
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
              <button title="Logout" onClick={() => setShowLogout(true)}
                style={{ width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#c09090", transition:"all 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.color="#e03131"; e.currentTarget.style.borderColor="#fca5a5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.color="#c09090"; e.currentTarget.style.borderColor="#f0e4e4"; }}>
                <i className="ti ti-logout" style={{ fontSize:14 }} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Topbar */}
          <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>School Settings</div>
              <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>Global configuration for South Lakes Integrated School</div>
            </div>
            <button onClick={handleSave} disabled={saving || loading}
              style={{ display:"inline-flex", alignItems:"center", gap:8, background:saving?"#e87474":"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 20px", fontSize:13, fontWeight:700, cursor:saving||loading?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)", transition:"all 0.16s" }}>
              {saving ? <><i className="ti ti-loader-2" style={{ fontSize:14, animation:"spin 1s linear infinite" }} />Saving…</> : <><i className="ti ti-device-floppy" style={{ fontSize:14 }} />Save Settings</>}
            </button>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Error / Success */}
            {error && (
              <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#b91c1c", display:"flex", alignItems:"center", gap:8 }}>
                <i className="ti ti-alert-circle" style={{ fontSize:15 }} />{error}
                <button onClick={() => setError("")} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:"#b91c1c" }}><i className="ti ti-x" style={{ fontSize:13 }} /></button>
              </div>
            )}
            {saved && (
              <div style={{ background:"#e8f5e0", border:"1px solid #a3d977", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#2e6b0d", display:"flex", alignItems:"center", gap:8 }}>
                <i className="ti ti-circle-check" style={{ fontSize:15 }} />Settings saved successfully.
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, alignItems:"start" }}>

              {/* Left column */}
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                <SectionCard title="School Information" subtitle="Basic school identity" icon="ti-school">
                  {loading ? (
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {[1,2,3].map((i) => <Sk key={i} h={42} />)}
                    </div>
                  ) : (
                    <>
                      <Field label="School Name *">
                        <input value={form.school_name} onChange={(e) => setF("school_name", e.target.value)} placeholder="South Lakes Integrated School" style={inp} />
                      </Field>
                      <Field label="School Address">
                        <textarea value={form.school_address} onChange={(e) => setF("school_address", e.target.value)} placeholder="Complete address…" rows={3} style={{ ...inp, resize:"vertical" }} />
                      </Field>
                    </>
                  )}
                </SectionCard>

                <SectionCard title="Contact Information" subtitle="For official communications" icon="ti-phone">
                  {loading ? (
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {[1,2].map((i) => <Sk key={i} h={42} />)}
                    </div>
                  ) : (
                    <>
                      <Field label="Contact Email">
                        <input type="email" value={form.contact_email} onChange={(e) => setF("contact_email", e.target.value)} placeholder="admin@southlakes.edu.ph" style={inp} />
                      </Field>
                      <Field label="Contact Phone">
                        <input value={form.contact_phone} onChange={(e) => setF("contact_phone", e.target.value)} placeholder="+63 998 979 1547" style={inp} />
                      </Field>
                    </>
                  )}
                </SectionCard>
              </div>

              {/* Right column */}
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                <SectionCard title="School Year" subtitle="Affects invoices, early bird eligibility, and reports" icon="ti-calendar">
                  {loading ? (
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {[1,2,3].map((i) => <Sk key={i} h={42} />)}
                    </div>
                  ) : (
                    <>
                      <Field label="Current School Year *" hint="Format: YYYY-YYYY e.g. 2025-2026">
                        <input value={form.current_school_year} onChange={(e) => setF("current_school_year", e.target.value)} placeholder="2025-2026" style={inp} />
                      </Field>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                        <Field label="S.Y. Start Date *" hint="Early bird counts from here">
                          <input type="date" value={form.sy_start_date} onChange={(e) => setF("sy_start_date", e.target.value)} style={inp} />
                        </Field>
                        <Field label="S.Y. End Date *">
                          <input type="date" value={form.sy_end_date} onChange={(e) => setF("sy_end_date", e.target.value)} style={inp} />
                        </Field>
                      </div>
                    </>
                  )}
                </SectionCard>

                <SectionCard title="Billing Configuration" subtitle="Discount and payment settings" icon="ti-cash">
                  {loading ? <Sk h={42} /> : (
                    <Field label="Early Bird Window (days) *" hint="Number of days from S.Y. start date during which early bird discount applies (default: 7)">
                      <div style={{ position:"relative" }}>
                        <input type="number" min="1" max="30" value={form.early_bird_days} onChange={(e) => setF("early_bird_days", e.target.value)} style={{ ...inp, paddingRight:50 }} />
                        <span style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"#b09090", fontWeight:600 }}>days</span>
                      </div>
                    </Field>
                  )}

                  {/* Billing info cards */}
                  <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:6 }}>
                    {[
                      { label:"Monthly plan",     detail:"10 installments — end of June through March",    color:"#1455a0", bg:"#e3f0fd" },
                      { label:"Quarterly plan",   detail:"4 installments — end of Aug, Nov, Feb, May",     color:"#2e6b0d", bg:"#e8f5e0" },
                      { label:"Semi-annual (3%)", detail:"2 installments — end of Oct and Mar",            color:"#7c3aed", bg:"#f0e8fd" },
                      { label:"Annual (5%)",      detail:"1 installment — end of October",                 color:"#d97706", bg:"#fdf5e8" },
                    ].map((p) => (
                      <div key={p.label} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:p.bg, borderRadius:10 }}>
                        <i className="ti ti-calendar-due" style={{ fontSize:14, color:p.color, flexShrink:0 }} />
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:p.color }}>{p.label}</div>
                          <div style={{ fontSize:11, color:p.color, opacity:0.8, marginTop:1 }}>{p.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* Last updated */}
                {settings?.updated_at && (
                  <div style={{ fontSize:11, color:"#b09090", textAlign:"right" }}>
                    Last updated: {new Date(settings.updated_at).toLocaleString("en-PH", { dateStyle:"medium", timeStyle:"short" })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showLogout && (
        <LogoutModal
          onConfirm={() => { clearAuthSession(); navigate("/"); }}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </>
  );
}
