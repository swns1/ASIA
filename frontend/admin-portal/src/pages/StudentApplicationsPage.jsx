// StudentApplicationsPage — the registrar-facing queue for applicant
// self-service submissions (backend: intake/views.py). Issues staff-scoped
// invites, reviews submitted applications against duplicate flags, and
// approves (creating the real student record) or rejects them. See the
// plan: this is the counterpart to pages/apply/ApplicantFormPage.jsx.
import { usePageTitle } from "../hooks/usePageTitle";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { QRCodeSVG } from "qrcode.react";

import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Card from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import Alert from "../components/ui/Alert";
import Tabs, { TabPanel } from "../components/ui/Tabs";
import useTabs from "../hooks/useTabs";
import { Field, Input, Textarea } from "../components/FormField";
import { ReviewStep } from "./student-form/StudentFormSteps";
import { STUDENT_APPLICATION_STATUS_MAP } from "../constants/statusMaps";
import { collect, required, hasErrors } from "../utils/validation";
import { isLocalOnlyUrl, resolveApplyUrl } from "../utils/applyLink";
import {
  createApplicationInvite,
  getStudentApplications,
  getStudentApplication,
  claimStudentApplication,
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
  { key: "lrn",        label: "LRN",       width: "14%" },
  { key: "submitted",  label: "Submitted", width: "16%" },
  { key: "flags",      label: "Flags",     width: "12%" },
];

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── Issue invite ─────────────────────────────────────────────────────────

function IssueInviteModal({ onClose, onIssued }) {
  const [form, setForm] = useState({
    applicant_first_name: "", applicant_last_name: "",
    contact_email: "", contact_mobile: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [issued, setIssued] = useState(null); // { access_code, apply_url, ... }
  const [copied, setCopied] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = (v) => collect({
    applicant_first_name: required(v.applicant_first_name, "First name"),
    applicant_last_name: required(v.applicant_last_name, "Last name"),
  });
  const errors = submitted ? validate(form) : {};

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors(validate(form))) return;

    setSaving(true);
    setServerError("");
    try {
      const res = await createApplicationInvite(form);
      setIssued(res);
      onIssued?.();
    } catch (err) {
      setServerError(err.message || "Could not issue the invite. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      toast.error("Couldn't copy — please select and copy manually.");
    }
  };

  if (issued) {
    return <IssuedInvite issued={issued} copied={copied} onCopy={copy} onClose={onClose} />;
  }

  return (
    <Modal onClose={onClose} size="md" icon="ti-user-plus" title="Issue form link" loading={saving} showClose>
      <form onSubmit={handleSubmit}>
        {serverError && <Alert variant="error" className="mb-4">{serverError}</Alert>}

        <div className="grid grid-cols-2 gap-x-4">
          <Field label="First Name" error={errors.applicant_first_name}>
            <Input value={form.applicant_first_name} onChange={(e) => set("applicant_first_name", e.target.value)} />
          </Field>
          <Field label="Last Name" error={errors.applicant_last_name}>
            <Input value={form.applicant_last_name} onChange={(e) => set("applicant_last_name", e.target.value)} />
          </Field>
        </div>

        <Field label="Contact Email" hint="For following up on this application — no email is sent from here.">
          <Input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Contact Mobile">
          <Input value={form.contact_mobile} onChange={(e) => set("contact_mobile", e.target.value)} placeholder="Optional" />
        </Field>

        <Button type="submit" fullWidth loading={saving} className="mt-2">Issue invite</Button>
      </form>
    </Modal>
  );
}

// ── Issued invite: QR first, link as backup ─────────────────────────────
//
// The parent scans the QR with their own phone and the registrar gives them
// the access code in person. Both devices must be on one network -- this is a
// LAN deployment, so the link opens nowhere else -- but any shared network
// works: the school Wi-Fi, or a phone hotspot the machine is joined to.
//
// The link and code stay separate factors; the code is never put in the QR,
// the link, or the navigation state. The URL itself comes from
// utils/applyLink.js, which falls back to the address staff are using when the
// backend still has its localhost default.

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function printSlip({ issued, qrSvg }) {
  const win = window.open("", "_blank", "width=480,height=720");
  if (!win) {
    toast.error("The slip window was blocked — allow pop-ups for this site and try again.");
    return;
  }
  const expires = issued.expires_at ? fmtDate(issued.expires_at) : "—";
  const applyUrl = resolveApplyUrl(issued.apply_url, window.location.origin);
  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Application slip</title>
<style>
  @page { size: A6 portrait; margin: 8mm; }
  body { font-family: Arial, sans-serif; color: #1a0a0a; margin: 0; padding: 16px; text-align: center; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .sub { font-size: 11px; color: #7a5050; margin-bottom: 12px; }
  .name { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
  .qr svg { width: 180px; height: 180px; }
  .code { font-size: 26px; font-weight: 700; letter-spacing: 0.18em; border: 2px dashed #1a0a0a;
          border-radius: 8px; padding: 6px 12px; display: inline-block; margin: 6px 0 10px; }
  .steps { text-align: left; font-size: 12px; line-height: 1.5; margin: 10px auto; max-width: 300px; padding-left: 18px; }
  .link { font-size: 9px; color: #555; word-break: break-all; margin-top: 8px; }
  .muted { font-size: 11px; color: #7a5050; }
</style></head><body>
  <h1>South Lakes Integrated School</h1>
  <div class="sub">Student Information Form</div>
  <div class="name">${escapeHtml(issued.applicant_full_name)}</div>
  <div class="qr">${qrSvg}</div>
  <div class="muted">Access code</div>
  <div class="code">${escapeHtml(issued.access_code)}</div>
  <ol class="steps">
    <li>Connect your phone to the <strong>school Wi-Fi</strong>.</li>
    <li>Scan the QR code with your phone camera and open the link.</li>
    <li>Enter the access code above, then fill in the form.</li>
  </ol>
  <div class="muted">Valid until ${escapeHtml(expires)}. Keep this slip — the code cannot be shown again.
  If it is lost, ask the Registrar for a new one.</div>
  <div class="link">Can't scan? ${escapeHtml(applyUrl)}</div>
</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function IssuedInvite({ issued, copied, onCopy, onClose }) {
  const navigate = useNavigate();
  const qrRef = useRef(null);
  // The address the parent's phone should open, which is not always the one
  // the backend built (see utils/applyLink.js).
  const applyUrl = resolveApplyUrl(issued.apply_url, window.location.origin);
  const localOnly = isLocalOnlyUrl(applyUrl);

  const handlePrint = () => {
    const qrSvg = qrRef.current?.querySelector("svg")?.outerHTML ?? "";
    printSlip({ issued, qrSvg });
  };


  // For a family without a phone: open the form here, on the school's own
  // device. The applicant page asks for the code, then for the hand-over,
  // which signs the staff member out before the family takes the device.
  const openHere = () => navigate(`/apply/${issued.invite_id}`);

  return (
    <Modal onClose={onClose} size="md" icon="ti-qrcode" title="Invite issued" showClose>
      {localOnly && (
        <Alert variant="warning" className="mb-4">
          Only this computer can open this link — it points to <strong>localhost</strong>.
          To try it from a phone, open this portal by the computer's network address
          instead (for example <code>http://192.168.1.42:5173</code>) and issue the invite
          again; the QR then points there. For the real deployment, set{" "}
          <code>FRONTEND_BASE_URL</code> in the student-service <code>.env</code>.
        </Alert>
      )}

      <div className="mb-4 flex flex-col items-center gap-2 text-center">
        <div className="text-sm font-semibold text-neutral-900">{issued.applicant_full_name}</div>
        <div ref={qrRef} className="rounded-xl border border-neutral-200 bg-white p-3">
          <QRCodeSVG value={applyUrl} size={208} marginSize={1} title="Application form link" />
        </div>
        <div className="text-[13px] text-neutral-700">
          Scan with a phone on the <strong>same network as this computer</strong>
        </div>
      </div>

      <Field label="Access code" hint="Read it out or write it down — the parent types it after scanning.">
        <div className="flex gap-2">
          <Input value={issued.access_code} readOnly onFocus={(e) => e.target.select()}
            style={{ fontWeight: 700, letterSpacing: "0.1em", fontSize: 18 }} />
          <Button type="button" variant="secondary" onClick={() => onCopy("code", issued.access_code)}>
            {copied === "code" ? "Copied" : "Copy"}
          </Button>
        </div>
      </Field>

      <Field label="Can't scan? Send this link instead" hint="Paste it into Messenger or SMS. Never send the code with it.">
        <div className="flex gap-2">
          <Input value={applyUrl} readOnly onFocus={(e) => e.target.select()} />
          <Button type="button" variant="secondary" onClick={() => onCopy("link", applyUrl)}>
            {copied === "link" ? "Copied" : "Copy"}
          </Button>
        </div>
      </Field>

      <Alert variant="warning" className="mb-4">
        The access code is shown once and cannot be retrieved later — print the slip if
        the family may finish another day, or re-issue if it's lost.
      </Alert>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" icon="ti-printer" onClick={handlePrint}>
          Print slip
        </Button>
        <Button type="button" variant="secondary" icon="ti-device-tablet" onClick={openHere}>
          Open form on this device
        </Button>
      </div>
      <Button fullWidth onClick={onClose} className="mt-2">Done</Button>
    </Modal>
  );
}

// ── Review one application ──────────────────────────────────────────────

function ReviewApplicationModal({ applicationId, onClose, onDecided }) {
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lrn, setLrn] = useState("");
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [actionError, setActionError] = useState("");

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
            <span>Submitted {fmtDate(application.submitted_at)}</span>
            <span>
              Applying for:{" "}
              <strong className="text-neutral-700">
                {applyingFor.grade_level || "not stated"}
                {applyingFor.strand ? ` — ${applyingFor.strand}` : ""}
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
              <Field label="LRN" required hint="Structurally required to create the student record.">
                <Input value={lrn} onChange={(e) => setLrn(e.target.value)} placeholder="12-digit LRN" />
              </Field>
              <div className="flex justify-end gap-2.5">
                <Button variant="secondary" onClick={() => setShowReject(true)}>Reject</Button>
                <Button onClick={handleApprove} loading={approving} disabled={!lrn.trim()}>
                  Approve &amp; create student
                </Button>
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

  const { active, direction, setActive } = useTabs(TABS, "submitted");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showIssue, setShowIssue] = useState(false);
  const [openApplicationId, setOpenApplicationId] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getStudentApplications({ status: active, page_size: 100 })
      .then((data) => setRows(Array.isArray(data) ? data : data?.results ?? []))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  };

  useEffect(load, [active]);

  return (
    <>
      <PageHeader
        title="Student Applications"
        subtitle="Self-service submissions awaiting review"
        icon="ti-user-plus"
        actions={<Button icon="ti-link" onClick={() => setShowIssue(true)}>Issue form link</Button>}
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
                  <TableCell>{row.lrn || <span className="text-neutral-400">Not yet assigned</span>}</TableCell>
                  <TableCell>{fmtDate(row.submitted_at)}</TableCell>
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
