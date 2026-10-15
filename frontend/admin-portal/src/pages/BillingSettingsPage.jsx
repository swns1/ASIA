import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Tabs from "../components/ui/Tabs";
import toast from "react-hot-toast";
import { Link, useSearchParams } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import { listVariants } from "../utils/motion";
import { getCurrentUser, STAFF_ADMIN } from "../utils/auth";
import useYearFilter from "../hooks/useYearFilter";
import { useSchoolYear } from "../context/SchoolYearContext";
import SchoolYearPicker from "../components/ui/SchoolYearPicker";
import CarryOverModal from "../components/schoolYears/CarryOverModal";
import useTheme from "../hooks/useTheme";
import { CARD_DARK } from "../components/ui/darkSurfaces";
import { CHIP_GLOW, LEVEL_GLOW } from "../constants/statusTones";

import {
  getSchoolSettings as _getSettings,
  updateSchoolSettings as _updateSettings,
  getFeeSchedules as _getFeeSchedules,
  createFeeSchedule as _createFeeSchedule,
  createFeeScheduleItem as _createItem,
  updateFeeScheduleItem as _updateItem,
  deleteFeeScheduleItem as _deleteItem,
  recalculateFeeSchedule as _recalculateSchedule,
  getDiscountTypes as _getDiscountTypes,
  updateDiscountType as _updateDiscountType,
} from "../api/billingApi";

const getFeeSchedules     = (p = {}) => _getFeeSchedules(p);
const createFeeSchedule   = (p)      => _createFeeSchedule(p);
const createItem          = (p)      => _createItem(p);
const updateItem          = (id, p)  => _updateItem(id, p);
const deleteItem          = (id)     => _deleteItem(id);
const recalculateSchedule = (id)     => _recalculateSchedule(id);

/** What a fee change did to existing invoices, in words. Invoices that have
 *  taken payments keep the amount they were billed; they are corrected one at
 *  a time with Re-issue, which carries their payments across. */
function describeRecalculation(result) {
  if (!result) return "";
  const n = result.updated ?? 0;
  const kept = result.skipped_with_payments ?? 0;
  let msg = `${n} unpaid invoice${n !== 1 ? "s" : ""} updated`;
  if (kept) msg += `; ${kept} already paid into keep${kept === 1 ? "s its" : " their"} original amount (re-issue from Invoices to change ${kept === 1 ? "it" : "them"})`;
  return msg + ".";
}

// ── Shared constants ─────────────────────────────────────────────────────────
const C = {
  red: "var(--color-brand-500)", redDark: "var(--color-brand-600)", redLight: "var(--color-brand-100)", redBorder: "var(--color-brand-300)",
  border: "var(--color-neutral-200)", softBorder: "#f9f0f0", text: "var(--color-neutral-900)",
  muted: "var(--color-neutral-700)", pale: "var(--color-neutral-500)", micro: "var(--color-neutral-500)", bg: "var(--color-neutral-50)", white: "#ffffff",
};

// framer-motion can't tween a var(), so what it animates takes literal
// colours: in dark, the dark values of the same tokens (brand-50 for a row
// hover, brand-100 for a button hover, brand-300 / brand-500 / brand-600 for
// hover borders and text).
const DARK_HOVER = { row: "#221616", fill: "#2f1a1a", border: "#7d3535", red: "#ef4b4b", redDark: "#ff8f8f" };

const baseCss = `
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  .settings-input:focus { border-color:var(--color-brand-500) !important; box-shadow:0 0 0 3px rgba(224,49,49,0.09) !important; outline:none; }
  .settings-input::placeholder { color:var(--color-neutral-500); }
  /* A card's last field must not stack its own 18px under the card's 22px
     padding: that left ~40px of air below the final input against 22px above
     the first label, so every card read as if its contents sat too high. */
  .settings-field:last-child { margin-bottom:0; }
  /* Fields sharing one row are spaced by the row's grid gap instead. */
  .settings-field-row .settings-field { margin-bottom:0; }
`;

const TABS = [
  { id: "general", label: "General",       icon: "ti-settings" },
  { id: "fees",    label: "Fee Schedules", icon: "ti-cash"     },
];

const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,var(--skeleton) 25%,var(--skeleton-shine) 50%,var(--skeleton) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
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
          {tab === "general" ? (
            <GeneralSettingsTab key="general" />
          ) : tab === "fees" ? (
            <FeeSchedulesTab key="fees" />
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// GENERAL TAB — ported from the former SchoolSettingsPage.jsx
// ════════════════════════════════════════════════════════════════════════════

// Cards are laid out as a flex column and left at height:auto, so the grid's
// default `align-items:stretch` pulls each one to its row's full height and
// the body below (flex:1) takes up the slack. Two cards side by side
// therefore share a top *and* a bottom edge. With each column stacked
// independently the two sides drifted apart by whatever their contents
// happened to measure — the second row started 35px lower on the left than on
// the right, and the shorter column ran out ~200px early. Deliberately not
// `height:100%`: that opts the card out of stretching and asks a percentage
// to resolve against an auto-sized row instead.
// `span` stretches a card across every column of that grid.
function SectionCard({ title, subtitle, icon, children, delay = 0, span = false }) {
  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.28, delay, ease: "easeOut" }}
      className={`bg-surface shadow-[0_2px_16px_rgba(224,49,49,0.06)] ${CARD_DARK}`}
      style={{
        borderRadius: 16, border: `1px solid ${C.border}`,
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        ...(span ? { gridColumn: "1 / -1" } : null),
      }}
    >
      <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div className={`bg-brand-100 ${CHIP_GLOW.brand}`} style={{ width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 18, color: C.red }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: C.pale, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: "22px 24px", flex: 1, display: "flex", flexDirection: "column" }}>{children}</div>
    </motion.div>
  );
}

// `grow` lets one field absorb whatever height its card gained from being
// stretched to match its neighbour, so the slack shows up as a taller input
// rather than as a gap under the last one.
function Field({ label, hint, children, required, grow = false }) {
  return (
    <div
      className="settings-field"
      style={{ marginBottom: 18, ...(grow ? { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 } : null) }}
    >
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.pale, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

const inputStyle = {
  width: "100%", border: `1.5px solid var(--color-neutral-300)`, borderRadius: 10,
  padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif",
  color: C.text, background: "var(--color-surface)", boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

// The discount rows the invoice math reads by code. Rates were only
// changeable through the API before; the labels here hardcoded 3% and 5%, and
// the due months described a calendar the installment schedule no longer used.
const RATE_ROWS = [
  { code: "MONTHLY_PLAN",     label: "Monthly plan",     plan: "monthly",     color: "var(--color-info-500)", bg: "var(--color-info-50)" },
  { code: "QUARTERLY_PLAN",   label: "Quarterly plan",   plan: "quarterly",   color: "var(--color-success-500)", bg: "var(--color-success-50)" },
  { code: "SEMI_ANNUAL_PLAN", label: "Semi-annual plan", plan: "semi_annual", color: "var(--color-accent-500)", bg: "var(--color-accent-50)" },
  { code: "ANNUAL_PLAN",      label: "Annual plan",      plan: "annual",      color: "var(--color-nursery-500)", bg: "var(--color-nursery-50)" },
  { code: "EARLY_BIRD",       label: "Early Bird",       plan: null,          color: "var(--color-brand-600)", bg: "var(--color-brand-100)" },
];
// Mirrors billing-service's PLAN_SHAPE: (installments, months apart), counted
// from the month the school year opens.
const PLAN_SHAPE = { monthly: [10, 1], quarterly: [4, 3], semi_annual: [2, 5], annual: [1, 1] };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function planDueMonths(plan, syStart) {
  const [count, step] = PLAN_SHAPE[plan];
  const start = syStart ? new Date(`${syStart}T00:00:00`).getMonth() : 5;
  const months = Array.from({ length: count }, (_, i) => MONTHS[(start + i * step) % 12]);
  if (plan === "monthly") return `10 installments — end of ${months[0]} through ${months[9]}`;
  return `${count} installment${count > 1 ? "s" : ""} — end of ${months.join(", ")}`;
}

function DiscountRatesCard({ syStart, earlyBirdDays }) {
  const dark = useTheme() === "dark";
  const [rows, setRows]     = useState(null);
  const [drafts, setDrafts] = useState({});
  const [savingCode, setSavingCode] = useState(null);
  const [error, setError]   = useState("");

  useEffect(() => {
    let cancelled = false;
    _getDiscountTypes()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.results ?? [];
        setRows(Object.fromEntries(list.map((r) => [r.discount_code, r])));
      })
      .catch(() => { if (!cancelled) setError("Couldn't load the discount rates."); });
    return () => { cancelled = true; };
  }, []);

  async function save(code) {
    const row = rows[code];
    const value = drafts[code];
    const pct = Number(value);
    if (value === "" || Number.isNaN(pct) || pct < 0 || pct > 100) {
      setError("A rate is a percentage from 0 to 100.");
      return;
    }
    setSavingCode(code); setError("");
    try {
      const updated = await _updateDiscountType(row.discount_type_id, { discount_value: pct });
      setRows((prev) => ({ ...prev, [code]: updated }));
      setDrafts((prev) => { const next = { ...prev }; delete next[code]; return next; });
      toast.success(`${RATE_ROWS.find((r) => r.code === code).label} discount set to ${pct}%. It applies to invoices generated from now on.`);
    } catch (e) {
      setError(e?.response?.data?.discount_value?.[0] || e.message || "Couldn't save the rate.");
    } finally { setSavingCode(null); }
  }

  if (!rows) {
    return error
      ? <div className="text-[#b91c1c] dark:text-error-500" style={{ fontSize: 13 }}>{error}</div>
      : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>{[1, 2, 3, 4, 5].map((i) => <Sk key={i} h={58} r={10} />)}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {error && <div role="alert" className="text-[#b91c1c] dark:text-error-500" style={{ fontSize: 13 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        {RATE_ROWS.filter((r) => rows[r.code]).map((r) => {
          const current = String(Number(rows[r.code].discount_value));
          const draft = drafts[r.code];
          const dirty = draft !== undefined && draft !== current;
          return (
            <div key={r.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: r.bg, borderRadius: 10, border: `1px solid color-mix(in srgb, ${r.color} 13.3%, transparent)` }}>
              <i className={`ti ${r.plan ? "ti-calendar-due" : "ti-clock-bolt"}`} style={{ fontSize: 16, color: r.color, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{r.label}</div>
                <div style={{ fontSize: 11, color: r.color, opacity: 0.75, marginTop: 1 }}>
                  {r.plan ? planDueMonths(r.plan, syStart) : `Invoiced within ${earlyBirdDays || 7} days of the school year opening`}
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: r.color, fontWeight: 600 }}>
                <span className="sr-only">{r.label} discount, percent off tuition</span>
                <input
                  type="number" min="0" max="100" step="0.5"
                  value={draft ?? current}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [r.code]: e.target.value }))}
                  style={{ width: 64, border: "1.5px solid var(--color-brand-border-soft)", borderRadius: 8, padding: "5px 8px", fontSize: 13, textAlign: "right", background: "var(--color-surface)" }}
                />%
              </label>
              {dirty && (
                <button type="button" onClick={() => save(r.code)} disabled={savingCode === r.code}
                  style={{ border: "none", background: r.color, color: dark ? "var(--color-surface)" : "white", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {savingCode === r.code ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: C.pale }}>
        Percent off tuition. Changing a rate affects invoices generated from now on; existing invoices keep theirs unless re-issued.
      </div>
    </div>
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

function SYProgress({ startDate, endDate }) {
  const dark = useTheme() === "dark";
  const pct = syProgress(startDate, endDate);
  if (pct === null) return null;

  const label = pct === 0 ? "Not started" : pct === 100 ? "Completed" : `${pct}% through`;
  const barColor = pct < 33 ? "var(--color-elementary-500)" : pct < 66 ? (dark ? "var(--color-success-500)" : "#16a34a") : pct < 90 ? (dark ? "var(--color-warning-500)" : "#d97706") : "var(--color-brand-500)";

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>School Year Progress</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: barColor }}>{label}</span>
      </div>
      <div className="bg-[#f0e8e8] dark:bg-neutral-200" style={{ height: 7, borderRadius: 99, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
          style={{ height: "100%", borderRadius: 99, background: `linear-gradient(to right, ${barColor}, color-mix(in srgb, ${barColor} 80%, transparent))` }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: C.micro }}>
        <span>{startDate ? new Date(startDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>
        <span>{endDate ? new Date(endDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>
      </div>
    </div>
  );
}

// The header of the DepEd school forms (SF1, SF2). Optional: a form prints
// the box blank until it is filled in here.
const DEPED_IDENTITY_FIELDS = ["deped_school_id", "region", "division", "district", "school_head_name"];
// The SF10 permanent record's signature lines: each the name printed over a
// line, labelled with the title printed under it. Blank prints the line empty.
const SF10_SIGNATORIES = [
  { key: "elementary_principal_name", label: "Elementary School Principal" },
  { key: "jhs_principal_name",        label: "Junior High School Principal" },
  { key: "shs_principal_name",        label: "Senior High School Principal" },
  { key: "shs_department_head_name",  label: "Senior High School Department Head" },
  { key: "records_officer_name",      label: "Records Officer / Registrar" },
];
// Every optional text setting the school forms print, the SF10's landline
// (its letterhead's "Mobile | Landline" line) included.
const SCHOOL_FORM_FIELDS = [...DEPED_IDENTITY_FIELDS, ...SF10_SIGNATORIES.map(s => s.key), "contact_landline"];
const EMPTY_SCHOOL_FORM_FIELDS = Object.fromEntries(SCHOOL_FORM_FIELDS.map(k => [k, ""]));

function GeneralSettingsTab() {
  const dark = useTheme() === "dark";
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The school year and its dates are not edited here any more: they belong
  // to the School Years page, and the settings API treats them as read-only.
  // This card shows what that page last made current.
  const [form, setForm] = useState({
    school_name: "",
    early_bird_days: 7,
    school_address: "", contact_email: "", contact_phone: "",
    ...EMPTY_SCHOOL_FORM_FIELDS,
  });

  useEffect(() => {
    _getSettings()
      .then(d => {
        setSettings(d);
        setForm({
          school_name:         d.school_name         ?? "",
          early_bird_days:     d.early_bird_days     ?? 7,
          school_address:      d.school_address      ?? "",
          contact_email:       d.contact_email       ?? "",
          contact_phone:       d.contact_phone       ?? "",
          ...Object.fromEntries(SCHOOL_FORM_FIELDS.map(k => [k, d[k] ?? ""])),
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
      String(form.early_bird_days) !== String(settings.early_bird_days ?? 7) ||
      form.school_address      !== (settings.school_address      ?? "") ||
      form.contact_email       !== (settings.contact_email       ?? "") ||
      form.contact_phone       !== (settings.contact_phone       ?? "") ||
      SCHOOL_FORM_FIELDS.some(k => form[k] !== (settings[k] ?? ""))
    );
  }, [form, settings]);

  async function handleSave() {
    if (!form.school_name.trim())         { setError("School name is required."); return; }
    if (!form.early_bird_days || parseInt(form.early_bird_days) < 1) { setError("Early bird days must be at least 1."); return; }
    if (form.deped_school_id.trim() && !/^\d{6}$/.test(form.deped_school_id.trim())) {
      setError("The DepEd School ID is six digits, like 401234."); return;
    }

    setSaving(true); setError("");
    try {
      const updated = await _updateSettings(settings.setting_id, {
        school_name:         form.school_name.trim(),
        early_bird_days:     parseInt(form.early_bird_days),
        school_address:      form.school_address.trim() || null,
        contact_email:       form.contact_email.trim()  || null,
        contact_phone:       form.contact_phone.trim()  || null,
        ...Object.fromEntries(SCHOOL_FORM_FIELDS.map(k => [k, form[k].trim() || null])),
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
                className="border border-[#fcd34d] dark:border-[color-mix(in_srgb,var(--color-warning-dot)_40%,transparent)]"
                style={{ fontSize: 11, fontWeight: 600, color: "var(--color-warning-500)", background: "var(--color-nursery-50)", borderRadius: 99, padding: "3px 10px" }}
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
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: isDirty ? "linear-gradient(135deg,var(--color-action),var(--color-action-2))" : dark ? "var(--color-neutral-200)" : "#f5eeee", color: isDirty ? C.white : C.micro, border: "none", borderRadius: 10, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: saving || loading || !isDirty ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: isDirty ? "0 4px 16px rgba(224,49,49,0.26)" : "none", transition: "background 0.2s, color 0.2s, box-shadow 0.2s" }}
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
              className="bg-[#fef2f2] text-[#b91c1c] dark:bg-error-50 dark:text-error-500"
              style={{ border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "12px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}
            >
              <i className="ti ti-alert-circle" style={{ fontSize: 15, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{error}</span>
              <motion.button onClick={() => setError("")} aria-label="Dismiss error" whileHover={{ scale: 1.1 }} className="text-[#b91c1c] dark:text-error-500" style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                <i className="ti ti-x" style={{ fontSize: 13 }} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* One grid holding five cards — not two independently stacked
            columns. Cards flow row by row (School Information beside School
            Year, Contact Information beside Billing Configuration), so each
            pair shares a top *and* a bottom edge instead of each column
            running to whatever depth its own contents happened to measure.
            Payment Plans spans the full width: it is reference content
            rather than a form, and lifting it out of Billing Configuration
            is what lets the two columns above balance, instead of the right
            one running ~200px past the bottom of the left.

            The track floor is max(360px, half the row) rather than a plain
            360px: a bare `auto-fit` sizes itself to the item count, and with
            five cards in the grid instead of the two column wrappers it used
            to hold it would open four columns on a wide screen. Half-width
            floor caps it at two, while the 360px still drops it to one at the
            same width the old layout did (a 736px container). */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(max(360px, (100% - 16px) / 2), 1fr))", gap: 16, alignItems: "stretch" }}>

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
                <Field label="School Address" grow>
                  <textarea className="settings-input" value={form.school_address} onChange={e => setF("school_address", e.target.value)} placeholder="Complete address…" rows={3} style={{ ...inputStyle, resize: "vertical", flex: 1, minHeight: 88 }} />
                </Field>
              </>
            )}
          </SectionCard>

          <SectionCard title="School Year" subtitle="Affects invoices, early bird eligibility, and reports" icon="ti-calendar" delay={0.06}>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Sk h={42} /><Sk h={7} r={99} /><Sk h={42} /><Sk h={42} />
              </div>
            ) : (
              <>
                <Field label="Current School Year">
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>
                    {settings?.current_school_year ? `S.Y. ${settings.current_school_year}` : "Not set"}
                  </div>
                </Field>
                <SYProgress startDate={settings?.sy_start_date} endDate={settings?.sy_end_date} />
                <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                  Each invoice's installments and Early Bird window count from its own school year's start date.{" "}
                  {STAFF_ADMIN.includes(getCurrentUser()?.role) ? (
                    <Link to="/school-years" style={{ color: C.red, fontWeight: 700 }}>
                      Manage school years <i className="ti ti-arrow-right" style={{ fontSize: 12 }} aria-hidden="true" />
                    </Link>
                  ) : (
                    <>School years are managed by admins on the School Years page.</>
                  )}
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard title="School Forms" subtitle="Printed on SF1, SF2 and the SF10 permanent record" icon="ti-forms" delay={0.07} span>
            {loading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {[1, 2, 3, 4, 5].map(i => <Sk key={i} h={68} />)}
              </div>
            ) : (
              <div className="settings-field-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <Field label="DepEd School ID" hint="Six digits">
                  <input className="settings-input" inputMode="numeric" maxLength={6} value={form.deped_school_id} onChange={e => setF("deped_school_id", e.target.value.replace(/\D/g, ""))} placeholder="401234" style={inputStyle} />
                </Field>
                <Field label="Region">
                  <input className="settings-input" maxLength={100} value={form.region} onChange={e => setF("region", e.target.value)} placeholder="IV-A (CALABARZON)" style={inputStyle} />
                </Field>
                <Field label="Division">
                  <input className="settings-input" maxLength={100} value={form.division} onChange={e => setF("division", e.target.value)} placeholder="Laguna" style={inputStyle} />
                </Field>
                <Field label="District">
                  <input className="settings-input" maxLength={100} value={form.district} onChange={e => setF("district", e.target.value)} placeholder="Cabuyao I" style={inputStyle} />
                </Field>
                <Field label="School Head" hint="Signs SF1 and SF2">
                  <input className="settings-input" maxLength={150} value={form.school_head_name} onChange={e => setF("school_head_name", e.target.value)} placeholder="Full name" style={inputStyle} />
                </Field>
              </div>
            )}
            {!loading && (
              <>
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginBottom: 12, fontSize: 12, fontWeight: 700, color: C.text }}>
                  SF10 signatories
                  <span style={{ fontWeight: 500, color: C.pale, marginLeft: 8 }}>printed over the certification's signature lines</span>
                </div>
                <div className="settings-field-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  {SF10_SIGNATORIES.map(({ key, label }) => (
                    <Field key={key} label={label} hint="Name and title, as it should print">
                      <input className="settings-input" maxLength={150} value={form[key]} onChange={e => setF(key, e.target.value)} placeholder="e.g. Maria Santos, LPT" style={inputStyle} />
                    </Field>
                  ))}
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard title="Contact Information" subtitle="For official communications" icon="ti-phone" delay={0.08}>
            {loading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                <Sk h={68} /><Sk h={68} />
              </div>
            ) : (
              // Paired on one row, like the S.Y. dates above: two short
              // fields stacked made this card overshoot the one beside it and
              // left ~55px of dead space under its neighbour's single field.
              <div className="settings-field-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                <Field label="Contact Email">
                  <input className="settings-input" type="email" value={form.contact_email} onChange={e => setF("contact_email", e.target.value)} placeholder="admin@southlakes.edu.ph" style={inputStyle} />
                </Field>
                <Field label="Mobile">
                  <input className="settings-input" value={form.contact_phone} onChange={e => setF("contact_phone", e.target.value)} placeholder="+63 998 979 1547" style={inputStyle} />
                </Field>
                <Field label="Landline">
                  <input className="settings-input" maxLength={50} value={form.contact_landline} onChange={e => setF("contact_landline", e.target.value)} placeholder="(049) 560-3268" style={inputStyle} />
                </Field>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Billing Configuration" subtitle="Discount and payment settings" icon="ti-cash" delay={0.1}>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Sk h={42} />
              </div>
            ) : (
              <Field label="Early Bird Window" required hint="Days from S.Y. start date during which early bird discount applies">
                <div style={{ position: "relative" }}>
                  <input className="settings-input" type="number" min="1" max="365" value={form.early_bird_days} onChange={e => setF("early_bird_days", e.target.value)} style={{ ...inputStyle, paddingRight: 50 }} />
                  <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.pale, fontWeight: 600, pointerEvents: "none" }}>days</span>
                </div>
              </Field>
            )}
          </SectionCard>

          <SectionCard title="Payment Plans & Discount Rates" subtitle="Installment schedules and the discounts off tuition" icon="ti-calendar-due" delay={0.12} span>
            {loading
              ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>{[1, 2, 3, 4].map(i => <Sk key={i} h={58} r={10} />)}</div>
              : <DiscountRatesCard syStart={form.sy_start_date} earlyBirdDays={form.early_bird_days} />}
          </SectionCard>
        </div>
      </div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FEE SCHEDULES TAB — ported from the former FeeSchedulesPage.jsx
// ════════════════════════════════════════════════════════════════════════════

// Each level in the app's level palette (as on Sections, Subjects and the
// level charts); `glow` is the dark-mode light for its icon tile.
const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",      color: "var(--color-nursery-500)", bg: "var(--color-nursery-50)", glow: LEVEL_GLOW.nursery, icon: "ti-baby-carriage",
    grades: ["Nursery"] },
  { value: "kindergarten",      label: "Kindergarten", color: "var(--color-kindergarten-500)", bg: "var(--color-kindergarten-50)", glow: LEVEL_GLOW.kindergarten, icon: "ti-star",
    // One Kindergarten, as on every other screen; "Senior Kinder" here meant
    // a Kindergarten enrollment found no fee schedule.
    grades: ["Kindergarten"] },
  { value: "elementary",        label: "Elementary",   color: "var(--color-elementary-500)", bg: "var(--color-elementary-50)", glow: LEVEL_GLOW.elementary, icon: "ti-book",
    grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"] },
  { value: "junior_highschool", label: "Junior HS",    color: "var(--color-juniorhigh-500)", bg: "var(--color-juniorhigh-50)", glow: LEVEL_GLOW.juniorhigh, icon: "ti-school",
    grades: ["Grade 7", "Grade 8", "Grade 9", "Grade 10"] },
  { value: "senior_highschool", label: "Senior HS",    color: "var(--color-seniorhigh-500)", bg: "var(--color-seniorhigh-50)", glow: LEVEL_GLOW.seniorhigh, icon: "ti-certificate",
    grades: ["Grade 11", "Grade 12"] },
];

const CATEGORY_META = {
  tuition: { label: "Tuition",       color: "var(--color-brand-600)", bg: "var(--color-brand-100)", icon: "ti-school" },
  misc:    { label: "Miscellaneous",  color: "var(--color-info-500)", bg: "var(--color-info-50)", icon: "ti-clipboard-list" },
  other:   { label: "Other",          color: "var(--color-success-500)", bg: "var(--color-success-50)", icon: "ti-dots-circle-horizontal" },
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

function NewScheduleModal({ schoolYear, onClose, onSaved }) {
  const [schoolLevel, setSchoolLevel] = useState("elementary");
  const [gradeLevel,  setGradeLevel]  = useState("Grade 1");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  const lvl = SCHOOL_LEVELS.find((l) => l.value === schoolLevel) ?? SCHOOL_LEVELS[2];

  const handleCreate = async () => {
    setSaving(true); setError("");
    try {
      const created = await createFeeSchedule({
        school_year: schoolYear, school_level: schoolLevel, grade_level: gradeLevel, is_active: true,
      });
      toast.success("Fee schedule created.");
      onSaved(created);
      onClose();
    } catch (e) {
      const msg = e.message || `Failed to create. SY ${schoolYear} may already have this grade.`;
      setError(msg);
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const inp = { width: "100%", border: "1.5px solid var(--color-brand-border-soft)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "var(--color-neutral-900)", background: "var(--color-neutral-100)", outline: "none", boxSizing: "border-box", cursor: "pointer" };

  return (
    <Modal
      onClose={onClose}
      size="sm"
      showClose
      loading={saving}
      className="text-left"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} loading={saving} icon="ti-plus">
            {saving ? "Creating…" : "Create"}
          </Button>
        </div>
      }
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
          <i className="ti ti-cash text-xl" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-neutral-900">New Fee Schedule</h2>
          <p className="text-[11px] text-neutral-500">For S.Y. {schoolYear}: select a level and grade</p>
        </div>
      </div>

          <AnimatePresence>
            {error && <Alert key="sched-error" variant="error" className="mb-3.5">{error}</Alert>}
          </AnimatePresence>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--color-neutral-700)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>School Level</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SCHOOL_LEVELS.map((lv) => {
                const active = schoolLevel === lv.value;
                return (
                  <button key={lv.value} type="button"
                    onClick={() => { setSchoolLevel(lv.value); setGradeLevel(lv.grades[0]); }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px",
                      borderRadius: 99, border: `1.5px solid ${active ? lv.color : "var(--color-neutral-300)"}`,
                      background: active ? lv.bg : "var(--color-surface)", color: active ? lv.color : "var(--color-neutral-600)",
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
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--color-neutral-700)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Grade Level</label>
            <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} style={inp}>
              {lvl.grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

    </Modal>
  );
}

function FeeItemRow({ item, readOnly, onUpdated, onDeleted }) {
  const dark = useTheme() === "dark";
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(item.item_name);
  const [amount,  setAmount]  = useState(String(item.amount));
  const [saving,  setSaving]  = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const catMeta = CATEGORY_META[item.item_category] ?? CATEGORY_META.other;
  const inp = { border: "1.5px solid var(--color-brand-border-soft)", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "var(--color-neutral-900)", background: "var(--color-neutral-100)", outline: "none" };

  const handleSave = async () => {
    if (!name.trim() || !amount || parseFloat(amount) < 0) return;
    setSaving(true);
    try {
      const res = await updateItem(item.fee_schedule_item_id, { item_name: name.trim(), amount: parseFloat(amount) });
      toast.success(`Fee item updated. ${describeRecalculation(res?.recalculation)}`.trim());
      setEditing(false);
      onUpdated();
    } catch (e) {
      toast.error(e.message || "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteItem(item.fee_schedule_item_id);
      toast.success("Fee item deleted.");
      setConfirmDelete(false);
      onDeleted();
    } catch (e) {
      const msg = e.message || "Delete failed.";
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      variants={listVariants.item}
      className="bg-[#fdfafa] dark:bg-neutral-50"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", border: "1px solid var(--color-neutral-200)", borderRadius: 10 }}
      whileHover={{ borderColor: dark ? DARK_HOVER.border : "#fca5a5" }}
      transition={{ duration: 0.12 }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMeta.color, flexShrink: 0 }} />
      {editing ? (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name"
            style={{ ...inp, flex: 1, minWidth: 0 }} />
          <div style={{ position: "relative", width: 120, flexShrink: 0 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--color-neutral-500)", fontWeight: 600 }}>₱</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ ...inp, width: "100%", paddingLeft: 22, textAlign: "right" }} />
          </div>
          <motion.button onClick={handleSave} disabled={saving}
            whileHover={!saving ? { scale: 1.06 } : {}} whileTap={!saving ? { scale: 0.94 } : {}}
            style={{ background: "var(--color-action)", color: "white", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
            {saving
              ? <i className="ti ti-loader-2" style={{ fontSize: 12, animation: "spin 1s linear infinite" }} />
              : <i className="ti ti-check" style={{ fontSize: 12 }} />
            }
          </motion.button>
          <motion.button onClick={() => { setEditing(false); setName(item.item_name); setAmount(String(item.amount)); }}
            aria-label="Cancel editing"
            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
            style={{ background: "var(--color-surface)", color: "var(--color-neutral-600)", border: "1px solid var(--color-neutral-300)", borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <i className="ti ti-x" style={{ fontSize: 12 }} />
          </motion.button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 13, color: "var(--color-neutral-900)", fontWeight: 500 }}>{item.item_name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-neutral-900)" }}>{fmt(item.amount)}</span>
          {!readOnly && <>
          <motion.button onClick={() => setEditing(true)} aria-label={`Edit fee item ${item.item_name}`}
            whileHover={{ scale: 1.08, backgroundColor: dark ? DARK_HOVER.fill : "#fff0f0", borderColor: dark ? DARK_HOVER.border : "#fca5a5" }}
            whileTap={{ scale: 0.93 }}
            style={{ width: 26, height: 26, border: "1px solid var(--color-neutral-300)", borderRadius: 7, background: "var(--color-surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-600)" }}>
            <i className="ti ti-pencil" style={{ fontSize: 11 }} />
          </motion.button>
          <motion.button onClick={() => setConfirmDelete(true)} aria-label={`Delete fee item ${item.item_name}`}
            whileHover={{ scale: 1.08, backgroundColor: dark ? DARK_HOVER.fill : "#fff0f0", borderColor: dark ? DARK_HOVER.border : "#fca5a5" }}
            whileTap={{ scale: 0.93 }}
            style={{ width: 26, height: 26, border: "1px solid var(--color-neutral-300)", borderRadius: 7, background: "var(--color-surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)" }}>
            <i className="ti ti-trash" style={{ fontSize: 11 }} />
          </motion.button>
          </>}
        </>
      )}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmModal
            icon="ti-trash"
            title="Delete fee item?"
            message={<>Remove <strong>{item.item_name}</strong> ({fmt(item.amount)}) from this fee schedule? This cannot be undone.</>}
            loading={deleting}
            error={deleteError}
            onConfirm={handleConfirmDelete}
            onCancel={() => { setConfirmDelete(false); setDeleteError(""); }}
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
  const inp = { border: "1.5px solid var(--color-brand-border-soft)", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "var(--color-neutral-900)", background: "var(--color-neutral-100)", outline: "none" };

  const handleAdd = async () => {
    if (!name.trim())                      { setError("Name required."); return; }
    if (!amount || parseFloat(amount) < 0) { setError("Amount required."); return; }
    setSaving(true); setError("");
    try {
      const res = await createItem({ fee_schedule: scheduleId, item_category: category, item_name: name.trim(), amount: parseFloat(amount) });
      if (res?.recalculation) toast.success(`Fee item added. ${describeRecalculation(res.recalculation)}`);
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
            className="text-[#b91c1c] dark:text-error-500"
            style={{ fontSize: 11, marginBottom: 6 }}
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
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--color-neutral-500)", fontWeight: 600 }}>₱</span>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00" style={{ ...inp, width: "100%", paddingLeft: 22, textAlign: "right" }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        </div>
        <motion.button onClick={handleAdd} disabled={saving}
          whileHover={!saving ? { scale: 1.04 } : {}} whileTap={!saving ? { scale: 0.96 } : {}}
          style={{ background: saving ? "var(--color-brand-400)" : "var(--color-brand-100)", color: "var(--color-brand-600)", border: "1px solid var(--color-brand-300)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
          {saving
            ? <i className="ti ti-loader-2" style={{ fontSize: 12, animation: "spin 1s linear infinite" }} />
            : <i className="ti ti-plus" style={{ fontSize: 12 }} />
          }Add
        </motion.button>
      </div>
    </div>
  );
}

function ScheduleDetail({ schedule, readOnly, onUpdated }) {
  const lvl = SCHOOL_LEVELS.find((l) => l.value === schedule.school_level) ?? SCHOOL_LEVELS[2];
  const [recalcing, setRecalcing] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState("");

  const categories = ["tuition", "misc", "other"];

  const handleRecalculate = async () => {
    setRecalcing(true); setRecalcMsg("");
    try {
      const result = await recalculateSchedule(schedule.fee_schedule_id);
      const msg = describeRecalculation(result);
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
        className={`bg-surface shadow-[0_2px_12px_rgba(224,49,49,0.05)] ${CARD_DARK}`}
        style={{ borderRadius: 16, border: "1px solid var(--color-neutral-200)", padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className={lvl.glow} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: lvl.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className={`ti ${lvl.icon}`} style={{ fontSize: 20, color: lvl.color }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-neutral-900)" }}>{schedule.grade_level}</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: lvl.bg, color: lvl.color, marginTop: 3 }}>
              <i className={`ti ${lvl.icon}`} style={{ fontSize: 11 }} />{lvl.label} · SY {schedule.school_year}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AnimatePresence>
            {recalcMsg && (
              <motion.span
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.18 }}
                className="border border-[#a3d98a] dark:border-[color-mix(in_srgb,var(--color-success-dot)_40%,transparent)]"
                style={{ fontSize: 12, color: "var(--color-success-500)", fontWeight: 600, background: "var(--color-success-50)", borderRadius: 99, padding: "4px 12px", display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <i className="ti ti-circle-check" style={{ fontSize: 12 }} />{recalcMsg}
              </motion.span>
            )}
          </AnimatePresence>
          {!readOnly && <motion.button onClick={handleRecalculate} disabled={recalcing}
            whileHover={!recalcing ? { scale: 1.02 } : {}} whileTap={!recalcing ? { scale: 0.97 } : {}}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--color-brand-100)", color: "var(--color-brand-600)", border: "1px solid var(--color-brand-300)", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: recalcing ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif" }}>
            {recalcing
              ? <i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />
              : <i className="ti ti-refresh" style={{ fontSize: 13 }} />
            }
            {recalcing ? "Updating…" : "Apply to Invoices"}
          </motion.button>}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.06, ease: "easeOut" }}
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}
      >
        {[
          { label: "Tuition",       val: tuitionTotal, color: "var(--color-brand-600)", bg: "var(--color-brand-100)" },
          { label: "Miscellaneous", val: miscTotal,    color: "var(--color-info-500)", bg: "var(--color-info-50)" },
          { label: "Other",         val: otherTotal,   color: "var(--color-success-500)", bg: "var(--color-success-50)" },
          { label: "Grand Total",   val: grandTotal,   color: "var(--color-accent-500)", bg: "var(--color-accent-50)" },
        ].map((s) => (
          <div key={s.label} className={`bg-surface shadow-[0_2px_8px_rgba(224,49,49,0.04)] ${CARD_DARK}`} style={{ borderRadius: 12, border: "1px solid var(--color-neutral-200)", padding: "14px 16px", textAlign: "center" }}>
            <AnimatedAmount value={parseFloat(s.val)} style={{ fontSize: 15, fontWeight: 700, color: s.color }} />
            <div style={{ fontSize: 11, color: "var(--color-neutral-500)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>{s.label}</div>
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
            className={`bg-surface shadow-[0_2px_12px_rgba(224,49,49,0.05)] ${CARD_DARK}`}
            style={{ borderRadius: 16, border: "1px solid var(--color-neutral-200)", overflow: "hidden" }}
          >
            <div className="border-b border-[#f9f0f0] dark:border-neutral-200 bg-[linear-gradient(to_right,#fdfafa,white)] dark:bg-[linear-gradient(to_right,var(--color-brand-50),var(--color-surface))]" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: catMeta.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className={`ti ${catMeta.icon}`} style={{ fontSize: 14, color: catMeta.color }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-neutral-900)" }}>{catMeta.label}</span>
                <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{catItems.length} item{catItems.length !== 1 ? "s" : ""}</span>
                {cat !== "tuition"
                  ? <span style={{ fontSize: 11, color: "var(--color-neutral-500)", fontStyle: "italic" }}>· no discount applied</span>
                  : <span style={{ fontSize: 11, color: "var(--color-brand-600)", fontStyle: "italic" }}>· discounts applied here</span>
                }
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: catMeta.color }}>
                {fmt(catItems.reduce((s, i) => s + parseFloat(i.amount), 0))}
              </span>
            </div>
            <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
              {catItems.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--color-neutral-500)", fontStyle: "italic", textAlign: "center", padding: "8px 0" }}>No items yet</div>
              )}
              <motion.div
                variants={listVariants.container}
                initial="hidden" animate="visible"
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                {catItems.map((item) => (
                  <FeeItemRow key={item.fee_schedule_item_id} item={item} readOnly={readOnly}
                    onUpdated={onUpdated} onDeleted={onUpdated} />
                ))}
              </motion.div>
              {!readOnly && <AddFeeItemForm scheduleId={schedule.fee_schedule_id} category={cat} onAdded={onUpdated} />}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function FeeSchedulesTab() {
  const dark = useTheme() === "dark";
  const [schedules,    setSchedules]    = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [levelFilter,  setLevelFilter]  = useState("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [copying,      setCopying]      = useState(false);
  // Fees are set per school year. Opens on the current year (or the one in
  // the link, e.g. from a year's setup checklist); never "All years" -- a
  // grade's fees only mean something within one year.
  const [schoolYear, setSchoolYear] = useYearFilter({ allowAll: false });
  const { options: yearLabels, yearStates } = useSchoolYear();
  const archived = yearStates[schoolYear] === "archived";

  const fetchSchedules = useCallback(async (lvl = levelFilter) => {
    setLoading(true);
    try {
      const params = { school_year: schoolYear };
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
  }, [levelFilter, selected, schoolYear]);

  // Another year's schedules are other rows entirely: drop the open one.
  useEffect(() => {
    setSelected(null); // eslint-disable-line react-hooks/set-state-in-effect
    fetchSchedules(levelFilter);
  }, [schoolYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSchedule = (sch) => setSelected(sch);
  const handleUpdated = () => fetchSchedules(levelFilter);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
      style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

      {/* Mini header */}
      <div style={{ padding: "14px 28px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SchoolYearPicker value={schoolYear} onChange={setSchoolYear} includeAllYears={false} counts={{}} />
          <div style={{ fontSize: 12, color: C.pale }}>
            {loading ? "Loading…" : `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""} for S.Y. ${schoolYear}`}
          </div>
          {archived && (
            <span className="bg-[#f5f0f0] dark:bg-muted-50" style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-neutral-600)", borderRadius: 99, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <i className="ti ti-archive" style={{ fontSize: 12 }} />Archived — read-only
            </span>
          )}
        </div>
        {!archived && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <motion.button
          whileHover={{ borderColor: dark ? DARK_HOVER.red : "#e03131", color: dark ? DARK_HOVER.redDark : "#c92a2a" }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setCopying(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--color-surface)", color: "var(--color-neutral-600)", border: "1.5px solid var(--color-brand-border-soft)", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
          <i className="ti ti-copy" style={{ fontSize: 15 }} />Copy from an earlier year
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setShowNewModal(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,var(--color-action),var(--color-action-2))", color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
          <i className="ti ti-plus" style={{ fontSize: 15 }} />New Schedule
        </motion.button>
        </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "300px 1fr" }}>

        <motion.div
          initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.26, ease: "easeOut" }}
          style={{ borderRight: "1px solid var(--color-neutral-200)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-surface)" }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--color-neutral-200)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, color: "var(--color-neutral-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>Filter by Level</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {[{ value: "all", label: "All", color: "var(--color-brand-600)", bg: "var(--color-brand-100)", icon: null }, ...SCHOOL_LEVELS].map((lv) => {
                const active = levelFilter === lv.value;
                return (
                  <motion.button
                    key={lv.value}
                    onClick={() => { setLevelFilter(lv.value); fetchSchedules(lv.value); }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      height: 26, padding: "0 10px", borderRadius: 99,
                      border: `1.5px solid ${active ? lv.color : "var(--color-neutral-300)"}`,
                      background: active ? lv.bg : "var(--color-surface)",
                      color: active ? lv.color : "var(--color-neutral-600)",
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
                  <div key={i} className="border-b border-[#f9f0f0] dark:border-neutral-200" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <Sk w={120} h={14} /><Sk w={80} h={11} /><Sk w="100%" h={6} r={99} />
                  </div>
                ))
              : schedules.length === 0
                ? (
                  <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--color-neutral-500)", fontSize: 13 }}>
                    <i className="ti ti-cash" style={{ fontSize: 28, color: "var(--color-neutral-500)", display: "block", marginBottom: 10 }} />
                    No fee schedules for S.Y. {schoolYear} yet.<br />
                    {!archived && (
                      <span style={{ fontSize: 12 }}>Copy an earlier year&apos;s and adjust, or click &quot;New Schedule&quot;.</span>
                    )}
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
                          whileHover={{ backgroundColor: isActive ? lv.bg : dark ? DARK_HOVER.row : "#fffaf9" }}
                          className="border-b border-[#f9f0f0] dark:border-neutral-200"
                          style={{
                            padding: "14px 16px",
                            borderLeft: `3px solid ${isActive ? lv.color : "transparent"}`,
                            background: isActive ? lv.bg : "var(--color-surface)",
                            cursor: "pointer",
                            transition: "border-left-color 0.15s ease, background-color 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <i className={`ti ${lv.icon}`} style={{ fontSize: 13, color: lv.color }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-neutral-900)" }}>{sch.grade_level}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 99, background: lv.bg, color: lv.color }}>{lv.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--color-neutral-500)", marginBottom: 5 }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</div>
                          {grandTotal > 0 && (
                            <div style={{ display: "flex", height: 4, borderRadius: 99, overflow: "hidden", gap: 1, marginBottom: 5 }}>
                              {tTotal > 0 && <div style={{ flex: tTotal / barTotal, background: "var(--color-brand-500)", minWidth: 2 }} title={`Tuition: ${fmt(tTotal)}`} />}
                              {mTotal > 0 && <div style={{ flex: mTotal / barTotal, background: "var(--color-info-500)", minWidth: 2 }} title={`Misc: ${fmt(mTotal)}`} />}
                              {oTotal > 0 && <div style={{ flex: oTotal / barTotal, background: "var(--color-success-500)", minWidth: 2 }} title={`Other: ${fmt(oTotal)}`} />}
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
                <div style={{ width: 60, height: 60, borderRadius: 18, background: "linear-gradient(135deg,var(--color-brand-100),var(--color-brand-200))", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-cash" style={{ fontSize: 28, color: "var(--color-neutral-500)" }} />
                </div>
                <div style={{ fontSize: 16, color: "var(--color-neutral-700)", fontWeight: 600 }}>Select a fee schedule</div>
                <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>Click a schedule on the left to view and edit its items</div>
              </motion.div>
            ) : (
              <motion.div
                key={selected.fee_schedule_id}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <ScheduleDetail schedule={selected} readOnly={archived} onUpdated={handleUpdated} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showNewModal && (
          <NewScheduleModal
            key="new-modal"
            schoolYear={schoolYear}
            onClose={() => setShowNewModal(false)}
            onSaved={(s) => { fetchSchedules(levelFilter); setSelected(s); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {copying && (
          <CarryOverModal
            key="copy-fees"
            schoolYear={schoolYear}
            years={yearLabels.map((label) => ({ label }))}
            availableParts={["fees"]}
            initialParts={["fees"]}
            onClose={() => setCopying(false)}
            onDone={() => fetchSchedules(levelFilter)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
