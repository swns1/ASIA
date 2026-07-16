import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import AppLayout from "../components/AppLayout";
import { getEnrollments } from "../api/enrollmentApi";
import { getAttendance, bulkAttendance, getAttendanceSummary } from "../api/attendanceApi";
import { useSchoolYear } from "../context/SchoolYearContext";
import { attendanceRate } from "../utils/attendance";

// ── Constants ──────────────────────────────────────────────────────────────────
const C = { dark:"#1a0a0a", muted:"#7a5050", border:"#f5eaea", red:"#e03131" };

const GRADE_LEVELS = [
  "Nursery","Kindergarten",
  "Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6",
  "Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12",
];

const STATUS_CONFIG = {
  P: { label:"Present", color:"#16a34a", bg:"#e8f5e0", border:"#a3d977" },
  A: { label:"Absent",  color:"#e03131", bg:"#fff0f0", border:"#fca5a5" },
  L: { label:"Late",    color:"#d97706", bg:"#fef3e2", border:"#f6c96a" },
  E: { label:"Excused", color:"#2563eb", bg:"#e8f0fd", border:"#93b4f5" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const isWeekend   = (s) => { const d = new Date(s+"T00:00:00"); return d.getDay()===0||d.getDay()===6; };
const todayStr    = () => new Date().toISOString().slice(0,10);
const nowMonthStr = () => new Date().toISOString().slice(0,7);

function fmtDateLong(s) {
  return new Date(s+"T00:00:00").toLocaleDateString("en-PH",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}
function fmtDay(s)       { return String(parseInt(s.slice(8))); }
function fmtDayOfWeek(s) { return ["Su","M","T","W","Th","F","Sa"][new Date(s+"T00:00:00").getDay()]; }
function monthLabel(ym) {
  const [y,m] = ym.split("-").map(Number);
  return new Date(y,m-1,1).toLocaleDateString("en-PH",{month:"long",year:"numeric"});
}
function getWeekdaysInMonth(ym) {
  const [y,m] = ym.split("-").map(Number);
  const days=[], d=new Date(y,m-1,1);
  while (d.getMonth()===m-1) {
    if (d.getDay()!==0&&d.getDay()!==6) days.push(d.toISOString().slice(0,10));
    d.setDate(d.getDate()+1);
  }
  return days;
}
function sortByLastName(list) {
  return [...list].sort((a,b)=>(a.student_detail?.last_name??"").localeCompare(b.student_detail?.last_name??""));
}
function displayName(st={}) {
  return `${st.last_name||"—"}, ${st.first_name||""}${st.middle_name?" "+st.middle_name[0]+".":""}${st.suffix?" "+st.suffix:""}`;
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function EmptyState({ icon, title, desc }) {
  return (
    <div style={{background:"white",borderRadius:14,border:`1px solid ${C.border}`,padding:"80px 24px",textAlign:"center",boxShadow:"0 2px 12px rgba(224,49,49,0.04)"}}>
      <div style={{width:56,height:56,borderRadius:16,background:"#fff0f0",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
        <i className={`ti ${icon}`} style={{fontSize:26,color:"#e08080"}}/>
      </div>
      <div style={{fontSize:16,fontWeight:700,color:C.muted}}>{title}</div>
      <div style={{fontSize:13,color:"#b09090",marginTop:6}}>{desc}</div>
    </div>
  );
}

// ── Daily Roster ───────────────────────────────────────────────────────────────
function DailyRoster({ classInfo, enrollments, statuses, date, saving, onMarkAll, onToggle, onSave }) {
  const counts = Object.values(statuses).reduce((acc,s)=>{ acc[s]=(acc[s]||0)+1; return acc; }, {});
  return (
    <div style={{background:"white",borderRadius:14,border:`1px solid ${C.border}`,boxShadow:"0 2px 12px rgba(224,49,49,0.04)",overflow:"hidden",animation:"fadeUp 0.2s ease both"}}>
      {/* Header */}
      <div style={{padding:"16px 22px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:C.dark}}>{classInfo.grade_level} — {classInfo.section}</div>
          <div style={{fontSize:12,color:"#b09090",marginTop:3}}>S.Y. {classInfo.school_year} · {fmtDateLong(date)} · {enrollments.length} student{enrollments.length!==1?"s":""}</div>
        </div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {Object.entries(STATUS_CONFIG).map(([k,v])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,background:v.bg,border:`1px solid ${v.border}`}}>
              <span style={{fontSize:12,fontWeight:700,color:v.color}}>{k}</span>
              <span style={{fontSize:12,color:v.color,fontWeight:600}}>{counts[k]||0}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Mark all */}
      <div style={{padding:"10px 22px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8,background:"#fdfafa"}}>
        <span style={{fontSize:11,color:"#b09090",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em"}}>Mark all:</span>
        {Object.entries(STATUS_CONFIG).map(([k,v])=>(
          <button key={k} onClick={()=>onMarkAll(k)}
            style={{height:28,padding:"0 12px",border:`1px solid ${v.border}`,borderRadius:6,background:v.bg,color:v.color,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
            {v.label}
          </button>
        ))}
      </div>
      {/* Table */}
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead>
          <tr style={{background:"#fdfafa"}}>
            <th style={{padding:"10px 22px",fontSize:11,fontWeight:600,color:"#b09090",textAlign:"left",textTransform:"uppercase",letterSpacing:"0.07em",borderBottom:`1px solid ${C.border}`,width:40}}>#</th>
            <th style={{padding:"10px 22px",fontSize:11,fontWeight:600,color:"#b09090",textAlign:"left",textTransform:"uppercase",letterSpacing:"0.07em",borderBottom:`1px solid ${C.border}`}}>Student</th>
            <th style={{padding:"10px 22px",fontSize:11,fontWeight:600,color:"#b09090",textAlign:"center",textTransform:"uppercase",letterSpacing:"0.07em",borderBottom:`1px solid ${C.border}`,width:220}}>Status</th>
          </tr>
        </thead>
        <tbody>
          {enrollments.map((en,idx)=>{
            const st=en.student_detail||{}, sid=en.enrollment_id, cur=statuses[sid]||"P";
            return (
              <tr key={sid} style={{borderBottom:`1px solid ${C.border}`}}
                onMouseEnter={(e)=>{e.currentTarget.style.background="#fdfafa";}}
                onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";}}>
                <td style={{padding:"11px 22px",fontSize:12,color:"#b09090",fontWeight:500}}>{idx+1}</td>
                <td style={{padding:"11px 22px"}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.dark}}>{displayName(st)}</div>
                  <div style={{fontSize:11,color:"#b09090",marginTop:2}}>LRN {st.lrn||"—"}</div>
                </td>
                <td style={{padding:"11px 22px",textAlign:"center"}}>
                  <div style={{display:"inline-flex",gap:5}}>
                    {Object.entries(STATUS_CONFIG).map(([k,v])=>{
                      const active=cur===k;
                      return (
                        <button key={k} onClick={()=>onToggle(sid,k)}
                          style={{width:40,height:32,border:`1.5px solid ${active?v.border:"#f0e4e4"}`,borderRadius:7,background:active?v.bg:"white",color:active?v.color:"#c0a0a0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.12s",boxShadow:active?`0 2px 8px ${v.border}99`:"none"}}>
                          {k}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Footer */}
      <div style={{padding:"14px 22px",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fdfafa"}}>
        <div style={{fontSize:13,color:"#b09090"}}>
          {Object.entries(STATUS_CONFIG).map(([k,v])=>counts[k]?`${counts[k]} ${v.label}`:null).filter(Boolean).join(" · ")}
        </div>
        <button onClick={onSave} disabled={saving}
          style={{height:38,padding:"0 24px",background:saving?"#f5eaea":"linear-gradient(135deg,#e03131,#c92a2a)",color:saving?C.muted:"white",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:saving?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:7,boxShadow:saving?"none":"0 4px 16px rgba(224,49,49,0.26)"}}>
          {saving?<i className="ti ti-loader-2" style={{fontSize:14,animation:"spin 1s linear infinite"}}/>:<i className="ti ti-device-floppy" style={{fontSize:14}}/>}
          {saving?"Saving…":"Save Attendance"}
        </button>
      </div>
    </div>
  );
}

// ── Monthly Matrix ─────────────────────────────────────────────────────────────
function MonthlyMatrix({ classInfo, month, weekdays, enrollments, matrix }) {
  return (
    <div style={{background:"white",borderRadius:14,border:`1px solid ${C.border}`,boxShadow:"0 2px 12px rgba(224,49,49,0.04)",overflow:"hidden",animation:"fadeUp 0.2s ease both"}}>
      <div style={{padding:"16px 22px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:C.dark}}>{classInfo.grade_level} — {classInfo.section}</div>
          <div style={{fontSize:12,color:"#b09090",marginTop:3}}>S.Y. {classInfo.school_year} · {monthLabel(month)} · {weekdays.length} school days</div>
        </div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {Object.entries(STATUS_CONFIG).map(([k,v])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:16,background:v.bg,border:`1px solid ${v.border}`}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:v.color,display:"inline-block"}}/>
              <span style={{fontSize:11,fontWeight:700,color:v.color}}>{k} = {v.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",minWidth:"100%"}}>
          <thead>
            <tr style={{background:"#fdfafa"}}>
              <th style={{padding:"10px 18px",fontSize:11,fontWeight:600,color:"#b09090",textAlign:"left",textTransform:"uppercase",letterSpacing:"0.07em",borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,minWidth:210,position:"sticky",left:0,background:"#fdfafa",zIndex:2}}>
                Student
              </th>
              {weekdays.map((d)=>(
                <th key={d} style={{padding:"6px 4px",fontSize:10,fontWeight:600,color:"#b09090",textAlign:"center",borderBottom:`1px solid ${C.border}`,borderRight:`1px solid #f9f0f0`,minWidth:34}}>
                  <div style={{color:"#b09090"}}>{fmtDayOfWeek(d)}</div>
                  <div style={{color:C.dark,fontWeight:700,fontSize:11}}>{fmtDay(d)}</div>
                </th>
              ))}
              <th style={{padding:"10px 14px",fontSize:11,fontWeight:600,color:"#b09090",textAlign:"center",borderBottom:`1px solid ${C.border}`,borderLeft:`1px solid ${C.border}`,minWidth:120,whiteSpace:"nowrap"}}>
                P / A / L / E
              </th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((en,idx)=>{
              const st=en.student_detail||{}, sid=en.enrollment_id, rec=matrix[sid]||{};
              const p=Object.values(rec).filter(v=>v==="P").length;
              const a=Object.values(rec).filter(v=>v==="A").length;
              const l=Object.values(rec).filter(v=>v==="L").length;
              const e=Object.values(rec).filter(v=>v==="E").length;
              const rowBg = idx%2===0?"white":"#fdfcfc";
              return (
                <tr key={sid} style={{borderBottom:`1px solid ${C.border}`}}
                  onMouseEnter={(ev)=>{ev.currentTarget.querySelectorAll("td").forEach(td=>td.style.background="#fdf5f5");}}
                  onMouseLeave={(ev)=>{ev.currentTarget.querySelectorAll("td").forEach(td=>td.style.background="");}} >
                  <td style={{padding:"9px 18px",borderRight:`1px solid ${C.border}`,position:"sticky",left:0,background:rowBg,zIndex:1,whiteSpace:"nowrap",minWidth:210}}>
                    <span style={{fontSize:11,color:"#b09090",marginRight:8}}>{idx+1}</span>
                    <span style={{fontSize:13,fontWeight:600,color:C.dark}}>{st.last_name||"—"}, {st.first_name||""}</span>
                    <div style={{fontSize:10,color:"#b09090",marginTop:1,paddingLeft:22}}>LRN {st.lrn||"—"}</div>
                  </td>
                  {weekdays.map((d)=>{
                    const s=rec[d], v=s?STATUS_CONFIG[s]:null;
                    return (
                      <td key={d} style={{padding:"5px 4px",textAlign:"center",borderRight:`1px solid #f9f0f0`,background:rowBg}}>
                        {v ? (
                          <span style={{display:"inline-block",width:26,height:24,lineHeight:"24px",borderRadius:6,background:v.bg,border:`1px solid ${v.border}`,fontSize:11,fontWeight:700,color:v.color,textAlign:"center"}}>
                            {s}
                          </span>
                        ) : (
                          <span style={{display:"inline-block",width:26,height:24,lineHeight:"24px",borderRadius:6,background:"#f5f0f0",fontSize:11,color:"#d8c8c8",textAlign:"center"}}>—</span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{padding:"9px 14px",textAlign:"center",borderLeft:`1px solid ${C.border}`,background:rowBg,whiteSpace:"nowrap"}}>
                    <span style={{fontSize:12,fontWeight:700,color:STATUS_CONFIG.P.color}}>{p}</span>
                    <span style={{fontSize:11,color:"#d0c0c0",margin:"0 3px"}}>/</span>
                    <span style={{fontSize:12,fontWeight:700,color:STATUS_CONFIG.A.color}}>{a}</span>
                    <span style={{fontSize:11,color:"#d0c0c0",margin:"0 3px"}}>/</span>
                    <span style={{fontSize:12,fontWeight:700,color:STATUS_CONFIG.L.color}}>{l}</span>
                    <span style={{fontSize:11,color:"#d0c0c0",margin:"0 3px"}}>/</span>
                    <span style={{fontSize:12,fontWeight:700,color:STATUS_CONFIG.E.color}}>{e}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Summary Table ──────────────────────────────────────────────────────────────
function SummaryTable({ classInfo, data }) {
  if (!data) return null;
  const rows = [...(data.per_enrollment||[])].sort((a,b)=>
    (a.enrollment__student__last_name||"").localeCompare(b.enrollment__student__last_name||"")
  );
  const tot = data.totals||{};
  return (
    <div style={{background:"white",borderRadius:14,border:`1px solid ${C.border}`,boxShadow:"0 2px 12px rgba(224,49,49,0.04)",overflow:"hidden",animation:"fadeUp 0.2s ease both"}}>
      {/* Header */}
      <div style={{padding:"16px 22px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:C.dark}}>{classInfo.grade_level} — {classInfo.section}</div>
          <div style={{fontSize:12,color:"#b09090",marginTop:3}}>S.Y. {classInfo.school_year} · Attendance Summary · {rows.length} students</div>
        </div>
        <div style={{display:"flex",gap:18,alignItems:"center"}}>
          {Object.entries(STATUS_CONFIG).map(([k,v])=>(
            <div key={k} style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:v.color}}>{tot[k.toLowerCase()]||0}</div>
              <div style={{fontSize:11,color:"#b09090"}}>{v.label}</div>
            </div>
          ))}
          <div style={{textAlign:"center",borderLeft:`1px solid ${C.border}`,paddingLeft:18}}>
            <div style={{fontSize:20,fontWeight:700,color:C.dark}}>{tot.total||0}</div>
            <div style={{fontSize:11,color:"#b09090"}}>Total Records</div>
          </div>
        </div>
      </div>
      {/* Table */}
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead>
          <tr style={{background:"#fdfafa"}}>
            <th style={{padding:"10px 22px",fontSize:11,fontWeight:600,color:"#b09090",textAlign:"left",textTransform:"uppercase",letterSpacing:"0.07em",borderBottom:`1px solid ${C.border}`,width:40}}>#</th>
            <th style={{padding:"10px 22px",fontSize:11,fontWeight:600,color:"#b09090",textAlign:"left",textTransform:"uppercase",letterSpacing:"0.07em",borderBottom:`1px solid ${C.border}`}}>Student</th>
            {Object.entries(STATUS_CONFIG).map(([k,v])=>(
              <th key={k} style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:v.color,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.07em",borderBottom:`1px solid ${C.border}`,width:70}}>{k}</th>
            ))}
            <th style={{padding:"10px 14px",fontSize:11,fontWeight:600,color:"#b09090",textAlign:"center",textTransform:"uppercase",letterSpacing:"0.07em",borderBottom:`1px solid ${C.border}`,width:70}}>Total</th>
            <th style={{padding:"10px 14px",fontSize:11,fontWeight:600,color:"#b09090",textAlign:"center",textTransform:"uppercase",letterSpacing:"0.07em",borderBottom:`1px solid ${C.border}`,width:90}}>Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.length===0 ? (
            <tr><td colSpan={8} style={{padding:"40px",textAlign:"center",fontSize:13,color:"#b09090"}}>No attendance records found for this class.</td></tr>
          ) : rows.map((row,idx)=>{
            const total=row.total||0;
            const pct=attendanceRate(row);
            const rc=pct===null?{c:"#b09090",bg:"#f5f5f5"}:pct>=90?{c:"#16a34a",bg:"#e8f5e0"}:pct>=75?{c:"#d97706",bg:"#fef3e2"}:{c:"#e03131",bg:"#fff0f0"};
            return (
              <tr key={row.enrollment_id} style={{borderBottom:`1px solid ${C.border}`}}
                onMouseEnter={(e)=>{e.currentTarget.style.background="#fdfafa";}}
                onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";}}>
                <td style={{padding:"11px 22px",fontSize:12,color:"#b09090",fontWeight:500}}>{idx+1}</td>
                <td style={{padding:"11px 22px"}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.dark}}>{row.enrollment__student__last_name||"—"}, {row.enrollment__student__first_name||""}</div>
                  <div style={{fontSize:11,color:"#b09090",marginTop:2}}>LRN {row.enrollment__student__lrn||"—"}</div>
                </td>
                <td style={{padding:"11px 14px",textAlign:"center",fontSize:13,fontWeight:700,color:STATUS_CONFIG.P.color}}>{row.present||0}</td>
                <td style={{padding:"11px 14px",textAlign:"center",fontSize:13,fontWeight:700,color:STATUS_CONFIG.A.color}}>{row.absent||0}</td>
                <td style={{padding:"11px 14px",textAlign:"center",fontSize:13,fontWeight:700,color:STATUS_CONFIG.L.color}}>{row.late||0}</td>
                <td style={{padding:"11px 14px",textAlign:"center",fontSize:13,fontWeight:700,color:STATUS_CONFIG.E.color}}>{row.excused||0}</td>
                <td style={{padding:"11px 14px",textAlign:"center",fontSize:13,fontWeight:600,color:C.dark}}>{total}</td>
                <td style={{padding:"11px 14px",textAlign:"center"}}>
                  {pct!==null
                    ? <span style={{padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700,color:rc.c,background:rc.bg}}>{pct}%</span>
                    : <span style={{fontSize:12,color:"#b09090"}}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  usePageTitle("Attendance");
  const [tab, setTab] = useState("daily");

  // ── Shared filters ──
  const { schoolYear: globalSchoolYear } = useSchoolYear();
  const [schoolYear, setSchoolYear] = useState(globalSchoolYear || "");
  const [gradeLevel, setGradeLevel] = useState("");
  const [section,    setSection]    = useState("");

  // ── Daily tab ──
  const [date,        setDate]        = useState(todayStr());
  const [dEnrollments,setDEnrollments]= useState([]);
  const [dStatuses,   setDStatuses]   = useState({});
  const [dClassInfo,  setDClassInfo]  = useState(null);
  const [dLoading,    setDLoading]    = useState(false);
  const [dSaving,     setDSaving]     = useState(false);

  // ── Monthly tab ──
  const [month,       setMonth]       = useState(nowMonthStr());
  const [mEnrollments,setMEnrollments]= useState([]);
  const [mMatrix,     setMMatrix]     = useState({});
  const [mClassInfo,  setMClassInfo]  = useState(null);
  const [mLoading,    setMLoading]    = useState(false);

  // ── Summary tab ──
  const [summaryData,    setSummaryData]    = useState(null);
  const [summaryClass,   setSummaryClass]   = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ── Notifications ──
  const [error, setError] = useState("");

  // Follow the global school year selector (still freely editable below —
  // this is a free-text lookup field, not a locked dropdown).
  useEffect(() => { setSchoolYear(globalSchoolYear); }, [globalSchoolYear]);

  // Reload daily records when date changes (if a class is already loaded)
  useEffect(() => {
    if (!dClassInfo || !dEnrollments.length) return;
    loadDailyRecords(dEnrollments, date, dClassInfo);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDailyRecords(enrList, d, info) {
    const map = {};
    enrList.forEach((e) => { map[e.enrollment_id] = "P"; });
    try {
      const data = await getAttendance({
        date: d,
        enrollment__school_year: info.school_year,
        enrollment__grade_level: info.grade_level,
        enrollment__section:     info.section,
        page_size: 500,
      });
      const records = Array.isArray(data) ? data : (data?.results??[]);
      records.forEach((r) => { map[r.enrollment] = r.status; });
    } catch { /* none */ }
    setDStatuses(map);
  }

  async function handleDailyLoad() {
    if (!schoolYear.trim()||!gradeLevel||!section.trim()) { setError("Fill in School Year, Grade Level, and Section."); return; }
    if (isWeekend(date)) { setError("Selected date is a weekend. Attendance is Mon–Fri only."); return; }
    setDLoading(true); setError("");
    try {
      const data = await getEnrollments({ school_year:schoolYear.trim(), grade_level:gradeLevel, section:section.trim(), enrollment_status:"enrolled", page_size:300 });
      const list = sortByLastName(Array.isArray(data)?data:(data?.results??[]));
      const info = { school_year:schoolYear.trim(), grade_level:gradeLevel, section:section.trim() };
      setDEnrollments(list);
      setDClassInfo(info);
      await loadDailyRecords(list, date, info);
    } catch(e) { setError(e.response?.data?.detail||e.message||"Failed to load class."); }
    finally { setDLoading(false); }
  }

  function markAll(status) {
    setDStatuses((p) => { const n={...p}; dEnrollments.forEach((e)=>{n[e.enrollment_id]=status;}); return n; });
  }

  async function handleDailySave() {
    if (!dClassInfo||!dEnrollments.length) return;
    setDSaving(true); setError("");
    try {
      await bulkAttendance({ date, records: dEnrollments.map((e)=>({ enrollment_id:e.enrollment_id, status:dStatuses[e.enrollment_id]||"P" })) });
      toast.success("Attendance saved.");
    } catch(e) {
      const msg = e.response?.data?.detail||e.message||"Failed to save.";
      setError(msg);
      toast.error(msg);
    }
    finally { setDSaving(false); }
  }

  async function handleMonthlyLoad() {
    if (!schoolYear.trim()||!gradeLevel||!section.trim()) { setError("Fill in School Year, Grade Level, and Section."); return; }
    setMLoading(true); setError("");
    try {
      const [y,m] = month.split("-").map(Number);
      const firstDay = `${month}-01`;
      const lastDay  = new Date(y, m, 0).toISOString().slice(0,10);
      const [enrData, attData] = await Promise.all([
        getEnrollments({ school_year:schoolYear.trim(), grade_level:gradeLevel, section:section.trim(), enrollment_status:"enrolled", page_size:300 }),
        getAttendance({ date__gte:firstDay, date__lte:lastDay, enrollment__school_year:schoolYear.trim(), enrollment__grade_level:gradeLevel, enrollment__section:section.trim(), page_size:5000 }),
      ]);
      const list = sortByLastName(Array.isArray(enrData)?enrData:(enrData?.results??[]));
      const records = Array.isArray(attData)?attData:(attData?.results??[]);
      const matrix = {};
      list.forEach((e) => { matrix[e.enrollment_id] = {}; });
      records.forEach((r) => {
        if (!matrix[r.enrollment]) matrix[r.enrollment] = {};
        matrix[r.enrollment][r.date] = r.status;
      });
      setMEnrollments(list);
      setMMatrix(matrix);
      setMClassInfo({ school_year:schoolYear.trim(), grade_level:gradeLevel, section:section.trim() });
    } catch(e) { setError(e.response?.data?.detail||e.message||"Failed to load."); }
    finally { setMLoading(false); }
  }

  async function handleSummaryLoad() {
    if (!schoolYear.trim()||!gradeLevel||!section.trim()) { setError("Fill in School Year, Grade Level, and Section."); return; }
    setSummaryLoading(true); setError("");
    try {
      const data = await getAttendanceSummary({ school_year:schoolYear.trim(), grade_level:gradeLevel, section:section.trim() });
      setSummaryData(data);
      setSummaryClass({ school_year:schoolYear.trim(), grade_level:gradeLevel, section:section.trim() });
    } catch(e) { setError(e.response?.data?.detail||e.message||"Failed to load summary."); }
    finally { setSummaryLoading(false); }
  }

  // ── Render helpers ──
  const inp = { height:36, border:"1.5px solid #fde2de", borderRadius:8, padding:"0 12px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:C.dark, background:"white", outline:"none" };
  const selectStyle = { ...inp, paddingRight:28, appearance:"none", backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23b09090'/%3E%3C/svg%3E\")", backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center" };
  const loadBtn = (onClick, loading, icon, label, disabled=false) => (
    <button onClick={onClick} disabled={loading||disabled}
      style={{height:36,padding:"0 20px",background:(loading||disabled)?"#f5eaea":"linear-gradient(135deg,#e03131,#c92a2a)",color:(loading||disabled)?C.muted:"white",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:(loading||disabled)?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:7,boxShadow:(loading||disabled)?"none":"0 4px 14px rgba(224,49,49,0.26)",transition:"all 0.14s"}}>
      {loading?<i className="ti ti-loader-2" style={{fontSize:14,animation:"spin 1s linear infinite"}}/>:<i className={`ti ${icon}`} style={{fontSize:14}}/>}
      {loading?"Loading…":label}
    </button>
  );

  const weekdays = getWeekdaysInMonth(month);

  return (
    <AppLayout>
      {/* Topbar */}
      <div style={{background:"white",borderBottom:`1px solid ${C.border}`,padding:"0 28px",height:58,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,boxShadow:"0 1px 8px rgba(224,49,49,0.04)"}}>
        <div>
          <span style={{fontSize:15,fontWeight:700,color:C.dark}}>Attendance</span>
          <span style={{fontSize:12,color:"#b09090",marginLeft:10}}>Track and view class attendance</span>
        </div>
        {tab==="daily"&&dClassInfo&&dEnrollments.length>0&&(
          <button onClick={handleDailySave} disabled={dSaving}
            style={{height:36,padding:"0 20px",background:dSaving?"#f5eaea":"linear-gradient(135deg,#e03131,#c92a2a)",color:dSaving?C.muted:"white",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:dSaving?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:7,boxShadow:dSaving?"none":"0 4px 14px rgba(224,49,49,0.26)"}}>
            {dSaving?<i className="ti ti-loader-2" style={{fontSize:14,animation:"spin 1s linear infinite"}}/>:<i className="ti ti-device-floppy" style={{fontSize:14}}/>}
            {dSaving?"Saving…":"Save Attendance"}
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"24px 28px",display:"flex",flexDirection:"column",gap:16}}>

        {error&&(
          <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#b91c1c",display:"flex",alignItems:"center",gap:8}}>
            <i className="ti ti-alert-circle" style={{fontSize:15}}/>{error}
            <button onClick={()=>setError("")} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"#b91c1c"}}><i className="ti ti-x" style={{fontSize:13}}/></button>
          </div>
        )}
        {/* Shared filter row */}
        <div style={{background:"white",borderRadius:14,border:`1px solid ${C.border}`,padding:"18px 22px",boxShadow:"0 2px 12px rgba(224,49,49,0.04)",display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <label style={{fontSize:11,fontWeight:600,color:"#b09090",textTransform:"uppercase",letterSpacing:"0.07em"}}>School Year</label>
            <input value={schoolYear} onChange={(e)=>setSchoolYear(e.target.value)} placeholder="2024-2025" style={{...inp,width:130}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <label style={{fontSize:11,fontWeight:600,color:"#b09090",textTransform:"uppercase",letterSpacing:"0.07em"}}>Grade Level</label>
            <select value={gradeLevel} onChange={(e)=>setGradeLevel(e.target.value)} style={{...selectStyle,width:158}}>
              <option value="">Select grade…</option>
              {GRADE_LEVELS.map((g)=><option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <label style={{fontSize:11,fontWeight:600,color:"#b09090",textTransform:"uppercase",letterSpacing:"0.07em"}}>Section</label>
            <input value={section} onChange={(e)=>setSection(e.target.value)} placeholder="e.g. Sampaguita" style={{...inp,width:148}}/>
          </div>

          {/* Tab-specific controls inline */}
          {tab==="daily"&&(
            <>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <label style={{fontSize:11,fontWeight:600,color:"#b09090",textTransform:"uppercase",letterSpacing:"0.07em"}}>Date</label>
                <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} style={{...inp,width:150}}/>
                {isWeekend(date)&&<span style={{fontSize:10,color:"#d97706"}}>⚠ Weekend selected</span>}
              </div>
              {loadBtn(handleDailyLoad, dLoading, "ti-users", "Load Class")}
            </>
          )}
          {tab==="monthly"&&(
            <>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <label style={{fontSize:11,fontWeight:600,color:"#b09090",textTransform:"uppercase",letterSpacing:"0.07em"}}>Month</label>
                <input type="month" value={month} onChange={(e)=>setMonth(e.target.value)} style={{...inp,width:150}}/>
              </div>
              {loadBtn(handleMonthlyLoad, mLoading, "ti-calendar-month", "Load Month")}
            </>
          )}
          {tab==="summary"&&loadBtn(handleSummaryLoad, summaryLoading, "ti-chart-bar", "Load Summary")}
        </div>

        {/* Tab bar */}
        <div style={{display:"flex",gap:0,background:"white",borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",boxShadow:"0 1px 6px rgba(224,49,49,0.04)",alignSelf:"flex-start"}}>
          {[
            { key:"daily",   icon:"ti-pencil",         label:"Daily Entry"  },
            { key:"monthly", icon:"ti-calendar-month", label:"Monthly View" },
            { key:"summary", icon:"ti-chart-bar",      label:"Summary"      },
          ].map((t,i)=>{
            const active=tab===t.key;
            return (
              <button key={t.key} onClick={()=>{ setTab(t.key); setError(""); }}
                style={{height:38,padding:"0 18px",border:"none",borderRight:i<2?`1px solid ${C.border}`:"none",background:active?"#fff0f0":"white",color:active?C.red:"#9a7070",fontSize:13,fontWeight:active?700:400,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:7,transition:"all 0.14s"}}>
                <i className={`ti ${t.icon}`} style={{fontSize:14}}/>{t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {tab==="daily"&&(
          !dClassInfo
            ? <EmptyState icon="ti-calendar-check" title="No class loaded" desc="Select filters above and click Load Class."/>
            : <DailyRoster classInfo={dClassInfo} enrollments={dEnrollments} statuses={dStatuses} date={date} saving={dSaving} onMarkAll={markAll} onToggle={(sid,s)=>setDStatuses((p)=>({...p,[sid]:s}))} onSave={handleDailySave}/>
        )}
        {tab==="monthly"&&(
          !mClassInfo
            ? <EmptyState icon="ti-calendar-month" title="No data loaded" desc="Select filters above and click Load Month."/>
            : mEnrollments.length===0
              ? <EmptyState icon="ti-users" title="No enrolled students found" desc="Check school year, grade level, and section."/>
              : <MonthlyMatrix classInfo={mClassInfo} month={month} weekdays={weekdays} enrollments={mEnrollments} matrix={mMatrix}/>
        )}
        {tab==="summary"&&(
          !summaryClass
            ? <EmptyState icon="ti-chart-bar" title="No summary loaded" desc="Select filters above and click Load Summary."/>
            : <SummaryTable classInfo={summaryClass} data={summaryData}/>
        )}
      </div>
    </AppLayout>
  );
}