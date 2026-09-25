import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Alert from "./ui/Alert";
import { Field } from "./FormField";
import PasswordInput from "./PasswordInput";
import { updateUser } from "../api/identityApi";
import { clearAuthSession } from "../utils/auth";
import { firstMessageFrom } from "../utils/apiError";
import { collect, required, minLength, hasErrors, focusFirstError } from "../utils/validation";

// Change your own password, for every role.
//
// The server has always let anyone change their own password (with their
// current one), but the only screen for it was the admin-only Users page. A
// registrar, teacher, accountant or parent kept whatever password an admin
// had set -- which meant the admins knew everyone's password.
export default function AccountSettingsModal({ user, onClose }) {
  const navigate = useNavigate();
  const [values, setValues] = useState({ currentPw: "", newPw: "", confirmPw: "" });
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const dirty = Boolean(values.currentPw || values.newPw || values.confirmPw);

  const validate = (v) =>
    collect({
      currentPw: required(v.currentPw, "Your current password"),
      newPw: required(v.newPw, "New password") ?? minLength(v.newPw, 8, "New password"),
      confirmPw: v.newPw && v.newPw !== v.confirmPw ? "This doesn't match the new password." : null,
    });

  const errors = submitted ? validate(values) : {};

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setFormError("");

    const errs = validate(values);
    if (hasErrors(errs)) {
      focusFirstError(errs, ["currentPw", "newPw", "confirmPw"]);
      return;
    }

    setSaving(true);
    try {
      await updateUser(user.id, { current_password: values.currentPw, new_password: values.newPw });
      // A password change ends every session, this one included -- say so
      // rather than letting the next click land on the login page unexplained.
      toast.success("Password changed. Sign in again with your new password.");
      clearAuthSession();
      navigate("/login");
    } catch (err) {
      setFormError(firstMessageFrom(err) || "We couldn't change your password. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      size="md"
      icon="ti-key"
      title="Change password"
      description={user?.email ? `Signed in as ${user.email}` : undefined}
      loading={saving}
      closeOnBackdrop={!dirty}
      showClose
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="account-password-form" loading={saving}>
            {saving ? "Saving…" : "Change password"}
          </Button>
        </div>
      }
    >
      <form id="account-password-form" onSubmit={handleSubmit} noValidate>
        <AnimatePresence>
          {formError && (
            <Alert variant="error" className="mb-4">
              {formError}
            </Alert>
          )}
        </AnimatePresence>

        <Field label="Current password" required error={errors.currentPw}>
          <PasswordInput
            id="currentPw"
            value={values.currentPw}
            onChange={set("currentPw")}
            placeholder="Enter your current password"
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password" required error={errors.newPw} hint="At least 8 characters, not too common, and not like your name or email.">
          <PasswordInput
            id="newPw"
            value={values.newPw}
            onChange={set("newPw")}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password" required error={errors.confirmPw} className="mb-0">
          <PasswordInput
            id="confirmPw"
            value={values.confirmPw}
            onChange={set("confirmPw")}
            placeholder="Repeat new password"
            autoComplete="new-password"
          />
        </Field>
        <p className="mt-3 text-xs text-neutral-500">
          You&apos;ll be signed out everywhere and asked to sign in with the new password.
        </p>
      </form>
    </Modal>
  );
}
