import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ── API ───────────────────────────────────────────────────────────────────────
const BILLING_API = "http://localhost:8002/api";

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

const getFeeSchedules     = (p = {}) => apiCall("GET",    `${BILLING_API}/fee-schedules/?${new URLSearchParams(p)}`);
const createFeeSchedule   = (p)      => apiCall("POST",   `${BILLING_API}/fee-schedules/`, p);
const updateFeeSchedule   = (id, p)  => apiCall("PATCH",  `${BILLING_API}/fee-schedules/${id}/`, p);
const createItem          = (p)      => apiCall("POST",   `${BILLING_API}/fee-schedule-items/`, p);
const updateItem          = (id, p)  => apiCall("PATCH",  `${BILLING_API}/fee-schedule-items/${id}/`, p);
const deleteItem          = (id)     => apiCall("DELETE", `${BILLING_API}/fee-schedule-items/${id}/`);
const recalculateSchedule = (id)     => apiCall("POST",   `${BILLING_API}/fee-schedules/${id}/recalculate/`);

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

// ── Constants ─────────────────────────────────────────────────────────────────
const SCHOOL_LEVELS = [
  { value:"nursery",           label:"Nursery",      color:"#be185d", bg:"#fde8f8", icon:"ti-baby-carriage",
    grades:["Nursery"] },
  { value:"kindergarten",      label:"Kindergarten", color:"#d97706", bg:"#fdf5e8", icon:"ti-star",
    grades:["Junior Kinder","Senior Kinder"] },
  { value:"elementary",        label:"Elementary",   color:"#2e6b0d", bg:"#e8f5e0", icon:"ti-book",
    grades:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"] },
  { value:"junior_highschool", label:"Junior HS",    color:"#1455a0", bg:"#e3f0fd", icon:"ti-school",
    grades:["Grade 7","Grade 8","Grade 9","Grade 10"] },
  { value:"senior_highschool", label:"Senior HS",    color:"#7c3aed", bg:"#f0e8fd", icon:"ti-certificate",
    grades:["Grade 11","Grade 12"] },
];

const CATEGORY_META = {
  tuition: { label:"Tuition",       color:"#e03131", bg:"#fff0f0", icon:"ti-school" },
  misc:    { label:"Miscellaneous",  color:"#1455a0", bg:"#e3f0fd", icon:"ti-clipboard-list" },
  other:   { label:"Other",          color:"#2e6b0d", bg:"#e8f5e0", icon:"ti-dots-circle-horizontal" },
};

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;

const Sk = ({ w="100%", h=14, r=6 }) => (
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
        <div style={{ display:"flex", gap:10, width:"100%" }}>
          <button onClick={onCancel} style={{ flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:"white", fontSize:13, color:"#7a5050", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>Stay</button>
          <button onClick={onConfirm} style={{ flex:1, height:42, border:"none", borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", fontSize:13, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>Yes, logout</button>
        </div>
      </div>
    </div>
  );
}

// ── New Fee Schedule Modal ────────────────────────────────────────────────────
function NewScheduleModal({ onClose, onSaved }) {
  const [schoolLevel, setSchoolLevel] = useState("elementary");
  const [gradeLevel,  setGradeLevel]  = useState("Grade 1");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  const lvl = SCHOOL_LEVELS.find((l) => l.value === schoolLevel) ?? SCHOOL_LEVELS[2];

  const handleCreate = async () => {
    setSaving(true); setError("");
    try {
      const created = await createFeeSchedule({ school_level: schoolLevel, grade_level: gradeLevel, is_active: true });
      onSaved(created);
      onClose();
    } catch (e) {
      setError(e.message || "Failed to create. This level/grade may already exist.");
    } finally { setSaving(false); }
  };

  const inp = { width:"100%", border:"1.5px solid #fde2de", borderRadius:10, padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none", boxSizing:"border-box", cursor:"pointer" };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, width:420, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", animation:"slideUp 0.2s ease", overflow:"hidden" }}>
        <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ti ti-cash" style={{ fontSize:18, color:"#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>New Fee Schedule</div>
              <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Select a level and grade to create a fee structure</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", fontSize:20 }}><i className="ti ti-x" /></button>
        </div>
        <div style={{ padding:"22px 28px" }}>
          {error && <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:14 }}>{error}</div>}

          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:8 }}>School Level</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {SCHOOL_LEVELS.map((lv) => {
                const active = schoolLevel === lv.value;
                return (
                  <button key={lv.value} type="button"
                    onClick={() => { setSchoolLevel(lv.value); setGradeLevel(lv.grades[0]); }}
                    style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:99, border:`1.5px solid ${active?lv.color:"#f0e4e4"}`, background:active?lv.bg:"white", color:active?lv.color:"#9a7070", fontSize:12, fontWeight:active?700:500, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .15s" }}>
                    <i className={`ti ${lv.icon}`} style={{ fontSize:12 }} />{lv.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom:6 }}>
            <label style={{ display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6 }}>Grade Level</label>
            <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} style={inp}>
              {lvl.grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        <div style={{ padding:"16px 28px 24px", display:"flex", justifyContent:"flex-end", gap:10, borderTop:"1px solid #f5eaea" }}>
          <button onClick={onClose} style={{ background:"transparent", color:"#9a7070", border:"1.5px solid #fde2de", borderRadius:50, padding:"9px 22px", fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            style={{ background:saving?"#e87474":"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:50, padding:"9px 24px", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:saving?"not-allowed":"pointer", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Creating…</> : <><i className="ti ti-plus" style={{ fontSize:13 }} />Create</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fee Item Row ──────────────────────────────────────────────────────────────
function FeeItemRow({ item, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(item.item_name);
  const [amount,  setAmount]  = useState(String(item.amount));
  const [saving,  setSaving]  = useState(false);

  const catMeta = CATEGORY_META[item.item_category] ?? CATEGORY_META.other;
  const inp = { border:"1.5px solid #fde2de", borderRadius:8, padding:"6px 10px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none" };

  const handleSave = async () => {
    if (!name.trim() || !amount || parseFloat(amount) < 0) return;
    setSaving(true);
    await updateItem(item.fee_schedule_item_id, { item_name: name.trim(), amount: parseFloat(amount) });
    setEditing(false); setSaving(false);
    onUpdated();
  };

  const handleDelete = async () => {
    await deleteItem(item.fee_schedule_item_id);
    onDeleted();
  };

  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", background:"#fdfafa", border:"1px solid #f5eaea", borderRadius:10, transition:"border-color 0.12s" }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor="#fca5a5"}
      onMouseLeave={(e) => e.currentTarget.style.borderColor="#f5eaea"}>
      <div style={{ width:8, height:8, borderRadius:"50%", background:catMeta.color, flexShrink:0 }} />
      {editing ? (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" style={{ ...inp, flex:1, minWidth:0 }} />
          <div style={{ position:"relative", width:120, flexShrink:0 }}>
            <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"#b09090", fontWeight:600 }}>₱</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inp, width:"100%", paddingLeft:22, textAlign:"right" }} />
          </div>
          <button onClick={handleSave} disabled={saving}
            style={{ background:"#e03131", color:"white", border:"none", borderRadius:7, padding:"6px 12px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:4 }}>
            {saving ? <i className="ti ti-loader-2" style={{ fontSize:12, animation:"spin 1s linear infinite" }} /> : <i className="ti ti-check" style={{ fontSize:12 }} />}
          </button>
          <button onClick={() => { setEditing(false); setName(item.item_name); setAmount(String(item.amount)); }}
            style={{ background:"white", color:"#9a7070", border:"1px solid #f0e4e4", borderRadius:7, padding:"6px 10px", fontSize:12, cursor:"pointer" }}>
            <i className="ti ti-x" style={{ fontSize:12 }} />
          </button>
        </>
      ) : (
        <>
          <span style={{ flex:1, fontSize:13, color:"#1a0a0a", fontWeight:500 }}>{item.item_name}</span>
          <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>{fmt(item.amount)}</span>
          <button onClick={() => setEditing(true)}
            style={{ width:26, height:26, border:"1px solid #f0e4e4", borderRadius:7, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070", transition:"all 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.color="#e03131"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.color="#9a7070"; }}>
            <i className="ti ti-pencil" style={{ fontSize:11 }} />
          </button>
          <button onClick={handleDelete}
            style={{ width:26, height:26, border:"1px solid #f0e4e4", borderRadius:7, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#c09090", transition:"all 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.color="#e03131"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.color="#c09090"; }}>
            <i className="ti ti-trash" style={{ fontSize:11 }} />
          </button>
        </>
      )}
    </div>
  );
}

// ── Add Fee Item Form ─────────────────────────────────────────────────────────
function AddFeeItemForm({ scheduleId, category, onAdded }) {
  const [name,   setName]   = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const catMeta = CATEGORY_META[category];
  const inp = { border:"1.5px solid #fde2de", borderRadius:8, padding:"7px 10px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none" };

  const handleAdd = async () => {
    if (!name.trim())              { setError("Name required."); return; }
    if (!amount || parseFloat(amount) < 0) { setError("Amount required."); return; }
    setSaving(true); setError("");
    try {
      await createItem({ fee_schedule: scheduleId, item_category: category, item_name: name.trim(), amount: parseFloat(amount) });
      setName(""); setAmount("");
      onAdded();
    } catch (e) { setError(e.message || "Failed to add."); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop:8 }}>
      {error && <div style={{ fontSize:11, color:"#b91c1c", marginBottom:6 }}>{error}</div>}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:catMeta.color, flexShrink:0, opacity:0.4 }} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${category === "tuition" ? "Tuition Fee" : category === "misc" ? "Books" : "Morning Binder"}`}
          style={{ ...inp, flex:1, minWidth:0 }} onKeyDown={(e) => e.key==="Enter" && handleAdd()} />
        <div style={{ position:"relative", width:120, flexShrink:0 }}>
          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"#b09090", fontWeight:600 }}>₱</span>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
            style={{ ...inp, width:"100%", paddingLeft:22, textAlign:"right" }} onKeyDown={(e) => e.key==="Enter" && handleAdd()} />
        </div>
        <button onClick={handleAdd} disabled={saving}
          style={{ background:saving?"#e87474":"#fff0f0", color:"#e03131", border:"1px solid #fca5a5", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:saving?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" }}>
          {saving ? <i className="ti ti-loader-2" style={{ fontSize:12, animation:"spin 1s linear infinite" }} /> : <i className="ti ti-plus" style={{ fontSize:12 }} />}Add
        </button>
      </div>
    </div>
  );
}

// ── Schedule Detail Panel ─────────────────────────────────────────────────────
function ScheduleDetail({ schedule, onUpdated }) {
  const lvl = SCHOOL_LEVELS.find((l) => l.value === schedule.school_level) ?? SCHOOL_LEVELS[2];
  const [recalcing, setRecalcing] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState("");

  const categories = ["tuition", "misc", "other"];

  const handleRecalculate = async () => {
    setRecalcing(true); setRecalcMsg("");
    try {
      const result = await recalculateSchedule(schedule.fee_schedule_id);
      setRecalcMsg(`✓ ${result.updated} invoice${result.updated !== 1 ? "s" : ""} updated`);
      setTimeout(() => setRecalcMsg(""), 4000);
    } catch (e) { setRecalcMsg("Recalculation failed."); }
    finally { setRecalcing(false); }
  };

  const tuitionTotal = schedule.total_tuition ?? 0;
  const miscTotal    = schedule.total_misc    ?? 0;
  const otherTotal   = schedule.total_other   ?? 0;
  const grandTotal   = schedule.grand_total   ?? 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Header */}
      <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"18px 22px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:lvl.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <i className={`ti ${lvl.icon}`} style={{ fontSize:20, color:lvl.color }} />
          </div>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>{schedule.grade_level}</div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99, background:lvl.bg, color:lvl.color, marginTop:3 }}>
              <i className={`ti ${lvl.icon}`} style={{ fontSize:11 }} />{lvl.label}
            </div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {recalcMsg && <span style={{ fontSize:12, color:"#2e6b0d", fontWeight:600 }}>{recalcMsg}</span>}
          <button onClick={handleRecalculate} disabled={recalcing}
            style={{ display:"inline-flex", alignItems:"center", gap:6, background:"#fff0f0", color:"#e03131", border:"1px solid #fca5a5", borderRadius:10, padding:"8px 16px", fontSize:12, fontWeight:700, cursor:recalcing?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif" }}>
            {recalcing ? <i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} /> : <i className="ti ti-refresh" style={{ fontSize:13 }} />}
            {recalcing ? "Updating…" : "Apply to Invoices"}
          </button>
        </div>
      </div>

      {/* Totals summary */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
        {[
          { label:"Tuition",       val:tuitionTotal, color:"#e03131", bg:"#fff0f0" },
          { label:"Miscellaneous", val:miscTotal,    color:"#1455a0", bg:"#e3f0fd" },
          { label:"Other",         val:otherTotal,   color:"#2e6b0d", bg:"#e8f5e0" },
          { label:"Grand Total",   val:grandTotal,   color:"#7c3aed", bg:"#f0e8fd" },
        ].map((s) => (
          <div key={s.label} style={{ background:"white", borderRadius:12, border:"1px solid #f5eaea", padding:"14px 16px", textAlign:"center", boxShadow:"0 2px 8px rgba(224,49,49,0.04)" }}>
            <div style={{ fontSize:16, fontWeight:700, color:s.color }}>{fmt(s.val)}</div>
            <div style={{ fontSize:11, color:"#a07878", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.06em", marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Category sections */}
      {categories.map((cat) => {
        const catMeta = CATEGORY_META[cat];
        const catItems = (schedule.items ?? []).filter((i) => i.item_category === cat);
        return (
          <div key={cat} style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:30, height:30, borderRadius:8, background:catMeta.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <i className={`ti ${catMeta.icon}`} style={{ fontSize:14, color:catMeta.color }} />
                </div>
                <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>{catMeta.label}</span>
                <span style={{ fontSize:11, color:"#b09090" }}>{catItems.length} item{catItems.length !== 1 ? "s" : ""}</span>
                {cat !== "tuition" && <span style={{ fontSize:11, color:"#b09090", fontStyle:"italic" }}>· no discount applied</span>}
                {cat === "tuition" && <span style={{ fontSize:11, color:"#e03131", fontStyle:"italic" }}>· discounts applied here</span>}
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:catMeta.color }}>
                {fmt(catItems.reduce((s, i) => s + parseFloat(i.amount), 0))}
              </span>
            </div>
            <div style={{ padding:"12px 18px", display:"flex", flexDirection:"column", gap:6 }}>
              {catItems.length === 0 && (
                <div style={{ fontSize:12, color:"#d0b8b8", fontStyle:"italic", textAlign:"center", padding:"8px 0" }}>No items yet</div>
              )}
              {catItems.map((item) => (
                <FeeItemRow key={item.fee_schedule_item_id} item={item}
                  onUpdated={onUpdated} onDeleted={onUpdated} />
              ))}
              <AddFeeItemForm scheduleId={schedule.fee_schedule_id} category={cat} onAdded={onUpdated} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function FeeSchedulesPage() {
  const navigate = useNavigate();

  const [schedules,      setSchedules]      = useState([]);
  const [selected,       setSelected]       = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [levelFilter,    setLevelFilter]    = useState("all");
  const [showNewModal,   setShowNewModal]   = useState(false);
  const [showLogout,     setShowLogout]     = useState(false);

  const fetchSchedules = useCallback(async (lvl = levelFilter) => {
    setLoading(true);
    try {
      const params = {};
      if (lvl !== "all") params.school_level = lvl;
      const data = await getFeeSchedules(params);
      const results = Array.isArray(data) ? data : data?.results ?? [];
      setSchedules(results);
      // Keep selection in sync
      if (selected) {
        const refreshed = results.find((s) => s.fee_schedule_id === selected.fee_schedule_id);
        setSelected(refreshed ?? null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [levelFilter, selected]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchSchedules("all");
  }, []);

  const handleSelectSchedule = (sch) => setSelected(sch);
  const handleUpdated = () => fetchSchedules(levelFilter);

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
        .sch-btn { transition:all 0.12s; cursor:pointer; }
        .sch-btn:hover { background:#fff8f6 !important; border-color:#fca5a5 !important; }
        .chip-btn { display:flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:99px;border:1.5px solid #f0e4e4;background:white;font-size:12px;color:#9a7070;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all 0.14s; }
        .chip-btn:hover { border-color:#fca5a5;color:#e03131;background:#fff8f6; }
        .chip-btn.active { background:#fff0f0;border-color:#e03131;color:#e03131;font-weight:700; }
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
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>Fee Schedules</div>
              <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>
                {loading ? "Loading…" : `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""} configured`}
              </div>
            </div>
            <button onClick={() => setShowNewModal(true)}
              style={{ display:"inline-flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
              <i className="ti ti-plus" style={{ fontSize:15 }} />New Schedule
            </button>
          </div>

          {/* Content — master/detail layout */}
          <div style={{ flex:1, overflow:"hidden", display:"grid", gridTemplateColumns:"280px 1fr" }}>

            {/* Left: Schedule list */}
            <div style={{ borderRight:"1px solid #f5eaea", display:"flex", flexDirection:"column", overflow:"hidden", background:"white" }}>
              {/* Level filter */}
              <div style={{ padding:"12px 14px", borderBottom:"1px solid #f5eaea", display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ fontSize:10.5, color:"#cdb0b0", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:600 }}>Filter by Level</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                  <button className={`chip-btn${levelFilter==="all"?" active":""}`} style={{ height:26, fontSize:11 }} onClick={() => { setLevelFilter("all"); fetchSchedules("all"); }}>All</button>
                  {SCHOOL_LEVELS.map((lv) => (
                    <button key={lv.value} className={`chip-btn${levelFilter===lv.value?" active":""}`}
                      style={{ height:26, fontSize:11, borderColor:levelFilter===lv.value?lv.color:"#f0e4e4", color:levelFilter===lv.value?lv.color:"#9a7070", background:levelFilter===lv.value?lv.bg:"white" }}
                      onClick={() => { setLevelFilter(lv.value); fetchSchedules(lv.value); }}>
                      {lv.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* List */}
              <div style={{ flex:1, overflowY:"auto" }}>
                {loading ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ padding:"14px 16px", borderBottom:"1px solid #f9f0f0", display:"flex", flexDirection:"column", gap:8 }}>
                    <Sk w={120} h={14} /><Sk w={80} h={11} /><Sk w="100%" h={8} r={99} />
                  </div>
                )) : schedules.length === 0 ? (
                  <div style={{ padding:"40px 16px", textAlign:"center", color:"#b09090", fontSize:13, fontStyle:"italic" }}>
                    No fee schedules yet.<br />Click "New Schedule" to create one.
                  </div>
                ) : schedules.map((sch) => {
                  const lv = SCHOOL_LEVELS.find((l) => l.value === sch.school_level) ?? SCHOOL_LEVELS[2];
                  const isActive = selected?.fee_schedule_id === sch.fee_schedule_id;
                  const grandTotal = parseFloat(sch.grand_total ?? 0);
                  const itemCount  = (sch.items ?? []).length;
                  return (
                    <div key={sch.fee_schedule_id} className="sch-btn"
                      style={{ padding:"14px 16px", borderBottom:"1px solid #f9f0f0", borderLeft:`3px solid ${isActive ? lv.color : "transparent"}`, background:isActive ? lv.bg : "white" }}
                      onClick={() => handleSelectSchedule(sch)}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <i className={`ti ${lv.icon}`} style={{ fontSize:13, color:lv.color }} />
                        <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>{sch.grade_level}</span>
                        <span style={{ fontSize:10.5, fontWeight:600, padding:"2px 6px", borderRadius:99, background:lv.bg, color:lv.color }}>{lv.label}</span>
                      </div>
                      <div style={{ fontSize:12, color:"#b09090" }}>{itemCount} items</div>
                      <div style={{ fontSize:14, fontWeight:700, color:lv.color, marginTop:4 }}>{fmt(grandTotal)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Detail */}
            <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
              {!selected ? (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:14 }}>
                  <div style={{ width:60, height:60, borderRadius:18, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <i className="ti ti-cash" style={{ fontSize:28, color:"#e08080" }} />
                  </div>
                  <div style={{ fontSize:16, color:"#7a5050", fontWeight:600, fontFamily:"'Playfair Display',serif" }}>Select a fee schedule</div>
                  <div style={{ fontSize:13, color:"#b09090" }}>Click a schedule on the left to view and edit its items</div>
                </div>
              ) : (
                <ScheduleDetail key={selected.fee_schedule_id} schedule={selected} onUpdated={handleUpdated} />
              )}
            </div>
          </div>
        </div>
      </div>

      {showNewModal && (
        <NewScheduleModal onClose={() => setShowNewModal(false)} onSaved={(s) => { fetchSchedules(levelFilter); setSelected(s); }} />
      )}

      {showLogout && (
        <LogoutModal
          onConfirm={() => { sessionStorage.removeItem("access_token"); sessionStorage.removeItem("refresh_token"); navigate("/"); }}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </>
  );
}
