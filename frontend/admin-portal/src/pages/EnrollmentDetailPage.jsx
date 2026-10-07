import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import {
  getEnrollment,
  getEnrollmentEligibility,
  getGrades,
  getEnrollmentScholarships,
  updateEnrollment,
  transferOutEnrollment,
  getEnrollmentEmailStatus,
  sendEnrollmentEmail,
} from "../api/enrollmentApi";
import RequirementDocumentsPanel from "../components/requirements/RequirementDocumentsPanel";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import { Field, Input, Textarea } from "../components/FormField";
import { getInvoices, closeOutInvoiceForTransfer } from "../api/billingApi";

import { updateStudentStatus } from "../api/studentApi";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF, BILLING_READ_ROLES, GRADE_ROLES } from "../utils/auth";
import { StatusBadge } from "../components/ui/Badge";
import { ENROLLMENT_STATUS_MAP } from "../constants/statusMaps";
import { todayISO, fmtDate } from "../utils/format";
import useArchivedYears from "../hooks/useArchivedYears";
import ArchivedYearNotice from "../components/schoolYears/ArchivedYearNotice";

const C = {
  red: "#e03131", redLight: "#fff0f0", redBorder: "#fca5a5",
  dark: "#1a0a0a", muted: "#7a5050", bg: "#fff8f6", white: "#ffffff",
};


const INVOICE_STATUS_META = {
  unpaid:         { label: "Unpaid",   color: "#a32d2d", bg: "#fde8e8" },
  partially_paid: { label: "Partial",  color: "#854f0b", bg: "#faeeda" },
  paid:           { label: "Paid",     color: "#2e6b0d", bg: "#e8f5e0" },
  void:           { label: "Void",     color: "#5c5752", bg: "#f0ede8" },
};

const GRADE_LABELS = {
  "1st_quarter": "Q1", "2nd_quarter": "Q2", "3rd_quarter": "Q3", "4th_quarter": "Q4",
  "1st_semester": "Sem 1", "2nd_semester": "Sem 2",
};


function Badge({ label, color, bg }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: "2px 10px", borderRadius: 50, letterSpacing: ".02em" }}>
      {label}
    </span>
  );
}

function Card({ title, icon, children, action }) {
  return (
    <div style={{ background: C.white, borderRadius: 14, border: "1px solid #f5eaea", overflow: "hidden", boxShadow: "0 2px 12px rgba(224,49,49,0.05)" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to right,#fdfafa,white)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 16, color: C.red }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

function Sk({ w = "100%", h = 14, r = 6 }) {
  return (
    <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
  );
}

export default function EnrollmentDetailPage() {
  usePageTitle("Enrollment Details");
  const { id } = useParams();
  const navigate = useNavigate();

  const [enrollment, setEnrollment] = useState(null);
  const isArchived = useArchivedYears();
  const [grades, setGrades] = useState([]);
  const [scholarships, setScholarships] = useState([]);
  // Taken from the eligibility endpoint rather than derived here, so the
  // document list on this page and the gate that blocks activation agree on
  // whether this learner is new, transferring in, or continuing. Guessing it
  // client-side would mean showing "Required" next to a document the server
  // would not actually block on.
  const [entryStatus, setEntryStatus] = useState(null);
  const [invoice, setInvoice] = useState(null);
  // Kept apart from `invoice` so a failed load isn't shown as "No invoice
  // generated yet." -- which invites generating a second one.
  const [invoiceFailed, setInvoiceFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState("");
  const [completeConfirm, setCompleteConfirm] = useState(false);

  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [transferEffectiveDate, setTransferEffectiveDate] = useState(todayISO());
  const [transferReason, setTransferReason] = useState("");
  const [transferDestSchool, setTransferDestSchool] = useState("");

  // Invoice data is billing-service-gated (billing staff and the registrar
  // may read it) even though this route allows every staff role — skip the
  // doomed fetch for roles that would just get a 403, and show an accurate
  // message instead of a misleading "No invoice generated yet."
  const canViewBilling = hasAnyRole(getCurrentUser(), BILLING_READ_ROLES);
  // A learner's documents (birth certificate, Form 137) aren't billing
  // material; the server refuses accounting, so don't render a card that can
  // only fail.
  const canViewDocuments = getCurrentUser()?.role !== "accounting";
  // Grades, the report card and the eligibility check are refused to
  // accounting too. Fetching them anyway failed the whole Promise.all, so an
  // accounting user saw "Failed to load enrollment details." on every one.
  const canViewGrades = hasAnyRole(getCurrentUser(), GRADE_ROLES);
  // Only these roles may change an enrollment; teachers and accounting were
  // shown Edit, Mark Completed and Transfer Out, and refused on saving.
  const canEditEnrollment = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);

  // Confirmation emails that failed and haven't gone through since. They were
  // logged server-side "for follow-up" with no screen that read them, so the
  // only notice a registrar ever got was the toast at the moment of sending.
  const canResendEmail = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);
  const [emailFailures, setEmailFailures] = useState([]);
  const [resending,     setResending]     = useState(false);
  const [resendError,   setResendError]   = useState("");
  const enrolledNow = enrollment?.enrollment_status === "enrolled";
  useEffect(() => {
    if (!id || !canResendEmail || !enrolledNow) { setEmailFailures([]); return; }
    let cancelled = false;
    getEnrollmentEmailStatus(id)
      .then((d) => { if (!cancelled) setEmailFailures(d?.failures ?? []); })
      .catch(() => { if (!cancelled) setEmailFailures([]); });
    return () => { cancelled = true; };
  }, [id, canResendEmail, enrolledNow]);

  async function handleResendEmail() {
    setResending(true);
    setResendError("");
    try {
      await sendEnrollmentEmail({ enrollment_id: Number(id) });
      setEmailFailures([]);
    } catch (e) {
      setResendError(e?.response?.data?.detail || e.message || "The email could not be sent.");
    } finally {
      setResending(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getEnrollment(id)
      .then((enr) => {
        setEnrollment(enr);
        return Promise.all([
          canViewGrades ? getGrades({ enrollment: id, page_size: 200 }) : Promise.resolve([]),
          getEnrollmentScholarships({ enrollment: id, page_size: 50 }),
          canViewBilling
            ? getInvoices({ enrollment_id: id, page_size: 5 }).catch(() => {
                setInvoiceFailed(true);
                return null;
              })
            : Promise.resolve(null),
          !canViewGrades ? Promise.resolve(null) : getEnrollmentEligibility(enr.student_id ?? enr.student, {
            schoolLevel: enr.school_level,
            gradeLevel: enr.grade_level,
            // This enrollment is not part of its own history. Without the
            // exclusion a Grade 7 walk-in with a pending row reads back as
            // "continuing", and the panel labels the transferee documents
            // the activation gate will actually demand as not applicable.
            excludeEnrollmentId: id,
          }).catch(() => null),
        ]);
      })
      .then(([gradesData, scholData, invData, eligibility]) => {
        setEntryStatus(eligibility?.entry_status ?? null);
        setGrades(Array.isArray(gradesData) ? gradesData : gradesData.results ?? []);
        setScholarships(Array.isArray(scholData) ? scholData : scholData.results ?? []);
        const invList = Array.isArray(invData) ? invData : invData?.results ?? [];
        setInvoice(invList[0] ?? null);
      })
      .catch(() => setError("Failed to load enrollment details."))
      .finally(() => setLoading(false));
  }, [id, canViewBilling, canViewGrades]);

  async function handleMarkCompleted() {
    setCompleting(true);
    setCompleteError("");
    try {
      const updated = await updateEnrollment(id, { enrollment_status: "completed" });
      setEnrollment(updated);
      setCompleteConfirm(false);
    } catch (err) {
      setCompleteError(err?.response?.data?.detail || "Failed to mark as completed.");
    } finally {
      setCompleting(false);
    }
  }

  async function closeOutTransferredInvoice() {
    const failed = () =>
      setError("Enrollment transferred out, but closing out the invoice's remaining installments failed — review it manually on the Invoices page.");
    try {
      let target = invoice;
      if (!target) {
        const data = await getInvoices({ enrollment_id: id, page_size: 5 });
        const list = Array.isArray(data) ? data : data?.results ?? [];
        target = list.find((inv) => inv.status !== "void") ?? null;
      }
      if (!target) return; // genuinely never invoiced
      const updated = await closeOutInvoiceForTransfer(target.invoice_id, { effective_date: transferEffectiveDate });
      if (canViewBilling) setInvoice(updated);
    } catch {
      failed();
    }
  }

  async function handleTransferOut() {
    setTransferring(true);
    setTransferError("");
    try {
      const result = await transferOutEnrollment(id, {
        effective_date: transferEffectiveDate,
        reason: transferReason,
        destination_school_name: transferDestSchool.trim() || undefined,
      });
      setEnrollment(result.enrollment);
      setTransferConfirm(false);
      setTransferReason("");
      setTransferDestSchool("");

      // Close out any existing invoice's remaining installments — same
      // frontend-orchestration approach as the status flip below.
      //
      // The invoice is looked up here rather than taken from the panel: the
      // panel only loads it for BILLING_ROLES, which in this app excludes the
      // registrar -- the person who usually records a transfer -- and a failed
      // load leaves it empty too. Either way the close-out used to be skipped
      // without a word, and the family's remaining installments went on
      // falling overdue after the student had left. billing-service accepts
      // this call from registrars.
      closeOutTransferredInvoice();

      // Flip the student's overall status separately — this codebase
      // orchestrates cross-service writes from the frontend rather than
      // backend-to-backend calls (same pattern as enroll → generate invoice).
      // If it fails, the transfer itself already succeeded, so surface the
      // problem rather than rolling anything back.
      const sid = result.enrollment?.student_id ?? result.enrollment?.student;
      if (sid) {
        updateStudentStatus(sid, "transferred").catch(() =>
          setError("Enrollment transferred out, but updating the student's overall status failed — update it manually on the student's profile.")
        );
      }
    } catch (err) {
      setTransferError(err?.response?.data?.detail || "Failed to transfer out.");
    } finally {
      setTransferring(false);
    }
  }

  if (loading) {
    return (
      <>
        <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", fontFamily: "'DM Sans', sans-serif" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[1, 2, 3].map((k) => <Sk key={k} h={72} r={14} />)}
          </div>
        </div>
      </>
    );
  }

  if (error || !enrollment) {
    return (
      <>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", fontFamily: "'DM Sans', sans-serif" }}>
          <p style={{ color: C.red }}>{error || "Enrollment not found."}</p>
          <button onClick={() => navigate("/enrollments")} style={{ color: C.muted, background: "none", border: "none", cursor: "pointer" }}>← Back</button>
        </div>
      </>
    );
  }

  const studentId = enrollment.student_id ?? enrollment.student;
  const studentName = enrollment.student_name ?? enrollment.student_detail?.name ?? `Student #${studentId}`;

  // Group grades by subject
  const gradesBySubject = grades.reduce((acc, g) => {
    const key = g.subject ?? g.subject_id;
    if (!acc[key]) acc[key] = { name: g.subject_name ?? `Subject #${key}`, periods: {} };
    acc[key].periods[g.grading_period] = { numeric_grade: g.numeric_grade, remarks: g.remarks };
    return acc;
  }, {});

  const activePeriods = ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter","1st_semester","2nd_semester"]
    .filter((p) => Object.values(gradesBySubject).some((s) => s.periods[p]));

  const canMarkCompleted = canEditEnrollment && enrollment.enrollment_status === "enrolled";
  // An archived year's enrollment is read-only: printing stays, changes go.
  const readOnly = isArchived(enrollment.school_year);

  // Compact enrollment info fields for the horizontal strip
  const infoFields = [
    { label: "School Year",  value: enrollment.school_year },
    { label: "Level",        value: enrollment.school_level?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) },
    { label: "Grade",        value: enrollment.grade_level },
    { label: "Section",      value: enrollment.section },
    ...(enrollment.strand   ? [{ label: "Strand",   value: enrollment.strand }] : []),
    ...(enrollment.semester ? [{ label: "Semester", value: enrollment.semester === "1st" ? "1st Sem" : "2nd Sem" }] : []),
  ];

  return (
    <>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      {/* Scrollable page wrapper */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ padding: "20px 28px 40px" }}>

          {/* ── Back + Header bar ── */}
          <button onClick={() => navigate("/enrollments")}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 12 }}>
            ← Back to Enrollments
          </button>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <div>
              <h2
                onClick={() => studentId && navigate(`/students/${studentId}`)}
                title="View student profile"
                style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.dark, cursor: studentId ? "pointer" : "default" }}
                onMouseEnter={(e) => { if (studentId) e.currentTarget.style.color = C.red; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.dark; }}
              >
                {studentName}
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: 13, color: C.muted }}>
                Enrollment #{id}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <StatusBadge status={enrollment.enrollment_status} map={ENROLLMENT_STATUS_MAP} />
              {canViewGrades && (
              <button onClick={() => navigate(`/report-card/${id}`)}
                style={{ background: "transparent", border: "1.5px solid #fca5a5", color: C.muted, borderRadius: 50, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <i className="ti ti-file-certificate" style={{ fontSize: 11, marginRight: 4 }} />Report Card
              </button>
              )}
              <button
                onClick={() => window.open(`/print/cor/${id}`, '_blank')}
                style={{ background: "transparent", border: "1.5px solid #fca5a5", color: C.muted, borderRadius: 50, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <i className="ti ti-file-invoice" style={{ fontSize: 11, marginRight: 4 }} />Print COR
              </button>
              {canEditEnrollment && !readOnly && (
              <button onClick={() => navigate(`/enrollments/${id}/edit`)}
                style={{ background: "transparent", border: "1.5px solid #fca5a5", color: C.muted, borderRadius: 50, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <i className="ti ti-edit" style={{ fontSize: 11, marginRight: 4 }} />Edit
              </button>
              )}
              {!readOnly && canMarkCompleted && (
                <button onClick={() => setCompleteConfirm(true)}
                  style={{ background: "linear-gradient(135deg,#1455a0,#0e3d7a)", color: "white", border: "none", borderRadius: 50, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 12, marginRight: 4 }} />Mark Completed
                </button>
              )}
              {!readOnly && canMarkCompleted && (
                <button onClick={() => setTransferConfirm(true)}
                  style={{ background: "transparent", border: "1.5px solid #f0a830", color: "#7a4a08", borderRadius: 50, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <i className="ti ti-transfer" style={{ fontSize: 12, marginRight: 4 }} />Transfer Out
                </button>
              )}
            </div>
          </div>

          <ArchivedYearNotice schoolYear={enrollment.school_year} records="enrollments" className="mb-4" />

          {emailFailures.length > 0 && (
            <div role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 16px", marginBottom: 12, fontSize: 13, color: "#7a4a08" }}>
              <span>
                <i className="ti ti-mail-exclamation" style={{ fontSize: 15, marginRight: 6 }} />
                The enrollment confirmation to {emailFailures[0].recipients.join(", ")} didn't go through
                {" "}({fmtDate(emailFailures[0].created_at)}).
                {resendError && <strong style={{ marginLeft: 6 }}>{resendError}</strong>}
              </span>
              <button onClick={handleResendEmail} disabled={resending}
                style={{ background: "white", border: "1.5px solid #f0a830", color: "#7a4a08", borderRadius: 50, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: resending ? "wait" : "pointer" }}>
                <i className="ti ti-send" style={{ fontSize: 11, marginRight: 4 }} />{resending ? "Sending…" : "Resend"}
              </button>
            </div>
          )}

          {/* ── Horizontal info strip ── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 0, background: "white", borderRadius: 12, border: "1px solid #f5eaea", marginBottom: 16, overflow: "hidden", boxShadow: "0 2px 10px rgba(224,49,49,0.04)" }}>
            {infoFields.map(({ label, value }, i) => (
              <div key={label} style={{ flex: "1 1 120px", padding: "12px 18px", borderRight: i < infoFields.length - 1 ? "1px solid #f5eaea" : "none", minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value ?? "—"}</div>
              </div>
            ))}
          </div>

          {/* ── Three-column card row: Invoice | Requirements | Scholarships ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>

            {/* Invoice — billing-gated; the "View"/"Generate" actions below
                point at /invoices, itself BILLING_ROLES-only, so they're
                dead ends for teacher/registrar and are hidden for them. */}
            <Card title="Invoice" icon="ti-file-invoice"
              action={
                canViewBilling && (
                  <button onClick={() => navigate(`/invoices?enrollment_id=${id}`)}
                    style={{ fontSize: 11, color: C.red, background: "none", border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                    View →
                  </button>
                )
              }>
              {!canViewBilling ? (
                <p style={{ margin: 0, fontSize: 12, color: C.muted, fontStyle: "italic" }}>
                  Invoice details are only visible to billing staff.
                </p>
              ) : invoiceFailed && !invoice ? (
                <p style={{ margin: 0, fontSize: 12, color: C.red }}>
                  Couldn&apos;t load the invoice. Reload the page before generating one.
                </p>
              ) : invoice ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Badge
                      label={INVOICE_STATUS_META[invoice.status]?.label ?? invoice.status}
                      color={INVOICE_STATUS_META[invoice.status]?.color ?? "#555"}
                      bg={INVOICE_STATUS_META[invoice.status]?.bg ?? "#eee"}
                    />
                    <span style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{invoice.invoice_no}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: C.muted }}>Next due</span>
                      <span style={{ fontWeight: 600, color: invoice.is_overdue ? "#c92a2a" : C.dark }}>
                        {invoice.next_due_date ? fmtDate(invoice.next_due_date) : "—"}{invoice.is_overdue ? " · overdue" : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: C.muted }}>Plan</span>
                      <span style={{ fontWeight: 600, color: C.dark, textTransform: "capitalize" }}>{invoice.payment_plan?.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: C.muted }}>No invoice generated yet.</p>
                  <button onClick={() => navigate(`/invoices?enrollment_id=${id}`)}
                    style={{ background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 50, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Generate
                  </button>
                </div>
              )}
            </Card>

            {/* Requirements — the shared panel, not a read-only list.
                This is where the completeness gate actually blocks a
                registrar, so it is where fixing it belongs; before this the
                page could only show a count and offered no way anywhere. */}
            {canViewDocuments && (
              <Card title="Requirements" icon="ti-file-check">
                <RequirementDocumentsPanel
                  studentId={enrollment.student_id ?? enrollment.student}
                  student={enrollment.student_detail}
                  variant="compact"
                  context={{ schoolLevel: enrollment.school_level, entryStatus }}
                  emptyMessage="No requirement types configured."
                />
                <button
                  type="button"
                  // With the year, so the page opens on this enrollment's
                  // placement and lists what it asks for.
                  onClick={() => navigate(`/requirements?student=${enrollment.student_id ?? enrollment.student}&school_year=${encodeURIComponent(enrollment.school_year)}`)}
                  style={{ marginTop: 12, background: "none", border: "none", padding: 0,
                           cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: C.red }}
                >
                  Open full document view →
                </button>
              </Card>
            )}

            {/* Scholarships */}
            <Card title="Scholarships" icon="ti-award">
              {scholarships.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: C.muted }}>No scholarships assigned.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {scholarships.map((s) => (
                    <div key={s.enrollment_scholarship_id} style={{ fontSize: 12, padding: "5px 9px", background: "#f8f4ff", borderRadius: 7, color: C.dark }}>
                      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.scholarship_type_detail?.scholarship_name ?? `Scholarship #${s.scholarship_type}`}
                      </div>
                      {s.notes && <div style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>{s.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── Grades — full width ── */}
          {canViewGrades && (
          <Card title="Grades" icon="ti-report-analytics">
            {Object.keys(gradesBySubject).length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: C.muted }}>No grades recorded yet.</p>
            ) : (
              /* Keeps its own <table>: a subject x grading-period cross-tab,
                 whose columns come from the data rather than a fixed list, so
                 ui/Table has nothing to describe. Same as GradesPage. */
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", minWidth: 480 }}>
                  <thead>
                    <tr style={{ background: "#fdfafa" }}>
                      <th style={{ padding: "9px 14px", textAlign: "left", color: C.muted, fontWeight: 600, borderBottom: "1px solid #f5eaea", whiteSpace: "nowrap" }}>Subject</th>
                      {activePeriods.map((p) => (
                        <th key={p} style={{ padding: "9px 14px", textAlign: "center", color: C.muted, fontWeight: 600, borderBottom: "1px solid #f5eaea", minWidth: 64, whiteSpace: "nowrap" }}>
                          {GRADE_LABELS[p]}
                        </th>
                      ))}
                      <th style={{ padding: "9px 14px", textAlign: "center", color: C.muted, fontWeight: 600, borderBottom: "1px solid #f5eaea", minWidth: 72, whiteSpace: "nowrap" }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(gradesBySubject).map(([key, subj]) => {
                      // Overall remark: worst across all periods
                      const allRemarks = activePeriods.map((p) => subj.periods[p]?.remarks).filter(Boolean);
                      const overallRemark = allRemarks.includes("failed") ? "failed"
                        : allRemarks.includes("incomplete") ? "incomplete"
                        : allRemarks.includes("passed") ? "passed"
                        : null;
                      const remColor = overallRemark === "failed" || overallRemark === "incomplete" ? "#a32d2d"
                        : overallRemark === "passed" ? "#2e6b0d" : C.muted;
                      return (
                        <tr key={key} style={{ borderBottom: "1px solid #f9f2f2" }}>
                          <td style={{ padding: "8px 14px", color: C.dark, fontWeight: 500 }}>{subj.name}</td>
                          {activePeriods.map((p) => {
                            const g = subj.periods[p];
                            const col = !g ? C.muted : g.remarks === "passed" ? "#2e6b0d" : g.remarks === "failed" ? "#a32d2d" : C.dark;
                            return (
                              <td key={p} style={{ padding: "8px 14px", textAlign: "center", color: col, fontWeight: g ? 600 : 400 }}>
                                {g ? g.numeric_grade : "—"}
                              </td>
                            );
                          })}
                          <td style={{ padding: "8px 14px", textAlign: "center" }}>
                            {overallRemark
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: remColor, background: remColor + "18", padding: "2px 8px", borderRadius: 50, textTransform: "capitalize" }}>{overallRemark}</span>
                              : <span style={{ color: C.muted, fontSize: 12 }}>—</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          )}

        </div>
      </div>

      {/* Mark Completed Confirm Modal */}
      <AnimatePresence>
      {completeConfirm && (
        <Modal
          onClose={() => { setCompleteConfirm(false); setCompleteError(""); }}
          size="sm"
          icon="ti-circle-check"
          iconTone="neutral"
          title="Mark as Completed?"
          description={<>This will change enrollment status to <strong>Completed</strong> and unlock the next school year&apos;s enrollment eligibility for this student.</>}
          loading={completing}
          footer={
            <div className="flex gap-2.5">
              <Button
                variant="secondary" fullWidth data-autofocus
                onClick={() => { setCompleteConfirm(false); setCompleteError(""); }}
                disabled={completing}
              >
                Cancel
              </Button>
              <Button fullWidth onClick={handleMarkCompleted} loading={completing}>
                {completing ? "Saving…" : "Confirm"}
              </Button>
            </div>
          }
        >
          {completeError && <Alert variant="error">{completeError}</Alert>}
        </Modal>
      )}

      {/* Transfer Out Confirm Modal */}
      {transferConfirm && (
        <Modal
          onClose={() => { setTransferConfirm(false); setTransferError(""); }}
          size="md"
          icon="ti-transfer-out"
          iconTone="neutral"
          title="Transfer Out Student?"
          description={<>This will change enrollment status to <strong>Transferred Out</strong> and mark the student&apos;s overall status as transferred. Grades and attendance already recorded are kept as-is.</>}
          loading={transferring}
          footer={
            <div className="flex gap-2.5">
              <Button
                variant="secondary" fullWidth
                onClick={() => { setTransferConfirm(false); setTransferError(""); }}
                disabled={transferring}
              >
                Cancel
              </Button>
              <Button
                fullWidth
                onClick={handleTransferOut}
                loading={transferring}
                disabled={!transferReason.trim() || !transferEffectiveDate}
              >
                {transferring ? "Saving…" : "Confirm"}
              </Button>
            </div>
          }
        >
          <div className="text-left">
            <Field label="Effective Date" required>
              <Input
                type="date"
                value={transferEffectiveDate}
                onChange={(e) => setTransferEffectiveDate(e.target.value)}
              />
            </Field>
            <Field label="Destination School" hint="Optional.">
              <Input
                type="text"
                value={transferDestSchool}
                onChange={(e) => setTransferDestSchool(e.target.value)}
                placeholder="e.g. Cebu City National High School"
              />
            </Field>
            <Field label="Reason" required>
              <Textarea
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                rows={2}
                placeholder="Explain why the student is transferring out (e.g. family relocating)…"
              />
            </Field>
            {transferError && <Alert variant="error">{transferError}</Alert>}
          </div>
        </Modal>
      )}
      </AnimatePresence>
    </>
  );
}
