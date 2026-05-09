import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ── API ───────────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8003/api";

function getToken() { return sessionStorage.getItem("access_token") || ""; }

async function apiCall(method, url, body = null) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
  const opts = { method, headers };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) { const e = await res.text(); throw new Error(`${res.status}: ${e}`); }
  if (method === "DELETE") return null;
  return res.json();
}

const getScholarshipTypes  = (p = {}) => apiCall("GET",    `${API_BASE}/scholarship-types/?${new URLSearchParams(p)}`);
const createScholarshipType = (p)     => apiCall("POST",   `${API_BASE}/scholarship-types/`, p);
const updateScholarshipType = (id, p) => apiCall("PATCH",  `${API_BASE}/scholarship-types/${id}/`, p);
const deleteScholarshipType = (id)    => apiCall("DELETE", `${API_BASE}/scholarship-types/${id}/`);

// ── NAV ───────────────────────────────────────────────────────────────────────
const NAV = [
  { section: "Main", items: [
    { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/dashboard"   },
    { label: "Students",    icon: "ti-users",             path: "/students"    },
    { label: "Enrollments", icon: "ti-clipboard-list",    path: "/enrollments" },
    { label: "Subjects",    icon: "ti-book",              path: "/subjects"    },
    { label: "Grades",      icon: "ti-chart-bar",         path: "/grades"      },
  ]},
  { section: "Finance", items: [
    { label: "Invoices",      icon: "ti-receipt",  path: "/invoices"          },
    { label: "Payments",      icon: "ti-cash",     path: "/payments"          },
    { label: "Scholarships", icon: "ti-discount", path: "/scholarships" },
  ]},
  { section: "Settings", items: [
    { label: "Users",             icon: "ti-user-cog",         path: "/users"             },
    { label: "School Settings",   icon: "ti-settings",         path: "/settings"          },
    { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates" },
  ]},
];

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.6s ease-in-out infinite" }} />
);

// ── Scholarship Type Modal ────────────────────────────────────────────────────
function ScholarshipTypeModal({ scholarshipType, onClose, onSaved }) {
  const isEdit = Boolean(scholarshipType?.scholarship_type_id);

  const [form, setForm] = useState({
    scholarship_code:  scholarshipType?.scholarship_code  ?? "",
    scholarship_name:  scholarshipType?.scholarship_name  ?? "",
    description:       scholarshipType?.description       ?? "",
    discount_mode:     scholarshipType?.discount_mode     ?? "percentage",
    discount_value:    scholarshipType?.discount_value    ?? "",
    is_active:         scholarshipType?.is_active         ?? true,
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.scholarship_code.trim()) { setError("Scholarship code is required."); return; }
    if (!form.scholarship_name.trim()) { setError("Scholarship name is required."); return; }
    if (!form.discount_value || parseFloat(form.discount_value) < 0) { setError("Discount value is required."); return; }
    if (form.discount_mode === "percentage" && parseFloat(form.discount_value) > 100) { setError("Percentage cannot exceed 100%."); return; }

    setSaving(true); setError("");
    try {
      const payload = {
        scholarship_code:  form.scholarship_code.trim(),
        scholarship_name:  form.scholarship_name.trim(),
        description:       form.description.trim() || null,
        discount_mode:     form.discount_mode,
        discount_value:    parseFloat(form.discount_value),
        is_active:         form.is_active,
      };
      if (isEdit) await updateScholarshipType(scholarshipType.scholarship_type_id, payload);
      else        await createScholarshipType(payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const inp = {
    width:"100%", border:"1.5px solid #fde2de", borderRadius:10,
    padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif",
    color:"#1a0a0a", background:"#fffbfb", outline:"none", boxSizing:"border-box",
  };

  const lbl = {
    display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050",
    letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6,
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)", animation:"fadeIn 0.15s ease" }}>
      <div style={{ background:"white", borderRadius:20, width:520, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(224,49,49,0.18)", animation:"slideUp 0.2s ease" }}>

        {/* Header */}
        <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ti ti-discount" style={{ fontSize:18, color:"#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>
                {isEdit ? "Edit Scholarship" : "New Scholarship Type"}
              </div>
              <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>
                {isEdit ? "Update scholarship details" : "Create a new scholarship type"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", fontSize:20, display:"flex", alignItems:"center" }}>
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding:"22px 28px" }}>
          {error && (
            <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize:14 }} />{error}
            </div>
          )}

          {/* Code + Name */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Scholarship Code *</label>
              <input value={form.scholarship_code} onChange={(e) => setF("scholarship_code", e.target.value)}
                placeholder="e.g. ACADEMIC_EXCEL" style={inp} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Scholarship Name *</label>
              <input value={form.scholarship_name} onChange={(e) => setF("scholarship_name", e.target.value)}
                placeholder="e.g. Academic Excellence Award" style={inp} />
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>Description</label>
            <textarea value={form.description} onChange={(e) => setF("description", e.target.value)}
              placeholder="Optional description…" rows={2}
              style={{ ...inp, resize:"vertical" }} />
          </div>

          {/* Discount mode */}
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>Discount Type *</label>
            <div style={{ display:"flex", gap:10 }}>
              {[
                { value:"percentage",   label:"Percentage (%)",   icon:"ti-percentage",    color:"#1455a0", bg:"#e3f0fd" },
                { value:"fixed_amount", label:"Fixed Amount (₱)", icon:"ti-currency-peso", color:"#2e6b0d", bg:"#e8f5e0" },
              ].map((opt) => {
                const active = form.discount_mode === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setF("discount_mode", opt.value)}
                    style={{ flex:1, display:"flex", alignItems:"center", gap:10, padding:"12px 16px", borderRadius:12, border:`1.5px solid ${active ? opt.color : "#f0e4e4"}`, background:active ? opt.bg : "white", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .15s" }}>
                    <div style={{ width:34, height:34, borderRadius:8, background:active ? "white" : "#f9f4f4", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <i className={`ti ${opt.icon}`} style={{ fontSize:16, color:active ? opt.color : "#9a7070" }} />
                    </div>
                    <span style={{ fontSize:13, fontWeight:active ? 700 : 500, color:active ? opt.color : "#7a5050" }}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Discount value */}
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>
              {form.discount_mode === "percentage" ? "Discount Percentage *" : "Discount Amount (₱) *"}
            </label>
            <div style={{ position:"relative" }}>
              <input type="number" min="0" max={form.discount_mode === "percentage" ? 100 : undefined}
                step="0.01" value={form.discount_value}
                onChange={(e) => setF("discount_value", e.target.value)}
                placeholder={form.discount_mode === "percentage" ? "e.g. 50" : "e.g. 5000"}
                style={{ ...inp, paddingRight:50 }} />
              <span style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", fontSize:13, fontWeight:700, color:"#b09090" }}>
                {form.discount_mode === "percentage" ? "%" : "₱"}
              </span>
            </div>
            {form.discount_mode === "percentage" && (
              <div style={{ fontSize:11, color:"#b09090", marginTop:5, fontStyle:"italic" }}>Must be between 0 and 100%</div>
            )}
          </div>

          {/* Active toggle */}
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:"#fdfafa", border:"1px solid #f5eaea", borderRadius:10 }}>
            <input type="checkbox" id="is_active" checked={form.is_active}
              onChange={(e) => setF("is_active", e.target.checked)}
              style={{ width:15, height:15, accentColor:"#e03131", cursor:"pointer" }} />
            <label htmlFor="is_active" style={{ fontSize:13, color:"#1a0a0a", cursor:"pointer", fontWeight:500 }}>
              Active — available for assignment to enrollments
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"16px 28px 24px", display:"flex", justifyContent:"flex-end", gap:10, borderTop:"1px solid #f5eaea" }}>
          <button onClick={onClose} style={{ background:"transparent", color:"#9a7070", border:"1.5px solid #fde2de", borderRadius:50, padding:"9px 22px", fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ background:saving?"#e87474":"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:50, padding:"9px 24px", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:saving?"not-allowed":"pointer", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Saving…</>
              : <><i className="ti ti-check" style={{ fontSize:13 }} />{isEdit ? "Update" : "Create Scholarship"}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteModal({ item, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, padding:"32px 36px", width:400, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", display:"flex", flexDirection:"column", alignItems:"center", gap:14, animation:"slideUp 0.2s ease" }}>
        <div style={{ width:56, height:56, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <i className="ti ti-trash" style={{ fontSize:24, color:"#e03131" }} />
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>Delete Scholarship?</div>
        <div style={{ fontSize:13, color:"#7a5050", textAlign:"center", lineHeight:1.7 }}>
          You're about to delete <strong style={{ color:"#1a0a0a" }}>{item.scholarship_name}</strong>. This cannot be undone and may affect existing enrollments.
        </div>
        <div style={{ display:"flex", gap:10, width:"100%", marginTop:4 }}>
          <button onClick={onCancel} style={{ flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:"white", fontSize:13, color:"#7a5050", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex:1, height:42, border:"none", borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", fontSize:13, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.3)" }}>Yes, delete</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function ScholarshipTypesPage() {
  const navigate = useNavigate();

  const [scholarships, setScholarships] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [inputVal,     setInputVal]     = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [modal,        setModal]        = useState(null);
  const [toDelete,     setToDelete]     = useState(null);

  const fetchScholarships = useCallback(async (term = search, active = activeFilter) => {
    setLoading(true);
    try {
      const params = { page_size: 100 };
      if (term) params.search = term;
      if (active !== "all") params.is_active = active === "active" ? "true" : "false";
      const data = await getScholarshipTypes(params);
      setScholarships(Array.isArray(data) ? data : data?.results ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, activeFilter]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchScholarships("", "all");
  }, []);

  const handleDelete = async () => {
    if (!toDelete) return;
    await deleteScholarshipType(toDelete.scholarship_type_id);
    setToDelete(null);
    fetchScholarships(search, activeFilter);
  };

  const activeCount   = scholarships.filter((s) => s.is_active).length;
  const inactiveCount = scholarships.filter((s) => !s.is_active).length;
  const pctCount      = scholarships.filter((s) => s.discount_mode === "percentage").length;
  const fixedCount    = scholarships.filter((s) => s.discount_mode === "fixed_amount").length;

  const formatDiscount = (s) =>
    s.discount_mode === "percentage"
      ? `${parseFloat(s.discount_value).toFixed(0)}% off`
      : `₱${parseFloat(s.discount_value).toLocaleString()} off`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes rowIn   { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
        .nav-item { transition:background 0.12s,color 0.12s; }
        .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
        .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }
        .row-action { width:30px;height:30px;border:1px solid #f0e4e4;border-radius:8px;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#9a7070;transition:all 0.12s; }
        .row-action:hover { background:#fff0f0 !important;color:#e03131 !important;border-color:#fca5a5 !important; }
        .sch-row { transition:background 0.12s; }
        .sch-row:hover td { background:#fff8f6 !important; }
        .chip-btn { display:flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:99px;border:1.5px solid #f0e4e4;background:white;font-size:12px;color:#9a7070;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all 0.14s; }
        .chip-btn:hover { border-color:#fca5a5;color:#e03131;background:#fff8f6; }
        .chip-btn.active { background:#fff0f0;border-color:#e03131;color:#e03131;font-weight:700; }
        .new-btn { transition:all 0.16s !important; }
        .new-btn:hover { background:#c92a2a !important;box-shadow:0 8px 28px rgba(224,49,49,0.32) !important;transform:translateY(-1px); }
        .search-wrap:focus-within { border-color:#e03131 !important;box-shadow:0 0 0 3px rgba(224,49,49,0.09) !important; }
      `}</style>

      <div style={{ display:"flex", height:"100vh", background:"#fdf8f6", fontFamily:"'DM Sans',sans-serif", overflow:"hidden" }}>

        {/* ── Sidebar ── */}
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
            {NAV.map((group) => (
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
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px", borderRadius:10, background:"#fff8f6", cursor:"pointer" }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#fde8e8,#fca5a5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#e03131", flexShrink:0 }}>SA</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>Super Admin</div>
                <div style={{ fontSize:11, color:"#b09090" }}>super_admin</div>
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize:13, color:"#c0a0a0", marginLeft:"auto" }} />
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Topbar */}
          <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif", letterSpacing:"-0.01em" }}>Scholarship Types</div>
              <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>
                {loading ? "Loading…" : `${scholarships.length} scholarship types · ${activeCount} active`}
              </div>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <button style={{ width:36, height:36, border:"1px solid #f5eaea", borderRadius:10, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070", position:"relative" }}>
                <i className="ti ti-bell" style={{ fontSize:16 }} />
                <span style={{ width:8, height:8, background:"#e03131", borderRadius:"50%", position:"absolute", top:6, right:6, border:"2px solid white" }} />
              </button>
              <button className="new-btn"
                style={{ display:"flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}
                onClick={() => setModal({ mode:"create" })}>
                <i className="ti ti-plus" style={{ fontSize:15 }} />New Scholarship
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Stat cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:12 }}>
              {[
                { label:"Total",      value:scholarships.length, icon:"ti-discount",        color:"#e03131", bg:"#fff0f0" },
                { label:"Active",     value:activeCount,          icon:"ti-circle-check",    color:"#2e6b0d", bg:"#e8f5e0" },
                { label:"Percentage", value:pctCount,             icon:"ti-percentage",      color:"#1455a0", bg:"#e3f0fd" },
                { label:"Fixed",      value:fixedCount,           icon:"ti-currency-peso",   color:"#7c3aed", bg:"#f0e8fd" },
              ].map((s) => (
                <div key={s.label} style={{ background:"white", borderRadius:14, padding:"16px 20px", border:"1px solid #f5eaea", display:"flex", alignItems:"center", gap:14, boxShadow:"0 2px 12px rgba(224,49,49,0.06)" }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:s.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <i className={`ti ${s.icon}`} style={{ fontSize:18, color:s.color }} />
                  </div>
                  <div>
                    {loading ? <Sk w={40} h={20} r={4} /> : <div style={{ fontSize:22, fontWeight:700, color:"#1a0a0a", lineHeight:1 }}>{s.value}</div>}
                    <div style={{ fontSize:11, color:"#a07878", marginTop:4, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.06em" }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Search + filter */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", gap:10 }}>
                <div className="search-wrap" style={{ flex:1, display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #f0e4e4", borderRadius:12, padding:"0 16px", height:42, transition:"border 0.15s,box-shadow 0.15s" }}>
                  <i className="ti ti-search" style={{ fontSize:15, color:"#c0a0a0", flexShrink:0 }} />
                  <input placeholder="Search by name or code…" value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key==="Enter") { setSearch(inputVal); fetchScholarships(inputVal, activeFilter); }}}
                    style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", fontFamily:"'DM Sans',sans-serif", outline:"none" }} />
                  {inputVal && (
                    <button style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", display:"flex", alignItems:"center", padding:2 }}
                      onClick={() => { setInputVal(""); setSearch(""); fetchScholarships("", activeFilter); }}>
                      <i className="ti ti-x" style={{ fontSize:13 }} />
                    </button>
                  )}
                </div>
                <button style={{ height:42, padding:"0 20px", background:"white", border:"1.5px solid #f0e4e4", borderRadius:12, fontSize:13, fontWeight:600, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.14s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor="#e03131"; e.currentTarget.style.color="#e03131"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor="#f0e4e4"; e.currentTarget.style.color="#7a5050"; }}
                  onClick={() => { setSearch(inputVal); fetchScholarships(inputVal, activeFilter); }}>
                  Search
                </button>
              </div>

              {/* Filter chips */}
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {[
                  { value:"all",      label:"All"      },
                  { value:"active",   label:"Active"   },
                  { value:"inactive", label:"Inactive" },
                ].map((f) => (
                  <button key={f.value} className={`chip-btn${activeFilter===f.value?" active":""}`}
                    onClick={() => { setActiveFilter(f.value); fetchScholarships(inputVal, f.value); }}>
                    {f.label}
                    {activeFilter===f.value && !loading && (
                      <span style={{ background:"#e03131", color:"white", borderRadius:99, fontSize:10, fontWeight:700, padding:"1px 7px", marginLeft:2 }}>
                        {f.value==="all" ? scholarships.length : f.value==="active" ? activeCount : inactiveCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div style={{ background:"white", border:"1px solid #f5eaea", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#fdfafa" }}>
                    {[
                      { label:"Scholarship",    w:"30%" },
                      { label:"Code",           w:"15%" },
                      { label:"Discount Type",  w:"15%" },
                      { label:"Discount Value", w:"15%" },
                      { label:"Status",         w:"12%" },
                      { label:"Description",    w:"10%" },
                      { label:"",               w:"3%"  },
                    ].map(({ label, w }) => (
                      <th key={label} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#c0a0a0", padding:"13px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em", width:w }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}>
                          <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <Sk w={36} h={36} r={10} />
                              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                <Sk w={140} h={13} />
                                <Sk w={90} h={11} />
                              </div>
                            </div>
                          </td>
                          {[80,90,80,60,120,36].map((w, j) => (
                            <td key={j} style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0" }}><Sk w={w} h={13} /></td>
                          ))}
                        </tr>
                      ))
                    : scholarships.length === 0
                      ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign:"center", padding:"64px 16px" }}>
                            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                              <div style={{ width:56, height:56, borderRadius:16, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                <i className="ti ti-discount-off" style={{ fontSize:24, color:"#e08080" }} />
                              </div>
                              <div style={{ fontSize:15, color:"#7a5050", fontWeight:600, fontFamily:"'Playfair Display',serif" }}>No scholarships found</div>
                              <div style={{ fontSize:12, color:"#b09090" }}>Create your first scholarship type to get started</div>
                              <button onClick={() => setModal({ mode:"create" })}
                                style={{ marginTop:8, display:"inline-flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"10px 20px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
                                <i className="ti ti-plus" style={{ fontSize:14 }} />New Scholarship
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                      : scholarships.map((sch, idx) => {
                          const isPct   = sch.discount_mode === "percentage";
                          const isActive = sch.is_active;
                          return (
                            <tr key={sch.scholarship_type_id} className="sch-row"
                              style={{ animation:`rowIn 0.2s ease both`, animationDelay:`${idx*20}ms` }}>
                              {/* Name */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  <div style={{ width:36, height:36, borderRadius:10, background: isPct ? "#e3f0fd" : "#e8f5e0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                    <i className={`ti ${isPct ? "ti-percentage" : "ti-currency-peso"}`} style={{ fontSize:15, color: isPct ? "#1455a0" : "#2e6b0d" }} />
                                  </div>
                                  <div>
                                    <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{sch.scholarship_name}</div>
                                  </div>
                                </div>
                              </td>
                              {/* Code */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <span style={{ fontFamily:"monospace", fontSize:12, color:"#5a4a4a", background:"#f9f4f4", padding:"3px 8px", borderRadius:6 }}>{sch.scholarship_code}</span>
                              </td>
                              {/* Discount type */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, padding:"4px 10px", borderRadius:99, background: isPct ? "#e3f0fd" : "#e8f5e0", color: isPct ? "#1455a0" : "#2e6b0d" }}>
                                  <i className={`ti ${isPct ? "ti-percentage" : "ti-currency-peso"}`} style={{ fontSize:11 }} />
                                  {isPct ? "Percentage" : "Fixed Amount"}
                                </span>
                              </td>
                              {/* Discount value */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <span style={{ fontSize:15, fontWeight:700, color: isPct ? "#1455a0" : "#2e6b0d" }}>
                                  {formatDiscount(sch)}
                                </span>
                              </td>
                              {/* Status */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, padding:"4px 10px", borderRadius:99, background: isActive ? "#e8f5e0" : "#f0ede8", color: isActive ? "#2e6b0d" : "#5c5752" }}>
                                  <span style={{ width:6, height:6, borderRadius:"50%", background: isActive ? "#4caf50" : "#9e9e9e" }} />
                                  {isActive ? "Active" : "Inactive"}
                                </span>
                              </td>
                              {/* Description */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                {sch.description
                                  ? <span style={{ fontSize:12, color:"#7a5a5a", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{sch.description}</span>
                                  : <span style={{ color:"#d0b8b8", fontStyle:"italic", fontSize:12 }}>—</span>
                                }
                              </td>
                              {/* Actions */}
                              <td style={{ padding:"13px 14px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ display:"flex", gap:4 }}>
                                  <button className="row-action" title="Edit" onClick={() => setModal({ mode:"edit", scholarshipType: sch })}>
                                    <i className="ti ti-pencil" style={{ fontSize:13 }} />
                                  </button>
                                  <button className="row-action" title="Delete" style={{ color:"#c09090" }} onClick={() => setToDelete(sch)}>
                                    <i className="ti ti-trash" style={{ fontSize:13 }} />
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
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal && (
        <ScholarshipTypeModal
          scholarshipType={modal.mode === "edit" ? modal.scholarshipType : null}
          onClose={() => setModal(null)}
          onSaved={() => fetchScholarships(search, activeFilter)}
        />
      )}
      {toDelete && (
        <DeleteModal item={toDelete} onConfirm={handleDelete} onCancel={() => setToDelete(null)} />
      )}
    </>
  );
}
