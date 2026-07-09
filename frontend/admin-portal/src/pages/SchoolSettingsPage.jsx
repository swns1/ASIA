import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import { listVariants } from "../utils/motion";

import {
  getSchoolSettings as _getSettings,
  updateSchoolSettings as _updateSettings,
} from "../api/billingApi";

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  red: "#e03131", redDark: "#c92a2a", redLight: "#fff0f0", redBorder: "#fca5a5",
  border: "#f5eaea", softBorder: "#f9f0f0", text: "#1a0a0a",
  muted: "#7a5050", pale: "#b09090", micro: "#c0a0a0", bg: "#fdf8f6", white: "#ffffff",
};

const baseCss = `
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  @keyframes drainBar { from{width:100%} to{width:0%} }
  .settings-input:focus { border-color:#e03131 !important; box-shadow:0 0 0 3px rgba(224,49,49,0.09) !important; outline:none; }
  .settings-input::placeholder { color:#c0a0a0; }
`;

const PAYMENT_PLANS = [
  { label: "Monthly plan",     detail: "10 installments — end of June through March",  color: "#1455a0", bg: "#e3f0fd" },
  { label: "Quarterly plan",   detail: "4 installments — end of Aug, Nov, Feb, May",   color: "#2e6b0d", bg: "#e8f5e0" },
  { label: "Semi-annual (3%)", detail: "2 installments — end of Oct and Mar",          color: "#7c3aed", bg: "#f0e8fd" },
  { label: "Annual (5%)",      detail: "1 installment — end of October",               color: "#d97706", bg: "#fdf5e8" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function Sk({ w = "100%", h = 14, r = 6 }) {
  return (
    <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
  );
}

function syProgress(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, icon, children, delay = 0, isFirstRender }) {
  return (
    <motion.div
      initial={isFirstRender ? { y: 10, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
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

// ── SY Progress Bar ───────────────────────────────────────────────────────────

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
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
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

// ── Toast ─────────────────────────────────────────────────────────────────────


// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SchoolSettingsPage() {
  usePageTitle("School Settings");
  const navigate = useNavigate();
  const [animated] = useState(false);

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
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
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

  // Dirty detection
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

  const isFirstRender = !animated;

  const lastUpdated = settings?.updated_at
    ? new Date(settings.updated_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <AppLayout>
      <style>{baseCss}</style>

      {/* Topbar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>School Settings</div>
          <div style={{ fontSize: 11.5, color: C.pale, marginTop: 1 }}>
            {lastUpdated ? `Last saved ${lastUpdated}` : "Global configuration"}
          </div>
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
      </motion.div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Banners */}
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

        {/* Two-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <SectionCard title="School Information" subtitle="Basic school identity" icon="ti-school" delay={0.08} isFirstRender={isFirstRender}>
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

            <SectionCard title="Contact Information" subtitle="For official communications" icon="ti-phone" delay={0.16} isFirstRender={isFirstRender}>
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

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <SectionCard title="School Year" subtitle="Affects invoices, early bird eligibility, and reports" icon="ti-calendar" delay={0.12} isFirstRender={isFirstRender}>
              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Sk h={42} /><Sk h={7} r={99} /><Sk h={42} /><Sk h={42} />
                </div>
              ) : (
                <>
                  <Field label="Current School Year" required hint="Format: YYYY-YYYY e.g. 2025-2026">
                    <input className="settings-input" value={form.current_school_year} onChange={e => setF("current_school_year", e.target.value)} placeholder="2025-2026" style={inputStyle} />
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

            <SectionCard title="Billing Configuration" subtitle="Discount and payment settings" icon="ti-cash" delay={0.2} isFirstRender={isFirstRender}>
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
                    variants={listVariants.container}
                    initial={isFirstRender ? "hidden" : false}
                    animate="visible"
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {PAYMENT_PLANS.map(p => (
                      <motion.div
                        key={p.label}
                        variants={listVariants.item}
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

    </AppLayout>
  );
}
