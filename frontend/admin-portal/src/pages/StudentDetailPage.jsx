import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { getStudent } from "../api/studentApi";
import { getGuardiansByStudent, patchGuardian, getGuardiansByUserIds } from "../api/guardianApi";
import { getSiblingsByStudent } from "../api/siblingApi";
import { getPreviousSchoolsByStudent } from "../api/previousSchoolApi";
import { getEnrollments } from "../api/enrollmentApi";
import { getStudentLedger } from "../api/billingApi";
import { getUsers, createUser } from "../api/identityApi";
import { getCurrentUser, hasAnyRole, isAdminRole, BILLING_ROLES } from "../utils/auth";

import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Alert from "../components/ui/Alert";
import { Field, Input, Select } from "../components/FormField";
import Skeleton from "../components/ui/Skeleton";
import Badge, { StatusBadge } from "../components/ui/Badge";
import Tabs, { TabPanel } from "../components/ui/Tabs";
import useTabs from "../hooks/useTabs";
import { STUDENT_STATUS_MAP } from "../constants/statusMaps";
import { getAvatarPalette } from "../utils/avatarPalette";

const CAN_LINK_ROLES = ["super_admin", "admin", "registrar"];

// ── Guardian account-linking modal ────────────────────────────────────────────
function LinkAccountModal({ guardian, onClose, onLinked }) {
  const canCreateAccount = isAdminRole(getCurrentUser()?.role);

  const [users, setUsers]     = useState([]);
  const [linkedMap, setLinkedMap] = useState({}); // user_id -> [student names already linked elsewhere]
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(guardian.user_id ?? "");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // "select" = pick an existing guardian account (also links siblings to the
  // same account); "create" = spin up a brand-new one and link it in one go.
  // Only admins can create accounts (identity-service restricts POST /users/
  // to ADMIN_ROLES — registrars can link but not create), so non-admins are
  // always locked to "select".
  const [mode, setMode] = useState("select");
  const [newName,     setNewName]     = useState(guardian.full_name || "");
  const [newEmail,    setNewEmail]    = useState(guardian.email_address || "");
  const [newPassword, setNewPassword] = useState("");
  const [showPw,       setShowPw]      = useState(false);
  const [creating,     setCreating]    = useState(false);
  const [createError,  setCreateError] = useState("");

  useEffect(() => {
    getUsers()
      .then(async (data) => {
        const guardianUsers = (Array.isArray(data) ? data : data?.results ?? []).filter((u) => u.role === "guardian");
        setUsers(guardianUsers);
        if (guardianUsers.length === 0 && canCreateAccount) setMode("create");
        try {
          const linkedData = await getGuardiansByUserIds(guardianUsers.map((u) => u.user_id));
          const linkedRows = Array.isArray(linkedData) ? linkedData : linkedData?.results ?? [];
          const map = {};
          for (const row of linkedRows) {
            if (row.guardian_id === guardian.guardian_id || !row.student_name) continue;
            (map[row.user_id] ??= []).push(row.student_name);
          }
          setLinkedMap(map);
        } catch { /* non-critical — hints just won't show */ }
      })
      .catch((e) => setError(e.message || "Failed to load guardian accounts."))
      .finally(() => setLoading(false));
  }, [guardian.guardian_id, canCreateAccount]);

  async function handleSave(unlink = false) {
    setSaving(true); setError("");
    try {
      const value = unlink ? null : (selected ? parseInt(selected, 10) : null);
      const updated = await patchGuardian(guardian.guardian_id, { user_id: value });
      toast.success(unlink ? "Account unlinked." : "Guardian account linked.");
      onLinked(updated);
      onClose();
    } catch (e) {
      const msg = e.message || "Failed to update link.";
      setError(msg); toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAndLink() {
    setCreateError("");
    if (!newName.trim() || !newEmail.trim() || !newPassword) {
      setCreateError("Name, email, and password are required.");
      return;
    }
    if (newPassword.length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }

    setCreating(true);
    let created;
    try {
      created = await createUser({ name: newName.trim(), email: newEmail.trim(), role: "guardian", password: newPassword });
    } catch (err) {
      setCreateError(err?.response?.data?.detail || err?.message || "Network error. Please try again.");
      setCreating(false);
      return;
    }

    try {
      const updated = await patchGuardian(guardian.guardian_id, { user_id: created.user_id });
      toast.success(`Account created for ${created.name} and linked.`);
      onLinked(updated);
      onClose();
    } catch {
      // Account exists now even though the link failed — don't strand it.
      // Drop back to "select" mode with it pre-picked so the admin can just
      // hit "Save link" instead of losing the account they just created.
      toast.error("Account created, but linking failed — try “Save link” below.");
      setUsers((prev) => [...prev, created]);
      setSelected(String(created.user_id));
      setMode("select");
    } finally {
      setCreating(false);
    }
  }

  const busy = saving || creating;

  return (
    <Modal
      onClose={onClose}
      size="md"
      icon="ti-link"
      title="Link login account"
      description={`Give ${guardian.full_name} access to the parent portal for this student.`}
      loading={busy}
      showClose
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            {guardian.user_id && mode === "select" && (
              confirmUnlink ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-700">Unlink this account?</span>
                  <Button variant="secondary" size="sm" disabled={saving} onClick={() => setConfirmUnlink(false)}>
                    No
                  </Button>
                  <Button variant="destructive" size="sm" loading={saving} onClick={() => handleSave(true)}>
                    Yes, unlink
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" icon="ti-unlink" disabled={busy} onClick={() => setConfirmUnlink(true)}>
                  Unlink
                </Button>
              )
            )}
          </div>
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            {mode === "create" ? (
              <Button loading={creating} onClick={handleCreateAndLink}>
                {creating ? "Creating…" : "Create & link"}
              </Button>
            ) : (
              <Button
                loading={saving}
                disabled={loading || users.length === 0}
                onClick={() => handleSave(false)}
              >
                {saving ? "Saving…" : "Save link"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <AnimatePresence>
        {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      </AnimatePresence>

      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.07em] text-neutral-700">
          Guardian account
        </span>
        {!loading && canCreateAccount && users.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            icon={mode === "select" ? "ti-plus" : "ti-arrow-left"}
            onClick={() => { setMode((m) => (m === "select" ? "create" : "select")); setCreateError(""); }}
          >
            {mode === "select" ? "Create new account" : "Choose existing"}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton height={40} />
          <Skeleton height={12} width="70%" />
        </div>
      ) : mode === "create" ? (
        <div>
          <Field label="Full name" required>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Maria Santos" />
          </Field>
          <Field label="Email address" required>
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="e.g. maria@gmail.com" />
          </Field>
          <Field label="Password" required hint="At least 8 characters.">
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                className="focus-ring absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-neutral-500 hover:text-brand-500"
              >
                <i className={`ti ${showPw ? "ti-eye-off" : "ti-eye"}`} aria-hidden="true" />
              </button>
            </div>
          </Field>
          <AnimatePresence>
            {createError && <Alert variant="error" className="mb-3">{createError}</Alert>}
          </AnimatePresence>
          <Alert variant="info">
            If {guardian.full_name} already has an account from another child, use
            &ldquo;Choose existing&rdquo; instead — don&apos;t create a second one for the same parent.
          </Alert>
        </div>
      ) : users.length === 0 ? (
        <Alert variant="info">
          No guardian login accounts exist yet.{" "}
          {canCreateAccount
            ? "Create one below."
            : <>Ask an admin to create one first in <strong>Users</strong> (role &ldquo;Guardian&rdquo;), then return here to link it.</>}
        </Alert>
      ) : (
        <Field hint="Link the same account across each of a parent's children so they see all of them in one portal.">
          <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">— Not linked —</option>
            {users.map((u) => {
              const linkedTo = linkedMap[u.user_id];
              return (
                <option key={u.user_id} value={u.user_id}>
                  {u.name} ({u.email}){linkedTo?.length ? ` — linked to: ${linkedTo.join(", ")}` : ""}
                </option>
              );
            })}
          </Select>
        </Field>
      )}
    </Modal>
  );
}



// Status colours and the avatar palette now come from the shared design system
// (constants/statusMaps.js, utils/avatarPalette.js) so a student looks the same
// here as in the list.
const getPalette = (name = "") => getAvatarPalette(name);

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age;
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function capitalize(str = "") {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Thin alias so the ~40 existing <Sk w= h= r= /> call sites below keep working
// while using the shared skeleton.
const Sk = ({ w = "100%", h = 14, r = 6 }) => <Skeleton width={w} height={h} radius={r} />;

// ── Reusable info row ─────────────────────────────────────────────────────────
// Every tab body is built from InfoRow + SectionCard, so restyling just these
// two propagates the design system through all seven tabs.
function InfoRow({ icon, label, value, mono = false }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-3 border-b border-neutral-200/70 py-3 last:border-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50">
        <i className={`ti ${icon} text-[14px] text-brand-500`} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-xs font-bold uppercase tracking-[0.07em] text-neutral-500">
          {label}
        </div>
        <div className={`text-base font-medium leading-normal text-neutral-900 ${mono ? "font-mono" : ""}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function SectionCard({ title, icon, children, badge, motionProps = {} }) {
  return (
    <motion.div
      {...motionProps}
      className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-100">
            <i className={`ti ${icon} text-[15px] text-brand-500`} aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-neutral-900">{title}</h2>
        </div>
        {badge != null && (
          <Badge variant="brand" size="sm">{badge}</Badge>
        )}
      </div>
      <div className="px-5 pb-3 pt-1">{children}</div>
    </motion.div>
  );
}

// ── Empty state inside a section ──────────────────────────────────────────────
function EmptySection({ message }) {
  return <p className="py-6 text-center text-sm italic text-neutral-500">{message}</p>;
}


// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

const TAB_ORDER = ["personal", "household", "guardians", "family", "schools", "enrollments", "ledger"];

export default function StudentDetailPage() {
  usePageTitle("Student Details");
  const { id } = useParams();
  const navigate = useNavigate();

  const [student,       setStudent]       = useState(null);
  const [guardians,     setGuardians]     = useState([]);
  const [siblings,      setSiblings]      = useState([]);
  const [schools,       setSchools]       = useState([]);
  const [enrollments,   setEnrollments]   = useState([]);
  const [ledger,        setLedger]        = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [linkGuardian,  setLinkGuardian]  = useState(null); // guardian being linked to an account

  const canLink = hasAnyRole(getCurrentUser(), CAN_LINK_ROLES);
  // getStudentLedger hits a billing-service endpoint that's BILLING_ROLES-only
  // even though this route allows every staff role — skip the doomed fetch
  // for teacher/registrar and show an accurate message instead of "Failed to
  // load financial history. Check that the billing service is running."
  // (which is misleading — the service is fine, the role just can't see it).
  const canViewBilling = hasAnyRole(getCurrentUser(), BILLING_ROLES);

  // Direction tracking for the slide transition now lives in useTabs, replacing
  // the hand-rolled prevTabRef/tabDirection state machine this page carried.
  const { active: activeTab, direction: tabDirection, setActive: handleTabChange } =
    useTabs(TAB_ORDER.map((id) => ({ id })), "personal");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getStudent(id),
      getGuardiansByStudent(id).catch(() => []),
      getSiblingsByStudent(id).catch(() => []),
      getPreviousSchoolsByStudent(id).catch(() => []),
      getEnrollments({ student: id, page_size: 100, ordering: "-school_year,-enrollment_id" }).catch(() => ({})),
    ]).then(([s, g, sib, sch, enrData]) => {
      setStudent(s);
      setGuardians(Array.isArray(g) ? g : g?.results ?? []);
      setSiblings(Array.isArray(sib) ? sib : sib?.results ?? []);
      setSchools(Array.isArray(sch) ? sch : sch?.results ?? []);
      setEnrollments(Array.isArray(enrData) ? enrData : enrData?.results ?? []);
    }).finally(() => setLoading(false));
  }, [id]);

  // Lazy-load ledger only when the tab is first opened
  useEffect(() => {
    if (activeTab !== "ledger" || ledger !== null || !id) return;
    if (!canViewBilling) { setLedger({ forbidden: true }); return; }
    setLedgerLoading(true);
    getStudentLedger(id)
      .then(setLedger)
      .catch(() => setLedger({ error: true }))
      .finally(() => setLedgerLoading(false));
  }, [activeTab, id, ledger, canViewBilling]);

  const TABS = [
    { id: "personal",    label: "Personal",     icon: "ti-user"           },
    { id: "household",   label: "Household",     icon: "ti-home"           },
    { id: "guardians",   label: "Guardians",     icon: "ti-users",   count: guardians.length   },
    { id: "family",      label: "Siblings",      icon: "ti-heart",   count: siblings.length    },
    { id: "schools",     label: "Prev. Schools", icon: "ti-school",  count: schools.length     },
    { id: "enrollments", label: "Enrollments",   icon: "ti-clipboard-list", count: enrollments.length },
    { id: "ledger",      label: "Financial History", icon: "ti-receipt"   },
  ];

  const palette    = getPalette(`${student?.last_name ?? ""}${student?.first_name ?? ""}`);
  const age        = calcAge(student?.birth_date);
  const fullName   = student
    ? [student.first_name, student.middle_name, student.last_name, student.suffix]
        .filter(Boolean).join(" ")
    : "";

  const isFirstRender = useIsFirstRender();


  return (
    <>

          {/* Breadcrumbs replace the old lone "← Students" button, so the
              hierarchy is visible rather than implied. */}
          <PageHeader
            title={loading ? "Loading…" : fullName || "Student"}
            breadcrumbs={[
              { label: "Students", to: "/students" },
              { label: loading ? "Loading…" : fullName },
            ]}
            actions={
              !loading && student && (
                <Button
                  variant="secondary"
                  icon="ti-pencil"
                  onClick={() => navigate(`/students/${student.student_id}/edit`)}
                >
                  Edit Student
                </Button>
              )
            }
          />

          {/* Scrollable body */}
          <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", display:"flex", flexDirection:"column", gap:22 }}>

            {loading ? (
              /* ── Skeleton hero + cards ── */
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                <div style={{ background:"white", borderRadius:20, padding:"28px 28px", border:"1px solid #f5eaea", display:"flex", gap:20, alignItems:"center" }}>
                  <Sk w={80} h={80} r={99} />
                  <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10 }}>
                    <Sk w={220} h={22} />
                    <Sk w={140} h={14} />
                    <div style={{ display:"flex", gap:8, marginTop:4 }}>
                      <Sk w={80} h={28} r={99} />
                      <Sk w={80} h={28} r={99} />
                    </div>
                  </div>
                </div>
                {[1,2,3].map(i => (
                  <div key={i} style={{ background:"white", borderRadius:16, padding:"20px 22px", border:"1px solid #f5eaea", display:"flex", flexDirection:"column", gap:14 }}>
                    <Sk w={140} h={16} />
                    <Sk w="80%" h={13} />
                    <Sk w="60%" h={13} />
                    <Sk w="70%" h={13} />
                  </div>
                ))}
              </div>
            ) : !student ? (
              <div style={{ textAlign:"center", padding:"80px 0", color:"#8a6a6a", fontSize:15 }}>
                Student not found.
              </div>
            ) : (
              <>
                {/* ── Hero profile card + tab bar ──
                    Grouped in one non-animated wrapper with no gap between
                    them so they read as a single card with the tabs as its
                    footer strip, while each child keeps its own independent
                    Framer Motion animation and layout box (nesting the tab
                    row's flex content inside the hero card's own animated,
                    overflow:hidden box collapsed its height — see the min-h
                    note below). */}
                <div style={{ display:"flex", flexDirection:"column" }}>
                {/* ── Hero profile card ── */}
                <motion.div
                  initial={isFirstRender ? { y: 16, opacity: 0 } : false}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.28, ease: "easeOut", delay: isFirstRender ? 0.06 : 0 }}
                  style={{
                    background:"white", borderRadius:"20px 20px 0 0",
                    border:"1px solid #f5eaea", borderBottom:"none",
                    boxShadow:"0 4px 24px rgba(224,49,49,0.07)",
                    overflow:"hidden",
                  }}
                >
                  {/* Top accent strip */}
                  <div style={{
                    height:6,
                    background:"linear-gradient(to right, #e03131, #ff6b6b, #fca5a5, #fde8e8)",
                  }} />

                  <div style={{ padding:"26px 28px", display:"flex", alignItems:"flex-start", gap:22, flexWrap:"wrap" }}>
                    {/* Avatar */}
                    <motion.div
                      initial={isFirstRender ? { scale: 0.82, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1], delay: isFirstRender ? 0.12 : 0 }}
                      style={{
                        width:76, height:76, borderRadius:"50%",
                        background:`linear-gradient(135deg, ${palette.bg}, ${palette.color}22)`,
                        border:`3px solid ${palette.color}33`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:26, fontWeight:700, color:palette.color,
                        flexShrink:0, letterSpacing:"0.02em",
                        boxShadow:`0 4px 20px ${palette.color}22`,
                      }}
                    >
                      {`${student.first_name?.[0] ?? ""}${student.last_name?.[0] ?? ""}`.toUpperCase()}
                    </motion.div>

                    {/* Name + identifiers */}
                    <div style={{ flex:1, minWidth:200 }}>
                      <div style={{ fontSize:22, fontWeight:700, color:"#1a0a0a", lineHeight:1.2, letterSpacing:"-0.01em" }}>
                        {fullName}
                      </div>
                      <div style={{ fontSize:12, color:"#8a6a6a", marginTop:5, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                        {student.student_number && (
                          <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <i className="ti ti-id-badge" style={{ fontSize:13 }} />
                            {student.student_number}
                          </span>
                        )}
                        {student.lrn && (
                          <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <i className="ti ti-fingerprint" style={{ fontSize:13 }} />
                            LRN {student.lrn}
                          </span>
                        )}
                        {student.religion && (
                          <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <i className="ti ti-star" style={{ fontSize:13 }} />
                            {student.religion}
                          </span>
                        )}
                      </div>

                      {/* At-a-glance facts, all on the shared Badge so they
                          match the pills used in the student list. */}
                      <div className="mt-3.5 flex flex-wrap items-center gap-2">
                        <StatusBadge status={student.status} map={STUDENT_STATUS_MAP} />
                        {student.sex && (
                          <Badge
                            variant={student.sex === "male" ? "info" : "accent"}
                            icon={student.sex === "male" ? "ti-mars" : "ti-venus"}
                          >
                            {capitalize(student.sex)}
                          </Badge>
                        )}
                        {age !== null && (
                          <Badge variant="success" icon="ti-cake">{age} years old</Badge>
                        )}
                        {guardians.length > 0 && (
                          <Badge variant="warning" icon="ti-users">
                            {guardians.length} Guardian{guardians.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Quick contact */}
                    <div style={{ display:"flex", flexDirection:"column", gap:8, alignSelf:"center" }}>
                      {student.mobile_number && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#5a4a4a" }}>
                          <div style={{ width:30, height:30, borderRadius:8, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <i className="ti ti-phone" style={{ fontSize:13, color:"#e03131" }} />
                          </div>
                          {student.mobile_number}
                        </div>
                      )}
                      {student.email && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#5a4a4a" }}>
                          <div style={{ width:30, height:30, borderRadius:8, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <i className="ti ti-mail" style={{ fontSize:13, color:"#e03131" }} />
                          </div>
                          {student.email}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>

                {/* ── Tab bar ──
                    Own animated box (sibling of the hero card, not nested
                    inside it) — nesting it inside the hero card's animated,
                    overflow:hidden box collapsed this row's height entirely.
                    Visually fused to the hero card above via zero gap +
                    matching border radius on the wrapping div, not by
                    sharing a layout box. min-h guards against the same
                    collapse this bar hit before (Framer Motion's y-transform
                    zeroing out a height that came purely from flex content). */}
                <motion.div
                  initial={isFirstRender ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.24, ease: "easeOut", delay: isFirstRender ? 0.16 : 0 }}
                  style={{
                    background:"#fafafa", borderRadius:"0 0 20px 20px",
                    border:"1px solid #f5eaea", borderTop:"1px solid #f0e4e4",
                  }}
                  className="flex min-h-[52px] items-center overflow-hidden px-3 [&>div]:!overflow-visible [&>div]:!border-b-0 [&>div]:w-full [&>div]:justify-between"
                >
                  {/* Shared Tabs adds the WAI-ARIA keyboard contract (arrows,
                      Home/End, roving tabindex) the hand-rolled bar lacked. */}
                  <Tabs tabs={TABS} value={activeTab} onChange={handleTabChange} />
                </motion.div>
                </div>

                {/* ── Tab content ── */}
                <TabPanel
                  id={activeTab}
                  direction={tabDirection}
                  className="flex flex-col gap-4"
                >

                    {/* PERSONAL TAB */}
                    {activeTab === "personal" && (<>
                      <SectionCard title="Basic Information" icon="ti-user"
                        motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0,    duration:0.22 } }}>
                        <InfoRow icon="ti-calendar"        label="Date of Birth"   value={fmtDate(student.birth_date)} />
                        <InfoRow icon="ti-clock"           label="Age"             value={age !== null ? `${age} years old` : null} />
                        <InfoRow icon="ti-gender-bigender" label="Sex"             value={capitalize(student.sex)} />
                        <InfoRow icon="ti-star"            label="Religion"        value={student.religion} />
                      </SectionCard>
                      <SectionCard title="Contact Information" icon="ti-address-book"
                        motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0.06, duration:0.22 } }}>
                        <InfoRow icon="ti-mail"  label="Email Address" value={student.email} />
                        <InfoRow icon="ti-phone" label="Mobile Number" value={student.mobile_number} />
                      </SectionCard>
                      <SectionCard title="Address" icon="ti-map-pin"
                        motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0.12, duration:0.22 } }}>
                        <InfoRow icon="ti-home"  label="Current Address"   value={student.current_address} />
                        <InfoRow icon="ti-map-2" label="Permanent Address" value={student.permanent_address} />
                      </SectionCard>
                      <SectionCard title="System Information" icon="ti-info-circle"
                        motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0.18, duration:0.22 } }}>
                        <InfoRow icon="ti-id-badge"    label="Student Number" value={student.student_number} mono />
                        <InfoRow icon="ti-fingerprint" label="LRN"            value={student.lrn} mono />
                        <InfoRow icon="ti-toggle-right" label="Status"        value={capitalize(student.status)} />
                      </SectionCard>
                    </>)}

                    {/* HOUSEHOLD TAB */}
                    {activeTab === "household" && (
                      <SectionCard title="Household Information" icon="ti-home"
                        motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                        {(!student.household_id && !student.parent_marital_status && !student.living_arrangement) ? (
                          <EmptySection message="No household information recorded for this student." />
                        ) : (<>
                          <InfoRow icon="ti-heart"              label="Parent Marital Status" value={capitalize(student.parent_marital_status || "")} />
                          <InfoRow icon="ti-building-community" label="Living Arrangement"    value={capitalize(student.living_arrangement || "")} />
                          <InfoRow icon="ti-badge"              label="4Ps Beneficiary"       value={student.is_4ps_beneficiary ? "Yes" : student.is_4ps_beneficiary === false ? "No" : null} />
                          <InfoRow icon="ti-hash"               label="4Ps ID"                value={student.four_ps_id} mono />
                        </>)}
                      </SectionCard>
                    )}

                    {/* GUARDIANS TAB */}
                    {activeTab === "guardians" && (
                      guardians.length === 0 ? (
                        <SectionCard title="Guardians" icon="ti-users"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                          <EmptySection message="No guardians have been linked to this student." />
                        </SectionCard>
                      ) : guardians.map((g, i) => (
                        <motion.div
                          key={g.guardian_id ?? i}
                          initial={{ opacity:0, y:10 }}
                          animate={{ opacity:1, y:0 }}
                          transition={{ delay: i * 0.07, duration:0.22 }}
                          whileHover={{ y:-2, boxShadow: g.is_primary_contact ? "0 6px 22px rgba(224,49,49,0.16)" : "0 6px 18px rgba(224,49,49,0.10)" }}
                          style={{
                            background:"white", borderRadius:16,
                            border:"1px solid #f5eaea",
                            boxShadow: g.is_primary_contact ? "0 2px 16px rgba(224,49,49,0.10)" : "0 2px 10px rgba(224,49,49,0.04)",
                            overflow:"hidden",
                          }}
                        >
                          <div style={{ height:4, background: g.is_primary_contact ? "linear-gradient(to right, #e03131, #ff6b6b, #fca5a5, #fde8e8)" : "linear-gradient(to right, #f5eaea, #fde8e8, #f5eaea)" }} />
                          <div style={{
                            padding:"14px 22px",
                            background: g.is_primary_contact ? "linear-gradient(to right, #fff0f0, #fdfafa)" : "linear-gradient(to right, #fff8f8, white)",
                            borderBottom:"1px solid #f9f0f0",
                            display:"flex", alignItems:"center", justifyContent:"space-between",
                          }}>
                            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                              <div style={{ width:38, height:38, borderRadius:"50%", background:getPalette(g.full_name ?? "").bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:getPalette(g.full_name ?? "").color }}>
                                {(g.full_name ?? "?")[0].toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>{g.full_name}</div>
                                <div style={{ fontSize:11.5, color:"#8a6a6a", marginTop:2, textTransform:"capitalize" }}>{g.relationship}</div>
                              </div>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              {g.is_primary_contact && (
                                <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 11px", borderRadius:99, background:"#fff0f0", color:"#e03131", fontSize:11, fontWeight:700, border:"1px solid #fca5a5" }}>
                                  <i className="ti ti-star-filled" style={{ fontSize:10 }} />
                                  Primary Contact
                                </span>
                              )}
                              {g.user_id ? (
                                <span title="This guardian can log into the parent portal"
                                  style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 11px", borderRadius:99, background:"#e8f5e0", color:"#2e6b0d", fontSize:11, fontWeight:700, border:"1px solid #86efac" }}>
                                  <i className="ti ti-user-check" style={{ fontSize:11 }} />
                                  Portal access
                                </span>
                              ) : canLink ? (
                                <button onClick={() => setLinkGuardian(g)}
                                  style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 11px", borderRadius:99, background:"white", color:"#7a5050", fontSize:11, fontWeight:600, border:"1px solid #f0e4e4", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                                  <i className="ti ti-link" style={{ fontSize:11 }} />
                                  Link account
                                </button>
                              ) : null}
                              {g.user_id && canLink && (
                                <button title="Manage portal access" onClick={() => setLinkGuardian(g)}
                                  style={{ width:26, height:26, borderRadius:7, border:"1px solid #f0e4e4", background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#855c5c" }}>
                                  <i className="ti ti-settings" style={{ fontSize:12 }} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div style={{ padding:"4px 22px 14px" }}>
                            <InfoRow icon="ti-briefcase" label="Occupation"    value={g.occupation} />
                            <InfoRow icon="ti-phone"     label="Mobile Number" value={g.mobile_number} />
                            <InfoRow icon="ti-mail"      label="Email Address" value={g.email_address} />
                          </div>
                        </motion.div>
                      ))
                    )}

                    {/* SIBLINGS TAB */}
                    {activeTab === "family" && (
                      siblings.length === 0 ? (
                        <SectionCard title="Siblings" icon="ti-heart" badge={0}
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                          <EmptySection message="No siblings have been recorded for this student." />
                        </SectionCard>
                      ) : (
                        <SectionCard title="Siblings" icon="ti-heart" badge={siblings.length}
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                            {siblings.map((s, i) => (
                              <div key={s.sibling_id ?? i} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 0", borderBottom: i < siblings.length - 1 ? "1px solid #f9f0f0" : "none" }}>
                                <div style={{ width:36, height:36, borderRadius:"50%", background:getPalette(s.full_name ?? "").bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:getPalette(s.full_name ?? "").color, flexShrink:0 }}>
                                  {(s.full_name ?? "?")[0].toUpperCase()}
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:13.5, fontWeight:600, color:"#1a0a0a" }}>{s.full_name}</div>
                                  {s.age && <div style={{ fontSize:12, color:"#8a6a6a", marginTop:2 }}>{s.age} years old</div>}
                                </div>
                                <div style={{ fontSize:11, color:"#8a6a6a", background:"#f9f4f4", padding:"3px 10px", borderRadius:99, fontWeight:500 }}>
                                  Sibling {i + 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        </SectionCard>
                      )
                    )}

                    {/* PREVIOUS SCHOOLS TAB */}
                    {activeTab === "schools" && (
                      schools.length === 0 ? (
                        <SectionCard title="Previous Schools" icon="ti-school"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                          <EmptySection message="No previous schools have been recorded." />
                        </SectionCard>
                      ) : schools.map((s, i) => (
                        <motion.div
                          key={s.previous_school_id ?? i}
                          initial={{ opacity:0, y:10 }}
                          animate={{ opacity:1, y:0 }}
                          transition={{ delay: i * 0.07, duration:0.22 }}
                          whileHover={{ y:-2, boxShadow:"0 6px 18px rgba(224,49,49,0.10)" }}
                          style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", boxShadow:"0 2px 10px rgba(224,49,49,0.04)", overflow:"hidden" }}
                        >
                          <div style={{ height:4, background:"linear-gradient(to right, #e03131, #ff6b6b, #fca5a5, #fde8e8)" }} />
                          <div style={{ padding:"14px 22px", background:"linear-gradient(to right, #fff8f8, white)", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:12 }}>
                            <div style={{ width:38, height:38, borderRadius:10, background:"#e8f0fd", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              <i className="ti ti-school" style={{ fontSize:17, color:"#2563eb" }} />
                            </div>
                            <div>
                              <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>{s.school_name}</div>
                              <div style={{ fontSize:11, color:"#8a6a6a", marginTop:2 }}>School {i + 1}</div>
                            </div>
                          </div>
                          <div style={{ padding:"4px 22px 14px" }}>
                            <InfoRow icon="ti-map-pin" label="School Address" value={s.school_address} />
                          </div>
                        </motion.div>
                      ))
                    )}

                    {/* ENROLLMENTS TAB */}
                    {activeTab === "enrollments" && (<>
                      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
                        <button
                          onClick={() => navigate(`/enrollments/new?student=${student.student_id}`)}
                          style={{ display:"flex", alignItems:"center", gap:8, height:36, padding:"0 16px", border:"none", borderRadius:10, background:"#e03131", color:"white", fontSize:13, fontFamily:"'DM Sans', sans-serif", fontWeight:700, cursor:"pointer" }}
                        >
                          <i className="ti ti-clipboard-plus" style={{ fontSize:14 }} />
                          New Enrollment
                        </button>
                      </div>
                      {enrollments.length === 0 ? (
                        <SectionCard title="Enrollment History" icon="ti-clipboard-list"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay:0, duration:0.22 } }}>
                          <EmptySection message="No enrollment records found for this student." />
                        </SectionCard>
                      ) : enrollments.map((en, i) => {
                        const statusColors = {
                          enrolled:        { color:"#2e6b0d", bg:"#e8f5e0", label:"Enrolled" },
                          pending:         { color:"#854f0b", bg:"#faeeda", label:"Pending" },
                          completed:       { color:"#1455a0", bg:"#e3f0fd", label:"Completed" },
                          cancelled:       { color:"#5c5752", bg:"#f0ede8", label:"Cancelled" },
                          transferred_out: { color:"#7a4a08", bg:"#fef3e2", label:"Transferred Out" },
                        };
                        const sc = statusColors[en.enrollment_status] ?? statusColors.pending;
                        return (
                          <motion.div
                            key={en.enrollment_id}
                            initial={{ opacity:0, y:10 }}
                            animate={{ opacity:1, y:0 }}
                            transition={{ delay: i * 0.05, duration:0.22 }}
                            whileHover={{ y:-2, boxShadow:"0 4px 16px rgba(224,49,49,0.12)" }}
                            whileTap={{ scale:0.99 }}
                            onClick={() => navigate(`/enrollments/${en.enrollment_id}`)}
                            style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", boxShadow:"0 2px 10px rgba(224,49,49,0.04)" }}
                          >
                            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                              <div style={{ width:38, height:38, borderRadius:10, background:"#fde8e8", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                <i className="ti ti-clipboard-list" style={{ fontSize:16, color:"#e03131" }} />
                              </div>
                              <div>
                                <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>{en.grade_level} — {en.section}</div>
                                <div style={{ fontSize:12, color:"#8a6a6a", marginTop:2 }}>
                                  {en.school_year}{en.semester ? ` · ${en.semester === "1st" ? "1st Sem" : "2nd Sem"}` : ""}{en.strand ? ` · ${en.strand}` : ""}
                                </div>
                              </div>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <span style={{ fontSize:11, fontWeight:700, color:sc.color, background:sc.bg, padding:"2px 10px", borderRadius:50 }}>
                                {sc.label}
                              </span>
                              <i className="ti ti-chevron-right" style={{ fontSize:14, color:"#8a6a6a" }} />
                            </div>
                          </motion.div>
                        );
                      })}
                    </>)}

                    {/* LEDGER TAB */}
                    {activeTab === "ledger" && (<>
                      {ledgerLoading && (
                        <SectionCard title="Financial History" icon="ti-receipt"
                          motionProps={{ initial:{ opacity:0 }, animate:{ opacity:1 }, transition:{ duration:0.18 } }}>
                          <div style={{ display:"flex", flexDirection:"column", gap:10, padding:"8px 0" }}>
                            {[1,2,3].map((k) => <Sk key={k} h={52} r={10} />)}
                          </div>
                        </SectionCard>
                      )}
                      {!ledgerLoading && ledger?.forbidden && (
                        <SectionCard title="Financial History" icon="ti-receipt"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ duration:0.22 } }}>
                          <EmptySection message="Financial history is only visible to billing staff." />
                        </SectionCard>
                      )}
                      {!ledgerLoading && ledger?.error && (
                        <SectionCard title="Financial History" icon="ti-receipt"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ duration:0.22 } }}>
                          <EmptySection message="Failed to load financial history. Check that the billing service is running." />
                        </SectionCard>
                      )}
                      {!ledgerLoading && ledger && !ledger.error && ledger.school_years?.length === 0 && (
                        <SectionCard title="Financial History" icon="ti-receipt"
                          motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ duration:0.22 } }}>
                          <EmptySection message="No invoices found for this student." />
                        </SectionCard>
                      )}
                      {!ledgerLoading && ledger && !ledger.error && ledger.school_years?.length > 0 && (<>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                          {[
                            { label:"Total Billed",  value:ledger.total_billed,   color:"#1a0a0a", bg:"#fff8f6", border:"#f5eaea" },
                            { label:"Total Paid",    value:ledger.total_paid,     color:"#2e6b0d", bg:"#f0faf0", border:"#d4edda" },
                            { label:"Total Balance", value:ledger.total_balance,  color:parseFloat(ledger.total_balance) > 0 ? "#c92a2a" : "#2e6b0d", bg:parseFloat(ledger.total_balance) > 0 ? "#fff0f0" : "#f0faf0", border:parseFloat(ledger.total_balance) > 0 ? "#fca5a5" : "#d4edda" },
                          ].map(({ label, value, color, bg, border }, i) => (
                            <motion.div
                              key={label}
                              initial={{ opacity:0, y:10 }}
                              animate={{ opacity:1, y:0 }}
                              transition={{ delay: i * 0.06, duration:0.22 }}
                              style={{ background:bg, border:`1px solid ${border}`, borderRadius:12, padding:"14px 18px" }}
                            >
                              <div style={{ fontSize:10, fontWeight:700, color:"#8a6a6a", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>{label}</div>
                              <div style={{ fontSize:18, fontWeight:800, color }}>
                                ₱{parseFloat(value).toLocaleString("en-PH", { minimumFractionDigits:2 })}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                        {ledger.school_years.map((yr, yi) => {
                          const balanceAmt = parseFloat(yr.year_balance);
                          const yrStatusColor = balanceAmt > 0 ? "#c92a2a" : "#2e6b0d";
                          const yrStatusBg    = balanceAmt > 0 ? "#fde8e8" : "#e8f5e0";
                          const levelLabel    = yr.school_level?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                          return (
                            <SectionCard
                              key={yr.school_year}
                              title={`SY ${yr.school_year} — ${yr.grade_level}`}
                              icon="ti-calendar"
                              motionProps={{ initial:{ opacity:0, y:10 }, animate:{ opacity:1, y:0 }, transition:{ delay: 0.18 + yi * 0.07, duration:0.22 } }}
                              badge={
                                <span style={{ fontSize:11, fontWeight:700, color:yrStatusColor, background:yrStatusBg, padding:"2px 10px", borderRadius:50 }}>
                                  {balanceAmt > 0 ? `Balance ₱${balanceAmt.toLocaleString("en-PH", { minimumFractionDigits:2 })}` : "Settled"}
                                </span>
                              }
                            >
                              <div style={{ fontSize:11, color:"#8a6a6a", marginBottom:10 }}>
                                {levelLabel}{yr.section ? ` · ${yr.section}` : ""} · <span style={{ fontWeight:600 }}>{yr.enrollment_status}</span>
                              </div>
                              {yr.invoices.length === 0 ? (
                                <EmptySection message="No invoices for this school year." />
                              ) : yr.invoices.map((inv) => {
                                const INV_STATUS = {
                                  unpaid:         { label:"Unpaid",  color:"#a32d2d", bg:"#fde8e8" },
                                  partially_paid: { label:"Partial", color:"#854f0b", bg:"#faeeda" },
                                  paid:           { label:"Paid",    color:"#2e6b0d", bg:"#e8f5e0" },
                                  void:           { label:"Void",    color:"#5c5752", bg:"#f0ede8" },
                                };
                                const isMeta = INV_STATUS[inv.status] ?? INV_STATUS.unpaid;
                                const netAmt  = parseFloat(inv.net_amount || 0);
                                const paidAmt = parseFloat(inv.total_paid || 0);
                                const balAmt  = netAmt - paidAmt;
                                return (
                                  <motion.div
                                    key={inv.invoice_id}
                                    whileHover={{ boxShadow:"0 3px 12px rgba(224,49,49,0.10)" }}
                                    onClick={() => navigate(`/invoices?selected=${inv.invoice_id}`)}
                                    style={{ border:"1px solid #f5eaea", borderRadius:10, padding:"12px 16px", marginBottom:8, cursor:"pointer" }}
                                  >
                                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                        <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>{inv.invoice_no}</span>
                                        <span style={{ fontSize:10, fontWeight:700, color:isMeta.color, background:isMeta.bg, padding:"2px 8px", borderRadius:50 }}>{isMeta.label}</span>
                                      </div>
                                      <span style={{ fontSize:11, color:"#8a6a6a" }}>
                                        {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString("en-PH", { month:"short", day:"numeric", year:"numeric" }) : "—"}
                                        {" · "}{inv.payment_plan?.replace(/_/g, " ")}
                                      </span>
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                                      {[
                                        { label:"Billed",  value:netAmt,  color:"#1a0a0a" },
                                        { label:"Paid",    value:paidAmt, color:"#2e6b0d" },
                                        { label:"Balance", value:balAmt,  color:balAmt > 0 ? "#c92a2a" : "#2e6b0d" },
                                      ].map(({ label, value, color }) => (
                                        <div key={label}>
                                          <div style={{ fontSize:9.5, fontWeight:700, color:"#8a6a6a", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
                                          <div style={{ fontSize:13, fontWeight:700, color }}>₱{value.toLocaleString("en-PH", { minimumFractionDigits:2 })}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </motion.div>
                                );
                              })}
                              <div style={{ display:"flex", justifyContent:"flex-end", gap:20, paddingTop:8, borderTop:"1px dashed #f0e4e4", marginTop:4 }}>
                                {[
                                  { label:"Year Billed",  value:yr.year_billed  },
                                  { label:"Year Paid",    value:yr.year_paid    },
                                  { label:"Year Balance", value:yr.year_balance, bold:true, color:balanceAmt > 0 ? "#c92a2a" : "#2e6b0d" },
                                ].map(({ label, value, bold, color }) => (
                                  <div key={label} style={{ textAlign:"right" }}>
                                    <div style={{ fontSize:9.5, color:"#8a6a6a", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>{label}</div>
                                    <div style={{ fontSize:13, fontWeight:bold ? 800 : 600, color:color || "#1a0a0a" }}>
                                      ₱{parseFloat(value).toLocaleString("en-PH", { minimumFractionDigits:2 })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </SectionCard>
                          );
                        })}
                      </>)}
                    </>)}

                </TabPanel>

              </>
            )}
          </div>

          <AnimatePresence>
            {linkGuardian && (
              <LinkAccountModal
                key="link-guardian-modal"
                guardian={linkGuardian}
                onClose={() => setLinkGuardian(null)}
                onLinked={(updated) =>
                  setGuardians((prev) => prev.map((x) => x.guardian_id === updated.guardian_id ? { ...x, ...updated } : x))
                }
              />
            )}
          </AnimatePresence>
    </>
  );
}
