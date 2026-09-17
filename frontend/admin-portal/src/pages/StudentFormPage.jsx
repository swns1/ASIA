import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import { mobileNumber, birthDate, email as emailCheck } from "../utils/validation";
import { localISODate } from "../utils/format";
import { getStudent, updateStudent } from "../api/studentApi";
import {
  createGuardian,
  updateGuardian,
  deleteGuardian,
  getGuardiansByStudent,
} from "../api/guardianApi";
import {
  createSibling,
  updateSibling,
  deleteSibling,
  getSiblingsByStudent,
} from "../api/siblingApi";
import {
  createPreviousSchool,
  updatePreviousSchool,
  deletePreviousSchool,
  getPreviousSchoolsByStudent,
} from "../api/previousSchoolApi";
import {
  getHouseholdByStudent,
  createHousehold,
  updateHousehold,
} from "../api/householdApi";
import { bulkCreateStudent } from "../api/studentApi";
import { ConfirmDialog } from "../components/ui/Modal";

import {
  STEPS, C, cardStyle,
  nullify, emptyStudent, emptyHousehold,
} from "./student-form/formShapes";
import {
  StepBar,
  StudentStep, HouseholdStep, GuardiansStep, SiblingsStep, SchoolsStep,
  ReviewStep,
} from "./student-form/StudentFormSteps";

// ─── Documents step helpers (mirrors RequirementsPage design) ────────────────






// ════════════════════════════════════════════════════════════════════════════
// DEBUG AUTOFILL  (only active in dev — stripped from production builds)
// ════════════════════════════════════════════════════════════════════════════

const DEV_FIRST_NAMES = ["Juan", "Maria", "Jose", "Ana", "Carlo", "Liza", "Mark", "Rosa", "Luis", "Nina"];
const DEV_MIDDLE_NAMES = ["Santos", "Reyes", "Cruz", "Garcia", "Lopez", "Gomez", "Torres", "Flores"];
const DEV_LAST_NAMES = ["Dela Cruz", "Ramos", "Fernandez", "Villanueva", "Aquino", "Bautista", "Mendoza", "Castillo"];
const DEV_RELIGIONS = ["Roman Catholic", "Iglesia ni Cristo", "Islam", "Born Again Christian", "Seventh Day Adventist"];
const DEV_BARANGAYS = ["Barangay Sta. Cruz", "Barangay San Jose", "Barangay Poblacion", "Barangay Bagong Lipunan", "Barangay Mabuhay"];
const DEV_CITIES = ["Quezon City", "Manila", "Pasig", "Marikina", "Caloocan"];
const DEV_SCHOOLS = ["Rizal Elementary School", "Mabini National High School", "San Jose Primary School", "Bonifacio Academy", "Katipunan Elementary School"];
const DEV_OCCUPATIONS = ["Teacher", "Engineer", "Nurse", "Driver", "Vendor", "Overseas Worker", "Farmer"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function genDevData() {
  const rnd2 = () => String(Math.floor(Math.random() * 90) + 10);
  const lrn = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
  const mobile = "09" + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");

  // Age between 6 and 18
  const ageYears = 6 + Math.floor(Math.random() * 13);
  const bDate = new Date();
  bDate.setFullYear(bDate.getFullYear() - ageYears);
  bDate.setMonth(Math.floor(Math.random() * 12));
  bDate.setDate(1 + Math.floor(Math.random() * 28));
  const birth_date = localISODate(bDate);

  const city = pick(DEV_CITIES);
  const brgy = pick(DEV_BARANGAYS);
  const address = `${rnd2()} ${brgy}, ${city}`;

  const firstName = pick(DEV_FIRST_NAMES);
  const lastName = pick(DEV_LAST_NAMES);

  const student = {
    lrn,
    first_name: firstName,
    middle_name: pick(DEV_MIDDLE_NAMES),
    last_name: lastName,
    suffix: "",
    sex: Math.random() > 0.5 ? "male" : "female",
    birth_date,
    religion: pick(DEV_RELIGIONS),
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s/g, "")}@email.com`,
    mobile_number: mobile,
    current_address: address,
    permanent_address: address,
    status: "active",
  };

  const household = {
    parent_marital_status: pick(["married", "single_parent", "separated", "widowed"]),
    living_arrangement: pick(["both_parents", "mother_only", "father_only", "guardian"]),
    is_4ps_beneficiary: false,
    four_ps_id: "",
  };

  const guardianMobile = "09" + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
  const gFirst = pick(DEV_FIRST_NAMES);
  const gLast = lastName;
  const guardians = [{
    relationship: pick(["mother", "father", "guardian"]),
    full_name: `${gFirst} ${gLast}`,
    occupation: pick(DEV_OCCUPATIONS),
    email_address: `${gFirst.toLowerCase()}.${gLast.toLowerCase().replace(/\s/g, "")}@email.com`,
    mobile_number: guardianMobile,
    is_primary_contact: true,
  }];

  const sibFirst = pick(DEV_FIRST_NAMES);
  const siblings = [{
    full_name: `${sibFirst} ${lastName}`,
    age: String(2 + Math.floor(Math.random() * 16)),
  }];

  const schools = [{
    school_name: pick(DEV_SCHOOLS),
    school_address: `${pick(DEV_BARANGAYS)}, ${pick(DEV_CITIES)}`,
  }];

  return { student, household, guardians, siblings, schools };
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function StudentFormPage() {
  usePageTitle("Student Form");
  const { id } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [student, setStudent] = useState(emptyStudent);
  const [household, setHousehold] = useState(emptyHousehold);
  const [guardians, setGuardians] = useState([]);
  const [siblings, setSiblings] = useState([]);
  const [schools, setSchools] = useState([]);

  // Documents are no longer collected here. The step existed so OCR could
  // extract a PSA birth certificate and prefill these fields; every
  // requirement type is VERIFY now (backend ocr/policy.py), so it prefilled
  // nothing, parked files against a student that did not exist yet, and
  // swallowed any upload failure into a console warning while telling the
  // user the student had been created. Documents now live on the enrollment,
  // where the completeness gate actually blocks a registrar, and on
  // /requirements — both through RequirementDocumentsPanel.

  // Track which existing records were removed in edit mode (so we can DELETE them on submit)
  const [removedGuardianIds, setRemovedGuardianIds] = useState([]);
  const [removedSiblingIds, setRemovedSiblingIds] = useState([]);
  const [removedSchoolIds, setRemovedSchoolIds] = useState([]);

  // Track the original household id (if any) so we know whether to PUT or POST
  const [householdId, setHouseholdId] = useState(null);

  // Shown after successfully creating a new student, offering to jump straight into enrollment
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  const DRAFT_KEY = "student_form_draft";
  const isNewStudent = !id;

  // ── Draft persistence (new student only) ─────────────────────────────────────
  // Restore draft on mount
  useEffect(() => {
    if (!isNewStudent) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.student)   setStudent(draft.student);
      if (draft.household) setHousehold(draft.household);
      if (draft.guardians) setGuardians(draft.guardians);
      if (draft.siblings)  setSiblings(draft.siblings);
      if (draft.schools)   setSchools(draft.schools);
      // Clamp: a draft saved before the Documents step was removed can
      // carry a step index this form no longer has, which would render
      // a blank card with no way forward.
      if (draft.step != null) setStep(Math.min(draft.step, STEPS.length - 1));
    } catch { /* ignore corrupted draft */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save draft whenever form data changes
  useEffect(() => {
    if (!isNewStudent) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ student, household, guardians, siblings, schools, step }));
    } catch { /* ignore quota errors */ }
  }, [student, household, guardians, siblings, schools, step, isNewStudent]);

  function clearDraft() {
    sessionStorage.removeItem(DRAFT_KEY);
  }


  // ── Load existing data for edit mode ──
  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        // Student (keep updated_at so optimistic-locking check passes on update)
        const studentData = await getStudent(id);
        setStudent({ ...emptyStudent, ...studentData });

        // Household
        try {
          const hh = await getHouseholdByStudent(id);
          if (hh) {
            setHousehold({
              ...emptyHousehold,
              parent_marital_status: hh.parent_marital_status || "",
              living_arrangement: hh.living_arrangement || "",
              is_4ps_beneficiary: !!hh.is_4ps_beneficiary,
              four_ps_id: hh.four_ps_id || "",
            });
            setHouseholdId(hh.household_id || hh.id || null);
          }
        } catch {
          // Household may not exist yet — that's fine
        }

        // Guardians
        try {
          const gs = await getGuardiansByStudent(id);
          setGuardians(Array.isArray(gs) ? gs : (gs?.results || []));
        } catch { /* none */ }

        // Siblings
        try {
          const ss = await getSiblingsByStudent(id);
          setSiblings(Array.isArray(ss) ? ss : (ss?.results || []));
        } catch { /* none */ }

        // Previous Schools
        try {
          const ps = await getPreviousSchoolsByStudent(id);
          setSchools(Array.isArray(ps) ? ps : (ps?.results || []));
        } catch { /* none */ }
      } catch {
        setError("Failed to load student data.");
      }
    })();
  }, [id]);

  // ── Wrapped setters that track removed items in edit mode ──
  const handleGuardiansChange = (next) => {
    if (id) {
      const removed = guardians.filter(
        (g) => g.guardian_id && !next.find((n) => n.guardian_id === g.guardian_id)
      );
      if (removed.length) {
        setRemovedGuardianIds((prev) => [
          ...prev,
          ...removed.map((g) => g.guardian_id),
        ]);
      }
    }
    setGuardians(next);
  };

  const handleSiblingsChange = (next) => {
    if (id) {
      const removed = siblings.filter(
        (s) => s.sibling_id && !next.find((n) => n.sibling_id === s.sibling_id)
      );
      if (removed.length) {
        setRemovedSiblingIds((prev) => [
          ...prev,
          ...removed.map((s) => s.sibling_id),
        ]);
      }
    }
    setSiblings(next);
  };

  const handleSchoolsChange = (next) => {
    if (id) {
      const removed = schools.filter(
        (s) =>
          s.previous_school_id &&
          !next.find((n) => n.previous_school_id === s.previous_school_id)
      );
      if (removed.length) {
        setRemovedSchoolIds((prev) => [
          ...prev,
          ...removed.map((s) => s.previous_school_id),
        ]);
      }
    }
    setSchools(next);
  };

  function fillDevData() {
    const d = genDevData();
    setStudent(d.student);
    setHousehold(d.household);
    setGuardians(d.guardians);
    setSiblings(d.siblings);
    setSchools(d.schools);
  }

  const [stepDir, setStepDir] = useState(1); // 1 = forward, -1 = backward
  const prevStepRef  = useRef(step);

  const next = () => {
    setStepDir(1);
    prevStepRef.current = step;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const prev = () => {
    setStepDir(-1);
    prevStepRef.current = step;
    setStep((s) => Math.max(s - 1, 0));
  };

  // Detect whether the household section has any meaningful content
  const householdHasContent = (h) =>
    !!(h.parent_marital_status || h.living_arrangement || h.is_4ps_beneficiary);

  // ── Client-side validation ───────────────────────────────────────────────────
  // Returns { step, message } for the first violation, or null if all valid.
  function validate() {
    const s = student;

    // Step 1 — Student
    // Kept granular rather than folded into validation.js's `lrn` helper:
    // staff typing at the counter get told which part is wrong. Same rule as
    // LRN_RE there and as students/validators.py server-side.
    if (!s.lrn?.trim())
      return { step: 0, message: "LRN is required." };
    if (!/^\d+$/.test(s.lrn.trim()))
      return { step: 0, message: "LRN must contain only numbers." };
    if (s.lrn.trim().length !== 12)
      return { step: 0, message: "LRN must be exactly 12 digits." };
    if (!s.first_name?.trim())
      return { step: 0, message: "First name is required." };
    if (!s.last_name?.trim())
      return { step: 0, message: "Last name is required." };
    if (!s.birth_date)
      return { step: 0, message: "Birth date is required." };
    if (!s.current_address?.trim())
      return { step: 0, message: "Current address is required." };
    if (!s.permanent_address?.trim())
      return { step: 0, message: "Permanent address is required." };

    // Shared with the public ApplicantFormPage — both write the same
    // `students` row, and the LRN rule in particular used to exist only on
    // that side, so a staff member at the counter could save a malformed
    // national learner identifier that a self-filling parent could not.
    const shapeError = birthDate(s.birth_date)
      || mobileNumber(s.mobile_number)
      || emailCheck(s.email);
    if (shapeError) return { step: 0, message: shapeError };

    // Step 2 — Household
    if (household.is_4ps_beneficiary && !household.four_ps_id?.trim())
      return { step: 1, message: "4Ps ID is required when 4Ps beneficiary is enabled." };

    // Step 3 — Guardians
    for (let i = 0; i < guardians.length; i++) {
      if (!guardians[i].full_name?.trim())
        return { step: 2, message: `Guardian ${i + 1} has no name — fill it in or remove it.` };
    }

    return null;
  }

  // True when all required fields pass — used to disable the submit button.
  const isFormValid = validate() === null;

  // Prevents double-submit even before React re-renders `loading` state.
  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const violation = validate();
    if (violation) {
      setStep(violation.step);
      setError(violation.message);
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setError("");
    let newStudentId = null;
    try {
      const nullableStudentFields = ["middle_name", "suffix", "religion", "email", "mobile_number"];
      const nullableGuardianFields = ["occupation", "email_address", "mobile_number"];
      const nullableHouseholdFields = ["parent_marital_status", "living_arrangement", "four_ps_id"];

      // student payload — KEEP updated_at so the optimistic-lock check passes
      const studentPayload = nullify(student, nullableStudentFields);

      if (id) {
        // ════════════════════════════════════════════════════════
        // EDIT MODE
        // ════════════════════════════════════════════════════════

        // 1) Update student (updated_at is included in studentPayload from getStudent)
        await updateStudent(id, studentPayload);

        // 2) Household — create or update depending on whether one already exists
        if (householdHasContent(household)) {
          const hhPayload = nullify({ ...household }, nullableHouseholdFields);
          if (householdId) {
            await updateHousehold(householdId, hhPayload);
          } else {
            const created = await createHousehold(hhPayload);
            const createdId = created.household_id || created.id || null;
            setHouseholdId(createdId);
            // Link the new household to the student
            if (createdId) await updateStudent(id, { ...studentPayload, household: createdId });
          }
        }

        // 3) Guardians — update existing, create new, delete removed
        for (const g of guardians) {
          const payload = nullify({ ...g, student: id }, nullableGuardianFields);
          if (g.guardian_id) {
            await updateGuardian(g.guardian_id, payload);
          } else if (g.full_name?.trim()) {
            await createGuardian(payload);
          }
        }
        // Removal failures are collected rather than swallowed. A failed
        // delete means the record the user just removed from the form is
        // still attached to the student — silently ignoring that told them
        // the save had succeeded and left a guardian, sibling or previous
        // school on the record that they believe is gone. Saving continues so
        // a single failure doesn't abandon the rest of a non-transactional
        // multi-request save half-done; the user is told at the end.
        const failedRemovals = [];
        for (const gid of removedGuardianIds) {
          try { await deleteGuardian(gid); } catch { failedRemovals.push("guardian"); }
        }

        // 4) Siblings — update existing, create new, delete removed
        for (const s of siblings) {
          if (!s.full_name?.trim()) continue;
          const siblingPayload = {
            student: id,
            full_name: s.full_name,
            age: s.age ? parseInt(s.age) : null,
          };
          if (s.sibling_id) {
            await updateSibling(s.sibling_id, siblingPayload);
          } else {
            await createSibling(siblingPayload);
          }
        }
        for (const sid of removedSiblingIds) {
          try { await deleteSibling(sid); } catch { failedRemovals.push("sibling"); }
        }

        // 5) Previous schools — update existing, create new, delete removed
        for (const s of schools) {
          if (!s.school_name?.trim()) continue;
          const schoolPayload = {
            student: id,
            school_name: s.school_name,
            school_address: s.school_address,
          };
          if (s.previous_school_id) {
            await updatePreviousSchool(s.previous_school_id, schoolPayload);
          } else {
            await createPreviousSchool(schoolPayload);
          }
        }
        for (const psid of removedSchoolIds) {
          try { await deletePreviousSchool(psid); } catch { failedRemovals.push("previous school"); }
        }

        if (failedRemovals.length) {
          const unique = [...new Set(failedRemovals)].join(", ");
          toast.error(
            `Saved, but ${failedRemovals.length} removed record(s) could not be deleted (${unique}). ` +
            `They are still attached to this student — please try removing them again.`,
            { duration: 8000 }
          );
        }
      } else {
        // ════════════════════════════════════════════════════════
        // CREATE MODE — use the bulk endpoint
        // ════════════════════════════════════════════════════════
        // One call, one transaction. Siblings and previous schools used to be
        // created here in a client-side loop *after* the student existed, so a
        // failure partway through saved the student, lost the siblings, and --
        // because `lrn` is UNIQUE -- left a retry that could never succeed.
        // The endpoint now writes all of it atomically, so a failure means
        // nothing was created and pressing Save again simply works.
        const bulkPayload = {
          student: studentPayload,
          household: householdHasContent(household)
            ? nullify(household, nullableHouseholdFields)
            : null,
          guardians: guardians.filter((g) => g.full_name?.trim()).map((g) => nullify(g, nullableGuardianFields)),
          siblings: siblings
            .filter((s) => s.full_name?.trim())
            .map((s) => ({ full_name: s.full_name, age: s.age ? parseInt(s.age) : null })),
          previous_schools: schools
            .filter((s) => s.school_name?.trim())
            .map((s) => ({ school_name: s.school_name, school_address: s.school_address })),
        };

        const result = await bulkCreateStudent(bulkPayload);
        newStudentId = result.student.student_id;
      }

      clearDraft();
      if (id) {
        toast.success("Student updated.");
        navigate("/students");
      } else {
        // Registration and enrolment are one process, not two errands. A
        // student with no enrolment has no section, appears in no SF1 or SF2
        // and can be given no grades -- and nothing else in the app says so,
        // which is exactly how one gets forgotten. `replace` because the form
        // behind us has already been submitted: Back must reach /students, not
        // a filled-in form that would create a second record.
        toast.success("Student created — now enroll them.");
        navigate(`/enrollments/new?student=${newStudentId}&continuing=1`, { replace: true });
      }
    } catch (err) {
      const data = err?.response?.data;
      let msg;
      if (!data) {
        msg = err?.message || "Something went wrong. Please check your inputs.";
      } else if (typeof data === "string") {
        msg = data;
      } else {
        const stringifyError = (val) => {
          if (val == null) return "";
          if (typeof val === "string") return val;
          if (Array.isArray(val)) return val.map(stringifyError).join(", ");
          if (typeof val === "object") {
            return Object.entries(val).map(([k, v]) => `${k}: ${stringifyError(v)}`).join(", ");
          }
          return String(val);
        };
        const entries = Object.entries(data);
        msg = entries.map(([field, errs]) => `${field}: ${stringifyError(errs)}`).join(" | ");
      }
      setError(msg || "Something went wrong. Please check your inputs.");
      toast.error(msg || "Something went wrong. Please check your inputs.");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const isLastStep = step === STEPS.length - 1;

  const isFirstRender = useIsFirstRender();

  const dir = stepDir;
  const stepVariants = {
    enter:  { x: dir * 32, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit:   { x: dir * -32, opacity: 0 },
  };

  const sideNavBtn = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    width: 44, height: 44, borderRadius: "50%", border: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", fontSize: 20, fontWeight: 700, zIndex: 10,
    boxShadow: "0 4px 16px rgba(224,49,49,0.18)", transition: "opacity .2s, box-shadow .2s",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "28px 20px", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .req-doc-card:hover { box-shadow: 0 4px 20px rgba(224,49,49,0.10) !important; transform: translateY(-1px); }
      `}</style>

      <div style={{ maxWidth: 780, margin: "0 auto", position: "relative" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <motion.button
            initial={isFirstRender ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: isFirstRender ? 0.06 : 0 }}
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setLeaveConfirm(true)}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 8 }}
          >
            ← Back to Students
          </motion.button>
          <motion.div
            initial={isFirstRender ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut", delay: isFirstRender ? 0.1 : 0 }}
            style={{ display: "flex", alignItems: "center", gap: 14 }}
          >
            <h2 style={{ margin: 0, fontSize: 28, color: C.dark }}>
              {id ? "Edit Student" : "New Student Registration"}
            </h2>
            {import.meta.env.DEV && !id && (
              <button
                type="button"
                onClick={fillDevData}
                title="Auto-fill all fields with random valid test data"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 8, border: "1.5px dashed #6366f1",
                  background: "#eef2ff", color: "#4338ca", fontSize: 12, fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif", cursor: "pointer", letterSpacing: ".02em",
                }}
              >
                <i className="ti ti-bolt" style={{ fontSize: 13 }} />
                Dev Fill
              </button>
            )}
          </motion.div>
        </div>

        {/* Step bar */}
        <motion.div
          initial={isFirstRender ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut", delay: isFirstRender ? 0.16 : 0 }}
        >
        <StepBar current={step} onStepClick={(i) => {
          setStepDir(i > step ? 1 : -1);
          prevStepRef.current = step;
          setStep(i);
        }} />
        </motion.div>

        {/* Error */}
        <AnimatePresence>
        {error && (
          <motion.div
            key="error-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10,
            padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20,
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <i className="ti ti-alert-circle" style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1 }}>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", padding: 0, lineHeight: 1, flexShrink: 0 }}
              title="Dismiss"
            >
              <i className="ti ti-x" style={{ fontSize: 14 }} />
            </button>
          </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Step content with side nav buttons */}
        <div style={{ position: "relative" }}>

          {/* Previous button — left of card */}
          <motion.button
            whileHover={step !== 0 ? { scale: 1.1, boxShadow: "0 8px 28px rgba(224,49,49,0.22)" } : {}}
            whileTap={step !== 0 ? { scale: 0.92 } : {}}
            transition={{ duration: 0.12 }}
            onClick={prev}
            disabled={step === 0}
            type="button"
            title="Previous"
            style={{
              ...sideNavBtn, left: -60,
              background: step === 0 ? "#f3e8e8" : C.white,
              color: step === 0 ? C.redMid : C.red,
              opacity: step === 0 ? 0.4 : 1,
              cursor: step === 0 ? "not-allowed" : "pointer",
            }}
          >
            <i className="ti ti-chevron-left" />
          </motion.button>

          {/* Next / Submit button — right of card */}
          <AnimatePresence mode="wait">
          {isLastStep ? (
            <motion.button
              key="submit"
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              whileHover={isFormValid && !loading ? { scale: 1.1, boxShadow: "0 8px 28px rgba(224,49,49,0.28)" } : {}}
              whileTap={isFormValid && !loading ? { scale: 0.92 } : {}}
              transition={{ duration: 0.12 }}
              onClick={handleSubmit}
              disabled={loading || !isFormValid}
              type="button"
              title={
                loading ? "Submitting…"
                : !isFormValid ? (validate()?.message ?? "Fill in required fields before submitting")
                : (id ? "Update Student" : "Submit Registration")
              }
              style={{
                ...sideNavBtn, right: -60,
                background: !isFormValid ? "#e0c8c8" : C.red,
                color: "#fff",
                opacity: loading ? 0.6 : 1,
                cursor: (loading || !isFormValid) ? "not-allowed" : "pointer",
              }}
            >
              {loading ? <i className="ti ti-loader-2" style={{ animation: "spin 0.8s linear infinite" }} /> : <i className="ti ti-check" />}
            </motion.button>
          ) : (
            <motion.button
              key="next"
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              whileHover={{ scale: 1.1, boxShadow: "0 8px 28px rgba(224,49,49,0.28)" }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.12 }}
              onClick={next}
              type="button"
              title="Next"
              style={{ ...sideNavBtn, right: -60, background: C.red, color: "#fff" }}
            >
              <i className="ti ti-chevron-right" />
            </motion.button>
          )}
          </AnimatePresence>

          <motion.div
            layout
            initial={isFirstRender ? { opacity: 0, y: 16 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.22 : 0, layout: { duration: 0.28, ease: "easeOut" } }}
            style={{ ...cardStyle, padding: 0, overflow: "hidden" }}
          >
            <div style={{ height: 4, background: "linear-gradient(to right, #e03131, #ff6b6b, #fca5a5, #fde8e8)" }} />
            <div style={{ overflow: "hidden" }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{ padding: "24px 28px" }}
              >
              {step === 0 && <StudentStep data={student} onChange={setStudent} />}
              {step === 1 && <HouseholdStep data={household} onChange={setHousehold} />}
              {step === 2 && <GuardiansStep data={guardians} onChange={handleGuardiansChange} />}
              {step === 3 && <SiblingsStep data={siblings} onChange={handleSiblingsChange} />}
              {step === 4 && <SchoolsStep data={schools} onChange={handleSchoolsChange} />}
              {step === 5 && (
                <ReviewStep
                  student={student} household={household}
                  guardians={guardians} siblings={siblings} schools={schools}
                />
              )}
              </motion.div>
            </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>


      <AnimatePresence>
        {leaveConfirm && (
          <ConfirmDialog
            icon="ti-arrow-left"
            danger={false}
            title="Leave this registration?"
            message={id
              ? "Your changes to this student have not been saved yet."
              : "Nothing has been saved yet, and the draft held on this device will be cleared."}
            confirmLabel="Yes, leave"
            cancelLabel="Keep filling in"
            onConfirm={() => { clearDraft(); navigate("/students"); }}
            onCancel={() => setLeaveConfirm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
