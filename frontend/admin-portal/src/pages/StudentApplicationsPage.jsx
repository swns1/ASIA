// StudentApplicationsPage — the registrar-facing queue for applicant
// self-service submissions (backend: intake/views.py). Issues staff-scoped
// invites, reviews submitted applications against duplicate flags, and
// approves (creating the real student record) or rejects them. See the
// plan: this is the counterpart to pages/apply/ApplicantFormPage.jsx.
import { usePageTitle } from "../hooks/usePageTitle";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Card from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import Alert from "../components/ui/Alert";
import Tabs, { TabPanel } from "../components/ui/Tabs";
import SchoolYearPicker from "../components/ui/SchoolYearPicker";
import useTabs from "../hooks/useTabs";
import { useSchoolYear } from "../context/SchoolYearContext";
import { yearOptionsForEntry } from "../utils/schoolYear";
import { Field, Input, Select, Textarea } from "../components/FormField";
import { ReviewStep } from "./student-form/StudentFormSteps";
import ApplicationDetailsEditor from "./apply/ApplicationDetailsEditor";
import { STUDENT_APPLICATION_STATUS_MAP } from "../constants/statusMaps";
import { fmtDateTime } from "../utils/format";
import IssueInviteModal from "../components/applications/IssueInviteModal";
import fetchAllPages from "../utils/fetchAllPages";
import {
  getStudentApplications,
  getStudentApplication,
  claimStudentApplication,
  changeApplicationSchoolYear,
  approveStudentApplication,
  rejectStudentApplication,
} from "../api/applicationApi";

const TABS = [
  { id: "submitted", label: "Submitted" },
  { id: "in_review", label: "In Review" },
  { id: "approved",  label: "Approved" },
  { id: "rejected",  label: "Rejected" },
];

const COLUMNS = [
  { key: "reference", label: "Reference", width: "16%" },
  { key: "applicant",  label: "Applicant" },
  { key: "year",       label: "For S.Y.",  width: "12%" },
  { key: "lrn",        label: "LRN",       width: "14%" },
  { key: "submitted",  label: "Submitted", width: "16%" },
  { key: "flags",      label: "Flags",     width: "10%" },
];


// ── Review one application ──────────────────────────────────────────────

function ReviewApplicationModal({ applicationId, onClose, onDecided }) {
  const navigate = useNavigate();
  const { entryYears } = useSchoolYear();
  const [savingYear, setSavingYear] = useState(false);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lrn, setLrn] = useState("");
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStudentApplication(applicationId)
      .then((data) => {
        if (cancelled) return;
        setApplication(data);
        setLrn(data.payload_json?.student?.lrn || "");
        if (data.status === "submitted") {
          claimStudentApplication(applicationId).catch(() => {});
        }
      })
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [applicationId]);

  // What the family said they were enrolling into. Advisory only — it never
  // became student data (see intake/serializers.py) and the real Enrollment
  // is still created by hand in enrollment-service, which owns that table.
  const applyingFor = application?.payload_json?.applying_for || {};

  const handleApprove = async () => {
    if (!lrn.trim()) {
      setActionError("LRN is required to approve — the student record cannot be saved without one.");
      return;
    }
    setApproving(true);
    setActionError("");
    try {
      const result = await approveStudentApplication(applicationId, { student: { lrn: lrn.trim() } });
      onDecided?.();
      onClose();
      // Falsy created_student_id means this was a replay of an already-approved
      // application: nothing was created now, so do not claim it was.
      if (!result.created_student_id) {
        toast.success("Application already approved.");
        return;
      }
      // Approving only creates the student record. Until an Enrollment
      // exists the learner has no section, so they appear in no SF1, no
      // SF2 and can receive no grades — and nothing else in the app would
      // tell the registrar that. Carry them straight into the enrolment
      // form with what the family said they were applying for; the section
      // is the registrar's call, so the form still asks for it.
      toast.success("Student record created — now enrol them for this school year.");
      // continuing=1 marks this as the second half of one process, exactly as
      // the counter-registration hand-off does. It matters more here: an
      // applicant who filled the kiosk form has uploaded no documents at all,
      // so the enrolment form should open the upload panel rather than hide it.
      const params = new URLSearchParams({
        student: String(result.created_student_id),
        continuing: "1",
      });
      // The year the invite was issued for; the form still lets them change it.
      if (application.school_year) params.set("school_year", application.school_year);
      if (applyingFor.grade_level) params.set("grade_level", applyingFor.grade_level);
      if (applyingFor.school_level) params.set("school_level", applyingFor.school_level);
      if (applyingFor.strand) params.set("strand", applyingFor.strand);
      navigate(`/enrollments/new?${params.toString()}`);
    } catch (err) {
      setActionError(err.message || "Could not approve this application.");
    } finally {
      setApproving(false);
    }
  };

  // Saved as soon as it's picked, so the queue's year column is right even if
  // the decision waits.
  const handleYearChange = async (schoolYear) => {
    setSavingYear(true);
    setActionError("");
    try {
      const updated = await changeApplicationSchoolYear(applicationId, schoolYear);
      setApplication((a) => ({ ...a, school_year: updated.school_year }));
      toast.success(`Now applying for S.Y. ${updated.school_year}.`);
      onDecided?.();
    } catch (err) {
      setActionError(err.message || "Could not change the school year.");
    } finally {
      setSavingYear(false);
    }
  };

  // The corrected application replaces the one on screen, and the queue
  // reloads so its row shows the corrected name. An LRN typed into the box
  // below but left out of the correction is kept rather than wiped.
  const handleSaved = (updated) => {
    setApplication(updated);
    setLrn((typed) => updated.payload_json?.student?.lrn || typed);
    setEditing(false);
    setActionError("");
    toast.success("Corrections saved.");
    onDecided?.();
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) return;
    setRejecting(true);
    setActionError("");
    try {
      await rejectStudentApplication(applicationId, rejectNote.trim());
      toast.success("Application rejected.");
      onDecided?.();
      onClose();
    } catch (err) {
      setActionError(err.message || "Could not reject this application.");
    } finally {
      setRejecting(false);
    }
  };

  if (showReject) {
    // Not ConfirmDialog: it doesn't forward children at all (only ever
    // renders its own `error` Alert), so the note textarea this dialog
    // needs would silently vanish. Built on Modal directly instead,
    // matching how ConfirmDialog itself is composed.
    return (
      <Modal
        onClose={() => setShowReject(false)}
        size="sm"
        icon="ti-circle-x"
        iconTone="danger"
        title="Reject this application?"
        description="This note is what staff will read back to the family — be specific."
        loading={rejecting}
        footer={
          <div className="flex gap-2.5">
            <Button variant="secondary" fullWidth disabled={rejecting} onClick={() => setShowReject(false)} data-autofocus>
              Cancel
            </Button>
            <Button variant="destructive" fullWidth loading={rejecting} disabled={!rejectNote.trim()} onClick={handleReject}>
              {rejecting ? "Working…" : "Reject"}
            </Button>
          </div>
        }
      >
        {actionError && <Alert variant="error" className="mb-3">{actionError}</Alert>}
        <Field label="Reason" required>
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="e.g. Missing required household information" />
        </Field>
      </Modal>
    );
  }

  if (editing && application) {
    return (
      <ApplicationDetailsEditor
        application={application}
        onCancel={() => setEditing(false)}
        onSaved={handleSaved}
      />
    );
  }

  const payload = application?.payload_json || {};
  const decided = application && application.status !== "submitted" && application.status !== "in_review";

  return (
    <Modal onClose={onClose} size="lg" icon="ti-clipboard-text" title={application ? `Application ${application.reference}` : "Application"} loading={loading} showClose>
      {error && <Alert variant="error">Could not load this application.</Alert>}

      {application && (
        <>
          {application.duplicate_of_student_id && (
            <Alert variant="warning" className="mb-4">
              This may already be an existing student —{" "}
              <a href={`/students/${application.duplicate_of_student_id}`} target="_blank" rel="noreferrer" className="font-semibold underline">
                view record #{application.duplicate_of_student_id}
              </a>. Confirm before approving.
            </Alert>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
            <span>Submitted {fmtDateTime(application.submitted_at)}</span>
            <span>
              Applying for:{" "}
              <strong className="text-neutral-700">
                {applyingFor.grade_level || "not stated"}
                {applyingFor.strand ? ` — ${applyingFor.strand}` : ""}
                {application.school_year ? ` · S.Y. ${application.school_year}` : ""}
              </strong>
            </span>
            <StatusBadge status={application.status} map={STUDENT_APPLICATION_STATUS_MAP} />
          </div>

          <ReviewStep
            student={payload.student || {}}
            household={payload.household || {}}
            guardians={payload.guardians || []}
            siblings={payload.siblings || []}
            schools={payload.previous_schools || []}
          />

          {decided ? (
            application.status === "rejected" && application.decision_note && (
              <Alert variant="info" className="mt-4">Rejection reason: {application.decision_note}</Alert>
            )
          ) : (
            <div className="mt-5 border-t border-neutral-200 pt-4">
              {actionError && <Alert variant="error" className="mb-3">{actionError}</Alert>}
              <Field label="Enrol for" hint="The year the link was issued for. Change it if that was wrong.">
                <Select
                  value={application.school_year || ""}
                  disabled={savingYear}
                  aria-label="Enrol for"
                  onChange={(e) => handleYearChange(e.target.value)}
                >
                  {!application.school_year && <option value="">Not set</option>}
                  {yearOptionsForEntry(entryYears, application.school_year).map((y) => (
                    <option key={y} value={y}>{`S.Y. ${y}`}</option>
                  ))}
                </Select>
              </Field>
              <Field label="LRN" required hint="Structurally required to create the student record.">
                <Input value={lrn} onChange={(e) => setLrn(e.target.value)} placeholder="12-digit LRN" />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Wrong details are corrected here, before approval, rather
                    than on the student record afterwards: the record is
                    created from them, and the duplicate check runs on them. */}
                <Button variant="secondary" icon="ti-pencil" onClick={() => setEditing(true)} disabled={approving}>
                  Edit details
                </Button>
                <div className="flex gap-2.5">
                  <Button variant="secondary" onClick={() => setShowReject(true)}>Reject</Button>
                  <Button onClick={handleApprove} loading={approving} disabled={!lrn.trim()}>
                    Approve &amp; create student
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function StudentApplicationsPage() {
  usePageTitle("Student Applications");

  // A link can open another tab (?tab=in_review, from the home pages' count
  // of applications opened but not decided).
  const [searchParams] = useSearchParams();
  const linkedTab = TABS.find((t) => t.id === searchParams.get("tab"))?.id;
  const { active, direction, setActive } = useTabs(TABS, linkedTab ?? "submitted");
  // All years by default: this is a to-do queue, and most applications are
  // for a year that hasn't started, so opening on the current year would hide
  // them.
  const [schoolYear, setSchoolYear] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showIssue, setShowIssue] = useState(false);
  const [openApplicationId, setOpenApplicationId] = useState(null);

  // Every application in the tab, not the first 100 -- the rest used to be
  // left out with nothing on screen saying so. And only the newest request
  // fills the table, so switching tabs quickly can't show one tab's
  // applications under another's heading.
  const loadSeq = useRef(0);
  const load = () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    fetchAllPages(getStudentApplications, { status: active, school_year: schoolYear }, { pageSize: 100 })
      .then((list) => { if (seq === loadSeq.current) setRows(list); })
      .catch((err) => { if (seq === loadSeq.current) setError(err); })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  };

  useEffect(load, [active, schoolYear]);

  return (
    <>
      <PageHeader
        title="Student Applications"
        subtitle="Self-service submissions awaiting review"
        icon="ti-user-plus"
        actions={
          <div className="flex items-center gap-2">
            {/* Enrolment counts would mislead here, so none are shown. */}
            <SchoolYearPicker value={schoolYear} onChange={(y) => setSchoolYear(y ?? "")} counts={{}} align="end" />
            <Button icon="ti-link" onClick={() => setShowIssue(true)}>Issue form link</Button>
          </div>
        }
      />

      <div className="p-6">
        <Tabs tabs={TABS} value={active} onChange={setActive} className="mb-4" />

        <TabPanel id={active} direction={direction}>
          {/* The queue sits on a card like every other list page (see
              StudentsPage); TabPanel already supplies the entrance
              animation, so this needs no motion wrapper of its own. */}
          <Card padding="none" className="overflow-hidden">
            <Table
              columns={COLUMNS}
              loading={loading}
              error={error}
              onRetry={load}
              errorSubject="student applications"
              isEmpty={!loading && !error && rows.length === 0}
              empty={{
                icon: "ti-inbox",
                title: `No ${TABS.find((t) => t.id === active)?.label.toLowerCase()} applications`,
                subtitle: "Issue a form link to get started.",
              }}
            >
              {rows.map((row) => (
                <TableRow key={row.student_application_id} onClick={() => setOpenApplicationId(row.student_application_id)}>
                  <TableCell><span className="font-semibold text-neutral-900">{row.reference}</span></TableCell>
                  <TableCell>{`${row.first_name} ${row.last_name}`.trim() || "—"}</TableCell>
                  <TableCell>{row.school_year || <span className="text-neutral-400 dark:text-neutral-500">—</span>}</TableCell>
                  <TableCell>{row.lrn || <span className="text-neutral-400 dark:text-neutral-500">Not yet assigned</span>}</TableCell>
                  <TableCell>{fmtDateTime(row.submitted_at)}</TableCell>
                  <TableCell>
                    {row.duplicate_of_student_id && (
                      <span title="Possible duplicate of an existing student">
                        <i className="ti ti-alert-triangle text-warning-500" aria-hidden="true" />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          </Card>
        </TabPanel>
      </div>

      {showIssue && (
        <IssueInviteModal onClose={() => setShowIssue(false)} onIssued={load} />
      )}

      {openApplicationId && (
        <ReviewApplicationModal
          applicationId={openApplicationId}
          onClose={() => setOpenApplicationId(null)}
          onDecided={load}
        />
      )}
    </>
  );
}
