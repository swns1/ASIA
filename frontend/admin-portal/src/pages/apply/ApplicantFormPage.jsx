// ApplicantFormPage — the public student information form an applicant
// fills in themselves: on their own phone (on the school Wi-Fi, after
// scanning the QR code the registrar shows them) or on a front-desk device a
// registrar hands over. Access is gated by a staff-issued invite (link) + a
// separately delivered access code — see backend intake/views.py. Nothing
// here writes to the student master directly: submission produces a
// StudentApplication for a registrar to review at /student-applications.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";

import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import FullPageMessage from "../../components/ui/FullPageMessage";
import { ConfirmDialog } from "../../components/ui/Modal";
import { Field, Input, Select } from "../../components/FormField";
import {
  StepBar, StudentStep, HouseholdStep, GuardiansStep, SiblingsStep, SchoolsStep, ReviewStep,
} from "../student-form/StudentFormSteps";
import { emptyStudent, emptyHousehold } from "../student-form/formShapes";
import {
  GRADE_LEVELS_BY_LEVEL, LEVEL_LABELS, SHS_STRANDS, schoolLevelForGrade,
} from "../../constants/schoolLevels";
import { verifyApplicantCode, saveApplicationDraft, submitApplication } from "../../api/applyApi";
import useIdleReset from "../../hooks/useIdleReset";
import { clearAuthSession } from "../../utils/auth";
import { lrn as lrnCheck, mobileNumber, birthDate } from "../../utils/validation";

// Its own list rather than StudentFormSteps.jsx's exported STEPS. The two
// happen to match today (STEPS used to carry a "documents" step, which is why
// they were split), but they are free to diverge: there is no document upload
// here, because an applicant is physically at the school for anything needing
// a paper original. Same {id, label, icon} shape, passed to StepBar as `steps`.
const APPLICANT_STEPS = [
  { id: "student",   label: "Student",       icon: "ti-user" },
  { id: "household", label: "Household",     icon: "ti-home" },
  { id: "guardians", label: "Guardians",     icon: "ti-users" },
  { id: "siblings",  label: "Siblings",      icon: "ti-friends" },
  { id: "schools",   label: "Prev. Schools", icon: "ti-school" },
  { id: "review",    label: "Review",        icon: "ti-clipboard-check" },
];

// A parent pausing to read a field or ask their spouse a question easily
// hits 60-90s; 3 minutes with a 30s warning gives real room without
// leaving a device tied up indefinitely between applicants.
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
// Used instead while an autosave is failing — see the useIdleReset call.
const IDLE_TIMEOUT_UNSAVED_MS = 10 * 60 * 1000;
const IDLE_WARN_MS = 30 * 1000;
// How long the success screen shows the reference before clearing itself
// for the next family walking up to the device.
const SUCCESS_RETURN_SECONDS = 20;
const AUTOSAVE_DEBOUNCE_MS = 3000;
// Five taps on the header within this window un-kiosks the device without
// needing to clear site data by hand.
const EXIT_TAP_COUNT = 5;
const EXIT_TAP_WINDOW_MS = 2500;

// Kiosk behaviour (idle reset, success countdown, "hand the device back")
// belongs on a school device a staff member armed, not on a parent's own
// phone. A device counts as armed once staff confirmed a hand-over on it, and
// stays armed for the tab's life: the hand-over signs staff out, so the next
// family's session on the same device would otherwise look like a phone.
// The five-tap exit disarms it.
const KIOSK_FLAG = "slis.kioskDevice";
function readKioskFlag() {
  try { return sessionStorage.getItem(KIOSK_FLAG) === "1"; } catch { return false; }
}
function writeKioskFlag(on) {
  try {
    if (on) sessionStorage.setItem(KIOSK_FLAG, "1");
    else sessionStorage.removeItem(KIOSK_FLAG);
  } catch { /* storage unavailable: kiosk mode just lasts for this page */ }
}

function fromPayload(payload) {
  const p = payload || {};
  return {
    student: { ...emptyStudent, ...(p.student || {}) },
    household: { ...emptyHousehold, ...(p.household || {}) },
    guardians: p.guardians || [],
    siblings: p.siblings || [],
    schools: p.previous_schools || [],
    applyingFor: { ...emptyApplyingFor, ...(p.applying_for || {}) },
  };
}

// `section` is deliberately not asked for: it depends on class sizes, so
// the registrar assigns it when they create the real Enrollment. school_level
// isn't asked for either — it's derived from the grade, since a parent knows
// "Grade 7" but shouldn't have to know it's called junior high school here.
const emptyApplyingFor = { school_level: "", grade_level: "", strand: "" };

// The one enrollment-shaped question on an otherwise purely demographic form.
// Nothing here becomes student data (see intake/serializers.py's
// ALLOWED_APPLYING_FOR_FIELDS) — it rides along in payload_json so the
// registrar isn't left guessing which grade to enrol the learner into.
function ApplyingForStep({ data, onChange }) {
  const isSHS = data.school_level === "senior_highschool";

  const setGrade = (grade) => onChange({
    ...data,
    grade_level: grade,
    school_level: schoolLevelForGrade(grade) || "",
    // A strand only exists for senior high; drop a stale one if the family
    // corrects an SHS pick back down to, say, Grade 10.
    strand: schoolLevelForGrade(grade) === "senior_highschool" ? data.strand : "",
  });

  return (
    <div>
      <h2 className="mb-1 text-base font-bold text-[#1a0a0a]">What are you enrolling into?</h2>
      <p className="mb-4 text-sm text-[#7a5050]">
        The school will confirm the section after reviewing this form.
      </p>

      <Field label="Grade level applying for">
        <Select value={data.grade_level} onChange={(e) => setGrade(e.target.value)}>
          <option value="">Select a grade level…</option>
          {Object.entries(GRADE_LEVELS_BY_LEVEL).map(([level, grades]) => (
            <optgroup key={level} label={LEVEL_LABELS[level]}>
              {grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </optgroup>
          ))}
        </Select>
      </Field>

      {isSHS && (
        <Field label="Strand" hint="Ask a staff member if you're not sure which strand to choose.">
          <Select value={data.strand} onChange={(e) => onChange({ ...data, strand: e.target.value })}>
            <option value="">Select a strand…</option>
            {SHS_STRANDS.map((st) => <option key={st} value={st}>{st}</option>)}
          </Select>
        </Field>
      )}
    </div>
  );
}

// Fixed offsets rather than randomized on each mount — this is a one-time
// celebratory burst, not a system that needs to look different every time.
const CONFETTI = [
  { w: 8, h: 8,  color: "#e03131", x: -70, y: -40, r: 120  },
  { w: 6, h: 12, color: "#ff9800", x: 60,  y: -55, r: -80  },
  { w: 7, h: 7,  color: "#7c3aed", x: -90, y: 20,  r: 200  },
  { w: 6, h: 10, color: "#2196f3", x: 80,  y: 10,  r: -150 },
  { w: 7, h: 7,  color: "#4caf50", x: -30, y: -80, r: 90   },
  { w: 6, h: 11, color: "#e03131", x: 40,  y: -85, r: -100 },
  { w: 6, h: 6,  color: "#2e6b0d", x: -15, y: 90,  r: 60   },
  { w: 7, h: 11, color: "#ff9800", x: 20,  y: 95,  r: -60  },
];

// The kiosk's own success screen — the emotional payoff moment for a family
// finishing an application — rather than the generic app-wide
// FullPageMessage card, so it stays inside this page's cream/red identity
// instead of switching to neutral chrome for one screen.
function KioskSuccessScreen({ reference, countdown, onDone, kiosk }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="relative w-full max-w-md rounded-3xl border border-[#fde2de] bg-white p-9 text-center shadow-2xl">
        <div className="pointer-events-none absolute left-1/2 top-16">
          {CONFETTI.map((c, i) => (
            <motion.span
              key={i}
              className="absolute rounded-sm"
              style={{ width: c.w, height: c.h, background: c.color }}
              initial={{ opacity: 0, x: 0, y: 0, rotate: 0 }}
              animate={{ opacity: [0, 1, 0], x: c.x, y: c.y, rotate: c.r }}
              transition={{ duration: 1.1, delay: 0.4, ease: "easeOut" }}
            />
          ))}
        </div>

        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-success-50"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <motion.path
              d="M4 12.5l5.5 5.5L20 6.5"
              stroke="var(--color-success-500)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: 0.35, ease: "easeOut" }}
            />
          </svg>
        </motion.div>

        <h1 className="text-2xl font-bold text-[#1a0a0a]">Application submitted</h1>
        {kiosk ? (
          <>
            <p className="mt-2.5 text-base leading-relaxed text-[#7a5050]">
              Reference <strong className="text-[#1a0a0a]">{reference}</strong>. Please hand the device back to a staff
              member, who will review your application and follow up with next steps.
            </p>

            <div className="mt-6 flex flex-col items-center gap-2">
              <p className="text-xs font-semibold text-[#7a5050]">Returning to the start in {countdown}s…</p>
              <div className="h-1 w-40 overflow-hidden rounded-full bg-[#fde2de]">
                <div
                  className="h-full rounded-full bg-[#e03131] transition-[width] duration-1000 ease-linear"
                  style={{ width: `${(countdown / SUCCESS_RETURN_SECONDS) * 100}%` }}
                />
              </div>
              <Button variant="secondary" onClick={onDone} className="mt-3">Done</Button>
            </div>
          </>
        ) : (
          <p className="mt-2.5 text-base leading-relaxed text-[#7a5050]">
            Reference <strong className="text-[#1a0a0a]">{reference}</strong>. The Registrar will review your
            application and follow up with next steps. You can keep this screen as proof, then close this page.
          </p>
        )}
      </div>
    </div>
  );
}

export default function ApplicantFormPage() {
  const { inviteId } = useParams();
  const navigate = useNavigate();

  // gate: entering the access code. handover: staff confirm before handing
  // the device over. form: the six steps. success: submitted.
  // expired: the session token was rejected (revoked invite, TTL, etc).
  const [phase, setPhase] = useState("gate");

  const [code, setCode] = useState("");
  const [gateError, setGateError] = useState("");
  const [gateBusy, setGateBusy] = useState(false);
  const [applicantName, setApplicantName] = useState("");
  const [token, setToken] = useState(null);

  const [step, setStep] = useState(0);
  const [student, setStudent] = useState(emptyStudent);
  const [household, setHousehold] = useState(emptyHousehold);
  const [guardians, setGuardians] = useState([]);
  const [siblings, setSiblings] = useState([]);
  const [schools, setSchools] = useState([]);
  const [applyingFor, setApplyingFor] = useState(emptyApplyingFor);
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState("");
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [countdown, setCountdown] = useState(SUCCESS_RETURN_SECONDS);
  const [kioskMode, setKioskMode] = useState(readKioskFlag);

  const submittingRef = useRef(false);
  const autosaveTimer = useRef(null);
  const skipNextAutosave = useRef(true);
  const exitTaps = useRef([]);

  useEffect(() => {
    // Not usePageTitle: that hook falls back to "Staff Portal" branding
    // (via portalLabelFor(getCurrentUser()?.role)) when there's no logged
    // in user, which is wrong for a page an applicant is meant to see.
    document.title = "Student Information Form";
  }, []);

  const hydrateFrom = useCallback((payload, rev) => {
    const shaped = fromPayload(payload);
    skipNextAutosave.current = true;
    setStudent(shaped.student);
    setHousehold(shaped.household);
    setGuardians(shaped.guardians);
    setSiblings(shaped.siblings);
    setSchools(shaped.schools);
    setApplyingFor(shaped.applyingFor);
    setRevision(rev || 0);
  }, []);

  // ── Code gate ──────────────────────────────────────────────────────────
  const handleVerify = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setGateBusy(true);
    setGateError("");
    try {
      const res = await verifyApplicantCode(inviteId, code.trim());
      setToken(res.token);
      setApplicantName(res.applicant_full_name || "");
      hydrateFrom(res.payload, res.revision);
      setStep(0);
      setConfirmed(false);

      // The token stays in React state only. Persisting it would let the
      // next family land in this one's half-filled form by refreshing the
      // tab; resuming is meant to go back through the code gate, which
      // re-hydrates the draft server-side (see the `expired` screen).
      const staffLoggedIn = !!sessionStorage.getItem("access_token");
      setPhase(staffLoggedIn ? "handover" : "form");
    } catch (err) {
      const errCode = err.response?.data?.code;
      if (errCode === "invite_locked") {
        setGateError("Too many incorrect attempts. Please ask a staff member for a new link.");
      } else if (errCode === "invite_inactive") {
        setGateError("This invitation is no longer active. Please ask a staff member for help.");
      } else if (errCode === "invite_consumed") {
        setGateError("This form has already been submitted. Please ask a staff member if this seems wrong.");
      } else if (errCode === "invalid_code") {
        const remaining = err.response?.data?.attempts_remaining;
        setGateError(`Incorrect code.${remaining != null ? ` ${remaining} attempt(s) remaining.` : ""}`);
      } else {
        setGateError(err.message || "Something went wrong. Please try again.");
      }
    } finally {
      setGateBusy(false);
    }
  };

  const confirmHandover = () => {
    // decision 5: arming the device signs the staff member out on it — a
    // parent left alone with the tablet must land on /login, not inside the
    // admin portal, if they poke at the browser chrome.
    clearAuthSession();
    writeKioskFlag(true);
    setKioskMode(true);
    setPhase("form");
  };

  // ── Autosave ───────────────────────────────────────────────────────────
  const currentPayload = useMemo(() => ({
    student, household, guardians, siblings, previous_schools: schools,
    applying_for: applyingFor,
  }), [student, household, guardians, siblings, schools, applyingFor]);

  useEffect(() => {
    if (phase !== "form") return undefined;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return undefined;
    }

    setSaveState("saving");
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      try {
        const res = await saveApplicationDraft(inviteId, token, revision, currentPayload);
        if (res.conflict) {
          // Another tab/device saved this same draft first — reload what's
          // actually stored rather than overwriting it. See the plan's
          // concurrency table.
          hydrateFrom(res.payload, res.revision);
          setSaveState("saved");
          toast("This draft was updated elsewhere — reloaded the latest version.");
        } else {
          setRevision(res.revision);
          // Each save renews the session; without this the token from the
          // code gate expired two hours in, however recently they saved.
          if (res.token) setToken(res.token);
          setSaveState("saved");
        }
      } catch (err) {
        // A refused session is not a network blip: say so now, with the way
        // back (re-enter the code), rather than showing "couldn't save" until
        // they reach Submit.
        if (err.response?.data?.code === "applicant_token_invalid") {
          setPhase("expired");
          return;
        }
        setSaveState("error");
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(autosaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- token/revision/hydrateFrom are stable per draft; re-running on every payload keystroke change is the point
  }, [currentPayload, phase]);

  // ── Reset back to the welcome/gate screen ─────────────────────────────
  const resetToGate = useCallback(() => {
    clearTimeout(autosaveTimer.current);
    setToken(null);
    setPhase("gate");
    setCode("");
    setGateError("");
    setApplicantName("");
    setStudent(emptyStudent);
    setHousehold(emptyHousehold);
    setGuardians([]);
    setSiblings([]);
    setSchools([]);
    setApplyingFor(emptyApplyingFor);
    setStep(0);
    setConfirmed(false);
    setSubmitError("");
    setSaveState("idle");
  }, []);

  // ── Idle reset ─────────────────────────────────────────────────────────
  // While an autosave is failing, everything typed since the last good save
  // exists only in this tab — so the reset would throw it away rather than
  // merely clear the screen. That earns a longer window for a family who is
  // still here to fetch a staff member (the hook re-arms when timeoutMs
  // changes), but not an indefinite one: a device abandoned mid-form must
  // still clear itself rather than sit in the lobby showing their details.
  useIdleReset({
    timeoutMs: saveState === "error" ? IDLE_TIMEOUT_UNSAVED_MS : IDLE_TIMEOUT_MS,
    warnMs: IDLE_WARN_MS,
    enabled: kioskMode && phase === "form" && !submitting,
    onWarn: () => setShowIdleWarning(true),
    onResume: () => setShowIdleWarning(false),
    onReset: () => {
      setShowIdleWarning(false);
      resetToGate();
    },
  });

  // ── Success screen countdown ──────────────────────────────────────────
  useEffect(() => {
    if (phase !== "success" || !kioskMode) return undefined;
    setCountdown(SUCCESS_RETURN_SECONDS);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          resetToGate();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, kioskMode]);

  // ── Hidden exit gesture ────────────────────────────────────────────────
  const handleHeaderTap = () => {
    const now = Date.now();
    exitTaps.current = [...exitTaps.current, now].filter((t) => now - t < EXIT_TAP_WINDOW_MS);
    if (exitTaps.current.length >= EXIT_TAP_COUNT) {
      exitTaps.current = [];
      // Ask first. Five taps is a deliberate gesture, but it is five taps on a
      // header an applicant may well be touching, and leaving abandons whatever
      // has not autosaved in the last few seconds. The gate below is the same
      // one the handover and idle dialogs use.
      setShowExitConfirm(true);
    }
  };

  // ── Step navigation ────────────────────────────────────────────────────
  const isLastStep = step === APPLICANT_STEPS.length - 1;
  const next = () => setStep((s) => Math.min(s + 1, APPLICANT_STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const validate = () => {
    if (!applyingFor.grade_level) return "Please choose the grade level you're enrolling into.";
    if (applyingFor.school_level === "senior_highschool" && !applyingFor.strand) {
      return "Please choose a strand for senior high school.";
    }
    if (!student.first_name?.trim()) return "First name is required.";
    if (!student.last_name?.trim()) return "Last name is required.";
    if (!student.sex) return "Sex is required.";
    if (!student.birth_date) return "Birth date is required.";
    // Shared with StudentFormPage — the two paths write the same `students`
    // row and had drifted apart on which of these they each checked.
    const shapeError = birthDate(student.birth_date)
      || lrnCheck(student.lrn)
      || mobileNumber(student.mobile_number);
    if (shapeError) return shapeError;
    if (!student.current_address?.trim()) return "Current address is required.";
    if (!student.permanent_address?.trim()) return "Permanent address is required.";
    // Same rule as the counter form and the server: someone to contact.
    if (!guardians.some((g) => g.full_name?.trim())) return "Please add at least one parent or guardian.";
    return null;
  };
  const validationError = validate();

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const err = validate();
    if (err) {
      setSubmitError(err);
      toast.error(err);
      return;
    }
    if (!confirmed) {
      setSubmitError("Please confirm the information is accurate before submitting.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      // Flush any pending debounced autosave first so the submit reflects
      // the very latest edit, not whatever was last saved 3s ago.
      clearTimeout(autosaveTimer.current);
      const saved = await saveApplicationDraft(inviteId, token, revision, currentPayload);
      if (saved.conflict) {
        // Someone/something else (another tab, another device on the same
        // invite) saved a newer version between the last autosave and this
        // submit. The backend's submit endpoint reads whatever is
        // CURRENTLY stored, not what this tab tried to save — proceeding
        // here would show "Application submitted!" for content the
        // applicant never actually confirmed. Reload the real state and
        // make them look again instead, same as the debounced autosave
        // handler already does for this exact conflict shape.
        hydrateFrom(saved.payload, saved.revision);
        setStep(APPLICANT_STEPS.length - 1);
        setConfirmed(false);
        const msg = "This application was updated elsewhere. Please review the reloaded information before submitting again.";
        setSubmitError(msg);
        toast(msg);
        return;
      }
      setRevision(saved.revision);
      if (saved.token) setToken(saved.token);

      const res = await submitApplication(inviteId, saved.token || token);
      setReference(res.reference);
      setPhase("success");
    } catch (err) {
      if (err.response?.data?.code === "applicant_token_invalid") {
        setPhase("expired");
      } else {
        const msg = err.message || "Something went wrong. Please try again.";
        setSubmitError(msg);
        toast.error(msg);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const stepId = APPLICANT_STEPS[step].id;

  return (
    <div className="applicant-form min-h-screen w-full" style={{ background: "#fff8f6" }}>
      <style>{`
        /* Touch-scale overrides for a shared, standing-height device.
           A scoped block rather than a Field size prop — Field's label is
           hardcoded text-xs with no size axis, and adding one for a single
           screen's benefit isn't worth the change to a ~50-call-site
           component. Precedent: StudentFormPage.jsx has its own scoped
           <style> block for a similar reason. */
        .applicant-form label { font-size: .8125rem !important; }
        .applicant-form input, .applicant-form select, .applicant-form textarea {
          min-height: 3.25rem; font-size: 1.0625rem;
        }
        .applicant-form button { min-height: 3.5rem; }
      `}</style>

      {phase === "gate" && (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md rounded-3xl border border-[#fde2de] bg-white p-9 shadow-2xl">
            <div
              className="mb-6 text-center cursor-default select-none"
              onClick={handleHeaderTap}
              title=""
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0f0]">
                <i className="ti ti-school text-2xl text-[#e03131]" aria-hidden="true" />
              </div>
              <h1 className="text-xl font-bold text-[#1a0a0a]">Student Information Form</h1>
              <p className="mt-1.5 text-sm text-[#7a5050]">
                Enter the access code a staff member gave you to begin.
              </p>
            </div>

            <form onSubmit={handleVerify}>
              <Field label="Access Code" error={gateError || undefined}>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. AB3D9K2M"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoFocus
                  style={{ letterSpacing: "0.15em", textAlign: "center", fontSize: "1.25rem", fontWeight: 700 }}
                />
              </Field>
              <Button type="submit" fullWidth loading={gateBusy} disabled={!code.trim()} className="mt-2">
                Continue
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-[#7a5050]">
              Don't have a code? Ask the school's front desk for help.
            </p>
          </div>
        </div>
      )}

      {phase === "handover" && (
        <ConfirmDialog
          icon="ti-device-tablet"
          title="Hand this device to the applicant?"
          message={`You'll be signed out on this device so ${applicantName || "the applicant"} can fill in their own information. Sign back in afterward to continue your work.`}
          confirmLabel="Hand over device"
          cancelLabel="Cancel"
          danger={false}
          onConfirm={confirmHandover}
          onCancel={() => setPhase("gate")}
        />
      )}

      {phase === "form" && (
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          <div className="mb-6 text-center" onClick={handleHeaderTap}>
            <h1 className="text-lg font-bold text-[#1a0a0a]">Student Information Form</h1>
            {applicantName && <p className="text-sm text-[#7a5050]">{applicantName}</p>}
          </div>

          <StepBar current={step} onStepClick={setStep} size="lg" steps={APPLICANT_STEPS} />

          <div className="mb-3 flex items-center justify-end gap-1.5 text-xs text-[#7a5050]" aria-live="polite">
            {saveState === "saving" && (<><i className="ti ti-loader-2 animate-spin" /> Saving…</>)}
            {saveState === "saved" && (<><i className="ti ti-check text-[#2e7d32]" /> Saved</>)}
          </div>

          {saveState === "error" && (
            <div className="mb-3">
              <Alert variant="error">
                Your answers aren't being saved right now — please tell a staff member before
                continuing. Nothing typed since the last save is stored yet, so don't close this page.
              </Alert>
            </div>
          )}

          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #fde2de", padding: "24px 28px", boxShadow: "0 4px 24px rgba(224,49,49,0.10)" }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={stepId}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
              >
                {stepId === "student" && (
                  <>
                    <ApplyingForStep data={applyingFor} onChange={setApplyingFor} />
                    <div className="my-6 border-t border-[#fde2de]" />
                    <StudentStep data={student} onChange={setStudent} showStatus={false} lrnRequired={false} />
                  </>
                )}
                {stepId === "household" && <HouseholdStep data={household} onChange={setHousehold} />}
                {stepId === "guardians" && <GuardiansStep data={guardians} onChange={setGuardians} />}
                {stepId === "siblings" && <SiblingsStep data={siblings} onChange={setSiblings} />}
                {stepId === "schools" && <SchoolsStep data={schools} onChange={setSchools} />}
                {stepId === "review" && (
                  <div>
                    {/* Not folded into ReviewStep: that component is shared
                        with the staff student form, which has nothing to do
                        with enrolling into a grade. */}
                    <div className="mb-5 rounded-xl border border-[#fde2de] bg-[#fff8f6] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#7a5050]">Enrolling into</p>
                      <p className="mt-0.5 text-sm font-semibold text-[#1a0a0a]">
                        {applyingFor.grade_level || "Not selected"}
                        {applyingFor.strand ? ` — ${applyingFor.strand}` : ""}
                      </p>
                    </div>
                    <ReviewStep
                      student={student} household={household} guardians={guardians}
                      siblings={siblings} schools={schools}
                    />
                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#fde2de] p-4">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                        style={{ marginTop: 3, width: 20, height: 20, flexShrink: 0 }}
                      />
                      <span className="text-sm text-[#1a0a0a]">
                        I confirm the information above is accurate to the best of my knowledge.
                      </span>
                    </label>
                    {submitError && <div className="mt-3"><Alert variant="error">{submitError}</Alert></div>}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="secondary" onClick={prev} disabled={step === 0}>
              <i className="ti ti-chevron-left" /> Back
            </Button>
            {isLastStep ? (
              <Button onClick={handleSubmit} loading={submitting} disabled={!confirmed}>
                Submit Application <i className="ti ti-send" />
              </Button>
            ) : (
              <Button onClick={next}>
                Next <i className="ti ti-chevron-right" />
              </Button>
            )}
          </div>

          {validationError && step === APPLICANT_STEPS.length - 1 && (
            <p className="mt-2 text-right text-xs text-[#c62828]">{validationError}</p>
          )}
        </div>
      )}

      {showExitConfirm && (
        <ConfirmDialog
          icon="ti-door-exit"
          title="Leave the applicant form?"
          message="This returns the device to the staff login. Anything typed since the last save is not stored yet."
          confirmLabel="Yes, leave"
          cancelLabel="Stay on the form"
          danger={false}
          onConfirm={() => { writeKioskFlag(false); navigate("/login", { replace: true }); }}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}

      {showIdleWarning && phase === "form" && (
        <ConfirmDialog
          icon="ti-clock"
          title="Still there?"
          message="This form will clear in 30 seconds if there's no activity, so the next family doesn't see your information."
          confirmLabel="I'm still here"
          cancelLabel="Clear now"
          danger={false}
          onConfirm={() => setShowIdleWarning(false)}
          onCancel={resetToGate}
        />
      )}

      {phase === "success" && (
        <KioskSuccessScreen reference={reference} countdown={countdown} onDone={resetToGate} kiosk={kioskMode} />
      )}

      {phase === "expired" && (
        <FullPageMessage
          icon="ti-lock"
          tone="warning"
          title="This session is no longer available"
          message="Your answers up to your last save are safe. Please enter your access code again to continue where you left off."
          actions={<Button onClick={resetToGate}>Enter code again</Button>}
        />
      )}
    </div>
  );
}
