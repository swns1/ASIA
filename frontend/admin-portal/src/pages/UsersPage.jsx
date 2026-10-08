import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import ChipGroup from "../components/ui/ChipGroup";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import SearchField from "../components/ui/SearchField";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Badge, { StatusDot } from "../components/ui/Badge";
import Pagination from "../components/Pagination";
import Alert from "../components/ui/Alert";
import { Field, Input } from "../components/FormField";
import { ROLE_MAP } from "../constants/statusMaps";
import { ROLE_DOT, ROLE_ORDER } from "../constants/roleDots";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import { fieldErrorsFrom, firstMessageFrom } from "../utils/apiError";
import { collect, required, email as emailCheck, minLength, hasErrors, focusFirstError } from "../utils/validation";
import { clearAuthSession, getCurrentUser, isAdminRole, isSuperAdminRole, setCurrentUser } from "../utils/auth";
import PasswordInput from "../components/PasswordInput";
import { MAX_SOURCE_BYTES, resizeImageFile } from "../utils/image";
import { useSchoolYear } from "../context/SchoolYearContext";
import { getSectionAdvisories } from "../api/enrollmentApi";

import {
  getUsers as _getUsers,
  createUser as _createUser,
  updateUser as _updateUser,
} from "../api/identityApi";

const ROLES = ["admin", "super_admin", "registrar", "accounting", "teacher", "guardian"];

const TABLE_COLUMNS = [
  { key: "user",    label: "User",    width: "42%" },
  { key: "role",    label: "Role",    width: "18%" },
  { key: "status",  label: "Status",  width: "14%" },
  { key: "id",      label: "ID",      width: "10%" },
  { key: "actions", label: "Actions", width: "16%", align: "right" },
];

// A deactivated account's avatar goes grey, so the row reads as retired at a
// glance even with the Inactive badge out of view.
const INACTIVE_PALETTE = { bg: "var(--color-muted-50)", color: "var(--color-muted-500)" };

function Avatar({ user, size = 36, dimmed = false }) {
  const palette = dimmed ? INACTIVE_PALETTE : getAvatarPalette(user.name);
  if (user.profile_picture) {
    return (
      <img
        src={user.profile_picture}
        alt=""
        className={`shrink-0 rounded-full object-cover ${dimmed ? "opacity-60 grayscale" : ""}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size, height: size,
        background: palette.bg, color: palette.color,
        fontSize: size * 0.35,
      }}
      aria-hidden="true"
    >
      {initialsFrom(user.name)}
    </div>
  );
}

// Granting super admin is a super admin's decision (identity-service refuses
// it otherwise), so a plain admin isn't offered the option.
function roleOptionsFor(currentUser) {
  return ROLES
    .filter((r) => r !== "super_admin" || isSuperAdminRole(currentUser?.role))
    .map((r) => ({ value: r, label: ROLE_MAP[r]?.label ?? r }));
}

// ── Create user ───────────────────────────────────────────────────────────────

function CreateUserModal({ currentUser, onClose, onCreated }) {
  const [values, setValues] = useState({ name: "", email: "", role: "registrar", password: "" });
  const [serverErrors, setServerErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const dirty = values.name || values.email || values.password;

  const validate = (v) =>
    collect({
      name: required(v.name, "Full name"),
      email: required(v.email, "Email address") ?? emailCheck(v.email),
      password: required(v.password, "Password") ?? minLength(v.password, 8, "Password"),
    });

  // Derived, not stored: errors appear only once they've tried to submit, then
  // stay live so a fix clears immediately — without scolding a half-typed field.
  const errors = { ...(submitted ? validate(values) : {}), ...serverErrors };

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    // A server complaint is stale the moment the field changes.
    setServerErrors({});
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setFormError("");

    const errs = validate(values);
    if (hasErrors(errs)) {
      focusFirstError(errs, ["name", "email", "password"]);
      return;
    }

    setSaving(true);
    try {
      const data = await _createUser({
        name: values.name.trim(),
        email: values.email.trim(),
        role: values.role,
        password: values.password,
      });
      toast.success(`${data.name || "User"} can now sign in.`);
      onCreated(data);
      onClose();
    } catch (err) {
      // Map server-side field errors onto the same inline slots.
      setServerErrors(fieldErrorsFrom(err));
      const msg = firstMessageFrom(err) || "We couldn't create this account. Please try again.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      size="md"
      icon="ti-user-plus"
      title="Create user account"
      description="Add a new person to the school portal."
      loading={saving}
      // Don't let a stray click on the backdrop throw away typed input.
      closeOnBackdrop={!dirty}
      showClose
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="create-user-form" loading={saving}>
            {saving ? "Creating…" : "Create user"}
          </Button>
        </div>
      }
    >
      <form id="create-user-form" onSubmit={handleSubmit} noValidate>
        <AnimatePresence>
          {formError && (
            <Alert variant="error" className="mb-4">
              {formError}
            </Alert>
          )}
        </AnimatePresence>

        <Field label="Full name" required error={errors.name}>
          <Input
            data-field="name"
            value={values.name}
            onChange={set("name")}
            placeholder="e.g. Maria Santos"
            autoComplete="name"
            autoFocus
          />
        </Field>

        <Field
          label="Email address"
          required
          error={errors.email}
          hint="They'll use this to sign in."
        >
          <Input
            data-field="email"
            type="email"
            value={values.email}
            onChange={set("email")}
            placeholder="e.g. maria@southlakes.edu.ph"
            autoComplete="email"
          />
        </Field>

        <Field label="Role" required>
          <ChipGroup
            label="Select a role"
            options={roleOptionsFor(currentUser)}
            value={values.role}
            onChange={(role) => setValues((v) => ({ ...v, role }))}
          />
        </Field>

        <Field
          label="Password"
          required
          error={errors.password}
          hint="At least 8 characters."
        >
          <PasswordInput
            id="password"
            value={values.password}
            onChange={set("password")}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </Field>
      </form>
    </Modal>
  );
}

// ── Edit profile ──────────────────────────────────────────────────────────────

function EditProfileModal({ user, currentUser, onClose, onSaved }) {
  const navigate = useNavigate();
  const isAdmin = isAdminRole(currentUser?.role);
  const isSelf = currentUser?.id === user.user_id;
  // Nobody changes their own role (the server refuses it), so the picker is
  // only for other people's accounts.
  const canChangeRole = isAdmin && !isSelf;

  const [values, setValues] = useState({
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role,
    currentPw: "",
    newPw: "",
    confirmPw: "",
  });
  const [changingPw, setChangingPw] = useState(false);
  const [picPreview, setPicPreview] = useState(user.profile_picture || null);
  const [picData, setPicData] = useState(undefined);
  const [serverErrors, setServerErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const dirty =
    values.name !== (user.name ?? "") ||
    values.email !== (user.email ?? "") ||
    values.role !== user.role ||
    picData !== undefined ||
    changingPw;

  const validate = (v) =>
    collect({
      name: required(v.name, "Full name"),
      email: required(v.email, "Email address") ?? emailCheck(v.email),
      currentPw: changingPw && isSelf ? required(v.currentPw, "Your current password") : null,
      newPw: changingPw
        ? required(v.newPw, "New password") ?? minLength(v.newPw, 8, "New password")
        : null,
      confirmPw: changingPw && v.newPw && v.newPw !== v.confirmPw
        ? "This doesn't match the new password."
        : null,
    });

  // Derived rather than stored — see CreateUserModal.
  const errors = { ...(submitted ? validate(values) : {}), ...serverErrors };

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setServerErrors({});
  };

  async function handlePicChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SOURCE_BYTES) {
      setFormError("That image is larger than 10 MB. Please choose a smaller file.");
      return;
    }
    setFormError("");
    try {
      // Shrunk to avatar size here: every user list carries every photo,
      // so a full-size camera image was paid for on each load of this page.
      const dataUrl = await resizeImageFile(file);
      setPicPreview(dataUrl);
      setPicData(dataUrl);
    } catch (err) {
      setFormError(err.message || "That file couldn't be read as an image.");
    }
  }

  function removePic() {
    setPicPreview(null);
    setPicData(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setFormError("");

    const errs = validate(values);
    if (hasErrors(errs)) {
      focusFirstError(errs, ["name", "email", "currentPw", "newPw", "confirmPw"]);
      return;
    }

    const body = { name: values.name.trim(), email: values.email.trim() };
    if (canChangeRole) body.role = values.role;
    if (changingPw && values.newPw) {
      body.new_password = values.newPw;
      if (isSelf) body.current_password = values.currentPw;
    }
    if (picData !== undefined) body.profile_picture = picData;

    setSaving(true);
    try {
      const data = await _updateUser(user.user_id, body);
      if (isSelf && body.new_password) {
        // Changing your password ends every session, this one included. It
        // used to say "Profile updated." and then drop you on the login page
        // at the next click, with no reason given.
        toast.success("Password changed. Sign in again with your new password.");
        clearAuthSession();
        navigate("/login");
        return;
      }
      if (isSelf) {
        // Keep the sidebar in step with the edit.
        setCurrentUser({ ...currentUser, name: data.name, email: data.email, profile_picture: data.profile_picture });
      }
      toast.success("Profile updated.");
      onSaved(data);
      onClose();
    } catch (err) {
      const serverFields = fieldErrorsFrom(err);
      setServerErrors({
        ...serverFields,
        // DRF names these differently from the form fields.
        ...(serverFields.current_password ? { currentPw: serverFields.current_password } : {}),
        ...(serverFields.new_password ? { newPw: serverFields.new_password } : {}),
      });
      const msg = firstMessageFrom(err) || "We couldn't save these changes. Please try again.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const palette = getAvatarPalette(values.name);

  return (
    <Modal
      onClose={onClose}
      size="md"
      icon="ti-user-edit"
      title="Edit profile"
      description={isSelf ? "Editing your own profile" : `Editing ${user.name}'s profile`}
      loading={saving}
      closeOnBackdrop={!dirty}
      showClose
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="edit-user-form" loading={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      }
    >
      <form id="edit-user-form" onSubmit={handleSubmit} noValidate>
        <AnimatePresence>
          {formError && (
            <Alert variant="error" className="mb-4">
              {formError}
            </Alert>
          )}
        </AnimatePresence>

        {/* Photo */}
        <div className="mb-5 flex items-center gap-4">
          <div className="relative">
            {picPreview ? (
              <img
                src={picPreview}
                alt=""
                className="h-16 w-16 rounded-full border-2 border-neutral-200 object-cover"
              />
            ) : (
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-neutral-200 text-xl font-bold"
                style={{ background: palette.bg, color: palette.color }}
                aria-hidden="true"
              >
                {initialsFrom(values.name)}
              </div>
            )}
          </div>
          <div className="flex flex-col items-start gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              icon="ti-camera"
              onClick={() => fileRef.current?.click()}
            >
              Upload photo
            </Button>
            {picPreview && (
              <button
                type="button"
                onClick={removePic}
                className="focus-ring rounded-sm text-xs text-neutral-500 underline hover:text-brand-600"
              >
                Remove photo
              </button>
            )}
            <span className="text-xs text-neutral-500">JPG, PNG, GIF or WebP · up to 10 MB, shrunk to fit</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handlePicChange}
          />
        </div>

        <Field label="Full name" required error={errors.name}>
          <Input data-field="name" value={values.name} onChange={set("name")} autoComplete="name" />
        </Field>

        <Field label="Email address" required error={errors.email}>
          <Input
            data-field="email"
            type="email"
            value={values.email}
            onChange={set("email")}
            autoComplete="email"
          />
        </Field>

        {canChangeRole && (
          <Field label="Role">
            <ChipGroup
              label="Select a role"
              options={roleOptionsFor(currentUser)}
              value={values.role}
              onChange={(role) => setValues((v) => ({ ...v, role }))}
            />
          </Field>
        )}

        <button
          type="button"
          onClick={() => setChangingPw((v) => !v)}
          aria-expanded={changingPw}
          className="focus-ring mb-3 inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-brand-600 hover:underline"
        >
          <i
            className={`ti ${changingPw ? "ti-chevron-up" : "ti-chevron-down"} text-[14px]`}
            aria-hidden="true"
          />
          {changingPw ? "Cancel password change" : "Change password"}
        </button>

        {changingPw && (
          <div className="rounded-lg border border-neutral-200 bg-brand-50 p-4">
            {isSelf && (
              <Field
                label="Current password"
                required
                error={errors.currentPw}
                hint="Confirms it's really you making this change."
              >
                <PasswordInput
                  id="currentPw"
                  value={values.currentPw}
                  onChange={set("currentPw")}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
              </Field>
            )}
            <Field label="New password" required error={errors.newPw}>
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
          </div>
        )}
      </form>
    </Modal>
  );
}

// ── Deactivate ────────────────────────────────────────────────────────────────

// Accounts are retired, never deleted -- the server refuses a delete, and this
// page offers none (a Delete button came back once, through a merge). A delete
// left every record that points at the person -- a teacher's section
// advisories, the grades they entered, a parent's guardian link -- pointing at
// nobody, and it could not be undone.
//
// Someone who has left is deactivated rather than deleted: they can't sign in
// and drop out of the staff pickers, but their past advisories, grades and
// audit entries keep a name. A teacher's advisories from this year on are
// listed, because they stay assigned until someone picks a replacement.
function DeactivateUserModal({ user, onClose, onDeactivated }) {
  const { currentYear } = useSchoolYear();
  const [advisories, setAdvisories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user.role !== "teacher") return undefined;
    let live = true;
    getSectionAdvisories({ teacher_user_id: user.user_id, page_size: 100 })
      .then((data) => {
        if (!live) return;
        const rows = Array.isArray(data) ? data : data?.results ?? [];
        // School year labels are "YYYY-YYYY", so they compare as text.
        setAdvisories(rows.filter((a) => !currentYear || a.school_year >= currentYear));
      })
      // Only a heads-up: deactivating doesn't depend on it.
      .catch(() => {});
    return () => { live = false; };
  }, [user.role, user.user_id, currentYear]);

  async function handleConfirm() {
    setSaving(true);
    setError("");
    try {
      const updated = await _updateUser(user.user_id, { is_active: false });
      toast.success(`${user.name} was deactivated and signed out.`);
      onDeactivated(updated);
    } catch (err) {
      setError(firstMessageFrom(err) || "We couldn't deactivate this account. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      size="sm"
      icon="ti-user-off"
      iconTone="danger"
      title={`Deactivate ${user.name}?`}
      description="Signed out right away, and can't sign in until reactivated. Past advisories, grades and audit entries keep the name. You can reactivate the account anytime."
      loading={saving}
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" fullWidth disabled={saving} onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button variant="destructive" fullWidth loading={saving} onClick={handleConfirm}>
            {saving ? "Working…" : "Deactivate account"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {advisories.length > 0 && (
          <Alert variant="warning" title="Still advises">
            <ul className="mt-1 space-y-0.5">
              {advisories.map((a) => (
                <li key={a.advisory_id}>
                  S.Y. {a.school_year} · {a.grade_level} {a.section}{a.strand ? ` (${a.strand})` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-1.5">
              These stay assigned until you pick a new adviser on the School Years page.
            </p>
          </Alert>
        )}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

/// ── Page ──────────────────────────────────────────────────────────────────────

// Whether an account can sign in. Deactivated staff stay listed, with their
// name on everything they recorded; the page opens on the active ones.
const ACCOUNT_STATUS_MAP = {
  active:   { label: "Active",   variant: "success" },
  inactive: { label: "Inactive", variant: "muted" },
};
const STATUS_FILTERS = [
  { value: "active",   label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all",      label: "Active and inactive" },
];
const DEFAULT_STATUS = "active";

export default function UsersPage() {
  usePageTitle("Users");
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const isAdmin = isAdminRole(currentUser?.role);

  // One page at a time from the server. This used to download every account
  // -- every guardian, every photo -- and filter in the browser.
  const [users, setUsers] = useState([]);
  const [pageMeta, setPageMeta] = useState({ count: 0, next: null, previous: null });
  const [counts, setCounts] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  // Opens on active accounts: staff who have left stay out of the way, one
  // click from view.
  const [statusFilter, setStatusFilter] = useState(DEFAULT_STATUS);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const [reactivatingId, setReactivatingId] = useState(null);
  const searchRef = useRef(null);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await _getUsers({
        page,
        ...(roleFilter !== "all" ? { role: roleFilter } : null),
        ...(statusFilter !== "all" ? { status: statusFilter } : null),
        ...(query ? { search: query } : null),
      });
      setUsers(data.results ?? []);
      setPageMeta({ count: data.count ?? 0, next: data.next ?? null, previous: data.previous ?? null });
      setCounts(data.counts ?? null);
    } catch (err) {
      console.error(err);
      setLoadError(err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, statusFilter, query]);

  useEffect(() => {
    if (!currentUser) { navigate("/login"); return; }
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUsers]);

  // The band counts each role among the accounts the Status menu shows --
  // active ones unless asked otherwise -- and not the search, which narrows
  // only the rows, as on the other list pages.
  const roleCount = (role) => {
    if (!counts) return undefined;
    const every = counts.by_role?.[role] ?? 0;
    const inactive = counts.inactive_by_role?.[role] ?? 0;
    if (statusFilter === "active") return every - inactive;
    if (statusFilter === "inactive") return inactive;
    return every;
  };
  const bandTotal = counts ? ROLE_ORDER.reduce((sum, r) => sum + roleCount(r), 0) : undefined;

  // Every filter change returns to page 1 -- staying on page 4 of a narrower
  // result would land on an empty table.
  const applyRole = (value) => { setRoleFilter(value); setPage(1); };
  const applyStatus = (value) => { setStatusFilter(value); setPage(1); };

  const hasActiveFilters = roleFilter !== "all" || statusFilter !== DEFAULT_STATUS || Boolean(search);
  const clearFilters = () => {
    setRoleFilter("all"); setStatusFilter(DEFAULT_STATUS); setSearch(""); setQuery(""); setPage(1);
    searchRef.current?.focus();
  };
  const onlyInactiveFilter = statusFilter === "inactive" && roleFilter === "all" && !search;
  const totalPages = Math.max(1, Math.ceil(pageMeta.count / 25));

  const bandCaption = `${statusFilter === "all" ? "" : `${statusFilter} `}account${bandTotal === 1 ? "" : "s"}`;
  const roleMeta = ROLE_MAP[roleFilter];

  async function handleReactivate(u) {
    setReactivatingId(u.user_id);
    try {
      await _updateUser(u.user_id, { is_active: true });
      toast.success(`${u.name} can sign in again.`);
      fetchUsers();
    } catch (err) {
      toast.error(firstMessageFrom(err) || "We couldn't reactivate this account. Please try again.");
    } finally {
      setReactivatingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        actions={
          isAdmin && (
            <Button icon="ti-user-plus" onClick={() => setShowCreate(true)}>
              New User
            </Button>
          )
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        {/* ── Who has an account, by role, and the role filter ── */}
        <StatusBand
          total={bandTotal}
          caption={bandCaption}
          hint="Pick a role to filter the list"
          options={[
            { value: "all", label: "All", count: bandTotal },
            ...ROLE_ORDER.map((r) => ({
              value: r,
              label: ROLE_MAP[r]?.label ?? r,
              count: roleCount(r),
              dot: ROLE_DOT[r],
            })),
          ]}
          value={roleFilter}
          allValue="all"
          onChange={applyRole}
          label="Filter by role"
        />

        {/* ── Toolbar: search, the status menu, Clear ── */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            id="user-search"
            label="Search users by name or email"
            placeholder="Search by name or email…"
            inputRef={searchRef}
            value={search}
            onChange={setSearch}
            onClear={() => setSearch("")}
          />

          <FilterMenu
            label="Status"
            valueLabel={STATUS_FILTERS.find((f) => f.value === statusFilter)?.label ?? "Active"}
            active={statusFilter !== DEFAULT_STATUS}
            options={STATUS_FILTERS}
            value={statusFilter}
            onChange={applyStatus}
            align="end"
            menuWidth={200}
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="focus-ring flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-error-600 transition-colors duration-150 hover:bg-brand-100"
            >
              <i className="ti ti-filter-off text-[14px]" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>

        <Card padding="none" className="overflow-hidden">
          <div className="flex items-baseline gap-2.5 border-b border-neutral-200 px-5 py-4">
            <h2 className="text-md font-bold text-neutral-900">
              {roleMeta ? `${roleMeta.label} accounts` : "All accounts"}
            </h2>
            {!loading && !loadError && (
              <span className="text-sm text-neutral-500 tabular-nums">{pageMeta.count.toLocaleString()}</span>
            )}
          </div>
          <Table
            headerVariant="quiet"
            columns={TABLE_COLUMNS}
            loading={loading}
            error={loadError}
            onRetry={fetchUsers}
            errorSubject="the user list"
            isEmpty={users.length === 0}
            skeletonRows={5}
            empty={{
              icon: "ti-users",
              title: onlyInactiveFilter
                ? "No inactive accounts"
                : hasActiveFilters ? "No users match your filters" : "No users yet",
              subtitle: onlyInactiveFilter
                ? "Someone who leaves shows up here once deactivated."
                : hasActiveFilters
                  ? "Try a different role, status or search term."
                  : "Create the first account to get started.",
              action: onlyInactiveFilter ? null : hasActiveFilters ? (
                <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : isAdmin ? (
                <Button size="sm" icon="ti-user-plus" onClick={() => setShowCreate(true)}>
                  New User
                </Button>
              ) : null,
            }}
          >
            {users.map((u) => {
              const isSelf = currentUser?.id === u.user_id;
              // A super admin account is only a super admin's to edit or
              // deactivate; a plain admin was offered both and met a 403.
              const outranked = isSuperAdminRole(u.role) && !isSuperAdminRole(currentUser?.role);
              const canEdit = isSelf || (isAdmin && !outranked);
              const canChangeStatus = isAdmin && !isSelf && !outranked;
              const inactive = u.is_active === false;
              return (
                <TableRow key={u.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar user={u} size={32} dimmed={inactive} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`truncate text-[13px] font-semibold ${inactive ? "text-neutral-500" : "text-neutral-900"}`}>
                            {u.name}
                          </span>
                          {isSelf && (
                            <Badge variant="success" size="sm">You</Badge>
                          )}
                        </div>
                        <div className="truncate text-[11.5px] text-neutral-500">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>

                  {/* The same dot as the band's legend. */}
                  <TableCell>
                    <span className="inline-flex items-center gap-2 text-sm text-neutral-800">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${ROLE_DOT[u.role] ?? "bg-neutral-400"}`} aria-hidden="true" />
                      {ROLE_MAP[u.role]?.label ?? u.role}
                    </span>
                  </TableCell>

                  <TableCell>
                    <StatusDot status={inactive ? "inactive" : "active"} map={ACCOUNT_STATUS_MAP} />
                  </TableCell>

                  <TableCell>
                    <span className="font-mono text-[12px] text-neutral-800">#{u.user_id}</span>
                  </TableCell>

                  <TableCell align="right">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button
                          variant="ghost" size="sm" iconOnly icon="ti-pencil"
                          title="Edit profile"
                          aria-label={`Edit ${u.name}`}
                          onClick={() => setEditing(u)}
                        />
                      )}
                      {canChangeStatus && !inactive && (
                        <Button
                          variant="ghost" size="sm" iconOnly icon="ti-user-off"
                          title="Deactivate account"
                          aria-label={`Deactivate ${u.name}`}
                          className="hover:bg-error-50 hover:text-error-500"
                          onClick={() => setDeactivating(u)}
                        />
                      )}
                      {canChangeStatus && inactive && (
                        <Button
                          variant="ghost" size="sm" iconOnly icon="ti-user-check"
                          title="Reactivate account"
                          aria-label={`Reactivate ${u.name}`}
                          className="text-success-500"
                          loading={reactivatingId === u.user_id}
                          disabled={reactivatingId === u.user_id}
                          onClick={() => handleReactivate(u)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </Table>
        </Card>

        {!loading && !loadError && pageMeta.count > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            count={pageMeta.count}
            hasPrevious={Boolean(pageMeta.previous)}
            hasNext={Boolean(pageMeta.next)}
            onPageChange={setPage}
          />
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateUserModal
            currentUser={currentUser}
            onClose={() => setShowCreate(false)}
            onCreated={() => fetchUsers()}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <EditProfileModal
            user={editing}
            currentUser={currentUser}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              fetchUsers();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deactivating && (
          <DeactivateUserModal
            user={deactivating}
            onClose={() => setDeactivating(null)}
            onDeactivated={() => {
              setDeactivating(null);
              fetchUsers();
            }}
          />
        )}
      </AnimatePresence>

    </>
  );
}
