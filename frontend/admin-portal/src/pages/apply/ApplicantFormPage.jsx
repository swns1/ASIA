// ApplicantFormPage — the public student information form an applicant
// fills in themselves, on a front-desk device handed over ("walk_in") or
// their own phone/laptop via a link ("remote"). Access is gated by a
// staff-issued invite (link) + a separately-delivered access code — see
// backend intake/views.py and the plan. Nothing here writes to the student
// master directly: submission produces a StudentApplication for a
// registrar to review at /student-applications.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";

import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import FullPageMessage from "../../components/ui/FullPageMessage";
import { ConfirmDialog } from "../../components/ui/Modal";
import { Field, Input } from "../../components/FormField";
import {
  StepBar, StudentStep, HouseholdStep, GuardiansStep, SiblingsStep, SchoolsStep, ReviewStep,
} from "../student-form/StudentFormSteps";
import { emptyStudent, emptyHousehold } from "../student-form/formShapes";
import { verifyApplicantCode, saveApplicationDraft, submitApplication } from "../../api/applyApi";
import useIdleReset from "../../hooks/useIdleReset";
import { clearAuthSession } from "../../utils/auth";

// Deliberately its own list, NOT StudentFormSteps.jsx's exported STEPS —
// that one includes "documents", and there is no document upload here in
// v1 (the applicant is physically at the school for anything that needs a
// paper original; see the plan's decision 6). Same {id, label, icon} shape,
// passed to StepBar via its `steps` prop.
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
const IDLE_WARN_MS = 30 * 1000;
// How long the success screen shows the reference before clearing itself
// for the next family — walk-in only; a remote applicant isn't handing the
// device to anyone.
const SUCCESS_RETURN_SECONDS = 20;
const AUTOSAVE_DEBOUNCE_MS = 3000;
// Five taps on the header within this window un-kiosks the device without
// needing to clear site data by hand.
const EXIT_TAP_COUNT = 5;
const EXIT_TAP_WINDOW_MS = 2500;

function sessionKey(inviteId) {
  return `applicant_session_${inviteId}`;
}

function fromPayload(payload) {
  const p = payload || {};
  return {
    student: { ...emptyStudent, ...(p.student || {}) },
    household: { ...emptyHousehold, ...(p.household || {}) },
    guardians: p.guardians || [],
    siblings: p.siblings || [],
    schools: p.previous_schools || [],
  };
}

export default function ApplicantFormPage() {
  const { inviteId } = useParams();
  const navigate = useNavigate();

  // gate: entering the access code. handover: walk-in confirm before
  // handing the device over. form: the six steps. success: submitted.
  // expired: the session token was rejected (revoked invite, TTL, etc).
  const [phase, setPhase] = useState("gate");

  const [code, setCode] = useState("");
  const [gateError, setGateError] = useState("");
  const [gateBusy, setGateBusy] = useState(false);
  const [applicantName, setApplicantName] = useState("");
  const [mode, setMode] = useState("remote");
  const [token, setToken] = useState(null);

  const [step, setStep] = useState(0);
  const [student, setStudent] = useState(emptyStudent);
  const [household, setHousehold] = useState(emptyHousehold);
  const [guardians, setGuardians] = useState([]);
  const [siblings, setSiblings] = useState([]);
  const [schools, setSchools] = useState([]);
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState("");
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [countdown, setCountdown] = useState(SUCCESS_RETURN_SECONDS);

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
      setMode(res.mode || "remote");
      sessionStorage.setItem(sessionKey(inviteId), JSON.stringify({ token: res.token, mode: res.mode }));
      hydrateFrom(res.payload, res.revision);
      setStep(0);
      setConfirmed(false);

      const staffLoggedIn = !!sessionStorage.getItem("access_token");
      setPhase(res.mode === "walk_in" && staffLoggedIn ? "handover" : "form");
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
    // decision 5: arming a walk-in device signs the staff member out on
    // it — a parent left alone with the tablet must land on /login, not
    // inside the admin portal, if they poke at the browser chrome.
    clearAuthSession();
    setPhase("form");
  };

  // ── Autosave ───────────────────────────────────────────────────────────
  const currentPayload = useMemo(() => ({
    student, household, guardians, siblings, previous_schools: schools,
  }), [student, household, guardians, siblings, schools]);

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
          setSaveState("saved");
        }
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(autosaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- token/revision/hydrateFrom are stable per draft; re-running on every payload keystroke change is the point
  }, [currentPayload, phase]);

  // ── Reset back to the welcome/gate screen ─────────────────────────────
  const resetToGate = useCallback(() => {
    sessionStorage.removeItem(sessionKey(inviteId));
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
    setStep(0);
    setConfirmed(false);
    setSubmitError("");
  }, [inviteId]);

  // ── Idle reset — walk-in only; never enabled in remote mode (see the
  // hook's own docstring: timing someone out on their own sofa is just
  // data loss). ──
  useIdleReset({
    timeoutMs: IDLE_TIMEOUT_MS,
    warnMs: IDLE_WARN_MS,
    enabled: phase === "form" && mode === "walk_in" && !submitting,
    onWarn: () => setShowIdleWarning(true),
    onResume: () => setShowIdleWarning(false),
    onReset: () => {
      setShowIdleWarning(false);
      resetToGate();
    },
  });

  // ── Success screen countdown (walk-in only) ───────────────────────────
  useEffect(() => {
    if (phase !== "success" || mode !== "walk_in") return undefined;
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
  }, [phase, mode]);

  // ── Hidden exit gesture ────────────────────────────────────────────────
  const handleHeaderTap = () => {
    const now = Date.now();
    exitTaps.current = [...exitTaps.current, now].filter((t) => now - t < EXIT_TAP_WINDOW_MS);
    if (exitTaps.current.length >= EXIT_TAP_COUNT) {
      exitTaps.current = [];
      sessionStorage.removeItem(sessionKey(inviteId));
      navigate("/login", { replace: true });
    }
  };

  // ── Step navigation ────────────────────────────────────────────────────
  const isLastStep = step === APPLICANT_STEPS.length - 1;
  const next = () => setStep((s) => Math.min(s + 1, APPLICANT_STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const validate = () => {
    if (!student.first_name?.trim()) return "First name is required.";
    if (!student.last_name?.trim()) return "Last name is required.";
    if (!student.sex) return "Sex is required.";
    if (!student.birth_date) return "Birth date is required.";
    if (new Date(student.birth_date) > new Date()) return "Birth date cannot be in the future.";
    if (student.lrn?.trim() && !/^\d{12}$/.test(student.lrn.trim())) {
      return "LRN must be exactly 12 digits — leave it blank if one hasn't been assigned yet.";
    }
    if (student.mobile_number?.trim() && !/^09\d{9}$/.test(student.mobile_number.trim())) {
      return "Mobile number must start with 09 and be 11 digits (e.g. 09XXXXXXXXX).";
    }
    if (!student.current_address?.trim()) return "Current address is required.";
    if (!student.permanent_address?.trim()) return "Permanent address is required.";
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

      const res = await submitApplication(inviteId, token);
      setReference(res.reference);
      sessionStorage.removeItem(sessionKey(inviteId));
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

          <div className="mb-3 flex items-center justify-end gap-1.5 text-xs text-[#7a5050]">
            {saveState === "saving" && (<><i className="ti ti-loader-2 animate-spin" /> Saving…</>)}
            {saveState === "saved" && (<><i className="ti ti-check text-[#2e7d32]" /> Saved</>)}
            {saveState === "error" && (<><i className="ti ti-alert-triangle text-[#c62828]" /> Couldn't save — check your connection</>)}
          </div>

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
                  <StudentStep data={student} onChange={setStudent} showStatus={false} lrnRequired={false} />
                )}
                {stepId === "household" && <HouseholdStep data={household} onChange={setHousehold} />}
                {stepId === "guardians" && <GuardiansStep data={guardians} onChange={setGuardians} />}
                {stepId === "siblings" && <SiblingsStep data={siblings} onChange={setSiblings} />}
                {stepId === "schools" && <SchoolsStep data={schools} onChange={setSchools} />}
                {stepId === "review" && (
                  <div>
                    <ReviewStep
                      student={student} household={household} guardians={guardians}
                      siblings={siblings} schools={schools}
                      pendingUploads={[]} existingDocs={[]} isEdit={false}
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
        <FullPageMessage
          icon="ti-circle-check"
          tone="brand"
          title="Application submitted"
          message={
            <>
              Reference <strong>{reference}</strong>. Please hand the device back to a staff member,
              who will review your application and follow up with next steps.
              {mode === "walk_in" && (
                <span className="mt-2 block text-xs text-[#7a5050]">
                  Returning to the start in {countdown}s…
                </span>
              )}
            </>
          }
          actions={mode === "walk_in" ? (
            <Button variant="secondary" onClick={resetToGate}>Done</Button>
          ) : undefined}
        />
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
