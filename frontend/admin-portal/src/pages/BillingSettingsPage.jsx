import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Tabs from "../components/ui/Tabs";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import { listVariants, modalVariants, springTransition } from "../utils/motion";
import { computeDefaultSchoolYear, buildSchoolYearOptions } from "../utils/schoolYear";

import {
  getSchoolSettings as _getSettings,
  updateSchoolSettings as _updateSettings,
  getFeeSchedules as _getFeeSchedules,
  createFeeSchedule as _createFeeSchedule,
  createFeeScheduleItem as _createItem,
  updateFeeScheduleItem as _updateItem,
  deleteFeeScheduleItem as _deleteItem,
  recalculateFeeSchedule as _recalculateSchedule,
} from "../api/billingApi";

const getFeeSchedules     = (p = {}) => _getFeeSchedules(p);
const createFeeSchedule   = (p)      => _createFeeSchedule(p);
const createItem          = (p)      => _createItem(p);
const updateItem          = (id, p)  => _updateItem(id, p);
const deleteItem          = (id)     => _deleteItem(id);
const recalculateSchedule = (id)     => _recalculateSchedule(id);

// ── Shared constants ─────────────────────────────────────────────────────────
const C = {
  red: "#e03131", redDark: "#c92a2a", redLight: "#fff0f0", redBorder: "#fca5a5",
  border: "#f5eaea", softBorder: "#f9f0f0", text: "#1a0a0a",
  muted: "#7a5050", pale: "#b09090", micro: "#c0a0a0", bg: "#fdf8f6", white: "#ffffff",
};

const baseCss = `
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  .settings-input:focus { border-color:#e03131 !important; box-shadow:0 0 0 3px rgba(224,49,49,0.09) !important; outline:none; }
  .settings-input::placeholder { color:#c0a0a0; }
`;

const TABS = [
  { id: "general", label: "General",       icon: "ti-settings" },
  { id: "fees",    label: "Fee Schedules", icon: "ti-cash"     },
];

const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE — shared AppLayout + tab switcher; each tab below is otherwise a
// self-contained port of the former standalone SchoolSettingsPage.jsx and
// FeeSchedulesPage.jsx (own state/effects/handlers), so merging carries no
// state-lifting risk between the two unrelated domains.
// ════════════════════════════════════════════════════════════════════════════
export default function BillingSettingsPage() {
  usePageTitle("Billing Settings");
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") === "fees" ? "fees" : "general");

  return (
    <>
      <style>{baseCss}</style>

      <PageHeader
        title="Billing Settings"
        icon="ti-settings"
        actions={<Tabs variant="pill" tabs={TABS} value={tab} onChange={setTab} />}
      />

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <AnimatePresence mode="wait">
          {tab === "general" ? <GeneralSettingsTab key="general" /> : <FeeSchedulesTab key="fees" />}
        </AnimatePresence>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// GENERAL TAB — ported from the former SchoolSettingsPage.jsx
// ════════════════════════════════════════════════════════════════════════════

function SectionCard({ title, subtitle, icon, children, delay = 0 }) {
  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.28, delay, ease: "easeOut" }}
      style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 2px 16px rgba(224,49,49,0.06)" }}
    >
      <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 18, color: C.red }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: C.pale, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: "22px 24px" }}>{children}</div>
    </motion.div>
  );
}

function Field({ label, hint, children, required }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.pale, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

const inputStyle = {
  width: "100%", border: `1.5px solid #f0e4e4`, borderRadius: 10,
  padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif",
  color: C.text, background: C.white, boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

const PAYMENT_PLANS = [
  { label: "Monthly plan",     detail: "10 installments — end of June through March",  color: "#1455a0", bg: "#e3f0fd" },
  { label: "Quarterly plan",   detail: "4 installments — end of Aug, Nov, Feb, May",   color: "#2e6b0d", bg: "#e8f5e0" },
  { label: "Semi-annual (3%)", detail: "2 installments — end of Oct and Mar",          color: "#7c3aed", bg: "#f0e8fd" },
  { label: "Annual (5%)",      detail: "1 installment — end of October",               color: "#d97706", bg: "#fdf5e8" },
];

function syProgress(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function SYProgress({ startDate, endDate }) {
  const pct = syProgress(startDate, endDate);
  if (pct === null) return null;

  const label = pct === 0 ? "Not started" : pct === 100 ? "Completed" : `${pct}% through`;
  const barColor = pct < 33 ? "#2563eb" : pct < 66 ? "#16a34a" : pct < 90 ? "#d97706" : "#e03131";

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>School Year Progress</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: barColor }}>{label}</span>
      </div>
      <div style={{ height: 7, background: "#f0e8e8", borderRadius: 99, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
          style={{ height: "100%", borderRadius: 99, background: `linear-gradient(to right, ${barColor}, ${barColor}cc)` }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10.5, color: C.micro }}>
        <span>{startDate ? new Date(startDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>
        <span>{endDate ? new Date(endDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>
      </div>
    </div>
  );
}

function GeneralSettingsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    school_name: "", current_school_year: "",
    sy_start_date: "", sy_end_date: "",
    early_bird_days: 7,
    school_address: "", contact_email: "", contact_phone: "",
  });

  useEffect(() => {
    _getSettings()
      .then(d => {
        setSettings(d);
        setForm({
          school_name:         d.school_name         ?? "",
          current_school_year: d.current_school_year ?? "",
          sy_start_date:       d.sy_start_date       ?? "",
          sy_end_date:         d.sy_end_date         ?? "",
          early_bird_days:     d.early_bird_days     ?? 7,
          school_address:      d.school_address      ?? "",
          contact_email:       d.contact_email       ?? "",
          contact_phone:       d.contact_phone       ?? "",
        });
      })
      .catch(() => setError("Failed to load school settings."))
      .finally(() => setLoading(false));
  }, []);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const isDirty = useMemo(() => {
    if (!settings) return false;
    return (
      form.school_name         !== (settings.school_name         ?? "") ||
      form.current_school_year !== (settings.current_school_year ?? "") ||
      form.sy_start_date       !== (settings.sy_start_date       ?? "") ||
      form.sy_end_date         !== (settings.sy_end_date         ?? "") ||
      String(form.early_bird_days) !== String(settings.early_bird_days ?? 7) ||
      form.school_address      !== (settings.school_address      ?? "") ||
      form.contact_email       !== (settings.contact_email       ?? "") ||
      form.contact_phone       !== (settings.contact_phone       ?? "")
    );
  }, [form, settings]);

  async function handleSave() {
    if (!form.school_name.trim())         { setError("School name is required."); return; }
    if (!form.current_school_year.trim()) { setError("School year is required. Format: YYYY-YYYY"); return; }
    if (!form.sy_start_date)              { setError("S.Y. start date is required."); return; }
    if (!form.sy_end_date)                { setError("S.Y. end date is required."); return; }
    if (form.sy_start_date >= form.sy_end_date) { setError("Start date must be before end date."); return; }
    if (!form.early_bird_days || parseInt(form.early_bird_days) < 1) { setError("Early bird days must be at least 1."); return; }

    setSaving(true); setError("");
    try {
      const updated = await _updateSettings(settings.setting_id, {
        school_name:         form.school_name.trim(),
        current_school_year: form.current_school_year.trim(),
        sy_start_date:       form.sy_start_date,
        sy_end_date:         form.sy_end_date,
        early_bird_days:     parseInt(form.early_bird_days),
        school_address:      form.school_address.trim() || null,
        contact_email:       form.contact_email.trim()  || null,
        contact_phone:       form.contact_phone.trim()  || null,
      });
      setSettings(updated);
      toast.success("Settings saved.");
    } catch (e) {
      const msg = e.message || "Failed to save settings.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const lastUpdated = settings?.updated_at
    ? new Date(settings.updated_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
      style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

      {/* Mini header: save state lives with this tab's own content */}
      <div style={{ padding: "14px 28px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: C.pale }}>
          {lastUpdated ? `Last saved ${lastUpdated}` : "Global school & billing configuration"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AnimatePresence>
            {isDirty && !saving && (
              <motion.span
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                style={{ fontSize: 11, fontWeight: 600, color: "#d97706", background: "#fdf5e8", border: "1px solid #fcd34d", borderRadius: 99, padding: "3px 10px" }}
              >
                Unsaved changes
              </motion.span>
            )}
          </AnimatePresence>
          <motion.button
            onClick={handleSave}
            disabled={saving || loading || !isDirty}
            whileHover={isDirty && !saving ? { scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" } : {}}
            whileTap={isDirty && !saving ? { scale: 0.97 } : {}}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: isDirty ? `linear-gradient(135deg,${C.red},${C.redDark})` : "#f5eeee", color: isDirty ? C.white : C.micro, border: "none", borderRadius: 10, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: saving || loading || !isDirty ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: isDirty ? "0 4px 16px rgba(224,49,49,0.26)" : "none", transition: "background 0.2s, color 0.2s, box-shadow 0.2s" }}
          >
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 1s linear infinite" }} />Saving…</>
              : <><i className="ti ti-device-floppy" style={{ fontSize: 14 }} />Save Settings</>
            }
          </motion.button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        <AnimatePresence>
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              style={{ background: "#fef2f2", border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}
            >
              <i className="ti ti-alert-circle" style={{ fontSize: 15, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{error}</span>
              <motion.button onClick={() => setError("")} whileHover={{ scale: 1.1 }} style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", display: "flex" }}>
                <i className="ti ti-x" style={{ fontSize: 13 }} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SectionCard title="School Information" subtitle="Basic school identity" icon="ti-school" delay={0.04}>
              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Sk h={42} /><Sk h={42} /><Sk h={80} />
                </div>
              ) : (
                <>
                  <Field label="School Name" required>
                    <input className="settings-input" value={form.school_name} onChange={e => setF("school_name", e.target.value)} placeholder="South Lakes Integrated School" style={inputStyle} />
                  </Field>
                  <Field label="School Address">
                    <textarea className="settings-input" value={form.school_address} onChange={e => setF("school_address", e.target.value)} placeholder="Complete address…" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                  </Field>
                </>
              )}
            </SectionCard>

            <SectionCard title="Contact Information" subtitle="For official communications" icon="ti-phone" delay={0.08}>
              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Sk h={42} /><Sk h={42} />
                </div>
              ) : (
                <>
                  <Field label="Contact Email">
                    <input className="settings-input" type="email" value={form.contact_email} onChange={e => setF("contact_email", e.target.value)} placeholder="admin@southlakes.edu.ph" style={inputStyle} />
                  </Field>
                  <Field label="Contact Phone">
                    <input className="settings-input" value={form.contact_phone} onChange={e => setF("contact_phone", e.target.value)} placeholder="+63 998 979 1547" style={inputStyle} />
                  </Field>
                </>
              )}
            </SectionCard>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SectionCard title="School Year" subtitle="Affects invoices, early bird eligibility, and reports" icon="ti-calendar" delay={0.06}>
              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Sk h={42} /><Sk h={7} r={99} /><Sk h={42} /><Sk h={42} />
                </div>
              ) : (
                <>
                  <Field label="Current School Year" required>
                    <select className="settings-input" value={form.current_school_year} onChange={e => setF("current_school_year", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                      {buildSchoolYearOptions(form.current_school_year || computeDefaultSchoolYear()).map(sy => (
                        <option key={sy} value={sy}>{sy}</option>
                      ))}
                    </select>
                  </Field>
                  <SYProgress startDate={form.sy_start_date} endDate={form.sy_end_date} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="S.Y. Start Date" required hint="Early bird counts from here">
                      <input className="settings-input" type="date" value={form.sy_start_date} onChange={e => setF("sy_start_date", e.target.value)} style={inputStyle} />
                    </Field>
                    <Field label="S.Y. End Date" required>
                      <input className="settings-input" type="date" value={form.sy_end_date} onChange={e => setF("sy_end_date", e.target.value)} style={inputStyle} />
                    </Field>
                  </div>
                </>
              )}
            </SectionCard>

            <SectionCard title="Billing Configuration" subtitle="Discount and payment settings" icon="ti-cash" delay={0.1}>
              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Sk h={42} />
                  {[1,2,3,4].map(i => <Sk key={i} h={52} r={10} />)}
                </div>
              ) : (
                <>
                  <Field label="Early Bird Window" required hint="Days from S.Y. start date during which early bird discount applies">
                    <div style={{ position: "relative" }}>
                      <input className="settings-input" type="number" min="1" max="365" value={form.early_bird_days} onChange={e => setF("early_bird_days", e.target.value)} style={{ ...inputStyle, paddingRight: 50 }} />
                      <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.pale, fontWeight: 600, pointerEvents: "none" }}>days</span>
                    </div>
                  </Field>

                  <div style={{ fontSize: 10.5, fontWeight: 700, color: C.micro, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Payment Plans</div>
                  <motion.div
                    variants={listVariants.container} initial="hidden" animate="visible"
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {PAYMENT_PLANS.map(p => (
                      <motion.div key={p.label} variants={listVariants.item}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: p.bg, borderRadius: 10, border: `1px solid ${p.color}22` }}
                      >
                        <i className="ti ti-calendar-due" style={{ fontSize: 15, color: p.color, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: p.color }}>{p.label}</div>
                          <div style={{ fontSize: 11, color: p.color, opacity: 0.75, marginTop: 1 }}>{p.detail}</div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FEE SCHEDULES TAB — ported from the former FeeSchedulesPage.jsx
// ════════════════════════════════════════════════════════════════════════════

const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",      color: "#be185d", bg: "#fde8f8", icon: "ti-baby-carriage",
    grades: ["Nursery"] },
  { value: "kindergarten",      label: "Kindergarten", color: "#d97706", bg: "#fdf5e8", icon: "ti-star",
    grades: ["Junior Kinder", "Senior Kinder"] },
  { value: "elementary",        label: "Elementary",   color: "#2e6b0d", bg: "#e8f5e0", icon: "ti-book",
    grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"] },
  { value: "junior_highschool", label: "Junior HS",    color: "#1455a0", bg: "#e3f0fd", icon: "ti-school",
    grades: ["Grade 7", "Grade 8", "Grade 9", "Grade 10"] },
  { value: "senior_highschool", label: "Senior HS",    color: "#7c3aed", bg: "#f0e8fd", icon: "ti-certificate",
    grades: ["Grade 11", "Grade 12"] },
];

const CATEGORY_META = {
  tuition: { label: "Tuition",       color: "#e03131", bg: "#fff0f0", icon: "ti-school" },
  misc:    { label: "Miscellaneous",  color: "#1455a0", bg: "#e3f0fd", icon: "ti-clipboard-list" },
  other:   { label: "Other",          color: "#2e6b0d", bg: "#e8f5e0", icon: "ti-dots-circle-horizontal" },
};

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function AnimatedAmount({ value, style }) {
  const mv = useMotionValue(value);
  const sp = useSpring(mv, { stiffness: 70, damping: 18 });
  const display = useTransform(sp, (v) =>
    `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  const [shown, setShown] = useState(fmt(value));

  useEffect(() => { mv.set(value); }, [value, mv]);
  useEffect(() => display.on("change", setShown), [display]);

  return <span style={style}>{shown}</span>;
}

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
      toast.success("Fee schedule created.");
      onSaved(created);
      onClose();
    } catch (e) {
      const msg = e.message || "Failed to create. This level/grade may already exist.";
      setError(msg);
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const inp = { width: "100%", border: "1.5px solid #fde2de", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none", boxSizing: "border-box", cursor: "pointer" };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}
    >
      <motion.div
        variants={modalVariants} initial="hidden" animate="visible" exit="exit"
        transition={springTransition}
        style={{ background: "white", borderRadius: 20, width: 420, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", overflow: "hidden" }}
      >
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-cash" style={{ fontSize: 20, color: "#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a" }}>New Fee Schedule</div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>Select a level and grade to create a fee structure</div>
            </div>
          </div>
          <motion.button onClick={onClose} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", fontSize: 20, display: "flex", alignItems: "center" }}>
            <i className="ti ti-x" />
          </motion.button>
        </div>

        <div style={{ padding: "22px 28px" }}>
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}
              >
                <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>School Level</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SCHOOL_LEVELS.map((lv) => {
                const active = schoolLevel === lv.value;
                return (
                  <button key={lv.value} type="button"
                    onClick={() => { setSchoolLevel(lv.value); setGradeLevel(lv.grades[0]); }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px",
                      borderRadius: 99, border: `1.5px solid ${active ? lv.color : "#f0e4e4"}`,
                      background: active ? lv.bg : "white", color: active ? lv.color : "#9a7070",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                      transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                    }}>
                    <i className={`ti ${lv.icon}`} style={{ fontSize: 12 }} />{lv.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Grade Level</label>
            <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} style={inp}>
              {lvl.grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div style={{ padding: "16px 28px 24px", display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #f5eaea" }}>
          <motion.button onClick={onClose}
            whileHover={{ borderColor: "#e03131", color: "#e03131" }}
            style={{ background: "transparent", color: "#9a7070", border: "1.5px solid #fde2de", borderRadius: 50, padding: "9px 22px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer" }}>
            Cancel
          </motion.button>
          <motion.button onClick={handleCreate} disabled={saving}
            whileHover={!saving ? { scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" } : {}}
            whileTap={!saving ? { scale: 0.96 } : {}}
            style={{ background: saving ? "#e87474" : "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 50, padding: "9px 24px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", cursor: saving ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />Creating…</>
              : <><i className="ti ti-plus" style={{ fontSize: 13 }} />Create</>
            }
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FeeItemRow({ item, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(item.item_name);
  const [amount,  setAmount]  = useState(String(item.amount));
  const [saving,  setSaving]  = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const catMeta = CATEGORY_META[item.item_category] ?? CATEGORY_META.other;
  const inp = { border: "1.5px solid #fde2de", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none" };

  const handleSave = async () => {
    if (!name.trim() || !amount || parseFloat(amount) < 0) return;
    setSaving(true);
    await updateItem(item.fee_schedule_item_id, { item_name: name.trim(), amount: parseFloat(amount) });
    setEditing(false); setSaving(false);
    onUpdated();
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteItem(item.fee_schedule_item_id);
      onDeleted();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <motion.div
      variants={listVariants.item}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#fdfafa", border: "1px solid #f5eaea", borderRadius: 10 }}
      whileHover={{ borderColor: "#fca5a5" }}
      transition={{ duration: 0.12 }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMeta.color, flexShrink: 0 }} />
      {editing ? (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name"
            style={{ ...inp, flex: 1, minWidth: 0 }} />
          <div style={{ position: "relative", width: 120, flexShrink: 0 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#b09090", fontWeight: 600 }}>₱</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ ...inp, width: "100%", paddingLeft: 22, textAlign: "right" }} />
          </div>
          <motion.button onClick={handleSave} disabled={saving}
            whileHover={!saving ? { scale: 1.06 } : {}} whileTap={!saving ? { scale: 0.94 } : {}}
            style={{ background: "#e03131", color: "white", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
            {saving
              ? <i className="ti ti-loader-2" style={{ fontSize: 12, animation: "spin 1s linear infinite" }} />
              : <i className="ti ti-check" style={{ fontSize: 12 }} />
            }
          </motion.button>
          <motion.button onClick={() => { setEditing(false); setName(item.item_name); setAmount(String(item.amount)); }}
            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
            style={{ background: "white", color: "#9a7070", border: "1px solid #f0e4e4", borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <i className="ti ti-x" style={{ fontSize: 12 }} />
          </motion.button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 13, color: "#1a0a0a", fontWeight: 500 }}>{item.item_name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{fmt(item.amount)}</span>
          <motion.button onClick={() => setEditing(true)}
            whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#fca5a5" }}
            whileTap={{ scale: 0.93 }}
            style={{ width: 26, height: 26, border: "1px solid #f0e4e4", borderRadius: 7, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9a7070" }}>
            <i className="ti ti-pencil" style={{ fontSize: 11 }} />
          </motion.button>
          <motion.button onClick={() => setConfirmDelete(true)} aria-label={`Delete fee item ${item.item_name}`}
            whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#fca5a5" }}
            whileTap={{ scale: 0.93 }}
            style={{ width: 26, height: 26, border: "1px solid #f0e4e4", borderRadius: 7, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090" }}>
            <i className="ti ti-trash" style={{ fontSize: 11 }} />
          </motion.button>
        </>
      )}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmModal
            icon="ti-trash"
            title="Delete fee item?"
            message={<>Remove <strong>{item.item_name}</strong> ({fmt(item.amount)}) from this fee schedule? This cannot be undone.</>}
            loading={deleting}
            onConfirm={handleConfirmDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AddFeeItemForm({ scheduleId, category, onAdded }) {
  const [name,   setName]   = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const catMeta = CATEGORY_META[category];
  const inp = { border: "1.5px solid #fde2de", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none" };

  const handleAdd = async () => {
    if (!name.trim())                      { setError("Name required."); return; }
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
    <div style={{ marginTop: 8 }}>
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            style={{ fontSize: 11, color: "#b91c1c", marginBottom: 6 }}
          >{error}</motion.div>
        )}
      </AnimatePresence>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMeta.color, flexShrink: 0, opacity: 0.4 }} />
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder={`e.g. ${category === "tuition" ? "Tuition Fee" : category === "misc" ? "Books" : "Morning Binder"}`}
          style={{ ...inp, flex: 1, minWidth: 0 }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <div style={{ position: "relative", width: 120, flexShrink: 0 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#b09090", fontWeight: 600 }}>₱</span>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00" style={{ ...inp, width: "100%", paddingLeft: 22, textAlign: "right" }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        </div>
        <motion.button onClick={handleAdd} disabled={saving}
          whileHover={!saving ? { scale: 1.04 } : {}} whileTap={!saving ? { scale: 0.96 } : {}}
          style={{ background: saving ? "#e87474" : "#fff0f0", color: "#e03131", border: "1px solid #fca5a5", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
          {saving
            ? <i className="ti ti-loader-2" style={{ fontSize: 12, animation: "spin 1s linear infinite" }} />
            : <i className="ti ti-plus" style={{ fontSize: 12 }} />
          }Add
        </motion.button>
      </div>
    </div>
  );
}

function ScheduleDetail({ schedule, onUpdated }) {
  const lvl = SCHOOL_LEVELS.find((l) => l.value === schedule.school_level) ?? SCHOOL_LEVELS[2];
  const [recalcing, setRecalcing] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState("");

  const categories = ["tuition", "misc", "other"];

  const handleRecalculate = async () => {
    setRecalcing(true); setRecalcMsg("");
    try {
      const result = await recalculateSchedule(schedule.fee_schedule_id);
      const msg = `${result.updated} invoice${result.updated !== 1 ? "s" : ""} updated`;
      setRecalcMsg(msg);
      toast.success(msg);
      setTimeout(() => setRecalcMsg(""), 4000);
    } catch (e) {
      const msg = e?.message || "Recalculation failed.";
      setRecalcMsg(msg);
      toast.error(msg);
    }
    finally { setRecalcing(false); }
  };

  const tuitionTotal = schedule.total_tuition ?? 0;
  const miscTotal    = schedule.total_misc    ?? 0;
  const otherTotal   = schedule.total_other   ?? 0;
  const grandTotal   = schedule.grand_total   ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        style={{ background: "white", borderRadius: 16, border: "1px solid #f5eaea", padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, boxShadow: "0 2px 12px rgba(224,49,49,0.05)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: lvl.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className={`ti ${lvl.icon}`} style={{ fontSize: 20, color: lvl.color }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a" }}>{schedule.grade_level}</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: lvl.bg, color: lvl.color, marginTop: 3 }}>
              <i className={`ti ${lvl.icon}`} style={{ fontSize: 11 }} />{lvl.label}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AnimatePresence>
            {recalcMsg && (
              <motion.span
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.18 }}
                style={{ fontSize: 12, color: "#2e6b0d", fontWeight: 600, background: "#e8f5e0", border: "1px solid #a3d98a", borderRadius: 99, padding: "4px 12px", display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <i className="ti ti-circle-check" style={{ fontSize: 12 }} />{recalcMsg}
              </motion.span>
            )}
          </AnimatePresence>
          <motion.button onClick={handleRecalculate} disabled={recalcing}
            whileHover={!recalcing ? { scale: 1.02 } : {}} whileTap={!recalcing ? { scale: 0.97 } : {}}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff0f0", color: "#e03131", border: "1px solid #fca5a5", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: recalcing ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif" }}>
            {recalcing
              ? <i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />
              : <i className="ti ti-refresh" style={{ fontSize: 13 }} />
            }
            {recalcing ? "Updating…" : "Apply to Invoices"}
          </motion.button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.06, ease: "easeOut" }}
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}
      >
        {[
          { label: "Tuition",       val: tuitionTotal, color: "#e03131", bg: "#fff0f0" },
          { label: "Miscellaneous", val: miscTotal,    color: "#1455a0", bg: "#e3f0fd" },
          { label: "Other",         val: otherTotal,   color: "#2e6b0d", bg: "#e8f5e0" },
          { label: "Grand Total",   val: grandTotal,   color: "#7c3aed", bg: "#f0e8fd" },
        ].map((s) => (
          <div key={s.label} style={{ background: "white", borderRadius: 12, border: "1px solid #f5eaea", padding: "14px 16px", textAlign: "center", boxShadow: "0 2px 8px rgba(224,49,49,0.04)" }}>
            <AnimatedAmount value={parseFloat(s.val)} style={{ fontSize: 15, fontWeight: 700, color: s.color }} />
            <div style={{ fontSize: 11, color: "#a07878", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </motion.div>

      {categories.map((cat, catIdx) => {
        const catMeta  = CATEGORY_META[cat];
        const catItems = (schedule.items ?? []).filter((i) => i.item_category === cat);
        return (
          <motion.div
            key={cat}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.1 + catIdx * 0.06, ease: "easeOut" }}
            style={{ background: "white", borderRadius: 16, border: "1px solid #f5eaea", overflow: "hidden", boxShadow: "0 2px 12px rgba(224,49,49,0.05)" }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f9f0f0", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to right,#fdfafa,white)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: catMeta.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className={`ti ${catMeta.icon}`} style={{ fontSize: 14, color: catMeta.color }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{catMeta.label}</span>
                <span style={{ fontSize: 11, color: "#b09090" }}>{catItems.length} item{catItems.length !== 1 ? "s" : ""}</span>
                {cat !== "tuition"
                  ? <span style={{ fontSize: 11, color: "#b09090", fontStyle: "italic" }}>· no discount applied</span>
                  : <span style={{ fontSize: 11, color: "#e03131", fontStyle: "italic" }}>· discounts applied here</span>
                }
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: catMeta.color }}>
                {fmt(catItems.reduce((s, i) => s + parseFloat(i.amount), 0))}
              </span>
            </div>
            <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
              {catItems.length === 0 && (
                <div style={{ fontSize: 12, color: "#d0b8b8", fontStyle: "italic", textAlign: "center", padding: "8px 0" }}>No items yet</div>
              )}
              <motion.div
                variants={listVariants.container}
                initial="hidden" animate="visible"
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                {catItems.map((item) => (
                  <FeeItemRow key={item.fee_schedule_item_id} item={item}
                    onUpdated={onUpdated} onDeleted={onUpdated} />
                ))}
              </motion.div>
              <AddFeeItemForm scheduleId={schedule.fee_schedule_id} category={cat} onAdded={onUpdated} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function FeeSchedulesTab() {
  const [schedules,    setSchedules]    = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [levelFilter,  setLevelFilter]  = useState("all");
  const [showNewModal, setShowNewModal] = useState(false);

  const fetchSchedules = useCallback(async (lvl = levelFilter) => {
    setLoading(true);
    try {
      const params = {};
      if (lvl !== "all") params.school_level = lvl;
      const data = await getFeeSchedules(params);
      const results = Array.isArray(data) ? data : data?.results ?? [];
      setSchedules(results);
      if (selected) {
        const refreshed = results.find((s) => s.fee_schedule_id === selected.fee_schedule_id);
        setSelected(refreshed ?? null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [levelFilter, selected]);

  useEffect(() => {
    fetchSchedules("all"); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSchedule = (sch) => setSelected(sch);
  const handleUpdated = () => fetchSchedules(levelFilter);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
      style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

      {/* Mini header */}
      <div style={{ padding: "14px 28px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: C.pale }}>
          {loading ? "Loading…" : `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""} configured`}
        </div>
        <motion.button
          whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setShowNewModal(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
          <i className="ti ti-plus" style={{ fontSize: 15 }} />New Schedule
        </motion.button>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "300px 1fr" }}>

        <motion.div
          initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.26, ease: "easeOut" }}
          style={{ borderRight: "1px solid #f5eaea", display: "flex", flexDirection: "column", overflow: "hidden", background: "white" }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f5eaea", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, color: "#c0a0a0", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>Filter by Level</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {[{ value: "all", label: "All", color: "#e03131", bg: "#fff0f0", icon: null }, ...SCHOOL_LEVELS].map((lv) => {
                const active = levelFilter === lv.value;
                return (
                  <motion.button
                    key={lv.value}
                    onClick={() => { setLevelFilter(lv.value); fetchSchedules(lv.value); }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      height: 26, padding: "0 10px", borderRadius: 99,
                      border: `1.5px solid ${active ? lv.color : "#f0e4e4"}`,
                      background: active ? lv.bg : "white",
                      color: active ? lv.color : "#9a7070",
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                      transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                    }}
                  >
                    {lv.icon && <i className={`ti ${lv.icon}`} style={{ fontSize: 11 }} />}
                    {lv.label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ padding: "14px 16px", borderBottom: "1px solid #f9f0f0", display: "flex", flexDirection: "column", gap: 8 }}>
                    <Sk w={120} h={14} /><Sk w={80} h={11} /><Sk w="100%" h={6} r={99} />
                  </div>
                ))
              : schedules.length === 0
                ? (
                  <div style={{ padding: "40px 16px", textAlign: "center", color: "#b09090", fontSize: 13 }}>
                    <i className="ti ti-cash" style={{ fontSize: 28, color: "#f0c8c8", display: "block", marginBottom: 10 }} />
                    No fee schedules yet.<br />
                    <span style={{ fontSize: 12 }}>Click "New Schedule" to create one.</span>
                  </div>
                )
                : (
                  <motion.div variants={listVariants.container} initial="hidden" animate="visible">
                    {schedules.map((sch) => {
                      const lv       = SCHOOL_LEVELS.find((l) => l.value === sch.school_level) ?? SCHOOL_LEVELS[2];
                      const isActive = selected?.fee_schedule_id === sch.fee_schedule_id;
                      const grandTotal = parseFloat(sch.grand_total ?? 0);
                      const itemCount  = (sch.items ?? []).length;

                      const tTotal = parseFloat(sch.total_tuition ?? 0);
                      const mTotal = parseFloat(sch.total_misc ?? 0);
                      const oTotal = parseFloat(sch.total_other ?? 0);
                      const barTotal = tTotal + mTotal + oTotal || 1;

                      return (
                        <motion.div
                          key={sch.fee_schedule_id}
                          variants={listVariants.item}
                          onClick={() => handleSelectSchedule(sch)}
                          whileHover={{ backgroundColor: isActive ? lv.bg : "#fffaf9" }}
                          style={{
                            padding: "14px 16px", borderBottom: "1px solid #f9f0f0",
                            borderLeft: `3px solid ${isActive ? lv.color : "transparent"}`,
                            background: isActive ? lv.bg : "white",
                            cursor: "pointer",
                            transition: "border-left-color 0.15s ease, background-color 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <i className={`ti ${lv.icon}`} style={{ fontSize: 13, color: lv.color }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{sch.grade_level}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 6px", borderRadius: 99, background: lv.bg, color: lv.color }}>{lv.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#b09090", marginBottom: 5 }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</div>
                          {grandTotal > 0 && (
                            <div style={{ display: "flex", height: 4, borderRadius: 99, overflow: "hidden", gap: 1, marginBottom: 5 }}>
                              {tTotal > 0 && <div style={{ flex: tTotal / barTotal, background: "#e03131", minWidth: 2 }} title={`Tuition: ${fmt(tTotal)}`} />}
                              {mTotal > 0 && <div style={{ flex: mTotal / barTotal, background: "#1455a0", minWidth: 2 }} title={`Misc: ${fmt(mTotal)}`} />}
                              {oTotal > 0 && <div style={{ flex: oTotal / barTotal, background: "#2e6b0d", minWidth: 2 }} title={`Other: ${fmt(oTotal)}`} />}
                            </div>
                          )}
                          <div style={{ fontSize: 14, fontWeight: 700, color: lv.color }}>{fmt(grandTotal)}</div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )
            }
          </div>
        </motion.div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <AnimatePresence mode="wait">
            {!selected ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14 }}
              >
                <div style={{ width: 60, height: 60, borderRadius: 18, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-cash" style={{ fontSize: 28, color: "#e08080" }} />
                </div>
                <div style={{ fontSize: 16, color: "#7a5050", fontWeight: 600 }}>Select a fee schedule</div>
                <div style={{ fontSize: 13, color: "#b09090" }}>Click a schedule on the left to view and edit its items</div>
              </motion.div>
            ) : (
              <motion.div
                key={selected.fee_schedule_id}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <ScheduleDetail schedule={selected} onUpdated={handleUpdated} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showNewModal && (
          <NewScheduleModal
            key="new-modal"
            onClose={() => setShowNewModal(false)}
            onSaved={(s) => { fetchSchedules(levelFilter); setSelected(s); }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
