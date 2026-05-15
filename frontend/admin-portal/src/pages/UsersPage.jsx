import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getVisibleNavGroups } from "../utils/navigation";
import { clearAuthSession, getCurrentUser, setCurrentUser, isAdminRole } from "../utils/auth";
import logo from "../assets/logo.png";
import logoutIcon from "../assets/logout.svg";

// ── Constants ─────────────────────────────────────────────────────────────────

const IDENTITY_API = "http://localhost:8001/api/auth";

const NAV = [
  { section: "Main", items: [
    { label: "Dashboard",    icon: "ti-layout-dashboard", path: "/dashboard"   },
    { label: "Students",     icon: "ti-users",            path: "/students"    },
    { label: "Enrollments",  icon: "ti-clipboard-list",   path: "/enrollments" },
    { label: "Subjects",     icon: "ti-book",             path: "/subjects"    },
    { label: "Grades",       icon: "ti-chart-bar",        path: "/grades"      },
    { label: "Requirements", icon: "ti-file-check",       path: "/requirements"},
    { label: "Analytics", icon: "ti-chart-dots-3", path: "/analytics" },
  ]},
  { section: "Finance", items: [
    { label: "Invoices",     icon: "ti-receipt",  path: "/invoices"     },
    { label: "Payments",     icon: "ti-cash",     path: "/payments"     },
    { label: "Scholarships", icon: "ti-discount", path: "/scholarships" },
  ]},
  { section: "Settings", items: [
    { label: "Users",             icon: "ti-user-cog",         path: "/users"             },
    { label: "Audit Trail",       icon: "ti-shield-check",     path: "/audit-trail", adminOnly: true },
    { label: "School Settings",   icon: "ti-settings",         path: "/settings"          },
    { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates" },
    { label: "Scholarship Types", icon: "ti-discount",         path: "/scholarship-types" },
    { label: "Fee Schedules",     icon: "ti-cash",             path: "/fee-schedules"     },
  ]},
];

const ROLES = ["admin", "super_admin", "registrar", "cashier", "teacher"];

const ROLE_META = {
  admin:       { bg: "#fde8e8", color: "#9b2020", label: "Admin" },
  super_admin: { bg: "#f0e8fd", color: "#6d28d9", label: "Super Admin" },
  registrar:   { bg: "#e3f0fd", color: "#1455a0", label: "Registrar" },
  cashier:     { bg: "#e8f5e0", color: "#2e6b0d", label: "Cashier" },
  teacher:     { bg: "#fef3e2", color: "#7a4a08", label: "Teacher" },
};

const C = {
  red: "#e03131", redDark: "#c92a2a", redLight: "#fff0f0", redBorder: "#fca5a5",
  border: "#f5eaea", softBorder: "#f9f0f0", text: "#1a0a0a",
  muted: "#7a5050", pale: "#b09090", bg: "#fdf8f6", white: "#ffffff",
};

function getToken() { return sessionStorage.getItem("access_token") || ""; }

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const PALETTE = [
  ["#fde8e8","#e03131"],["#e3f0fd","#1455a0"],["#e8f5e0","#2e6b0d"],
  ["#f0e8fd","#6d28d9"],["#fef3e2","#7a4a08"],["#e8f4fd","#0369a1"],
];

function avatarColors(name = "") {
  const i = name.charCodeAt(0) % PALETTE.length;
  return PALETTE[i];
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (name.slice(0, 2).toUpperCase() || "??");
}

function Avatar({ user, size = 36, style = {} }) {
  const [bg, fg] = avatarColors(user.name);
  if (user.profile_picture) {
    return (
      <img
        src={user.profile_picture}
        alt={user.name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, ...style }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, color: fg, flexShrink: 0, ...style,
    }}>
      {initials(user.name)}
    </div>
  );
}

function RoleBadge({ role }) {
  const meta = ROLE_META[role] || { bg: "#f0ede8", color: "#5c5752", label: role };
  return (
    <span style={{
      background: meta.bg, color: meta.color,
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
    }}>{meta.label}</span>
  );
}

// ── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({ user, currentUser, onClose, onSaved }) {
  const isAdmin = isAdminRole(currentUser?.role);
  const isSelf = currentUser?.id === user.user_id;

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPwSection, setShowPwSection] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [picPreview, setPicPreview] = useState(user.profile_picture || null);
  const [picData, setPicData] = useState(undefined); // undefined = not changed
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  function handlePicChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Image must be under 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPicPreview(ev.target.result);
      setPicData(ev.target.result);
    };
    reader.readAsDataURL(file);
  }

  function removePic() {
    setPicPreview(null);
    setPicData(null); // null = explicitly remove
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSave() {
    setError("");
    if (!name.trim()) { setError("Name cannot be empty."); return; }
    if (!email.trim()) { setError("Email cannot be empty."); return; }
    if (showPwSection) {
      if (newPw.length < 8) { setError("New password must be at least 8 characters."); return; }
      if (newPw !== confirmPw) { setError("Passwords do not match."); return; }
    }

    const body = { name: name.trim(), email: email.trim() };
    if (isAdmin) body.role = role;
    if (showPwSection && newPw) {
      body.new_password = newPw;
      if (isSelf) body.current_password = currentPw;
    }
    if (picData !== undefined) body.profile_picture = picData; // null or base64

    setSaving(true);
    try {
      const res = await fetch(`${IDENTITY_API}/users/${user.user_id}/`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Failed to save changes."); setSaving(false); return; }

      // If editing self, update session user
      if (isSelf) {
        const sessionUser = getCurrentUser();
        setCurrentUser({ ...sessionUser, name: data.name, email: data.email, profile_picture: data.profile_picture });
      }
      onSaved(data);
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(26,10,10,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: C.white, borderRadius: 18, width: "100%", maxWidth: 480,
        boxShadow: "0 20px 60px rgba(224,49,49,0.14)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "22px 26px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Edit Profile</div>
            <div style={{ fontSize: 12, color: C.pale, marginTop: 2 }}>
              {isSelf ? "Editing your own profile" : `Editing ${user.name}'s profile`}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, cursor: "pointer", color: C.pale, fontSize: 16 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 18, maxHeight: "70vh", overflowY: "auto" }}>

          {/* Profile picture */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative" }}>
              {picPreview
                ? <img src={picPreview} alt="Preview" style={{ width: 68, height: 68, borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.border}` }} />
                : <div style={{ width: 68, height: 68, borderRadius: "50%", background: avatarColors(name)[0], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: avatarColors(name)[1], border: `2px solid ${C.border}` }}>{initials(name)}</div>
              }
              <button
                onClick={() => fileRef.current?.click()}
                style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: "50%", background: C.red, border: "2px solid white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                title="Change photo"
              >
                <i className="ti ti-camera" style={{ fontSize: 11, color: "white" }} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                onClick={() => fileRef.current?.click()}
                style={{ fontSize: 12, fontWeight: 600, color: C.red, background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "5px 14px", cursor: "pointer" }}
              >
                Upload photo
              </button>
              {picPreview && (
                <button
                  onClick={removePic}
                  style={{ fontSize: 12, color: C.pale, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  Remove photo
                </button>
              )}
              <div style={{ fontSize: 11, color: C.pale }}>JPG, PNG or GIF · max 2 MB</div>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: "none" }} onChange={handlePicChange} />
          </div>

          {/* Name */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Full Name</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              style={{ width: "100%", height: 40, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 14px", fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }}
            />
          </div>

          {/* Email */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Email Address</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              style={{ width: "100%", height: 40, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 14px", fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }}
            />
          </div>

          {/* Role (admin only) */}
          {isAdmin && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Role</label>
              <select
                value={role} onChange={e => setRole(e.target.value)}
                style={{ width: "100%", height: 40, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 14px", fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", background: C.white }}
              >
                {ROLES.map(r => <option key={r} value={r}>{ROLE_META[r]?.label || r}</option>)}
              </select>
            </div>
          )}

          {/* Password toggle */}
          <div>
            <button
              onClick={() => setShowPwSection(v => !v)}
              style={{ fontSize: 12, fontWeight: 600, color: C.red, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}
            >
              <i className={`ti ${showPwSection ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 13 }} />
              {showPwSection ? "Cancel password change" : "Change password"}
            </button>
          </div>

          {showPwSection && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", background: "#fff8f6", borderRadius: 12, border: `1px solid ${C.border}` }}>
              {isSelf && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Current Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showCurrentPw ? "text" : "password"} value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                      style={{ width: "100%", height: 40, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 40px 0 14px", fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }}
                      placeholder="Enter current password"
                    />
                    <button onClick={() => setShowCurrentPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.pale, fontSize: 15 }}>
                      <i className={`ti ${showCurrentPw ? "ti-eye-off" : "ti-eye"}`} />
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>New Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showNewPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)}
                    style={{ width: "100%", height: 40, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 40px 0 14px", fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }}
                    placeholder="At least 8 characters"
                  />
                  <button onClick={() => setShowNewPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.pale, fontSize: 15 }}>
                    <i className={`ti ${showNewPw ? "ti-eye-off" : "ti-eye"}`} />
                  </button>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Confirm New Password</label>
                <input
                  type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  style={{ width: "100%", height: 40, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 14px", fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }}
                  placeholder="Repeat new password"
                />
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#9b2020" }}>
              <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 26px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ height: 38, padding: "0 20px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, fontSize: 13, fontWeight: 600, color: C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Cancel
          </button>
          <button
            onClick={handleSave} disabled={saving}
            style={{ height: 38, padding: "0 22px", border: "none", borderRadius: 10, background: `linear-gradient(135deg, ${C.red}, ${C.redDark})`, color: "white", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 14px rgba(224,49,49,0.26)" }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create User Modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("registrar");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    setError("");
    if (!name.trim() || !email.trim() || !password) { setError("All fields are required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setSaving(true);
    try {
      const res = await fetch(`${IDENTITY_API}/users/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Failed to create user."); setSaving(false); return; }
      onCreated(data);
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.white, borderRadius: 18, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(224,49,49,0.14)", overflow: "hidden" }}>
        <div style={{ padding: "22px 26px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Create User Account</div>
            <div style={{ fontSize: 12, color: C.pale, marginTop: 2 }}>Add a new admin portal user</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, cursor: "pointer", color: C.pale, fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { label: "Full Name", val: name, set: setName, placeholder: "e.g. Maria Santos", type: "text" },
            { label: "Email Address", val: email, set: setEmail, placeholder: "e.g. maria@school.edu", type: "email" },
          ].map(({ label, val, set, placeholder, type }) => (
            <div key={label}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>{label}</label>
              <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={placeholder}
                style={{ width: "100%", height: 40, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 14px", fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }} />
            </div>
          ))}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ width: "100%", height: 40, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 14px", fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", background: C.white }}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_META[r]?.label || r}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Password</label>
            <div style={{ position: "relative" }}>
              <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"
                style={{ width: "100%", height: 40, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 40px 0 14px", fontSize: 13, color: C.text, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }} />
              <button onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.pale, fontSize: 15 }}>
                <i className={`ti ${showPw ? "ti-eye-off" : "ti-eye"}`} />
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#9b2020" }}>
              <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{error}
            </div>
          )}
        </div>

        <div style={{ padding: "16px 26px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ height: 38, padding: "0 20px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, fontSize: 13, fontWeight: 600, color: C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            style={{ height: 38, padding: "0 22px", border: "none", borderRadius: 10, background: `linear-gradient(135deg, ${C.red}, ${C.redDark})`, color: "white", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 14px rgba(224,49,49,0.26)" }}>
            {saving ? "Creating…" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteModal({ user, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`${IDENTITY_API}/users/${user.user_id}/`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (res.status === 204 || res.ok) { onDeleted(user.user_id); onClose(); return; }
      const data = await res.json();
      setError(data.detail || "Failed to delete user.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.white, borderRadius: 18, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(224,49,49,0.14)", padding: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fde8e8", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-trash" style={{ fontSize: 24, color: C.red }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Delete User Account</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
              Are you sure you want to delete <strong>{user.name}</strong>? This action cannot be undone.
            </div>
          </div>
          {error && <div style={{ width: "100%", background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#9b2020" }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, height: 40, border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, fontSize: 13, fontWeight: 600, color: C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
            <button onClick={handleDelete} disabled={deleting}
              style={{ flex: 1, height: 40, border: "none", borderRadius: 10, background: `linear-gradient(135deg, ${C.red}, ${C.redDark})`, color: "white", fontSize: 13, fontWeight: 700, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1, fontFamily: "'DM Sans', sans-serif" }}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── User Card ─────────────────────────────────────────────────────────────────

function UserCard({ user, currentUser, isAdmin, onEdit, onDelete }) {
  const isSelf = currentUser?.id === user.user_id;
  const canEdit = isAdmin || isSelf;
  const canDelete = isAdmin && !isSelf;

  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, transition: "box-shadow 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 20px rgba(224,49,49,0.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      <Avatar user={user} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
          {isSelf && <span style={{ fontSize: 10, fontWeight: 600, background: "#e8f5e0", color: "#2e6b0d", padding: "2px 8px", borderRadius: 20 }}>You</span>}
        </div>
        <div style={{ fontSize: 12, color: C.pale, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
        <div style={{ marginTop: 6 }}><RoleBadge role={user.role} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {canEdit && (
          <button onClick={() => onEdit(user)}
            style={{ height: 34, padding: "0 14px", border: `1px solid ${C.border}`, borderRadius: 9, background: C.white, fontSize: 12, fontWeight: 600, color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif" }}
            onMouseEnter={e => { e.currentTarget.style.background = C.redLight; e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.redBorder; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.white; e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}>
            <i className="ti ti-pencil" style={{ fontSize: 13 }} /> Edit
          </button>
        )}
        {canDelete && (
          <button onClick={() => onDelete(user)}
            style={{ height: 34, width: 34, border: `1px solid ${C.border}`, borderRadius: 9, background: C.white, fontSize: 14, color: C.pale, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#fde8e8"; e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.redBorder; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.white; e.currentTarget.style.color = C.pale; e.currentTarget.style.borderColor = C.border; }}>
            <i className="ti ti-trash" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const isAdmin = isAdminRole(currentUser?.role);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showLogout, setShowLogout] = useState(false);

  // Sidebar user reflects session (updated after self-edit)
  const [sidebarUser, setSidebarUser] = useState(currentUser);

  useEffect(() => {
    if (!currentUser) { navigate("/login"); return; }
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${IDENTITY_API}/users/`, { headers: authHeaders() });
      if (res.status === 401) { navigate("/login"); return; }
      if (!res.ok) { setError("Failed to load users."); return; }
      const data = await res.json();
      setUsers(data);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function handleSaved(updatedUser) {
    setUsers(prev => prev.map(u => u.user_id === updatedUser.user_id ? updatedUser : u));
    // Refresh sidebar if self was edited
    if (currentUser?.id === updatedUser.user_id) setSidebarUser(getCurrentUser());
  }

  function handleCreated(newUser) {
    setUsers(prev => [...prev, newUser]);
  }

  function handleDeleted(userId) {
    setUsers(prev => prev.filter(u => u.user_id !== userId));
  }

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const sidebarU = sidebarUser || currentUser;

  // ── Logout modal ─────────────────────────────────────────────────────────
  function doLogout() {
    clearAuthSession();
    navigate("/login");
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus { border-color: #fca5a5 !important; box-shadow: 0 0 0 3px rgba(224,49,49,0.08); }
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside style={{ width: 224, flexShrink: 0, background: C.white, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", boxShadow: "2px 0 12px rgba(224,49,49,0.04)" }}>
          <div style={{ padding: "22px 18px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logo} alt="Logo" style={{ width: 20, height: 30 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>South Lakes IS</div>
                <div style={{ fontSize: 11, color: C.pale, marginTop: 1 }}>Admin Portal</div>
              </div>
            </div>
          </div>

          <nav style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
            {getVisibleNavGroups(NAV).map(group => (
              <div key={group.section} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9.5, color: "#cdb0b0", letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 10px 4px", fontWeight: 600 }}>
                  {group.section}
                </div>
                {group.items.map(item => {
                  const active = location.pathname === item.path;
                  return (
                    <div key={item.path}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, fontSize: 13, color: active ? C.red : "#7a5a5a", cursor: "pointer", background: active ? C.redLight : "transparent", fontWeight: active ? 600 : 400 }}
                      onClick={() => navigate(item.path)} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && navigate(item.path)}>
                      <i className={`ti ${item.icon}`} style={{ fontSize: 16, width: 20, textAlign: "center" }} />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>

          <div style={{ padding: "14px 10px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px", borderRadius: 10, background: "#fff8f6" }}>
              {sidebarU ? <Avatar user={sidebarU} size={32} /> : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#fde8e8,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.red }}>?</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sidebarU?.name || "User"}</div>
                <div style={{ fontSize: 11, color: C.pale }}>{sidebarU?.role || ""}</div>
              </div>
              <button title="Logout" onClick={() => setShowLogout(true)}
                style={{ width: 30, height: 30, border: `1px solid #f0e4e4`, borderRadius: 8, background: C.white, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090" }}
                onMouseEnter={e => { e.currentTarget.style.background = C.redLight; e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.redBorder; }}
                onMouseLeave={e => { e.currentTarget.style.background = C.white; e.currentTarget.style.color = "#c09090"; e.currentTarget.style.borderColor = "#f0e4e4"; }}>
                <img src={logoutIcon} alt="Logout" style={{ width: 20, height: 20 }} />
              </button>
            </div>
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Topbar */}
          <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>Users</div>
              <div style={{ fontSize: 11.5, color: C.pale, marginTop: 1 }}>
                {loading ? "Loading…" : `${users.length} user${users.length !== 1 ? "s" : ""} registered`}
              </div>
            </div>
            {isAdmin && (
              <button onClick={() => setShowCreate(true)}
                style={{ display: "flex", alignItems: "center", gap: 8, background: `linear-gradient(135deg, ${C.red}, ${C.redDark})`, color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
                <i className="ti ti-user-plus" style={{ fontSize: 15 }} /> New User
              </button>
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Stats */}
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { label: "Total Users", value: users.length, icon: "ti-users", color: C.red, bg: C.redLight },
                { label: "Admins", value: users.filter(u => isAdminRole(u.role)).length, icon: "ti-shield-check", color: "#6d28d9", bg: "#f0e8fd" },
                { label: "Staff", value: users.filter(u => !isAdminRole(u.role)).length, icon: "ti-user", color: "#1455a0", bg: "#e3f0fd" },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className={`ti ${s.icon}`} style={{ fontSize: 20, color: s.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1 }}>{loading ? "—" : s.value}</div>
                    <div style={{ fontSize: 12, color: C.pale, marginTop: 3 }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Search + filter */}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: C.white, border: `1.5px solid #f0e4e4`, borderRadius: 12, padding: "0 16px", height: 42 }}>
                <i className="ti ti-search" style={{ color: C.pale, fontSize: 16 }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…"
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: C.text, background: "transparent", fontFamily: "'DM Sans', sans-serif" }} />
                {search && <button onClick={() => setSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: C.pale, fontSize: 16 }}>✕</button>}
              </div>
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                style={{ height: 42, border: `1.5px solid #f0e4e4`, borderRadius: 12, padding: "0 14px", fontSize: 13, color: C.muted, outline: "none", background: C.white, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                <option value="all">All roles</option>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_META[r]?.label || r}</option>)}
              </select>
            </div>

            {/* List */}
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 82, borderRadius: 14, background: C.white, border: `1px solid ${C.border}`, animation: "pulse 1.5s infinite" }} />)}
              </div>
            ) : error ? (
              <div style={{ background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 14, padding: "20px 24px", fontSize: 14, color: "#9b2020", textAlign: "center" }}>
                <i className="ti ti-alert-circle" style={{ fontSize: 20, display: "block", marginBottom: 8 }} />
                {error}
                <button onClick={fetchUsers} style={{ marginTop: 10, fontSize: 13, color: C.red, background: "none", border: "none", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>Try again</button>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: C.pale }}>
                <i className="ti ti-users" style={{ fontSize: 36, display: "block", marginBottom: 10 }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>{search || roleFilter !== "all" ? "No users match your filters" : "No users found"}</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtered.map(u => (
                  <UserCard key={u.user_id} user={u} currentUser={currentUser} isAdmin={isAdmin}
                    onEdit={setEditTarget} onDelete={setDeleteTarget} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {editTarget && (
        <EditProfileModal user={editTarget} currentUser={currentUser}
          onClose={() => setEditTarget(null)} onSaved={handleSaved} />
      )}
      {deleteTarget && (
        <DeleteModal user={deleteTarget}
          onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />
      )}
      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {showLogout && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => e.target === e.currentTarget && setShowLogout(false)}>
          <div style={{ background: C.white, borderRadius: 18, padding: 28, maxWidth: 360, width: "90%", boxShadow: "0 20px 60px rgba(224,49,49,0.14)", textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <img src={logoutIcon} alt="Logout" style={{ width: 26, height: 26 }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Sign out?</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6, marginBottom: 22 }}>You will be returned to the login screen.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowLogout(false)} style={{ flex: 1, height: 40, border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, fontSize: 13, fontWeight: 600, color: C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button onClick={doLogout} style={{ flex: 1, height: 40, border: "none", borderRadius: 10, background: `linear-gradient(135deg, ${C.red}, ${C.redDark})`, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}