import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card, { StatCard } from "../components/ui/Card";
import FilterBar, { FilterRow } from "../components/ui/FilterBar";
import ChipGroup from "../components/ui/ChipGroup";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Badge from "../components/ui/Badge";
import Pagination from "../components/Pagination";
import Alert from "../components/ui/Alert";
import { Field, Input } from "../components/FormField";
import { ROLE_MAP } from "../constants/statusMaps";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import { fieldErrorsFrom, firstMessageFrom } from "../utils/apiError";
import { collect, required, email as emailCheck, minLength, hasErrors, focusFirstError } from "../utils/validation";
import { clearAuthSession, getCurrentUser, isAdminRole, isSuperAdminRole, setCurrentUser } from "../utils/auth";
import PasswordInput from "../components/PasswordInput";
import { MAX_SOURCE_BYTES, resizeImageFile } from "../utils/image";

import {
  getUsers as _getUsers,
  createUser as _createUser,
  updateUser as _updateUser,
} from "../api/identityApi";

const ROLES = ["admin", "super_admin", "registrar", "accounting", "teacher", "guardian"];

const TABLE_COLUMNS = [
  { key: "user",    label: "User",    width: "45%" },
  { key: "role",    label: "Role",    width: "20%" },
  { key: "id",      label: "ID",      width: "15%" },
  { key: "actions", label: "Actions", width: "20%", align: "right" },
];

// The role chips and stat cards filter by these groups.
const ROLE_FILTER_PARAM = {
  admin: "admin,super_admin",
  staff: "registrar,teacher,accounting",
};

function Avatar({ user, size = 36 }) {
  const palette = getAvatarPalette(user.name);
  if (user.profile_picture) {
    return (
      <img
        src={user.profile_picture}
        alt=""
        className="shrink-0 rounded-full object-cover"
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

// ── Deactivate / reactivate ───────────────────────────────────────────────────
//
// Accounts are retired, not deleted. A delete left every record that points at
// the person -- a teacher's section advisories, grades they entered, a
// parent's guardian link -- pointing at nobody. A deactivated account can't
// sign in, but it still names them everywhere, and it can be brought back.

function AccountStatusModal({ user, onClose, onChanged }) {
  const deactivating = user.is_active !== false;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setSaving(true);
    try {
      const updated = await _updateUser(user.user_id, { is_active: !deactivating });
      toast.success(deactivating ? `${user.name} can no longer sign in.` : `${user.name} can sign in again.`);
      onChanged(updated);
      onClose();
    } catch (err) {
      setError(firstMessageFrom(err) || "We couldn't change this account. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConfirmModal
      icon={deactivating ? "ti-user-off" : "ti-user-check"}
      danger={deactivating}
      title={deactivating ? "Deactivate this account?" : "Reactivate this account?"}
      message={deactivating ? (
        <>
          <strong className="text-neutral-900">{user.name}</strong> won&apos;t be able to sign in,
          and any open session ends now. Their name stays on everything they did.
          {user.role === "teacher" && " If they advise a section, give it a new adviser on Teacher Advisories."}
          {" "}You can reactivate the account later.
        </>
      ) : (
        <>
          <strong className="text-neutral-900">{user.name}</strong> will be able to sign in again
          with their existing password.
        </>
      )}
      error={error}
      loading={saving}
      confirmLabel={deactivating ? "Deactivate" : "Reactivate"}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);

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
      const role = ROLE_FILTER_PARAM[roleFilter] ?? (roleFilter === "all" ? null : roleFilter);
      const data = await _getUsers({
        page,
        ...(role ? { role } : null),
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

  const byRole = counts?.by_role ?? {};
  const stats = {
    total: counts?.total ?? 0,
    admins: (byRole.admin ?? 0) + (byRole.super_admin ?? 0),
    staff: (byRole.registrar ?? 0) + (byRole.teacher ?? 0) + (byRole.accounting ?? 0),
    guardians: byRole.guardian ?? 0,
  };

  // Every filter change returns to page 1 -- staying on page 4 of a narrower
  // result would land on an empty table.
  const applyRole = (value) => { setRoleFilter(value); setPage(1); };
  const applyStatus = (value) => { setStatusFilter(value); setPage(1); };

  const hasActiveFilters = roleFilter !== "all" || statusFilter !== "all" || Boolean(search);
  const clearFilters = () => {
    setRoleFilter("all"); setStatusFilter("all"); setSearch(""); setQuery(""); setPage(1);
  };
  const totalPages = Math.max(1, Math.ceil(pageMeta.count / 25));

  const roleFilterOptions = [
    { value: "all", label: "All", tone: "brand", count: stats.total },
    // Tone and icon come from the shared role map, so a chip lights up in the
    // same colour as that role's badge in the table below.
    ...ROLES.map((r) => ({
      value: r,
      label: ROLE_MAP[r]?.label ?? r,
      tone: ROLE_MAP[r]?.variant ?? "brand",
      icon: ROLE_MAP[r]?.icon,
      count: byRole[r] ?? 0,
    })),
  ];

  const statusFilterOptions = [
    { value: "all", label: "All", tone: "brand" },
    { value: "active", label: "Active", tone: "success", icon: "ti-user-check" },
    { value: "inactive", label: "Deactivated", tone: "muted", icon: "ti-user-off", count: counts?.inactive ?? 0 },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        icon="ti-user-cog"
        subtitle={
          loading
            ? "Loading…"
            : `${stats.total} account${stats.total === 1 ? "" : "s"}${counts?.inactive ? `, ${counts.inactive} deactivated` : ""}`
        }
        actions={
          isAdmin && (
            <Button icon="ti-user-plus" onClick={() => setShowCreate(true)}>
              New User
            </Button>
          )
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            label="Total Users"
            value={stats.total}
            icon="ti-users"
            iconTone="brand"
            layout="horizontal"
            loading={loading}
            active={roleFilter === "all"}
            onClick={() => applyRole("all")}
          />
          <StatCard
            label="Admins"
            value={stats.admins}
            icon="ti-shield-check"
            iconTone="accent"
            layout="horizontal"
            loading={loading}
            active={roleFilter === "admin"}
            onClick={() => applyRole(roleFilter === "admin" ? "all" : "admin")}
          />
          <StatCard
            label="Staff"
            value={stats.staff}
            icon="ti-user"
            iconTone="info"
            layout="horizontal"
            loading={loading}
            active={roleFilter === "staff"}
            onClick={() => applyRole(roleFilter === "staff" ? "all" : "staff")}
          />
          <StatCard
            label="Guardians"
            value={stats.guardians}
            icon="ti-users-group"
            iconTone="muted"
            layout="horizontal"
            loading={loading}
            active={roleFilter === "guardian"}
            onClick={() => applyRole(roleFilter === "guardian" ? "all" : "guardian")}
          />
        </div>

        {/* Search filters as you type — no Search button, so FilterBar omits
            one rather than implying a submit step that doesn't exist. */}
        <FilterBar
          searchInputId="user-search"
          searchLabel="Search users by name or email"
          searchPlaceholder="Search by name or email…"
          searchValue={search}
          onSearchChange={setSearch}
          onClearSearch={() => setSearch("")}
          hasFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        >
          <FilterRow label="Role">
            <ChipGroup
              label="Filter by role"
              options={roleFilterOptions}
              value={roleFilter}
              onChange={applyRole}
            />
          </FilterRow>
          <FilterRow label="Status">
            <ChipGroup
              label="Filter by account status"
              options={statusFilterOptions}
              value={statusFilter}
              onChange={applyStatus}
            />
          </FilterRow>
        </FilterBar>

        <Card padding="none" className="overflow-hidden">
          <Table
            columns={TABLE_COLUMNS}
            loading={loading}
            error={loadError}
            onRetry={fetchUsers}
            errorSubject="the user list"
            isEmpty={users.length === 0}
            skeletonRows={5}
            empty={{
              icon: "ti-users",
              title: hasActiveFilters ? "No users match your filters" : "No users yet",
              subtitle: hasActiveFilters
                ? "Try a different role, status or search term."
                : "Create the first account to get started.",
              action: hasActiveFilters ? (
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
              const meta = ROLE_MAP[u.role];
              // A super admin account is only a super admin's to edit or
              // delete; a plain admin was offered both and met a 403.
              const outranked = isSuperAdminRole(u.role) && !isSuperAdminRole(currentUser?.role);
              const canEdit = isSelf || (isAdmin && !outranked);
              const canChangeStatus = isAdmin && !isSelf && !outranked;
              const inactive = u.is_active === false;
              return (
                <TableRow key={u.user_id} className={inactive ? "opacity-60" : undefined}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar user={u} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-neutral-900">
                            {u.name}
                          </span>
                          {isSelf && (
                            <Badge variant="success" size="sm">You</Badge>
                          )}
                          {inactive && (
                            <Badge variant="muted" size="sm" icon="ti-user-off">Deactivated</Badge>
                          )}
                        </div>
                        <div className="truncate text-xs text-neutral-500">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant={meta?.variant ?? "muted"} icon={meta?.icon}>
                      {meta?.label ?? u.role}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <span className="font-mono text-xs text-neutral-500">#{u.user_id}</span>
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
                      {canChangeStatus && (
                        <Button
                          variant="ghost" size="sm" iconOnly
                          icon={inactive ? "ti-user-check" : "ti-user-off"}
                          title={inactive ? "Reactivate account" : "Deactivate account"}
                          aria-label={`${inactive ? "Reactivate" : "Deactivate"} ${u.name}`}
                          className={inactive ? undefined : "hover:bg-error-50 hover:text-error-500"}
                          onClick={() => setStatusTarget(u)}
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
        {statusTarget && (
          <AccountStatusModal
            user={statusTarget}
            onClose={() => setStatusTarget(null)}
            onChanged={() => {
              setStatusTarget(null);
              fetchUsers();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
