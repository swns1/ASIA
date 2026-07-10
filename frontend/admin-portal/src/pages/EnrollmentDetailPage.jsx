import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import {
  getEnrollment,
  getGrades,
  getEnrollmentScholarships,
  updateEnrollment,
} from "../api/enrollmentApi";
import { getInvoices } from "../api/billingApi";
import { getRequirementTypes, getStudentRequirementSubmissions } from "../api/enrollmentApi";

const C = {
  red: "#e03131", redLight: "#fff0f0", redBorder: "#fca5a5",
  dark: "#1a0a0a", muted: "#7a5050", bg: "#fff8f6", white: "#ffffff",
};

const STATUS_META = {
  enrolled:   { label: "Enrolled",   color: "#2e6b0d", bg: "#e8f5e0" },
  pending:    { label: "Pending",    color: "#854f0b", bg: "#faeeda" },
  completed:  { label: "Completed",  color: "#1455a0", bg: "#e3f0fd" },
  cancelled:  { label: "Cancelled",  color: "#5c5752", bg: "#f0ede8" },
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

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";

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
  const [grades, setGrades] = useState([]);
  const [scholarships, setScholarships] = useState([]);
  const [requirements, setRequirements] = useState(null);
  const [reqTypes, setReqTypes] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState("");
  const [completeConfirm, setCompleteConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getEnrollment(id)
      .then((enr) => {
        setEnrollment(enr);
        const sid = enr.student_id ?? enr.student;
        return Promise.all([
          getGrades({ enrollment: id, page_size: 200 }),
          getEnrollmentScholarships({ enrollment: id, page_size: 50 }),
          getRequirementTypes({ is_active: true, page_size: 100 }),
          sid
            ? getStudentRequirementSubmissions({ student_id: sid, page_size: 200 }).catch(() => null)
            : Promise.resolve(null),
          getInvoices({ enrollment_id: id, page_size: 5 }),
        ]);
      })
      .then(([gradesData, scholData, rtypesData, reqData, invData]) => {
        setGrades(Array.isArray(gradesData) ? gradesData : gradesData.results ?? []);
        setScholarships(Array.isArray(scholData) ? scholData : scholData.results ?? []);
        setReqTypes(Array.isArray(rtypesData) ? rtypesData : rtypesData.results ?? []);
        setRequirements(Array.isArray(reqData) ? reqData : reqData?.results ?? []);
        const invList = Array.isArray(invData) ? invData : invData.results ?? [];
        setInvoice(invList[0] ?? null);
      })
      .catch(() => setError("Failed to load enrollment details."))
      .finally(() => setLoading(false));
  }, [id]);

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

  if (loading) {
    return (
      <AppLayout>
        <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", fontFamily: "'DM Sans', sans-serif" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[1, 2, 3].map((k) => <Sk key={k} h={72} r={14} />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !enrollment) {
    return (
      <AppLayout>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", fontFamily: "'DM Sans', sans-serif" }}>
          <p style={{ color: C.red }}>{error || "Enrollment not found."}</p>
          <button onClick={() => navigate("/enrollments")} style={{ color: C.muted, background: "none", border: "none", cursor: "pointer" }}>← Back</button>
        </div>
      </AppLayout>
    );
  }

  const studentId = enrollment.student_id ?? enrollment.student;
  const studentName = enrollment.student_name ?? enrollment.student_detail?.name ?? `Student #${studentId}`;
  const statusMeta = STATUS_META[enrollment.enrollment_status] ?? STATUS_META.pending;

  // Group grades by subject
  const gradesBySubject = grades.reduce((acc, g) => {
    const key = g.subject ?? g.subject_id;
    if (!acc[key]) acc[key] = { name: g.subject_name ?? `Subject #${key}`, periods: {} };
    acc[key].periods[g.grading_period] = { numeric_grade: g.numeric_grade, remarks: g.remarks };
    return acc;
  }, {});

  const activePeriods = ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter","1st_semester","2nd_semester"]
    .filter((p) => Object.values(gradesBySubject).some((s) => s.periods[p]));

  // Requirements summary — requirements is a list of StudentRequirementSubmission records
  const submittedIds = new Set(
    Array.isArray(requirements)
      ? requirements.filter((r) => r.is_submitted).map((r) => r.requirement_type_id ?? r.requirement_type)
      : []
  );
  const missingCount = reqTypes.filter((rt) => !submittedIds.has(rt.requirement_type_id)).length;
  const canMarkCompleted = enrollment.enrollment_status === "enrolled";

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
    <AppLayout>
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
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.dark }}>{studentName}</h2>
              <p style={{ margin: "3px 0 0", fontSize: 13, color: C.muted }}>
                Enrollment #{id}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge label={statusMeta.label} color={statusMeta.color} bg={statusMeta.bg} />
              <button onClick={() => navigate(`/report-card/${id}`)}
                style={{ background: "transparent", border: "1.5px solid #fca5a5", color: C.muted, borderRadius: 50, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <i className="ti ti-file-certificate" style={{ fontSize: 11, marginRight: 4 }} />Report Card
              </button>
              <button
                onClick={() => window.open(`/print/cor/${id}`, '_blank')}
                style={{ background: "transparent", border: "1.5px solid #fca5a5", color: C.muted, borderRadius: 50, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <i className="ti ti-file-invoice" style={{ fontSize: 11, marginRight: 4 }} />Print COR
              </button>
              <button
                onClick={() => window.open(`/print/grade-slip/${id}`, '_blank')}
                style={{ background: "transparent", border: "1.5px solid #fca5a5", color: C.muted, borderRadius: 50, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <i className="ti ti-file-chart" style={{ fontSize: 11, marginRight: 4 }} />Grade Slip
              </button>
              <button onClick={() => navigate(`/enrollments/${id}/edit`)}
                style={{ background: "transparent", border: "1.5px solid #fca5a5", color: C.muted, borderRadius: 50, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <i className="ti ti-edit" style={{ fontSize: 11, marginRight: 4 }} />Edit
              </button>
              {canMarkCompleted && (
                <button onClick={() => setCompleteConfirm(true)}
                  style={{ background: "linear-gradient(135deg,#1455a0,#0e3d7a)", color: "white", border: "none", borderRadius: 50, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 12, marginRight: 4 }} />Mark Completed
                </button>
              )}
            </div>
          </div>

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

            {/* Invoice */}
            <Card title="Invoice" icon="ti-file-invoice"
              action={
                <button onClick={() => navigate(`/invoices?enrollment_id=${id}`)}
                  style={{ fontSize: 11, color: C.red, background: "none", border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                  View →
                </button>
              }>
              {invoice ? (
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
                      <span style={{ color: C.muted }}>Due</span>
                      <span style={{ fontWeight: 600, color: C.dark }}>{fmtDate(invoice.due_date)}</span>
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

            {/* Requirements */}
            <Card title="Requirements" icon="ti-file-check">
              {reqTypes.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: C.muted }}>No types configured.</p>
              ) : (
                <div>
                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    {missingCount === 0
                      ? <span style={{ color: "#2e6b0d", fontWeight: 600 }}>✓ All submitted</span>
                      : <span style={{ color: "#a32d2d" }}><strong>{missingCount}</strong> missing</span>
                    }
                    <span style={{ color: C.muted, marginLeft: 6 }}>· {reqTypes.length} total</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {reqTypes.map((rt) => {
                      const submitted = submittedIds.has(rt.requirement_type_id);
                      return (
                        <div key={rt.requirement_type_id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                          <i className={`ti ${submitted ? "ti-circle-check" : "ti-circle-x"}`}
                            style={{ fontSize: 12, color: submitted ? "#2e6b0d" : "#a32d2d", flexShrink: 0 }} />
                          <span style={{ color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rt.requirement_name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>

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
          <Card title="Grades" icon="ti-report-analytics">
            {Object.keys(gradesBySubject).length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: C.muted }}>No grades recorded yet.</p>
            ) : (
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

        </div>
      </div>

      {/* Mark Completed Confirm Modal */}
      {completeConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "white", borderRadius: 16, padding: 28, maxWidth: 400, width: "100%", boxShadow: "0 8px 40px rgba(20,85,160,0.15)", fontFamily: "'DM Sans', sans-serif" }}>
            <h3 style={{ margin: "0 0 10px", color: C.dark }}>Mark as Completed?</h3>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: C.muted }}>
              This will change enrollment status to <strong>Completed</strong> and unlock the next school year's enrollment eligibility for this student.
            </p>
            {completeError && <p style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{completeError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setCompleteConfirm(false); setCompleteError(""); }}
                disabled={completing}
                style={{ flex: 1, padding: "10px 0", borderRadius: 50, border: "1.5px solid #fca5a5", background: "transparent", color: C.muted, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleMarkCompleted} disabled={completing}
                style={{ flex: 1, padding: "10px 0", borderRadius: 50, border: "none", background: completing ? "#9ab5d4" : "linear-gradient(135deg,#1455a0,#0e3d7a)", color: "white", fontWeight: 700, cursor: completing ? "not-allowed" : "pointer" }}>
                {completing ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
