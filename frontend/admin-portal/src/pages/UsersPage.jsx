import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useMemo, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card, { StatCard } from "../components/ui/Card";
import ChipGroup from "../components/ui/ChipGroup";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Badge from "../components/ui/Badge";
import Alert from "../components/ui/Alert";
import { Field, Input } from "../components/FormField";
import { ROLE_MAP } from "../constants/statusMaps";
import { getAvatarPalette } from "../utils/avatarPalette";
import { fieldErrorsFrom, firstMessageFrom } from "../utils/apiError";
import { collect, required, email as emailCheck, minLength, hasErrors, focusFirstError } from "../utils/validation";
import { getCurrentUser, isAdminRole } from "../utils/auth";

import {
  getUsers as _getUsers,
  createUser as _createUser,
  updateUser as _updateUser,
  deleteUser as _deleteUser,
} from "../api/identityApi";

const ROLES = ["admin", "super_admin", "registrar", "accounting", "teacher", "guardian"];

const TABLE_COLUMNS = [
  { key: "user",    label: "User",    width: "45%" },
  { key: "role",    label: "Role",    width: "20%" },
  { key: "id",      label: "ID",      width: "15%" },
  { key: "actions", label: "Actions", width: "20%", align: "right" },
];

const MAX_PIC_BYTES = 2 * 1024 * 1024;

function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase() || "??";
}

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
      {initials(user.name)}
    </div>
  );
}

/** Password field with a show/hide toggle — used in both modals. */
function PasswordInput({ id, value, onChange, placeholder, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        data-field={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="focus-ring absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-neutral-500 hover:text-brand-500"
      >
        <i className={`ti ${visible ? "ti-eye-off" : "ti-eye"}`} aria-hidden="true" />
      </button>
    </div>
  );
}

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_MAP[r]?.label ?? r }));

// ── Create user ───────────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }) {
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
            placeholder="e.g. maria@southlakes.edu"
            autoComplete="email"
          />
        </Field>

        <Field label="Role" required>
          <ChipGroup
            label="Select a role"
            options={roleOptions}
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
  const isAdmin = isAdminRole(currentUser?.role);
  const isSelf = currentUser?.id === user.user_id;

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

  function handlePicChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PIC_BYTES) {
      setFormError("That image is larger than 2 MB. Please choose a smaller file.");
      return;
    }
    setFormError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPicPreview(ev.target.result);
      setPicData(ev.target.result);
    };
    reader.readAsDataURL(file);
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
    if (isAdmin) body.role = values.role;
    if (changingPw && values.newPw) {
      body.new_password = values.newPw;
      if (isSelf) body.current_password = values.currentPw;
    }
    if (picData !== undefined) body.profile_picture = picData;

    setSaving(true);
    try {
      const data = await _updateUser(user.user_id, body);
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
                {initials(values.name)}
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
                className="focus-ring rounded-sm text-xs text-neutral-500 underline hover:text-brand-500"
              >
                Remove photo
              </button>
            )}
            <span className="text-xs text-neutral-500">JPG, PNG or GIF · max 2 MB</span>
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

        {isAdmin && (
          <Field label="Role">
            <ChipGroup
              label="Select a role"
              options={roleOptions}
              value={values.role}
              onChange={(role) => setValues((v) => ({ ...v, role }))}
            />
          </Field>
        )}

        <button
          type="button"
          onClick={() => setChangingPw((v) => !v)}
          aria-expanded={changingPw}
          className="focus-ring mb-3 inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-brand-500 hover:underline"
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

// ── Delete ────────────────────────────────────────────────────────────────────

function DeleteUserModal({ user, currentUser, onClose, onDeleted }) {
  const isSelf = currentUser?.id === user.user_id;
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(() =>
    isSelf ? "You can't delete your own account." : ""
  );

  async function handleDelete() {
    if (isSelf) return;
    setDeleting(true);
    try {
      await _deleteUser(user.user_id);
      toast.success("User account deleted.");
      onDeleted(user.user_id);
      onClose();
    } catch (err) {
      setError(firstMessageFrom(err) || "We couldn't delete this account. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ConfirmModal
      icon="ti-trash"
      title="Delete user account?"
      message={
        <>
          <strong className="text-neutral-900">{user.name}</strong> will lose access to the
          portal immediately. This cannot be undone.
        </>
      }
      error={error}
      loading={deleting}
      confirmDisabled={isSelf}
      confirmLabel="Delete account"
      onConfirm={handleDelete}
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

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function fetchUsers() {
    setLoading(true);
    setLoadError(null);
    try {
      setUsers(await _getUsers());
    } catch (err) {
      console.error(err);
      setLoadError(err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!currentUser) { navigate("/login"); return; }
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        !q ||
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, search, roleFilter]);

  const stats = useMemo(
    () => ({
      total: users.length,
      admins: users.filter((u) => isAdminRole(u.role)).length,
      staff: users.filter((u) => !isAdminRole(u.role) && u.role !== "guardian").length,
      guardians: users.filter((u) => u.role === "guardian").length,
    }),
    [users]
  );

  const hasActiveFilters = roleFilter !== "all" || Boolean(search);
  const clearFilters = () => { setRoleFilter("all"); setSearch(""); };

  const roleFilterOptions = [
    { value: "all", label: "All", count: users.length },
    ...ROLES.map((r) => ({
      value: r,
      label: ROLE_MAP[r]?.label ?? r,
      count: users.filter((u) => u.role === r).length,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Users"
        icon="ti-user-cog"
        subtitle={
          loading
            ? "Loading…"
            : `${users.length} account${users.length === 1 ? "" : "s"} with portal access`
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
          <StatCard label="Total Users" value={stats.total} icon="ti-users" iconTone="brand" loading={loading} />
          <StatCard label="Admins" value={stats.admins} icon="ti-shield-check" iconTone="accent" loading={loading} />
          <StatCard label="Staff" value={stats.staff} icon="ti-user" iconTone="info" loading={loading} />
          <StatCard label="Guardians" value={stats.guardians} icon="ti-users-group" iconTone="muted" loading={loading} />
        </div>

        <Card>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] flex-1">
              <label htmlFor="user-search" className="sr-only">Search users by name or email</label>
              <i
                className="ti ti-search pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-neutral-500"
                aria-hidden="true"
              />
              <input
                id="user-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="focus-ring h-10 w-full rounded-lg border-[1.5px] border-neutral-300 bg-white pl-10 pr-9 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-500 hover:border-brand-300"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="focus-ring absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-neutral-500 hover:text-brand-500"
                >
                  <i className="ti ti-x text-[13px]" aria-hidden="true" />
                </button>
              )}
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" icon="ti-filter-off" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          <hr className="my-4 border-neutral-200" />

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
              Role
            </div>
            <ChipGroup
              label="Filter by role"
              options={roleFilterOptions}
              value={roleFilter}
              onChange={setRoleFilter}
            />
          </div>
        </Card>

        <Card padding="none" className="overflow-hidden">
          <Table
            columns={TABLE_COLUMNS}
            loading={loading}
            error={loadError}
            onRetry={fetchUsers}
            errorSubject="the user list"
            isEmpty={filtered.length === 0}
            skeletonRows={5}
            empty={{
              icon: "ti-users",
              title: hasActiveFilters ? "No users match your filters" : "No users yet",
              subtitle: hasActiveFilters
                ? "Try a different role or search term."
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
            {filtered.map((u) => {
              const isSelf = currentUser?.id === u.user_id;
              const meta = ROLE_MAP[u.role];
              return (
                <TableRow key={u.user_id}>
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
                      {(isAdmin || isSelf) && (
                        <Button
                          variant="ghost" size="sm" iconOnly icon="ti-pencil"
                          title="Edit profile"
                          aria-label={`Edit ${u.name}`}
                          onClick={() => setEditing(u)}
                        />
                      )}
                      {isAdmin && !isSelf && (
                        <Button
                          variant="ghost" size="sm" iconOnly icon="ti-trash"
                          title="Delete account"
                          aria-label={`Delete ${u.name}`}
                          className="hover:bg-error-50 hover:text-error-500"
                          onClick={() => setDeleting(u)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </Table>
        </Card>
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateUserModal
            onClose={() => setShowCreate(false)}
            onCreated={(u) => setUsers((prev) => [...prev, u])}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <EditProfileModal
            user={editing}
            currentUser={currentUser}
            onClose={() => setEditing(null)}
            onSaved={(updated) => {
              setUsers((prev) =>
                prev.map((x) => (x.user_id === updated.user_id ? updated : x))
              );
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleting && (
          <DeleteUserModal
            user={deleting}
            currentUser={currentUser}
            onClose={() => setDeleting(null)}
            onDeleted={(id) => {
              setUsers((prev) => prev.filter((x) => x.user_id !== id));
              setDeleting(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
