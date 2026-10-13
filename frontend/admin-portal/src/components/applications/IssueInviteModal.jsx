// IssueInviteModal — "Issue form link": issues an applicant invite (backend:
// intake/views.py ApplicationInviteViewSet) and shows the QR, access code and
// link once. Opened from the Student Applications page and from the
// registrar's home page, so both issue links the same way.
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { QRCodeSVG } from "qrcode.react";

import Button from "../ui/Button";
import Modal from "../ui/Modal";
import Alert from "../ui/Alert";
import { Field, Input, Select } from "../FormField";
import { useSchoolYear } from "../../context/SchoolYearContext";
import { collect, required, hasErrors } from "../../utils/validation";
import { isLocalOnlyUrl, isPrivateNetworkUrl, resolveApplyUrl } from "../../utils/applyLink";
import { fmtDateTime } from "../../utils/format";
import { createApplicationInvite } from "../../api/applicationApi";

// ── Issue invite ─────────────────────────────────────────────────────────

// Admissions are mostly for the year about to start, so a new link defaults
// to the next upcoming year once an admin has set one up; before that, the
// current year. Any year still taking enrolments can be picked.
function defaultIntakeYear(entryYears, yearStates, currentYear) {
  const upcoming = entryYears.filter((y) => yearStates[y] === "upcoming").sort();
  return upcoming[0] ?? currentYear;
}

export default function IssueInviteModal({ onClose, onIssued }) {
  const { currentYear, entryYears, yearStates } = useSchoolYear();
  const [form, setForm] = useState(() => ({
    applicant_first_name: "", applicant_last_name: "",
    contact_email: "", contact_mobile: "",
    school_year: defaultIntakeYear(entryYears, yearStates, currentYear),
  }));
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

        <Field label="Applying for" hint="The school year they'll be enrolled into. The family can't change it.">
          <Select value={form.school_year} onChange={(e) => set("school_year", e.target.value)} aria-label="Applying for">
            {entryYears.map((y) => (
              <option key={y} value={y}>
                {`S.Y. ${y}${yearStates[y] === "upcoming" ? " (upcoming)" : yearStates[y] === "current" ? " (current)" : ""}`}
              </option>
            ))}
          </Select>
        </Field>

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
// the access code in person. On the LAN deployment the link only opens on the
// same network (the school Wi-Fi, or a hotspot the machine is joined to); on
// the hosted copy it opens from anywhere. The instructions follow whichever
// the link actually is (utils/applyLink.js isPrivateNetworkUrl).
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
  const expires = issued.expires_at ? fmtDateTime(issued.expires_at) : "—";
  const applyUrl = resolveApplyUrl(issued.apply_url, window.location.origin);
  const wifiStep = isPrivateNetworkUrl(applyUrl)
    ? "<li>Connect your phone to the <strong>school Wi-Fi</strong>.</li>"
    : "";
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
  ${issued.school_year ? `<div class="muted">Applying for S.Y. ${escapeHtml(issued.school_year)}</div>` : ""}
  <div class="qr">${qrSvg}</div>
  <div class="muted">Access code</div>
  <div class="code">${escapeHtml(issued.access_code)}</div>
  <ol class="steps">
    ${wifiStep}
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
  const sameNetworkOnly = isPrivateNetworkUrl(applyUrl);

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
        {issued.school_year && (
          <div className="text-[12.5px] text-neutral-500">Applying for S.Y. {issued.school_year}</div>
        )}
        <div ref={qrRef} className="rounded-xl border border-neutral-200 bg-white p-3">
          <QRCodeSVG value={applyUrl} size={208} marginSize={1} title="Application form link" />
        </div>
        <div className="text-[13px] text-neutral-700">
          {sameNetworkOnly
            ? <>Scan with a phone on the <strong>same network as this computer</strong></>
            : <>Scan with any phone camera — Wi-Fi or mobile data</>}
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
